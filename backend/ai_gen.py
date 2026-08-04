"""Claude Sonnet 4.6 programme generation and refinement."""
import json
import os
import re
import uuid

from emergentintegrations.llm.chat import LlmChat, UserMessage

MODEL = ("anthropic", "claude-sonnet-4-6")

SYSTEM_PROMPT = """You are a Chartered Project Controls Manager with 25 years of experience \
producing baseline construction programmes in Primavera P6 and Asta Powerproject.

You produce fully logic-linked Programmes of Works. Rules you ALWAYS follow:
1. Build a WBS hierarchy: Level 1 = project stages, Level 2 = work packages, Level 3 = activities.
2. All durations are in WORKING DAYS (5-day week), scaled realistically to the project size, value and type.
3. Every activity except the first has at least one predecessor. Every activity except the last has a successor. The network MUST be closed with no orphans and no cycles.
4. Use FS / SS / FF / SF link types with lags where realistic (e.g. SS with +5d lag for overlapping trades).
5. Insert these milestones (duration 0) where applicable: Notice to Proceed, Planning Approval, Contract Award, Site Access / Possession, Topping Out, Sectional Completion(s), Practical Completion.
6. Include a clear driving critical path from Notice to Proceed through to Practical Completion.
7. Activity IDs: 4-digit numeric ids prefixed by a stage letter, e.g. A1000, B1010 — ascending in 10s within a stage.
8. Where the user has not supplied information, apply industry-standard defaults and record each one in the assumptions list.

Return ONLY valid JSON. No markdown fences, no commentary. Schema:
{
  "programme_name": "string",
  "summary": "2-3 sentence narrative of the strategy",
  "assumptions": [{"category": "string", "assumption": "string", "basis": "string"}],
  "activities": [
    {
      "activity_id": "A1000",
      "wbs_code": "1.1.1",
      "wbs_l1": "Stage name",
      "wbs_l2": "Work package",
      "wbs_l3": "Activity group or empty string",
      "description": "Activity description",
      "type": "Task" | "Milestone" | "Summary",
      "duration": 10,
      "predecessors": [{"id": "A0990", "type": "FS", "lag": 0}]
    }
  ]
}
Produce between 45 and 90 activities for a typical project. Order activities logically.
"""


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("AI returned no JSON object")
    return json.loads(text[start : end + 1])


def _chat(system_message: str):
    return LlmChat(
        api_key=os.environ["EMERGENT_LLM_KEY"],
        session_id=f"pow-{uuid.uuid4()}",
        system_message=system_message,
    ).with_model(*MODEL)


def _inputs_brief(inputs: dict) -> str:
    lines = []
    labels = {
        "project_type": "Project type",
        "gia": "Gross internal area",
        "gia_unit": "Area unit",
        "floors": "Number of floors",
        "linear_km": "Linear length (km)",
        "budget": "Budget",
        "currency": "Currency",
        "start_date": "Target start date",
        "completion_date": "Target completion date",
        "procurement": "Procurement strategy",
        "long_lead_items": "Long-lead items",
        "site_constraints": "Site constraints",
        "sectional_completions": "Sectional completions required",
        "notes": "Additional notes",
    }
    for k, label in labels.items():
        v = inputs.get(k)
        if v not in (None, "", [], 0):
            lines.append(f"- {label}: {v}")
    return "\n".join(lines) or "- No parameters supplied; use industry-standard defaults throughout."


async def generate_programme(inputs: dict) -> dict:
    chat = _chat(SYSTEM_PROMPT)
    msg = UserMessage(
        text=(
            "Produce a baseline Programme of Works for the following project.\n\n"
            f"{_inputs_brief(inputs)}\n\n"
            "Where a parameter above is missing, choose an industry-standard default and log it in "
            "'assumptions'. Return the JSON only."
        )
    )
    raw = await chat.send_message(msg)
    return _extract_json(raw)


REFINE_SYSTEM = (
    SYSTEM_PROMPT
    + """
You are now REFINING an existing programme based on a user instruction.
Return ONLY JSON with this schema:
{
  "explanation": "short plain-English summary of what you changed and the schedule impact",
  "changes": [
    {"op": "update", "activity_id": "A1030", "fields": {"duration": 25}, "reason": "..."},
    {"op": "add", "activity": { full activity object }, "reason": "..."},
    {"op": "delete", "activity_id": "A1090", "reason": "..."}
  ]
}
Only include activities you are actually changing. Keep the network closed after your changes.
"""
)


async def refine_programme(inputs: dict, activities: list, instruction: str) -> dict:
    chat = _chat(REFINE_SYSTEM)
    slim = [
        {
            "activity_id": a.get("activity_id"),
            "wbs_l1": a.get("wbs_l1"),
            "description": a.get("description"),
            "type": a.get("type"),
            "duration": a.get("duration"),
            "predecessors": a.get("predecessors"),
        }
        for a in activities
    ]
    raw = await chat.send_message(
        UserMessage(
            text=(
                f"Project parameters:\n{_inputs_brief(inputs)}\n\n"
                f"Current programme (JSON):\n{json.dumps(slim)}\n\n"
                f"User instruction: {instruction}\n\nReturn the JSON diff only."
            )
        )
    )
    return _extract_json(raw)
