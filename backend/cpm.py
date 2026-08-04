"""CPM engine: forward/backward pass over a working-day calendar."""
import re
from datetime import date, timedelta

LINK_TYPES = {"FS", "SS", "FF", "SF"}
_LINK_RE = re.compile(r"^\s*([A-Za-z0-9_.\-]+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?\s*$", re.I)


def parse_predecessor_string(text):
    """'A1030FS+5d, A1040SS-2' -> [{'id','type','lag'}]. Raises ValueError on bad syntax."""
    if not text or not str(text).strip():
        return []
    out = []
    for part in re.split(r"[,;]", str(text)):
        part = part.strip()
        if not part:
            continue
        m = _LINK_RE.match(part)
        if not m:
            raise ValueError(f"Invalid link syntax: '{part}'")
        pid, ltype, lag = m.group(1), (m.group(2) or "FS").upper(), m.group(3)
        out.append({"id": pid, "type": ltype, "lag": int(lag.replace(" ", "")) if lag else 0})
    return out


def format_predecessors(preds):
    parts = []
    for p in preds or []:
        lag = p.get("lag", 0) or 0
        s = f"{p['id']}{p.get('type', 'FS')}"
        if lag:
            s += f"{'+' if lag > 0 else '-'}{abs(lag)}d"
        parts.append(s)
    return ", ".join(parts)


def add_working_days(start: date, n: int) -> date:
    """Advance n working days (Mon-Fri) from start, where start counts as day 0."""
    d = start
    step = 1 if n >= 0 else -1
    remaining = abs(n)
    while remaining > 0:
        d += timedelta(days=step)
        if d.weekday() < 5:
            remaining -= 1
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def _index_to_date(project_start: date, idx: int) -> date:
    return add_working_days(project_start, max(0, int(idx)))


def calculate(activities, project_start):
    """activities: list of dicts with activity_id, type, duration, predecessors.
    Returns new list with early/late dates, floats, critical flag. Mutation-free."""
    if isinstance(project_start, str):
        project_start = date.fromisoformat(project_start[:10])

    acts = [dict(a) for a in activities]
    net = [a for a in acts if a.get("type") != "Summary"]
    by_id = {a["activity_id"]: a for a in net}

    for a in net:
        a["duration"] = 0 if a.get("type") == "Milestone" else max(0, int(a.get("duration") or 0))
        a["predecessors"] = [p for p in (a.get("predecessors") or []) if p.get("id") in by_id]

    succs = {a["activity_id"]: [] for a in net}
    indeg = {a["activity_id"]: 0 for a in net}
    for a in net:
        for p in a["predecessors"]:
            succs[p["id"]].append({"id": a["activity_id"], "type": p.get("type", "FS"), "lag": p.get("lag", 0)})
            indeg[a["activity_id"]] += 1

    order, queue = [], [i for i, d in indeg.items() if d == 0]
    queue.sort()
    while queue:
        cur = queue.pop(0)
        order.append(cur)
        for s in succs[cur]:
            indeg[s["id"]] -= 1
            if indeg[s["id"]] == 0:
                queue.append(s["id"])
    cyclic = len(order) != len(net)
    if cyclic:
        order = order + [a["activity_id"] for a in net if a["activity_id"] not in set(order)]

    # forward pass
    for aid in order:
        a = by_id[aid]
        es = 0
        for p in a["predecessors"]:
            pr = by_id[p["id"]]
            if "es" not in pr:
                continue
            lag, t = p.get("lag", 0), p.get("type", "FS")
            if t == "FS":
                es = max(es, pr["ef"] + lag)
            elif t == "SS":
                es = max(es, pr["es"] + lag)
            elif t == "FF":
                es = max(es, pr["ef"] + lag - a["duration"])
            else:  # SF
                es = max(es, pr["es"] + lag - a["duration"])
        a["es"] = max(0, es)
        a["ef"] = a["es"] + a["duration"]

    project_finish = max([a["ef"] for a in net], default=0)

    # backward pass
    for aid in reversed(order):
        a = by_id[aid]
        lf = project_finish
        for s in succs[aid]:
            sc = by_id[s["id"]]
            if "lf" not in sc:
                continue
            lag, t = s.get("lag", 0), s.get("type", "FS")
            if t == "FS":
                lf = min(lf, sc["ls"] - lag)
            elif t == "SS":
                lf = min(lf, sc["ls"] - lag + a["duration"])
            elif t == "FF":
                lf = min(lf, sc["lf"] - lag)
            else:  # SF
                lf = min(lf, sc["lf"] - lag + a["duration"])
        a["lf"] = lf
        a["ls"] = a["lf"] - a["duration"]

    for a in net:
        a["total_float"] = a["ls"] - a["es"]
        ff = None
        for s in succs[a["activity_id"]]:
            sc = by_id[s["id"]]
            t, lag = s.get("type", "FS"), s.get("lag", 0)
            if t in ("FS", "FF"):
                slack = sc["es"] - lag - a["ef"] if t == "FS" else sc["ef"] - lag - a["ef"]
            else:
                slack = sc["es"] - lag - a["es"] if t == "SS" else sc["ef"] - lag - a["es"]
            ff = slack if ff is None else min(ff, slack)
        a["free_float"] = a["total_float"] if ff is None else max(0, ff)
        a["critical"] = a["total_float"] <= 0
        a["start"] = _index_to_date(project_start, a["es"]).isoformat()
        finish_idx = a["es"] if a["duration"] == 0 else a["ef"] - 1
        a["finish"] = _index_to_date(project_start, finish_idx).isoformat()
        a["successors"] = format_predecessors(
            [{"id": s["id"], "type": s["type"], "lag": s.get("lag", 0)} for s in succs[a["activity_id"]]]
        )
        for k in ("es", "ef", "ls", "lf"):
            a[k] = int(a[k])

    # summary rollups from WBS descendants
    for a in acts:
        if a.get("type") != "Summary":
            continue
        prefix = (a.get("wbs_code") or "").strip()
        kids = [
            n for n in net
            if prefix and (n.get("wbs_code") or "").startswith(prefix + ".")
        ] or [n for n in net if n.get("wbs_l1") == a.get("wbs_l1")]
        if kids:
            a["es"] = min(k["es"] for k in kids)
            a["ef"] = max(k["ef"] for k in kids)
            a["ls"], a["lf"] = a["es"], a["ef"]
            a["duration"] = a["ef"] - a["es"]
            a["total_float"] = min(k["total_float"] for k in kids)
            a["free_float"] = a["total_float"]
            a["critical"] = any(k["critical"] for k in kids)
            a["start"] = _index_to_date(project_start, a["es"]).isoformat()
            a["finish"] = _index_to_date(project_start, max(a["es"], a["ef"] - 1)).isoformat()
        else:
            a.update({"es": 0, "ef": 0, "ls": 0, "lf": 0, "total_float": 0,
                      "free_float": 0, "critical": False,
                      "start": project_start.isoformat(), "finish": project_start.isoformat()})
        a["successors"] = ""

    return {
        "activities": acts,
        "project_start": project_start.isoformat(),
        "project_finish": _index_to_date(project_start, max(0, project_finish - 1)).isoformat(),
        "duration_working_days": project_finish,
        "has_cycle": cyclic,
        "critical_count": sum(1 for a in net if a["critical"]),
    }
