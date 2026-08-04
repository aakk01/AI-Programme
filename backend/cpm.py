"""CPM engine: forward/backward pass on a configurable working calendar."""
import re
from datetime import date, timedelta

import holiday_presets

LINK_TYPES = {"FS", "SS", "FF", "SF"}
_LINK_RE = re.compile(r"^\s*([A-Za-z0-9_.\-]+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?\s*$", re.I)

WEEK_PATTERNS = {
    "5-day": {0, 1, 2, 3, 4},
    "6-day": {0, 1, 2, 3, 4, 5},
    "7-day": {0, 1, 2, 3, 4, 5, 6},
}

CONSTRAINTS = {"", "SNET", "FNLT", "MSO"}


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


class WorkCalendar:
    """Maps working-day indices to calendar dates for a given week pattern and holiday set."""

    def __init__(self, week_pattern="5-day", holiday_region="none", holidays=None, horizon=4000):
        self.week_pattern = week_pattern if week_pattern in WEEK_PATTERNS else "5-day"
        self.workdays = WEEK_PATTERNS[self.week_pattern]
        self.holiday_region = holiday_region or "none"
        self.holidays = set(holiday_presets.resolve(self.holiday_region, holidays))
        self.horizon = horizon
        self._dates = []
        self._index = {}

    @classmethod
    def from_config(cls, cfg):
        cfg = cfg or {}
        return cls(
            week_pattern=cfg.get("week_pattern", "5-day"),
            holiday_region=cfg.get("holiday_region", "none"),
            holidays=cfg.get("holidays", []),
        )

    def is_working(self, d: date) -> bool:
        return d.weekday() in self.workdays and d.isoformat() not in self.holidays

    def build(self, start: date):
        d = start
        while not self.is_working(d):
            d += timedelta(days=1)
        self._dates, self._index = [], {}
        for _ in range(self.horizon):
            self._dates.append(d)
            self._index[d.isoformat()] = len(self._dates) - 1
            d += timedelta(days=1)
            while not self.is_working(d):
                d += timedelta(days=1)
        return self

    def date_at(self, idx: int) -> date:
        idx = max(0, min(int(idx), len(self._dates) - 1))
        return self._dates[idx]

    def iso_at(self, idx: int) -> str:
        return self.date_at(idx).isoformat()

    def index_of(self, iso: str):
        """Working-day index of a calendar date; rolls forward to the next working day."""
        if not iso:
            return None
        try:
            d = date.fromisoformat(str(iso)[:10])
        except ValueError:
            return None
        if d < self._dates[0]:
            return 0
        for _ in range(40):
            if d.isoformat() in self._index:
                return self._index[d.isoformat()]
            d += timedelta(days=1)
        return None


def calculate(activities, project_start, calendar_config=None):
    if isinstance(project_start, str):
        project_start = date.fromisoformat(project_start[:10])
    cal = WorkCalendar.from_config(calendar_config).build(project_start)

    acts = [dict(a) for a in activities]
    net = [a for a in acts if a.get("type") != "Summary"]
    by_id = {a["activity_id"]: a for a in net}

    for a in net:
        a["duration"] = 0 if a.get("type") == "Milestone" else max(0, int(a.get("duration") or 0))
        a["predecessors"] = [p for p in (a.get("predecessors") or []) if p.get("id") in by_id]
        ctype = (a.get("constraint_type") or "").upper()
        a["constraint_type"] = ctype if ctype in CONSTRAINTS else ""
        a["_cidx"] = cal.index_of(a.get("constraint_date")) if a["constraint_type"] else None
        if a["_cidx"] is None:
            a["constraint_type"] = a["constraint_type"] if a.get("constraint_date") else ""

    succs = {a["activity_id"]: [] for a in net}
    indeg = {a["activity_id"]: 0 for a in net}
    for a in net:
        for p in a["predecessors"]:
            succs[p["id"]].append({"id": a["activity_id"], "type": p.get("type", "FS"), "lag": p.get("lag", 0)})
            indeg[a["activity_id"]] += 1

    order, queue = [], sorted([i for i, d in indeg.items() if d == 0])
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
            else:
                es = max(es, pr["es"] + lag - a["duration"])
        ct, ci = a["constraint_type"], a["_cidx"]
        if ct == "MSO" and ci is not None:
            es = ci
        elif ct == "SNET" and ci is not None:
            es = max(es, ci)
        a["es"] = max(0, es)
        a["ef"] = a["es"] + a["duration"]

    project_finish = max([a["ef"] for a in net], default=0)

    # backward pass
    for aid in reversed(order):
        a = by_id[aid]
        lf = project_finish
        ct, ci = a["constraint_type"], a["_cidx"]
        if ct == "FNLT" and ci is not None:
            lf = min(lf, ci + 1)
        if ct == "MSO" and ci is not None:
            lf = min(lf, ci + a["duration"])
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
            else:
                lf = min(lf, sc["lf"] - lag + a["duration"])
        a["lf"] = lf
        a["ls"] = a["lf"] - a["duration"]

    for a in net:
        a["total_float"] = a["ls"] - a["es"]
        ff = None
        for s in succs[a["activity_id"]]:
            sc = by_id[s["id"]]
            t, lag = s.get("type", "FS"), s.get("lag", 0)
            if t == "FS":
                slack = sc["es"] - lag - a["ef"]
            elif t == "FF":
                slack = sc["ef"] - lag - a["ef"]
            elif t == "SS":
                slack = sc["es"] - lag - a["es"]
            else:
                slack = sc["ef"] - lag - a["es"]
            ff = slack if ff is None else min(ff, slack)
        a["free_float"] = a["total_float"] if ff is None else max(0, ff)
        a["critical"] = a["total_float"] <= 0
        a["start"] = cal.iso_at(a["es"])
        a["finish"] = cal.iso_at(a["es"] if a["duration"] == 0 else a["ef"] - 1)
        a["successors"] = format_predecessors(
            [{"id": s["id"], "type": s["type"], "lag": s.get("lag", 0)} for s in succs[a["activity_id"]]]
        )
        for k in ("es", "ef", "ls", "lf"):
            a[k] = int(a[k])
        a.pop("_cidx", None)

    # summary rollups from WBS descendants
    for a in acts:
        if a.get("type") != "Summary":
            continue
        prefix = (a.get("wbs_code") or "").strip()
        kids = [n for n in net if prefix and (n.get("wbs_code") or "").startswith(prefix + ".")] or [
            n for n in net if n.get("wbs_l1") == a.get("wbs_l1")
        ]
        if kids:
            a["es"] = min(k["es"] for k in kids)
            a["ef"] = max(k["ef"] for k in kids)
            a["ls"], a["lf"] = a["es"], a["ef"]
            a["duration"] = a["ef"] - a["es"]
            a["total_float"] = min(k["total_float"] for k in kids)
            a["free_float"] = a["total_float"]
            a["critical"] = any(k["critical"] for k in kids)
            a["start"] = cal.iso_at(a["es"])
            a["finish"] = cal.iso_at(max(a["es"], a["ef"] - 1))
        else:
            a.update({"es": 0, "ef": 0, "ls": 0, "lf": 0, "total_float": 0, "free_float": 0,
                      "critical": False, "start": cal.iso_at(0), "finish": cal.iso_at(0)})
        a["successors"] = ""
        a.pop("_cidx", None)

    finish_iso = cal.iso_at(max(0, project_finish - 1))
    return {
        "activities": acts,
        "project_start": cal.iso_at(0),
        "project_finish": finish_iso,
        "duration_working_days": project_finish,
        "has_cycle": cyclic,
        "critical_count": sum(1 for a in net if a["critical"]),
        "calendar": {
            "week_pattern": cal.week_pattern,
            "holiday_region": cal.holiday_region,
            "holidays": sorted(cal.holidays),
            "working_days_per_week": len(cal.workdays),
        },
        "_calendar_obj": cal,
    }


def variance_report(result, target_completion, activities):
    """Forecast vs target completion, plus milestone and critical-path detail."""
    cal = result["_calendar_obj"]
    forecast = result["project_finish"]
    out = {
        "forecast_finish": forecast,
        "target_finish": target_completion or None,
        "variance_working_days": None,
        "variance_calendar_days": None,
        "status": "no_target",
        "milestones": [],
        "negative_float_activities": [],
        "critical_path": [],
    }
    if target_completion:
        t_idx = cal.index_of(target_completion)
        f_idx = cal.index_of(forecast)
        if t_idx is not None and f_idx is not None:
            out["variance_working_days"] = f_idx - t_idx
            out["variance_calendar_days"] = (
                date.fromisoformat(forecast) - date.fromisoformat(str(target_completion)[:10])
            ).days
            out["status"] = (
                "on_time" if out["variance_working_days"] == 0
                else "late" if out["variance_working_days"] > 0
                else "early"
            )
    for a in activities:
        if a.get("type") == "Milestone":
            out["milestones"].append({
                "activity_id": a["activity_id"], "description": a.get("description", ""),
                "date": a.get("start"), "total_float": a.get("total_float", 0),
                "critical": a.get("critical", False),
            })
        if (a.get("total_float") or 0) < 0:
            out["negative_float_activities"].append({
                "activity_id": a["activity_id"], "description": a.get("description", ""),
                "total_float": a["total_float"],
                "constraint": f"{a.get('constraint_type', '')} {a.get('constraint_date', '') or ''}".strip(),
            })
        if a.get("critical") and a.get("type") != "Summary":
            out["critical_path"].append({
                "activity_id": a["activity_id"], "description": a.get("description", ""),
                "duration": a.get("duration", 0), "start": a.get("start"), "finish": a.get("finish"),
            })
    return out
