"""CSV / JSON / MS Project XML / Primavera P6 XER exporters."""
import base64
import csv
import io
import uuid
import zlib
import xml.etree.ElementTree as ET
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from cpm import format_predecessors

COLUMNS = [
    "Activity ID", "WBS Code", "WBS L1", "WBS L2", "Description", "Type",
    "Duration (wd)", "Predecessors", "Successors", "Start", "Finish",
    "Total Float", "Free Float", "Constraint", "Constraint Date", "Critical",
]


def to_csv(activities: List[Dict[str, Any]]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(COLUMNS)
    for a in activities or []:
        w.writerow([
            a.get("activity_id", ""), a.get("wbs_code", ""), a.get("wbs_l1", ""),
            a.get("wbs_l2", ""), a.get("description", ""), a.get("type", "Task"),
            a.get("duration", 0), format_predecessors(a.get("predecessors")),
            a.get("successors", ""), a.get("start", ""), a.get("finish", ""),
            a.get("total_float", 0), a.get("free_float", 0),
            a.get("constraint_type", ""), a.get("constraint_date", ""),
            "Yes" if a.get("critical") else "No",
        ])
    return buf.getvalue()


# Strict 1-based MSP / Asta link codes: 1=FF, 2=SF, 3=SS, 4=FS
LINK_CODE = {"FF": 1, "SF": 2, "SS": 3, "FS": 4}
MSP_CONSTRAINT = {"": 0, "SNET": 4, "FNLT": 6, "MSO": 2}
WEEKDAY_WORKING = {
    "5-day": {2, 3, 4, 5, 6},
    "6-day": {2, 3, 4, 5, 6, 7},
    "7-day": {1, 2, 3, 4, 5, 6, 7},
}
WBS_FIELD_ID = 188743731  # Text1 field mapping


def _dt(d: Any, end: bool = False) -> str:
    if not d:
        return ""
    clean_date = str(d)[:10]
    return f"{clean_date}T{'17:00:00' if end else '08:00:00'}"


def to_asta_xml(
    project_name: str,
    project_start: str,
    activities: List[Dict[str, Any]],
    calendar: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate perfectly valid MS Project XML using ElementTree."""
    cal = calendar or {}
    pattern = cal.get("week_pattern", "5-day")
    working_days = WEEKDAY_WORKING.get(pattern, WEEKDAY_WORKING["5-day"])
    p_start = str(project_start or date.today().isoformat())[:10]

    finish_dates = [str(a.get("finish"))[:10] for a in activities if a.get("finish")]
    p_finish = max(finish_dates) if finish_dates else p_start
    per_week = 480 * len(working_days)

    root = ET.Element("Project")
    
    # Project Header (Sequence enforced)
    ET.SubElement(root, "SaveVersion").text = "14"
    ET.SubElement(root, "Name").text = f"{project_name or 'Project'}.xml"
    ET.SubElement(root, "Title").text = project_name or "Project"
    ET.SubElement(root, "Author").text = "Programme Generator"
    ET.SubElement(root, "ScheduleFromStart").text = "1"
    ET.SubElement(root, "StartDate").text = _dt(p_start)
    ET.SubElement(root, "FinishDate").text = _dt(p_finish, end=True)
    ET.SubElement(root, "CalendarUID").text = "1"
    ET.SubElement(root, "DefaultStartTime").text = "08:00:00"
    ET.SubElement(root, "DefaultFinishTime").text = "17:00:00"
    ET.SubElement(root, "DurationFormat").text = "7"
    ET.SubElement(root, "MinutesPerDay").text = "480"
    ET.SubElement(root, "MinutesPerWeek").text = str(per_week)
    ET.SubElement(root, "DaysPerMonth").text = "20"
    ET.SubElement(root, "NewTasksAreManual").text = "0"

    # Extended Attributes definition
    ext_attrs = ET.SubElement(root, "ExtendedAttributes")
    ea = ET.SubElement(ext_attrs, "ExtendedAttribute")
    ET.SubElement(ea, "FieldID").text = str(WBS_FIELD_ID)
    ET.SubElement(ea, "FieldName").text = "Text1"
    ET.SubElement(ea, "Alias").text = "WBS Code"

    # Calendars
    cals = ET.SubElement(root, "Calendars")
    cal_el = ET.SubElement(cals, "Calendar")
    ET.SubElement(cal_el, "UID").text = "1"
    ET.SubElement(cal_el, "Name").text = "Standard Calendar"
    ET.SubElement(cal_el, "IsBaseCalendar").text = "1"
    
    wds = ET.SubElement(cal_el, "WeekDays")
    for d in range(1, 8):
        wd = ET.SubElement(wds, "WeekDay")
        ET.SubElement(wd, "DayType").text = str(d)
        is_work = 1 if d in working_days else 0
        ET.SubElement(wd, "DayWorking").text = str(is_work)
        if is_work:
            wts = ET.SubElement(wd, "WorkingTimes")
            wt1 = ET.SubElement(wts, "WorkingTime")
            ET.SubElement(wt1, "FromTime").text = "08:00:00"
            ET.SubElement(wt1, "ToTime").text = "12:00:00"
            wt2 = ET.SubElement(wts, "WorkingTime")
            ET.SubElement(wt2, "FromTime").text = "13:00:00"
            ET.SubElement(wt2, "ToTime").text = "17:00:00"

    holidays = cal.get("holidays", []) or []
    if holidays:
        excs = ET.SubElement(cal_el, "Exceptions")
        for h in holidays:
            exc = ET.SubElement(excs, "Exception")
            ET.SubElement(exc, "EnteredByOccurrences").text = "0"
            tp = ET.SubElement(exc, "TimePeriod")
            ET.SubElement(tp, "FromDate").text = f"{str(h)[:10]}T00:00:00"
            ET.SubElement(tp, "ToDate").text = f"{str(h)[:10]}T23:59:00"
            ET.SubElement(exc, "Occurrences").text = "1"
            ET.SubElement(exc, "Name").text = "Holiday"
            ET.SubElement(exc, "Type").text = "1"
            ET.SubElement(exc, "DayWorking").text = "0"

    # Tasks definition
    tasks_el = ET.SubElement(root, "Tasks")
    uid_map = {a.get("activity_id"): idx for idx, a in enumerate(activities, start=1) if a.get("activity_id")}

    # Root Project Summary Task
    t0 = ET.SubElement(tasks_el, "Task")
    ET.SubElement(t0, "UID").text = "0"
    ET.SubElement(t0, "ID").text = "0"
    ET.SubElement(t0, "Name").text = project_name or "Project"
    ET.SubElement(t0, "Type").text = "1"
    ET.SubElement(t0, "IsNull").text = "0"
    ET.SubElement(t0, "OutlineLevel").text = "0"
    ET.SubElement(t0, "Priority").text = "500"
    ET.SubElement(t0, "Start").text = _dt(p_start)
    ET.SubElement(t0, "Finish").text = _dt(p_finish, end=True)
    ET.SubElement(t0, "Summary").text = "1"

    for idx, a in enumerate(activities, start=1):
        atype = a.get("type", "Task")
        is_ms = atype == "Milestone"
        is_summary = atype == "Summary"
        dur = 0 if is_ms else int(a.get("duration", 0) or 0)
        
        t_el = ET.SubElement(tasks_el, "Task")
        ET.SubElement(t_el, "UID").text = str(idx)
        ET.SubElement(t_el, "ID").text = str(idx)
        ET.SubElement(t_el, "Name").text = a.get("description") or a.get("activity_id") or "Task"
        ET.SubElement(t_el, "Type").text = "1"
        ET.SubElement(t_el, "IsNull").text = "0"
        
        wbs_code = a.get("wbs_code") or a.get("wbs_l1") or ""
        if wbs_code:
            ET.SubElement(t_el, "WBS").text = str(wbs_code)
            ET.SubElement(t_el, "OutlineNumber").text = str(wbs_code)
            
        outline_lvl = 1 if is_summary else (3 if a.get("wbs_l2") else 2)
        ET.SubElement(t_el, "OutlineLevel").text = str(outline_lvl)
        ET.SubElement(t_el, "Priority").text = "500"
        ET.SubElement(t_el, "Start").text = _dt(a.get("start") or p_start)
        ET.SubElement(t_el, "Finish").text = _dt(a.get("finish") or p_start, end=not is_ms)
        ET.SubElement(t_el, "Duration").text = f"PT{dur * 8}H0M0S"
        ET.SubElement(t_el, "DurationFormat").text = "7"
        ET.SubElement(t_el, "Work").text = f"PT{dur * 8}H0M0S"
        ET.SubElement(t_el, "EffortDriven").text = "0"
        ET.SubElement(t_el, "Estimated").text = "0"
        ET.SubElement(t_el, "Milestone").text = "1" if is_ms else "0"
        ET.SubElement(t_el, "Summary").text = "1" if is_summary else "0"
        ET.SubElement(t_el, "Critical").text = "1" if a.get("critical") else "0"
        ET.SubElement(t_el, "IsSubproject").text = "0"
        
        tf_tenths = int(a.get("total_float", 0) or 0) * 4800
        ff_tenths = int(a.get("free_float", 0) or 0) * 4800
        ET.SubElement(t_el, "FreeSlack").text = str(ff_tenths)
        ET.SubElement(t_el, "TotalSlack").text = str(tf_tenths)
        ET.SubElement(t_el, "FixedCost").text = "0"
        ET.SubElement(t_el, "FixedCostAccrual").text = "3"
        ET.SubElement(t_el, "PercentComplete").text = "0"
        ET.SubElement(t_el, "PercentWorkComplete").text = "0"
        
        ctype = str(a.get("constraint_type") or "").upper()
        cdate = a.get("constraint_date")
        ET.SubElement(t_el, "ConstraintType").text = str(MSP_CONSTRAINT.get(ctype, 0))
        if ctype and cdate:
            ET.SubElement(t_el, "ConstraintDate").text = _dt(cdate)
            
        ET.SubElement(t_el, "CalendarUID").text = "1"
        ET.SubElement(t_el, "Manual").text = "0"
        ET.SubElement(t_el, "Active").text = "1"

        # PredecessorLink MUST appear before ExtendedAttribute in XSD sequence
        for p in a.get("predecessors") or []:
            pid = p.get("id") if isinstance(p, dict) else getattr(p, "id", None)
            ptype = (p.get("type", "FS") if isinstance(p, dict) else getattr(p, "type", "FS")) or "FS"
            plag = int((p.get("lag", 0) if isinstance(p, dict) else getattr(p, "lag", 0)) or 0)
            if pid and pid in uid_map:
                link_el = ET.SubElement(t_el, "PredecessorLink")
                ET.SubElement(link_el, "PredecessorUID").text = str(uid_map[pid])
                ET.SubElement(link_el, "Type").text = str(LINK_CODE.get(str(ptype).upper(), 4))
                ET.SubElement(link_el, "LinkLag").text = str(plag * 4800)
                ET.SubElement(link_el, "LagFormat").text = "7"

        # ExtendedAttribute follows Predecessors
        if wbs_code:
            ext_el = ET.SubElement(t_el, "ExtendedAttribute")
            ET.SubElement(ext_el, "FieldID").text = str(WBS_FIELD_ID)
            ET.SubElement(ext_el, "Value").text = str(wbs_code)

    xml_str = ET.tostring(root, encoding="unicode")
    # Hack to inject namespace without triggering ElementTree ValueError bugs
    xml_str = xml_str.replace('<Project>', '<Project xmlns="http://schemas.microsoft.com/project">')
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n{xml_str}'


def to_msproject_xml(
    project_name: str,
    project_start: str,
    activities: List[Dict[str, Any]],
    calendar: Optional[Dict[str, Any]] = None,
) -> str:
    return to_asta_xml(project_name, project_start, activities, calendar)


# ---------------- Primavera P6 XER ----------------
XER_PRED = {"FS": "PR_FS", "SS": "PR_SS", "FF": "PR_FF", "SF": "PR_SF"}
XER_CONSTRAINT = {"SNET": "CS_MSOB", "FNLT": "CS_MEOB", "MSO": "CS_MANDSTART"}
XER_WORKDAY = {"5-day": 5, "6-day": 6, "7-day": 7}


def _xd(d: Any, t: str = "08:00") -> str:
    return f"{str(d)[:10]} {t}" if d else ""


def _table(name: str, fields: List[str], rows: List[List[Any]]) -> List[str]:
    out = [f"%T\t{name}", "%F\t" + "\t".join(fields)]
    for r in rows:
        out.append("%R\t" + "\t".join("" if v is None else str(v) for v in r))
    return out


def to_xer(
    project_name: str,
    project_start: str,
    project_finish: str,
    activities: List[Dict[str, Any]],
    calendar: Optional[Dict[str, Any]] = None,
) -> str:
    cal = calendar or {}
    pattern = cal.get("week_pattern", "5-day")
    ndays = XER_WORKDAY.get(pattern, 5)

    p_start_str = _xd(project_start, "08:00")
    p_finish_str = _xd(project_finish, "17:00")
    proj_guid = f"{{{uuid.uuid4()}}}"

    raw_clndr = (
        "(0||CalendarData()("
        + "".join(
            f"(0||{i + 1}()"
            + ("(0||0(s|08:00|f|12:00)(s|13:00|f|17:00)))" if i < ndays else "))")
            for i in range(7)
        )
        + ")(0||Exceptions()"
        + "".join(f"(0||{str(h).replace('-', '')}()))" for h in cal.get("holidays", []) or [])
        + "))"
    )

    compressed_clndr = zlib.compress(raw_clndr.encode("utf-8"))
    clndr_data_b64 = base64.b64encode(compressed_clndr).decode("ascii")

    lines = [
        "ERMHDR\t19.12\t"
        + datetime.now().strftime("%Y-%m-%d")
        + "\tProject\tadmin\tProgrammeWorks\tdbxDatabaseNoName\tProject Management\tGBP"
    ]

    lines += _table(
        "CURRTYPE",
        ["curr_id", "decimal_digit_cnt", "curr_symbol", "decimal_symbol", "digit_group_symbol",
         "pos_curr_fmt_type", "neg_curr_fmt_type", "curr_type", "curr_short_name",
         "group_digit_cnt", "base_exch_rate"],
        [[1, 2, "£", ".", ",", "#1.1", "(#1.1)", "Pound", "GBP", 3, 1.0]],
    )

    lines += _table(
        "CALENDAR",
        ["clndr_id", "default_flag", "clndr_name", "proj_id", "base_clndr_id", "last_chng_date",
         "clndr_type", "day_hr_cnt", "week_hr_cnt", "month_hr_cnt", "year_hr_cnt", "rsrc_private",
         "clndr_data"],
        [[1, "Y", "Standard Calendar", "", "", "", "CA_Base", 8.0, float(ndays * 8), float(ndays * 8 * 4.34),
          float(ndays * 8 * 52), "N", clndr_data_b64]],
    )

    lines += _table(
        "PROJECT",
        ["proj_id", "fy_start_month_num", "rsrc_self_add_flag", "allow_complete_flag",
         "rsrc_multi_assign_flag", "checkout_flag", "project_flag", "step_complete_flag",
         "cost_qty_recalc_flag", "batch_sum_flag", "name_sep_char", "def_complete_pct_type",
         "proj_short_name", "acct_id", "orig_proj_id", "source_proj_id", "base_type_id",
         "clndr_id", "sum_base_proj_id", "task_code_base", "task_code_step", "priority_num",
         "wbs_max_sum_level", "risk_level", "strgy_priority_num", "last_checksum",
         "critical_drtn_hr_cnt", "def_cost_per_qty", "last_recalc_date", "plan_start_date",
         "plan_end_date", "scd_end_date", "add_date", "last_tasksum_date", "fcst_start_date",
         "def_duration_type", "task_code_prefix", "guid", "def_qty_type", "add_by_name",
         "web_local_root_path", "proj_url", "def_rate_type", "add_act_remain_flag",
         "act_this_per_link_flag", "def_task_type", "act_pct_link_flag", "add_pct_type",
         "tasks_ct", "sum_only_flag", "anticip_start_date", "anticip_end_date"],
        [[1, 1, "N", "Y", "N", "N", "Y", "N", "N", "N", ".", "CP_Drtn", (project_name or "Project")[:40], "", "", "",
          "", 1, "", 1000, 10, 10, 4, "RL_Medium", 100, 0, 0, 0,
          p_start_str, p_start_str, p_finish_str, p_finish_str, p_start_str, "", p_start_str,
          "DT_FixedDUR2", "A", proj_guid, "QT_Hour", "admin", "", "", "COST_PER_QTY_RATE_TYPE1",
          "N", "N", "TT_Task", "N", "CP_Drtn", len(activities), "N", p_start_str, p_finish_str]],
    )

    stages = []
    seen = {}
    for a in activities:
        s = a.get("wbs_l1") or "Programme"
        if s not in seen:
            seen[s] = len(seen) + 2
            stages.append(s)

    wbs_rows = [[1, 1, "", "N", "", 0, 1, (project_name or "Project")[:60], "WBS_Node", "Y", "", "", "", "", "", p_start_str, p_finish_str, f"{{{uuid.uuid4()}}}"]]
    for s in stages:
        wbs_rows.append([seen[s], 1, 1, "N", "", seen[s], 1, s[:60], "WBS_Node", "N", "", "", "", "", "", p_start_str, p_finish_str, f"{{{uuid.uuid4()}}}"])

    lines += _table(
        "PROJWBS",
        ["wbs_id", "proj_id", "parent_wbs_id", "obs_id", "seq_num", "est_wt", "proj_node_flag",
         "sum_data_flag", "status_code", "wbs_short_name", "wbs_name", "phase_id", "orig_cost",
         "indep_remain_total_cost", "ann_dscnt_rate_pct", "anticip_start_date", "anticip_end_date", "guid"],
        [[r[0], 1, r[2] or "", "", r[5], 1, "Y" if r[0] == 1 else "N", "N", "WS_Open",
          (r[7] or "")[:20], r[7], "", 0, 0, "", r[15], r[16], r[17]] for r in wbs_rows],
    )

    task_ids = {a.get("activity_id"): 1000 + i for i, a in enumerate(activities) if a.get("activity_id")}
    task_rows = []
    for i, a in enumerate(activities):
        aid = a.get("activity_id")
        if not aid:
            continue
        atype = a.get("type", "Task")
        dur = 0 if atype == "Milestone" else int(a.get("duration") or 0)
        ttype = "TT_Mile" if atype == "Milestone" else "TT_Task"
        ctype = str(a.get("constraint_type") or "").upper()
        task_rows.append([
            task_ids[aid], 1, seen.get(a.get("wbs_l1") or "Programme", 2), 1,
            "TK_NotStart", aid, (a.get("description") or "")[:120],
            float(dur * 8), float(dur * 8), 0.0, 0.0, ttype, "DT_FixedDUR2", "CP_Drtn",
            float(int(a.get("total_float") or 0) * 8), float(int(a.get("free_float") or 0) * 8),
            "Y" if a.get("critical") else "N",
            _xd(a.get("start")), _xd(a.get("finish"), "17:00"),
            _xd(a.get("start")), _xd(a.get("finish"), "17:00"),
            XER_CONSTRAINT.get(ctype, ""), _xd(a.get("constraint_date")) if ctype else "",
            i + 1,
            f"{{{uuid.uuid4()}}}",
        ])

    lines += _table(
        "TASK",
        ["task_id", "proj_id", "wbs_id", "clndr_id", "status_code", "task_code", "task_name",
         "target_drtn_hr_cnt", "remain_drtn_hr_cnt", "act_work_qty", "target_work_qty",
         "task_type", "duration_type", "complete_pct_type", "total_float_hr_cnt",
         "free_float_hr_cnt", "driving_path_flag", "early_start_date", "early_end_date",
         "target_start_date", "target_end_date", "cstr_type", "cstr_date", "phys_complete_pct", "guid"],
        task_rows,
    )

    pred_rows = []
    n = 1
    for a in activities:
        aid = a.get("activity_id")
        if not aid or aid not in task_ids:
            continue
        for p in a.get("predecessors") or []:
            pid = p.get("id") if isinstance(p, dict) else getattr(p, "id", None)
            ptype = (p.get("type", "FS") if isinstance(p, dict) else getattr(p, "type", "FS")) or "FS"
            plag = int((p.get("lag", 0) if isinstance(p, dict) else getattr(p, "lag", 0)) or 0)
            if pid and pid in task_ids:
                pred_rows.append([
                    n, task_ids[aid], task_ids[pid], 1, 1,
                    XER_PRED.get(str(ptype).upper(), "PR_FS"), float(plag * 8), "", "N",
                ])
                n += 1

    lines += _table(
        "TASKPRED",
        ["task_pred_id", "task_id", "pred_task_id", "proj_id", "pred_proj_id", "pred_type",
         "lag_hr_cnt", "comments", "float_path"],
        pred_rows,
    )

    lines.append("%E")
    return "\n".join(lines) + "\n"