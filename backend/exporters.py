"""CSV / JSON / MS Project XML / Primavera P6 XER exporters."""
import csv
import io
from datetime import date, datetime
from xml.sax.saxutils import escape

from cpm import format_predecessors

COLUMNS = [
    "Activity ID", "WBS Code", "WBS L1", "WBS L2", "Description", "Type",
    "Duration (wd)", "Predecessors", "Successors", "Start", "Finish",
    "Total Float", "Free Float", "Constraint", "Constraint Date", "Critical",
]


def to_csv(activities) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(COLUMNS)
    for a in activities:
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


LINK_CODE = {"FF": 0, "FS": 1, "SF": 2, "SS": 3}
MSP_CONSTRAINT = {"": 0, "SNET": 4, "FNLT": 6, "MSO": 2}
WEEKDAY_WORKING = {"5-day": {2, 3, 4, 5, 6}, "6-day": {2, 3, 4, 5, 6, 7}, "7-day": {1, 2, 3, 4, 5, 6, 7}}


def _dt(d, end=False):
    day = date.fromisoformat(str(d)[:10])
    return f"{day.isoformat()}T{'17:00:00' if end else '08:00:00'}"


def to_msproject_xml(project_name: str, project_start: str, activities, calendar=None) -> str:
    cal = calendar or {}
    pattern = cal.get("week_pattern", "5-day")
    working = WEEKDAY_WORKING.get(pattern, WEEKDAY_WORKING["5-day"])
    hours = (
        "<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>"
        "<WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>"
    )
    weekdays = "".join(
        f"<WeekDay><DayType>{d}</DayType><DayWorking>{1 if d in working else 0}</DayWorking>"
        f"{hours if d in working else ''}</WeekDay>"
        for d in range(1, 8)
    )
    exceptions = "".join(
        f"<Exception><EnteredByOccurrences>0</EnteredByOccurrences><TimePeriod>"
        f"<FromDate>{h}T00:00:00</FromDate><ToDate>{h}T23:59:00</ToDate></TimePeriod>"
        f"<Occurrences>1</Occurrences><Name>Holiday</Name><Type>1</Type><DayWorking>0</DayWorking></Exception>"
        for h in cal.get("holidays", [])
    )

    uid = {a["activity_id"]: i + 1 for i, a in enumerate(activities)}
    rows = []
    for i, a in enumerate(activities):
        atype = a.get("type", "Task")
        dur = 0 if atype == "Milestone" else int(a.get("duration") or 0)
        preds = "".join(
            f"<PredecessorLink><PredecessorUID>{uid[p['id']]}</PredecessorUID>"
            f"<Type>{LINK_CODE.get(p.get('type', 'FS'), 1)}</Type>"
            f"<LinkLag>{int(p.get('lag', 0)) * 4800}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>"
            for p in (a.get("predecessors") or [])
            if p.get("id") in uid
        )
        ctype = (a.get("constraint_type") or "").upper()
        cdate = a.get("constraint_date")
        constraint = f"<ConstraintType>{MSP_CONSTRAINT.get(ctype, 0)}</ConstraintType>" + (
            f"<ConstraintDate>{_dt(cdate)}</ConstraintDate>" if ctype and cdate else ""
        )
        rows.append(f"""    <Task>
      <UID>{uid[a['activity_id']]}</UID>
      <ID>{i + 1}</ID>
      <Name>{escape(str(a.get('description') or a['activity_id']))}</Name>
      <Type>1</Type>
      <OutlineLevel>{3 if atype != 'Summary' else 1}</OutlineLevel>
      <WBS>{escape(str(a.get('wbs_code') or ''))}</WBS>
      <Milestone>{1 if atype == 'Milestone' else 0}</Milestone>
      <Summary>{1 if atype == 'Summary' else 0}</Summary>
      <Critical>{1 if a.get('critical') else 0}</Critical>
      <Start>{_dt(a.get('start') or project_start)}</Start>
      <Finish>{_dt(a.get('finish') or project_start, end=True)}</Finish>
      <Duration>PT{dur * 8}H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <TotalSlack>{int(a.get('total_float') or 0) * 4800}</TotalSlack>
      <FreeSlack>{int(a.get('free_float') or 0) * 4800}</FreeSlack>
      {constraint}{preds}
    </Task>""")

    finish = max([str(a.get("finish") or "") for a in activities] or [project_start])
    per_week = 480 * len(working)
    return f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>{escape(project_name)}.xml</Name>
  <Title>{escape(project_name)}</Title>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>{_dt(project_start)}</StartDate>
  <FinishDate>{_dt(finish, end=True)}</FinishDate>
  <CurrentDate>{datetime.now().strftime('%Y-%m-%dT%H:%M:%S')}</CurrentDate>
  <CalendarUID>1</CalendarUID>
  <DurationFormat>7</DurationFormat>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>{per_week}</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Programme Calendar</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <WeekDays>{weekdays}</WeekDays>
      <Exceptions>{exceptions}</Exceptions>
    </Calendar>
  </Calendars>
  <Tasks>
{chr(10).join(rows)}
  </Tasks>
</Project>
"""


# ---------------- Primavera P6 XER ----------------
XER_PRED = {"FS": "PR_FS", "SS": "PR_SS", "FF": "PR_FF", "SF": "PR_SF"}
XER_CONSTRAINT = {"SNET": "CS_MSO", "FNLT": "CS_MEOB", "MSO": "CS_MANDSTART"}
XER_WORKDAY = {"5-day": 5, "6-day": 6, "7-day": 7}


def _xd(d, t="08:00"):
    return f"{str(d)[:10]} {t}" if d else ""


def _table(name, fields, rows):
    out = [f"%T\t{name}", "%F\t" + "\t".join(fields)]
    for r in rows:
        out.append("%R\t" + "\t".join("" if v is None else str(v) for v in r))
    return out


def to_xer(project_name: str, project_start: str, project_finish: str, activities, calendar=None) -> str:
    cal = calendar or {}
    pattern = cal.get("week_pattern", "5-day")
    ndays = XER_WORKDAY.get(pattern, 5)
    day_hours = ["0" for _ in range(7)]
    for i in range(ndays):
        day_hours[i] = "1"
    clndr_data = (
        "(0||CalendarData()("
        + "".join(
            f"(0||{i + 1}()"
            + ("(0||0(s|08:00|f|12:00)(s|13:00|f|17:00)))" if i < ndays else "))")
            for i in range(7)
        )
        + ")(0||Exceptions()"
        + "".join(f"(0||{h.replace('-', '')}()))" for h in cal.get("holidays", []))
        + "))"
    )

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
        [[1, 2, "£", ".", ",", "#1.1", "(#1.1)", "Pound", "GBP", 3, 1]],
    )

    lines += _table(
        "CALENDAR",
        ["clndr_id", "default_flag", "clndr_name", "proj_id", "base_clndr_id", "last_chng_date",
         "clndr_type", "day_hr_cnt", "week_hr_cnt", "month_hr_cnt", "year_hr_cnt", "rsrc_private",
         "clndr_data"],
        [[1, "Y", "Programme Calendar", "", "", "", "CA_Base", 8, ndays * 8, ndays * 8 * 4.34,
          ndays * 8 * 52, "N", clndr_data]],
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
         "tasks_ct", "sum_only_flag"],
        [[1, 1, "N", "Y", "N", "N", "Y", "N", "N", "N", ".", "CP_Drtn", project_name[:40], "", "", "",
          "", 1, "", 1000, 10, 10, 4, "RL_Medium", 100, 0, 0, 0,
          _xd(project_start), _xd(project_start), _xd(project_finish, "17:00"),
          _xd(project_finish, "17:00"), _xd(project_start), "", _xd(project_start),
          "DT_FixedDUR2", "A", "", "QT_Hour", "admin", "", "", "COST_PER_QTY_RATE_TYPE1",
          "N", "N", "TT_Task", "N", "CP_Drtn", len(activities), "N"]],
    )

    stages = []
    seen = {}
    for a in activities:
        s = a.get("wbs_l1") or "Programme"
        if s not in seen:
            seen[s] = len(seen) + 2  # 1 reserved for the project root node
            stages.append(s)
    wbs_rows = [[1, 1, "", "N", "", 0, 1, project_name[:60], "WBS_Node", "Y", "", "", "", "", ""]]
    for s in stages:
        wbs_rows.append([seen[s], 1, 1, "N", "", seen[s], 1, s[:60], "WBS_Node", "N", "", "", "", "", ""])
    lines += _table(
        "PROJWBS",
        ["wbs_id", "proj_id", "parent_wbs_id", "obs_id", "seq_num", "est_wt", "proj_node_flag",
         "sum_data_flag", "status_code", "wbs_short_name", "wbs_name", "phase_id", "orig_cost",
         "indep_remain_total_cost", "ann_dscnt_rate_pct"],
        [[r[0], 1, r[2] or "", "", r[5], 1, "Y" if r[0] == 1 else "N", "N", "WS_Open",
          (r[7] or "")[:20], r[7], "", 0, 0, ""] for r in wbs_rows],
    )

    task_ids = {a["activity_id"]: 1000 + i for i, a in enumerate(activities)}
    task_rows = []
    for i, a in enumerate(activities):
        atype = a.get("type", "Task")
        dur = 0 if atype == "Milestone" else int(a.get("duration") or 0)
        ttype = "TT_Mile" if atype == "Milestone" else "TT_Task"
        ctype = (a.get("constraint_type") or "").upper()
        task_rows.append([
            task_ids[a["activity_id"]], 1, seen.get(a.get("wbs_l1") or "Programme", 2), 1,
            "TK_NotStart", a["activity_id"], (a.get("description") or "")[:120],
            dur * 8, dur * 8, 0, 0, ttype, "DT_FixedDUR2", "CP_Drtn",
            int(a.get("total_float") or 0) * 8, int(a.get("free_float") or 0) * 8,
            "Y" if a.get("critical") else "N",
            _xd(a.get("start")), _xd(a.get("finish"), "17:00"),
            _xd(a.get("start")), _xd(a.get("finish"), "17:00"),
            XER_CONSTRAINT.get(ctype, ""), _xd(a.get("constraint_date")) if ctype else "",
            i + 1,
        ])
    lines += _table(
        "TASK",
        ["task_id", "proj_id", "wbs_id", "clndr_id", "status_code", "task_code", "task_name",
         "target_drtn_hr_cnt", "remain_drtn_hr_cnt", "act_work_qty", "target_work_qty",
         "task_type", "duration_type", "complete_pct_type", "total_float_hr_cnt",
         "free_float_hr_cnt", "driving_path_flag", "early_start_date", "early_end_date",
         "target_start_date", "target_end_date", "cstr_type", "cstr_date", "phys_complete_pct"],
        task_rows,
    )

    pred_rows = []
    n = 1
    for a in activities:
        for p in a.get("predecessors") or []:
            if p.get("id") not in task_ids:
                continue
            pred_rows.append([
                n, task_ids[a["activity_id"]], task_ids[p["id"]], 1, 1,
                XER_PRED.get(p.get("type", "FS"), "PR_FS"), int(p.get("lag", 0)) * 8, "", "N",
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
