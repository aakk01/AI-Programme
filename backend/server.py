import asyncio
import logging
import os
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import ai_gen  # noqa: E402
import cpm  # noqa: E402
import exporters  # noqa: E402
import payments  # noqa: E402
import xer_import  # noqa: E402
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
    constraint_type: Literal["", "SNET", "FNLT", "MSO"] = ""
    constraint_date: Optional[str] = None


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


class CalendarConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")
    week_pattern: Literal["5-day", "6-day", "7-day"] = "5-day"
    holiday_region: Literal["none", "UK", "US"] = "none"
    holidays: List[str] = Field(default_factory=list)


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
    calendar: CalendarConfig = Field(default_factory=CalendarConfig)


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
    return cpm.calculate(acts, start, project.get("calendar"))


def with_schedule(project: dict) -> dict:
    res = schedule(project)
    project["activities"] = res["activities"]
    project["schedule"] = {
        k: v for k, v in res.items() if k not in ("activities", "_calendar_obj")
    }
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
        "calendar": body.calendar.model_dump(),
        "activities": [],
        "assumptions": [],
        "summary": "",
        "version": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one(dict(project))
    return with_schedule(project)


@api.post("/projects/import/xer")
async def import_xer(file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    raw = await file.read()
    if len(raw) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 12MB)")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("cp1252", errors="replace")
    try:
        parsed = xer_import.import_xer(text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("XER import failed")
        raise HTTPException(status_code=400, detail=f"Could not read XER file: {e}")

    activities = [Activity(**a).model_dump() for a in parsed["activities"]]
    name = parsed["name"]
    if file.filename:
        name = name or file.filename.rsplit(".", 1)[0]
    project = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": name,
        "inputs": ProjectInputs(start_date=parsed["start_date"]).model_dump(),
        "calendar": CalendarConfig(
            week_pattern=parsed["week_pattern"], holidays=parsed.get("holidays", [])
        ).model_dump(),
        "activities": activities,
        "assumptions": [{
            "category": "Import",
            "assumption": f"Imported from Primavera P6 XER '{file.filename}'.",
            "basis": (
                f"{parsed['stats']['activities']} activities, {parsed['stats']['links']} links, "
                f"{parsed['stats']['milestones']} milestones, {parsed['stats']['wbs_nodes']} WBS nodes. "
                "Dates recalculated by the CPM engine; resources, costs and codes were not imported."
            ),
        }],
        "summary": "Programme imported from a Primavera P6 XER file and rescheduled by the CPM engine.",
        "version": 1,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one(dict(project))
    result = with_schedule(project)
    result["import_stats"] = parsed["stats"]
    return result


@api.get("/projects/{project_id}")
async def read_project(project_id: str, user_id: str = Depends(get_current_user_id)):
    return with_schedule(await get_project(project_id, user_id))


@api.put("/projects/{project_id}/calendar")
async def set_calendar(project_id: str, body: CalendarConfig,
                       user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    updates = {"calendar": body.model_dump(), "updated_at": now_iso()}
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    return with_schedule({**p, **updates})


@api.get("/projects/{project_id}/variance")
async def variance(project_id: str, user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    res = schedule(p)
    report = cpm.variance_report(
        res, p.get("inputs", {}).get("completion_date"), res["activities"]
    )
    report["project_name"] = p["name"]
    report["project_start"] = res["project_start"]
    report["duration_working_days"] = res["duration_working_days"]
    report["calendar"] = res["calendar"]
    return report


@api.patch("/projects/{project_id}")
async def update_project(project_id: str, body: dict, user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    updates = {"updated_at": now_iso()}
    if "name" in body:
        updates["name"] = str(body["name"]).strip() or p["name"]
    if "inputs" in body:
        merged = {**p.get("inputs", {}), **(body["inputs"] or {})}
        updates["inputs"] = ProjectInputs(**merged).model_dump()
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
    if not await payments.user_has_active_subscription(user_id):
        raise HTTPException(status_code=402,
                            detail={"code": "pro_required", "feature": "ai_generation"})
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


# ---------- versions / snapshots ----------
async def _save_snapshot(project_id: str, user_id: str, label: str | None) -> dict:
    p = await get_project(project_id, user_id)
    n = await db.versions.count_documents({"project_id": project_id})
    v = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "version": n + 1,
        "label": (label or "").strip() or f"Snapshot {n + 1}",
        "activities": p.get("activities", []),
        "assumptions": p.get("assumptions", []),
        "inputs": p.get("inputs", {}),
        "calendar": p.get("calendar", {}),
        "created_at": now_iso(),
    }
    await db.versions.insert_one(dict(v))
    await db.projects.update_one({"id": project_id}, {"$set": {"version": n + 1}})
    return v


def _snapshot_summary(v: dict) -> dict:
    return {
        "id": v["id"],
        "version": v.get("version"),
        "label": v.get("label"),
        "created_at": v.get("created_at"),
        "activity_count": len(v.get("activities", [])),
    }


@api.post("/projects/{project_id}/versions")
async def snapshot(project_id: str, body: dict = None,
                   user_id: str = Depends(get_current_user_id)):
    v = await _save_snapshot(project_id, user_id, (body or {}).get("label"))
    return {k: v[k] for k in ("id", "version", "label", "created_at")}


@api.get("/projects/{project_id}/versions")
async def list_versions(project_id: str, user_id: str = Depends(get_current_user_id)):
    await get_project(project_id, user_id)
    rows = await db.versions.find({"project_id": project_id}, NO_ID).sort("version", -1).to_list(100)
    return [_snapshot_summary(r) for r in rows]


@api.post("/projects/{project_id}/versions/{version_id}/restore")
async def restore_version(project_id: str, version_id: str,
                          user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    v = await db.versions.find_one({"id": version_id, "project_id": project_id}, NO_ID)
    if not v:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    updates = {
        "activities": v["activities"],
        "assumptions": v.get("assumptions", []),
        "inputs": v.get("inputs", p.get("inputs", {})),
        "calendar": v.get("calendar", p.get("calendar", {})),
        "updated_at": now_iso(),
    }
    await db.projects.update_one({"id": project_id}, {"$set": updates})
    return with_schedule({**p, **updates})


# --- Snapshot aliases (same underlying `versions` collection, richer API) ---
@api.post("/projects/{project_id}/snapshots")
async def create_snapshot(project_id: str, body: dict = None,
                          user_id: str = Depends(get_current_user_id)):
    v = await _save_snapshot(project_id, user_id, (body or {}).get("name")
                             or (body or {}).get("label"))
    return _snapshot_summary(v)


@api.get("/projects/{project_id}/snapshots")
async def list_snapshots(project_id: str, user_id: str = Depends(get_current_user_id)):
    await get_project(project_id, user_id)
    rows = (await db.versions.find({"project_id": project_id}, NO_ID)
            .sort("version", -1).to_list(100))
    return [_snapshot_summary(r) for r in rows]


@api.post("/projects/{project_id}/snapshots/{snapshot_id}/restore")
async def restore_snapshot(project_id: str, snapshot_id: str,
                           user_id: str = Depends(get_current_user_id)):
    return await restore_version(project_id, snapshot_id, user_id)


def _diff_days(current: str | None, baseline: str | None) -> int | None:
    if not current or not baseline:
        return None
    try:
        return (date.fromisoformat(str(current)[:10])
                - date.fromisoformat(str(baseline)[:10])).days
    except ValueError:
        return None


@api.get("/projects/{project_id}/snapshots/{snapshot_id}/compare")
async def compare_snapshot(project_id: str, snapshot_id: str,
                           user_id: str = Depends(get_current_user_id)):
    p = await get_project(project_id, user_id)
    snap = await db.versions.find_one({"id": snapshot_id, "project_id": project_id}, NO_ID)
    if not snap:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    current = schedule(p)
    baseline_project = {
        "inputs": snap.get("inputs", p.get("inputs", {})),
        "activities": snap.get("activities", []),
        "calendar": snap.get("calendar", p.get("calendar", {})),
    }
    baseline = schedule(baseline_project)

    by_id = {a["activity_id"]: a for a in baseline["activities"]}
    rows = []
    for a in current["activities"]:
        b = by_id.get(a["activity_id"])
        row = {
            "activity_id": a["activity_id"],
            "description": a.get("description", ""),
            "current_start": a.get("start"),
            "current_finish": a.get("finish"),
            "current_duration": a.get("duration", 0),
            "baseline_start": b.get("start") if b else None,
            "baseline_finish": b.get("finish") if b else None,
            "baseline_duration": b.get("duration", 0) if b else None,
            "start_variance_days": _diff_days(a.get("start"), b.get("start") if b else None),
            "finish_variance_days": _diff_days(a.get("finish"), b.get("finish") if b else None),
            "duration_variance": (a.get("duration", 0) - b.get("duration", 0)) if b else None,
            "in_baseline": b is not None,
        }
        rows.append(row)

    added = [a["activity_id"] for a in current["activities"]
             if a["activity_id"] not in by_id]
    current_ids = {a["activity_id"] for a in current["activities"]}
    removed = [{"activity_id": bid, "description": ba.get("description", ""),
                "baseline_start": ba.get("start"), "baseline_finish": ba.get("finish")}
               for bid, ba in by_id.items() if bid not in current_ids]

    return {
        "snapshot": _snapshot_summary(snap),
        "current_finish": current.get("project_finish"),
        "baseline_finish": baseline.get("project_finish"),
        "finish_variance_days": _diff_days(current.get("project_finish"),
                                           baseline.get("project_finish")),
        "rows": rows,
        "added": added,
        "removed": removed,
    }


# ---------- exports ----------
@api.get("/projects/{project_id}/export/{fmt}")
async def export(project_id: str, fmt: str, user_id: str = Depends(get_current_user_id)):
    if not await payments.user_has_active_subscription(user_id):
        raise HTTPException(status_code=402,
                            detail={"code": "pro_required", "feature": "export"})
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
            "calendar": p.get("calendar", {}),
            "summary": p.get("summary", ""), "assumptions": p.get("assumptions", []),
            "schedule": p["schedule"], "activities": acts,
        }
        return Response(
            json.dumps(payload, indent=2), media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{slug}.json"'},
        )
    if fmt in ("xml", "mspxml"):
        return Response(
            exporters.to_msproject_xml(
                p["name"], p["schedule"]["project_start"], acts, p["schedule"]["calendar"]
            ),
            media_type="application/xml",
            headers={"Content-Disposition": f'attachment; filename="{slug}.xml"'},
        )
    if fmt in ("asta", "astaxml", "pp"):
        return Response(
            exporters.to_asta_xml(
                p["name"], p["schedule"]["project_start"], acts, p["schedule"]["calendar"]
            ),
            media_type="application/xml",
            headers={"Content-Disposition": f'attachment; filename="{slug}-asta.xml"'},
        )
    if fmt == "xer":
        return Response(
            exporters.to_xer(
                p["name"], p["schedule"]["project_start"], p["schedule"]["project_finish"],
                acts, p["schedule"]["calendar"],
            ),
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="{slug}.xer"'},
        )
    raise HTTPException(status_code=400, detail="Unsupported format")


@api.get("/")
async def root():
    return {"status": "ok", "service": "programme-of-works-generator"}


app.include_router(api)
app.include_router(payments.router)
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
