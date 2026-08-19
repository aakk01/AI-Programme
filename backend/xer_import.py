"""Primavera P6 XER importer -> internal activity model."""
import re
from datetime import date

TYPE_MAP = {
    "TT_Mile": "Milestone",
    "TT_FinMile": "Milestone",
    "TT_StartMile": "Milestone",
    "TT_WBS": "Summary",
    "TT_LOE": "Summary",
    "TT_Task": "Task",
    "TT_Rsrc": "Task",
}

PRED_MAP = {"PR_FS": "FS", "PR_SS": "SS", "PR_FF": "FF", "PR_SF": "SF"}

CSTR_MAP = {
    "CS_MSO": "SNET", "CS_MSOB": "SNET", "CS_ALAP": "", "CS_MANDSTART": "MSO",
    "CS_MEO": "FNLT", "CS_MEOB": "FNLT", "CS_MANDFIN": "FNLT",
    "CS_MSOA": "SNET", "CS_MEOA": "FNLT",
}


def parse_tables(text: str) -> dict:
    """XER -> {table_name: [ {field: value} ]}."""
    tables, name, fields = {}, None, []
    for raw in text.splitlines():
        if not raw or raw.startswith("ERMHDR"):
            continue
        parts = raw.split("\t")
        tag = parts[0]
        if tag == "%T":
            name = parts[1].strip()
            tables[name] = []
            fields = []
        elif tag == "%F":
            fields = [p.strip() for p in parts[1:]]
        elif tag == "%R" and name and fields:
            values = parts[1:]
            row = {f: (values[i] if i < len(values) else "") for i, f in enumerate(fields)}
            tables[name].append(row)
        elif tag == "%E":
            break
    return tables


def _date(value):
    if not value:
        return None
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", value.strip())
    if not m:
        return None
    return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()


def _hours_to_days(value):
    try:
        return max(0, int(round(float(value or 0) / 8.0)))
    except (TypeError, ValueError):
        return 0


def _wbs_paths(rows):
    """wbs_id -> {'names': [l1, l2, ...], 'code': '1.2'}"""
    by_id = {r["wbs_id"]: r for r in rows}
    children = {}
    for r in rows:
        children.setdefault(r.get("parent_wbs_id") or "", []).append(r)
    for kids in children.values():
        kids.sort(key=lambda r: (int(r.get("seq_num") or 0), r.get("wbs_name", "")))

    out = {}

    def walk(node_id, names, code):
        for i, kid in enumerate(children.get(node_id, []), start=1):
            is_root = kid.get("proj_node_flag") == "Y"
            kid_names = names if is_root else names + [kid.get("wbs_name", "")]
            kid_code = code if is_root else (f"{code}.{i}" if code else str(i))
            out[kid["wbs_id"]] = {"names": kid_names, "code": kid_code}
            walk(kid["wbs_id"], kid_names, kid_code)

    roots = [r for r in rows if (r.get("parent_wbs_id") or "") not in by_id]
    for r in roots:
        is_root = r.get("proj_node_flag") == "Y"
        names = [] if is_root else [r.get("wbs_name", "")]
        code = "" if is_root else "1"
        out[r["wbs_id"]] = {"names": names, "code": code}
        walk(r["wbs_id"], names, code)
    return out


def import_xer(text: str) -> dict:
    tables = parse_tables(text)
    tasks = tables.get("TASK") or []
    if not tasks:
        raise ValueError("No TASK table found — this does not look like a P6 XER file")

    wbs = _wbs_paths(tables.get("PROJWBS") or [])

    used, id_by_task = set(), {}
    activities = []
    for t in tasks:
        code = (t.get("task_code") or "").strip() or f"A{len(activities) + 1:04d}"
        while code in used:
            code = f"{code}_1"
        used.add(code)
        id_by_task[t.get("task_id")] = code
        path = wbs.get(t.get("wbs_id"), {"names": [], "code": ""})
        names = path["names"]
        atype = TYPE_MAP.get((t.get("task_type") or "").strip(), "Task")
        duration = 0 if atype == "Milestone" else _hours_to_days(t.get("target_drtn_hr_cnt"))
        activities.append({
            "activity_id": code,
            "wbs_code": path["code"],
            "wbs_l1": names[0] if len(names) > 0 else "Imported",
            "wbs_l2": names[1] if len(names) > 1 else "",
            "wbs_l3": " / ".join(names[2:]) if len(names) > 2 else "",
            "description": (t.get("task_name") or code).strip(),
            "type": atype,
            "duration": duration,
            "predecessors": [],
            "constraint_type": CSTR_MAP.get((t.get("cstr_type") or "").strip(), ""),
            "constraint_date": _date(t.get("cstr_date")),
            "_start": _date(t.get("target_start_date")) or _date(t.get("early_start_date")),
        })

    by_code = {a["activity_id"]: a for a in activities}
    for link in tables.get("TASKPRED") or []:
        succ = id_by_task.get(link.get("task_id"))
        pred = id_by_task.get(link.get("pred_task_id"))
        if not succ or not pred or succ == pred:
            continue
        by_code[succ]["predecessors"].append({
            "id": pred,
            "type": PRED_MAP.get((link.get("pred_type") or "").strip(), "FS"),
            "lag": _hours_to_days(link.get("lag_hr_cnt")),
        })

    project_rows = tables.get("PROJECT") or []
    start = None
    if project_rows:
        p = project_rows[0]
        start = _date(p.get("plan_start_date")) or _date(p.get("scd_end_date"))
    if not start:
        starts = [a["_start"] for a in activities if a["_start"]]
        start = min(starts) if starts else date.today().isoformat()

    name = ""
    if project_rows:
        name = (project_rows[0].get("proj_short_name") or "").strip()

    week_days = 5
    holidays = []
    for c in tables.get("CALENDAR") or []:
        data = c.get("clndr_data") or ""
        working = len(re.findall(r"\(0\|\|\d\(\)\(0\|\|0", data))
        if working:
            week_days = min(7, max(1, working))
        exc = data.split("Exceptions", 1)
        if len(exc) > 1:
            holidays = sorted(
                {
                    f"{m[0:4]}-{m[4:6]}-{m[6:8]}"
                    for m in re.findall(r"\b(\d{8})\b", exc[1])
                    if 1990 <= int(m[0:4]) <= 2100 and 1 <= int(m[4:6]) <= 12 and 1 <= int(m[6:8]) <= 31
                }
            )
        if working or holidays:
            break

    for a in activities:
        a.pop("_start", None)

    return {
        "name": name or "Imported programme",
        "start_date": start,
        "week_pattern": {6: "6-day", 7: "7-day"}.get(week_days, "5-day"),
        "holidays": holidays,
        "activities": activities,
        "stats": {
            "activities": len(activities),
            "links": sum(len(a["predecessors"]) for a in activities),
            "milestones": sum(1 for a in activities if a["type"] == "Milestone"),
            "wbs_nodes": len(wbs),
            "holidays": len(holidays),
        },
    }
