"""CSV / JSON / MS Project XML exporters."""
import csv
import io
from datetime import date, datetime, timedelta
from xml.sax.saxutils import escape

from cpm import format_predecessors

COLUMNS = [
    "Activity ID", "WBS Code", "WBS L1", "WBS L2", "Description", "Type",
    "Duration (wd)", "Predecessors", "Successors", "Start", "Finish", "Total Float", "Critical",
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
            a.get("total_float", 0), "Yes" if a.get("critical") else "No",
        ])
    return buf.getvalue()


LINK_CODE = {"FF": 0, "FS": 1, "SF": 2, "SS": 3}


def _dt(d, end=False):
    if not d:
        return "2025-01-01T08:00:00"
    day = date.fromisoformat(str(d)[:10])
    return f"{day.isoformat()}T{'17:00:00' if end else '08:00:00'}"


def to_msproject_xml(project_name: str, project_start: str, activities) -> str:
    uid = {a["activity_id"]: i + 1 for i, a in enumerate(activities)}
    rows = []
    for i, a in enumerate(activities):
        atype = a.get("type", "Task")
        dur = 0 if atype == "Milestone" else int(a.get("duration") or 0)
        preds = "".join(
            f"""
        <PredecessorLink>
          <PredecessorUID>{uid[p['id']]}</PredecessorUID>
          <Type>{LINK_CODE.get(p.get('type', 'FS'), 1)}</Type>
          <LinkLag>{int(p.get('lag', 0)) * 4800}</LinkLag>
          <LagFormat>7</LagFormat>
        </PredecessorLink>"""
            for p in (a.get("predecessors") or [])
            if p.get("id") in uid
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
      <Start>{_dt(a.get('start'))}</Start>
      <Finish>{_dt(a.get('finish'), end=True)}</Finish>
      <Duration>PT{dur * 8}H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <TotalSlack>{int(a.get('total_float') or 0) * 4800}</TotalSlack>
      <FreeSlack>{int(a.get('free_float') or 0) * 4800}</FreeSlack>{preds}
    </Task>""")

    finish = max([str(a.get("finish") or "") for a in activities] or [project_start])
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
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <WeekDays>
{''.join(f'''        <WeekDay><DayType>{d}</DayType><DayWorking>{0 if d in (1, 7) else 1}</DayWorking>{'' if d in (1, 7) else '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes>'}</WeekDay>
''' for d in range(1, 8))}      </WeekDays>
    </Calendar>
  </Calendars>
  <Tasks>
{chr(10).join(rows)}
  </Tasks>
</Project>
"""
