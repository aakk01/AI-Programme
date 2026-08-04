import asyncio
import logging
import os
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, HTTPException
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import ai_gen  # noqa: E402
import cpm  # noqa: E402
import exporters  # noqa: E402
from auth import (  # noqa: E402
    create_access_token,
    get_current_user_id,
    hash_password,
    verify_password,
)

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Programme of Works Generator")
api = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

NO_ID = {"_id": 0}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- models ----------
class Link(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    type: Literal["FS", "SS", "FF", "SF"] = "FS"
    lag: int = 0


class Activity(BaseModel):
    model_config = ConfigDict(extra="ignore")
    activity_id: str
    wbs_code: str = ""
    wbs_l1: str = ""
    wbs_l2: str = ""
    wbs_l3: str = ""
    description: str = ""
    type: Literal["Task", "Milestone", "Summary"] = "Task"
    duration: int = 0
    predecessors: List[Link] = Field(default_factory=list)


class ProjectInputs(BaseModel):
    model_config = ConfigDict(extra="ignore")
    project_type: str = ""
    gia: Optional[float] = None
    gia_unit: str = "sqm"
    floors: Optional[int] = None
    linear_km: Optional[float] = None
    budget: Optional[float] = None
    currency: str = "GBP"
    start_date: Optional[str] = None
    completion_date: Optional[str] = None
    procurement: str = ""
    long_lead_items: str = ""
    site_constraints: str = ""
    sectional_completions: str = ""
    notes: str = ""


class SignupBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = ""


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ProjectCreate(BaseModel):
    name: str
    inputs: ProjectInputs


class ActivitiesUpdate(BaseModel):
    activities: List[Activity]


class RefineBody(BaseModel):
    instruction: str


class ApplyChangesBody(BaseModel):
    changes: List[dict]


# ---------- helpers ----------
def schedule(project: dict) -> dict:
    start = project.get("inputs", {}).get("start_date") or date.today().isoformat()
    acts = [a if isinstance(a, dict) else a.model_dump() for a in project.get("activities", [])]
    return cpm.calculate(acts, start)


def with_schedule(project: dict) -> dict:
    res = schedule(project)
    project["activities"] = res["activities"]
    project["schedule"] = {k: v for k, v in res.items() if k != "activities"}
    return project


async def get_project(project_id: str, user_id: str) -> dict:
    p = await db.projects.find_one({"id": project_id, "user_id": user_id}, NO_ID)
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


# ---------- auth ----------
@api.post("/auth/signup")
async def signup(body: SignupBody):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": body.name.strip() or email.split("@")[0],
        "password_hash": hash_password(body.password),
        "created_at": now_iso(),
    }
    await db.users.insert_one(dict(user))
    return {
        "token": create_access_token(user["id"], email),
        "user": {"id": user["id"], "email": email, "name": user["name"]},
    }


@api.post("/auth/login")
async def login(body: LoginBody):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, NO_ID)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "token": create_access_token(user["id"], email),
        "user": {"id": user["id"], "email": email, "name": user.get("name", "")},
    }


@api.get("/auth/me")
async def me(user_id: str = Depends(get_current_user_id)):
    user = await db.users.find_one({"id": user_id}, NO_ID)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user["id"], "email": user["email"], "name": user.get("name", "")}


# ---------- projects ----------
@api.get("/projects")
async def list_projects(user_id: str = Depends(get_current_user_id)):
    rows = await db.projects.find({"user_id": user_id}, NO_ID).sort("updated_at", -1).to_list(500)
    out = []
    for p in rows:
        res = schedule(p) if p.get("activities") else None
        out.append({
            "id": p["id"],
            "name": p["name"],
            "inputs": p.get("inputs", {}),
            "activity_count": len(p.get("activities", [])),
            "version": p.get("version", 1),
            "created_at": p.get("created_at"),
            "updated_at": p.get("updated_at"),
            "project_finish": res["project_finish"] if res else None,
            "duration_working_days": res["duration_working_days"] if res else 0,
        })
    return out


@api.post("/projects")
async def create_project(body: ProjectCreate, user_id: str = Depends(get_current_user_id)):
    inputs = body.inputs.model_dump()
    if not inputs.get("start_date"):
        inputs["start_date"] = date.today().isoformat()
    project = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": body.name.strip() or "Untitled Programme",
        "inputs": inputs,
        "activities": [],
        "assumptions": [],
        "summary": "",
        "version": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one(dict(project))
    return with_schedule(project)


@api.get("/projects/{project_id}")
async def read_project(project_id: str, user_id: str = Depends(get_current_user_id)):
    return with_schedule(await get_project(project_id, user_id))


@api.patch("/projects/{project_id}")
async def update_project(project_id: str, body: dict, user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    updates = {"updated_at": now_iso()}
    if "name" in body:
        updates["name"] = str(body["name"]).strip() or p["name"]
    if "inputs" in body:
        updates["inputs"] = {**p.get("inputs", {}), **ProjectInputs(**body["inputs"]).model_dump()}
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    return with_schedule({**p, **updates})


@api.delete("/projects/{project_id}")
async def delete_project(project_id: str, user_id: str = Depends(get_current_user_id)):
    await get_project(project_id, user_id)
    await db.projects.delete_one({"id": project_id})
    await db.versions.delete_many({"project_id": project_id})
    return {"deleted": True}


@api.post("/projects/{project_id}/duplicate")
async def duplicate_project(project_id: str, user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    copy = {**p, "id": str(uuid.uuid4()), "name": f"{p['name']} (copy)",
            "created_at": now_iso(), "updated_at": now_iso(), "version": 1}
    await db.projects.insert_one(dict(copy))
    return with_schedule(copy)


async def _run_generation(project_id: str, inputs: dict):
    try:
        result = await ai_gen.generate_programme(inputs)
        activities = [Activity(**a).model_dump() for a in result.get("activities", [])]
        if not activities:
            raise ValueError("AI returned no activities")
        await db.projects.update_one(
            {"id": project_id},
            {"$set": {
                "activities": activities,
                "assumptions": result.get("assumptions", []),
                "summary": result.get("summary", ""),
                "generation_status": "done",
                "generation_error": "",
                "updated_at": now_iso(),
            }},
        )
    except Exception as e:
        logger.exception("AI generation failed")
        await db.projects.update_one(
            {"id": project_id},
            {"$set": {"generation_status": "error", "generation_error": str(e)[:400]}},
        )


@api.post("/projects/{project_id}/generate")
async def generate(project_id: str, user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    if p.get("generation_status") == "running":
        return {"status": "running"}
    await db.projects.update_one(
        {"id": project_id}, {"$set": {"generation_status": "running", "generation_error": ""}}
    )
    asyncio.create_task(_run_generation(project_id, p.get("inputs", {})))
    return {"status": "running"}


@api.get("/projects/{project_id}/generation-status")
async def generation_status(project_id: str, user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    status_val = p.get("generation_status") or ("done" if p.get("activities") else "idle")
    out = {"status": status_val, "error": p.get("generation_error", "")}
    if status_val == "done":
        out["project"] = with_schedule(p)
    return out


@api.put("/projects/{project_id}/activities")
async def save_activities(project_id: str, body: ActivitiesUpdate,
                          user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    acts = [a.model_dump() for a in body.activities]
    ids = [a["activity_id"] for a in acts]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Duplicate Activity IDs are not allowed")
    updates = {"activities": acts, "updated_at": now_iso()}
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    return with_schedule({**p, **updates})


@api.post("/projects/{project_id}/recalculate")
async def recalculate(project_id: str, body: ActivitiesUpdate,
                      user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    return schedule({**p, "activities": [a.model_dump() for a in body.activities]})


@api.post("/parse-links")
async def parse_links(body: dict):
    try:
        return {"ok": True, "links": cpm.parse_predecessor_string(body.get("text", ""))}
    except ValueError as e:
        return {"ok": False, "error": str(e)}


# ---------- AI refinement ----------
@api.post("/projects/{project_id}/refine")
async def refine(project_id: str, body: RefineBody, user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    if not p.get("activities"):
        raise HTTPException(status_code=400, detail="Generate a programme before refining it")
    try:
        result = await ai_gen.refine_programme(p.get("inputs", {}), p["activities"], body.instruction)
    except Exception as e:
        logger.exception("AI refinement failed")
        raise HTTPException(status_code=502, detail=f"AI refinement failed: {e}")
    msg = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "instruction": body.instruction,
        "explanation": result.get("explanation", ""),
        "changes": result.get("changes", []),
        "created_at": now_iso(),
    }
    await db.chats.insert_one(dict(msg))
    return msg


@api.get("/projects/{project_id}/chat")
async def chat_history(project_id: str, user_id: str = Depends(get_current_user_id)):
    await get_project(project_id, user_id)
    return await db.chats.find({"project_id": project_id}, NO_ID).sort("created_at", 1).to_list(200)


@api.post("/projects/{project_id}/apply-changes")
async def apply_changes(project_id: str, body: ApplyChangesBody,
                        user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    acts = [dict(a) for a in p.get("activities", [])]
    index = {a["activity_id"]: a for a in acts}
    for ch in body.changes:
        op = ch.get("op")
        if op == "update" and ch.get("activity_id") in index:
            index[ch["activity_id"]].update(
                Activity(**{**index[ch["activity_id"]], **(ch.get("fields") or {})}).model_dump()
            )
        elif op == "add" and ch.get("activity"):
            new = Activity(**ch["activity"]).model_dump()
            if new["activity_id"] not in index:
                acts.append(new)
                index[new["activity_id"]] = new
        elif op == "delete" and ch.get("activity_id") in index:
            dead = ch["activity_id"]
            acts = [a for a in acts if a["activity_id"] != dead]
            index.pop(dead, None)
            for a in acts:
                a["predecessors"] = [x for x in a.get("predecessors", []) if x.get("id") != dead]
    updates = {"activities": acts, "updated_at": now_iso()}
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    return with_schedule({**p, **updates})


# ---------- versions ----------
@api.post("/projects/{project_id}/versions")
async def snapshot(project_id: str, body: dict = None, user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    n = await db.versions.count_documents({"project_id": project_id})
    v = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "version": n + 1,
        "label": (body or {}).get("label") or f"Version {n + 1}",
        "activities": p.get("activities", []),
        "assumptions": p.get("assumptions", []),
        "inputs": p.get("inputs", {}),
        "created_at": now_iso(),
    }
    await db.versions.insert_one(dict(v))
    await db.projects.update_one({"id": project_id}, {"$set": {"version": n + 1}})
    return {k: v[k] for k in ("id", "version", "label", "created_at")}


@api.get("/projects/{project_id}/versions")
async def list_versions(project_id: str, user_id: str = Depends(get_current_user_id)):
    await get_project(project_id, user_id)
    rows = await db.versions.find({"project_id": project_id}, NO_ID).sort("version", -1).to_list(100)
    return [{"id": r["id"], "version": r["version"], "label": r["label"],
             "created_at": r["created_at"], "activity_count": len(r.get("activities", []))}
            for r in rows]


@api.post("/projects/{project_id}/versions/{version_id}/restore")
async def restore_version(project_id: str, version_id: str,
                          user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    v = await db.versions.find_one({"id": version_id, "project_id": project_id}, NO_ID)
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    updates = {"activities": v["activities"], "assumptions": v.get("assumptions", []),
               "inputs": v.get("inputs", p.get("inputs", {})), "updated_at": now_iso()}
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    return with_schedule({**p, **updates})


# ---------- exports ----------
@api.get("/projects/{project_id}/export/{fmt}")
async def export(project_id: str, fmt: str, user_id: str = Depends(get_current_user_id)):
    p = with_schedule(await get_project(project_id, user_id))
    slug = "".join(c if c.isalnum() or c in "-_" else "_" for c in p["name"])[:60] or "programme"
    acts = p["activities"]
    if fmt == "csv":
        return Response(
            exporters.to_csv(acts), media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{slug}.csv"'},
        )
    if fmt == "json":
        import json
        payload = {
            "programme_name": p["name"], "inputs": p.get("inputs", {}),
            "summary": p.get("summary", ""), "assumptions": p.get("assumptions", []),
            "schedule": p["schedule"], "activities": acts,
        }
        return Response(
            json.dumps(payload, indent=2), media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{slug}.json"'},
        )
    if fmt in ("xml", "mspxml"):
        return Response(
            exporters.to_msproject_xml(p["name"], p["schedule"]["project_start"], acts),
            media_type="application/xml",
            headers={"Content-Disposition": f'attachment; filename="{slug}.xml"'},
        )
    raise HTTPException(status_code=400, detail="Unsupported format")


@api.get("/")
async def root():
    return {"status": "ok", "service": "programme-of-works-generator"}


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    client.close()
