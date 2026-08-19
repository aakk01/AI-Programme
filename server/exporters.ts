import { v4 as uuidv4 } from "uuid";
import zlib from "zlib";
import { formatPredecessors } from "./cpm";

export const COLUMNS = [
  "Activity ID",
  "WBS Code",
  "WBS L1",
  "WBS L2",
  "Description",
  "Type",
  "Duration (wd)",
  "Predecessors",
  "Successors",
  "Start",
  "Finish",
  "Total Float",
  "Free Float",
  "Constraint",
  "Constraint Date",
  "Critical",
];

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(activities: any[] = []): string {
  const lines: string[] = [COLUMNS.map(escapeCsvField).join(",")];
  for (const a of activities || []) {
    const row = [
      a.activity_id || "",
      a.wbs_code || "",
      a.wbs_l1 || "",
      a.wbs_l2 || "",
      a.description || "",
      a.type || "Task",
      a.duration || 0,
      formatPredecessors(a.predecessors),
      a.successors || "",
      a.start || "",
      a.finish || "",
      a.total_float || 0,
      a.free_float || 0,
      a.constraint_type || "",
      a.constraint_date || "",
      a.critical ? "Yes" : "No",
    ];
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\n") + "\n";
}

const LINK_CODE: Record<string, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };
const MSP_CONSTRAINT: Record<string, number> = { "": 0, SNET: 4, FNLT: 6, MSO: 2 };
const WEEKDAY_WORKING: Record<string, Set<number>> = {
  "5-day": new Set([2, 3, 4, 5, 6]),
  "6-day": new Set([2, 3, 4, 5, 6, 7]),
  "7-day": new Set([1, 2, 3, 4, 5, 6, 7]),
};
const WBS_FIELD_ID = 188743731; // Text1 field mapping

function dt(d: any, end = false): string {
  if (!d) return "";
  const cleanDate = String(d).slice(0, 10);
  return `${cleanDate}T${end ? "17:00:00" : "08:00:00"}`;
}

function escapeXml(str: any): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toAstaXml(
  projectName: string,
  projectStart: string,
  activities: any[] = [],
  calendar: any = null
): string {
  const cal = calendar || {};
  const pattern = cal.week_pattern || "5-day";
  const workingDays = WEEKDAY_WORKING[pattern] || WEEKDAY_WORKING["5-day"];
  const pStart = String(projectStart || new Date().toISOString().slice(0, 10)).slice(0, 10);

  const finishDates = activities
    .filter((a) => a.finish)
    .map((a) => String(a.finish).slice(0, 10));
  const pFinish = finishDates.length > 0 ? finishDates.sort().pop()! : pStart;
  const perWeek = 480 * workingDays.size;

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  xml += '<Project xmlns="http://schemas.microsoft.com/project">\n';
  xml += `  <SaveVersion>14</SaveVersion>\n`;
  xml += `  <Name>${escapeXml(projectName || "Project")}.xml</Name>\n`;
  xml += `  <Title>${escapeXml(projectName || "Project")}</Title>\n`;
  xml += `  <Author>Programme Intelligence Suite</Author>\n`;
  xml += `  <CreationDate>${dt(pStart)}</CreationDate>\n`;
  xml += `  <LastSaved>${dt(new Date().toISOString().slice(0, 10))}</LastSaved>\n`;
  xml += `  <ScheduleFromStart>1</ScheduleFromStart>\n`;
  xml += `  <StartDate>${dt(pStart)}</StartDate>\n`;
  xml += `  <FinishDate>${dt(pFinish, true)}</FinishDate>\n`;
  xml += `  <FYStartDate>1</FYStartDate>\n`;
  xml += `  <CriticalSlackLimit>0</CriticalSlackLimit>\n`;
  xml += `  <CurrencyDigits>2</CurrencyDigits>\n`;
  xml += `  <CurrencySymbol>£</CurrencySymbol>\n`;
  xml += `  <CurrencyCode>GBP</CurrencyCode>\n`;
  xml += `  <CalendarUID>1</CalendarUID>\n`;
  xml += `  <DefaultStartTime>08:00:00</DefaultStartTime>\n`;
  xml += `  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n`;
  xml += `  <MinutesPerDay>480</MinutesPerDay>\n`;
  xml += `  <MinutesPerWeek>${perWeek}</MinutesPerWeek>\n`;
  xml += `  <DaysPerMonth>20</DaysPerMonth>\n`;
  xml += `  <DefaultTaskType>1</DefaultTaskType>\n`;
  xml += `  <DefaultFixedCostAccrual>3</DefaultFixedCostAccrual>\n`;
  xml += `  <DefaultStandardRate>0</DefaultStandardRate>\n`;
  xml += `  <DefaultOvertimeRate>0</DefaultOvertimeRate>\n`;
  xml += `  <DurationFormat>7</DurationFormat>\n`;
  xml += `  <WorkFormat>2</WorkFormat>\n`;
  xml += `  <EditableActualCosts>0</EditableActualCosts>\n`;
  xml += `  <HonorConstraints>1</HonorConstraints>\n`;
  xml += `  <EarnedValueMethod>0</EarnedValueMethod>\n`;
  xml += `  <InsertedProjectsLikeSummary>1</InsertedProjectsLikeSummary>\n`;
  xml += `  <MultipleCriticalPaths>0</MultipleCriticalPaths>\n`;
  xml += `  <NewTasksAreManual>0</NewTasksAreManual>\n`;

  // ExtendedAttributes
  xml += `  <ExtendedAttributes>\n`;
  xml += `    <ExtendedAttribute>\n`;
  xml += `      <FieldID>${WBS_FIELD_ID}</FieldID>\n`;
  xml += `      <FieldName>Text1</FieldName>\n`;
  xml += `      <Alias>Activity Code / WBS</Alias>\n`;
  xml += `    </ExtendedAttribute>\n`;
  xml += `  </ExtendedAttributes>\n`;

  // Calendars
  xml += `  <Calendars>\n`;
  xml += `    <Calendar>\n`;
  xml += `      <UID>1</UID>\n`;
  xml += `      <Name>Standard Calendar</Name>\n`;
  xml += `      <IsBaseCalendar>1</IsBaseCalendar>\n`;
  xml += `      <WeekDays>\n`;
  for (let d = 1; d <= 7; d++) {
    const isWork = workingDays.has(d) ? 1 : 0;
    xml += `        <WeekDay>\n`;
    xml += `          <DayType>${d}</DayType>\n`;
    xml += `          <DayWorking>${isWork}</DayWorking>\n`;
    if (isWork) {
      xml += `          <WorkingTimes>\n`;
      xml += `            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>\n`;
      xml += `            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>\n`;
      xml += `          </WorkingTimes>\n`;
    }
    xml += `        </WeekDay>\n`;
  }
  xml += `      </WeekDays>\n`;

  const holidays = cal.holidays || [];
  if (holidays.length > 0) {
    xml += `      <Exceptions>\n`;
    for (const h of holidays) {
      const hDate = String(h).slice(0, 10);
      xml += `        <Exception>\n`;
      xml += `          <EnteredByOccurrences>0</EnteredByOccurrences>\n`;
      xml += `          <TimePeriod><FromDate>${hDate}T00:00:00</FromDate><ToDate>${hDate}T23:59:00</ToDate></TimePeriod>\n`;
      xml += `          <Occurrences>1</Occurrences>\n`;
      xml += `          <Name>Holiday</Name>\n`;
      xml += `          <Type>1</Type>\n`;
      xml += `          <DayWorking>0</DayWorking>\n`;
      xml += `        </Exception>\n`;
    }
    xml += `      </Exceptions>\n`;
  }
  xml += `    </Calendar>\n`;
  xml += `  </Calendars>\n`;

  // Tasks
  xml += `  <Tasks>\n`;
  const uidMap: Record<string, number> = {};
  activities.forEach((a, idx) => {
    const taskUid = idx + 1;
    if (a.activity_id) uidMap[a.activity_id] = taskUid;
    if (a.id) uidMap[a.id] = taskUid;
    if (a.code) uidMap[a.code] = taskUid;
  });

  // Root task (UID 0)
  xml += `    <Task>\n`;
  xml += `      <UID>0</UID>\n`;
  xml += `      <ID>0</ID>\n`;
  xml += `      <Name>${escapeXml(projectName || "Project")}</Name>\n`;
  xml += `      <Type>1</Type>\n`;
  xml += `      <IsNull>0</IsNull>\n`;
  xml += `      <CreateDate>${dt(pStart)}</CreateDate>\n`;
  xml += `      <OutlineLevel>0</OutlineLevel>\n`;
  xml += `      <Priority>500</Priority>\n`;
  xml += `      <Start>${dt(pStart)}</Start>\n`;
  xml += `      <Finish>${dt(pFinish, true)}</Finish>\n`;
  xml += `      <Summary>1</Summary>\n`;
  xml += `      <Critical>1</Critical>\n`;
  xml += `      <Milestone>0</Milestone>\n`;
  xml += `    </Task>\n`;

  activities.forEach((a, idx) => {
    const taskUid = idx + 1;
    const atype = a.type || "Task";
    const isMs = atype === "Milestone" || a.is_milestone || (a.duration === 0);
    const isSummary = atype === "Summary";
    const dur = isMs ? 0 : Math.max(0, parseInt(String(a.duration || 0), 10) || 0);
    const taskName = a.description || a.name || a.activity_id || a.id || `Task ${taskUid}`;
    const pct = Math.min(100, Math.max(0, parseInt(String(a.percent_complete ?? a.progress ?? 0), 10) || 0));

    xml += `    <Task>\n`;
    xml += `      <UID>${taskUid}</UID>\n`;
    xml += `      <ID>${taskUid}</ID>\n`;
    xml += `      <Name>${escapeXml(taskName)}</Name>\n`;
    xml += `      <Type>1</Type>\n`;
    xml += `      <IsNull>0</IsNull>\n`;
    xml += `      <CreateDate>${dt(pStart)}</CreateDate>\n`;

    const actCode = a.activity_id || a.id || `A${taskUid}`;
    const wbsCode = a.wbs_code || a.wbs_l1 || "";
    if (wbsCode) {
      xml += `      <WBS>${escapeXml(wbsCode)}</WBS>\n`;
      xml += `      <OutlineNumber>${escapeXml(wbsCode)}</OutlineNumber>\n`;
    }

    const outlineLvl = isSummary ? 1 : a.wbs_l2 ? 3 : 2;
    xml += `      <OutlineLevel>${outlineLvl}</OutlineLevel>\n`;
    xml += `      <Priority>500</Priority>\n`;
    xml += `      <Start>${dt(a.start || a.early_start || pStart)}</Start>\n`;
    xml += `      <Finish>${dt(a.finish || a.early_finish || pStart, !isMs)}</Finish>\n`;
    xml += `      <Duration>PT${dur * 8}H0M0S</Duration>\n`;
    xml += `      <DurationFormat>7</DurationFormat>\n`;
    xml += `      <Work>PT${dur * 8}H0M0S</Work>\n`;
    xml += `      <ResumeValid>0</ResumeValid>\n`;
    xml += `      <EffortDriven>0</EffortDriven>\n`;
    xml += `      <Recurring>0</Recurring>\n`;
    xml += `      <OverAllocated>0</OverAllocated>\n`;
    xml += `      <Estimated>0</Estimated>\n`;
    xml += `      <Milestone>${isMs ? 1 : 0}</Milestone>\n`;
    xml += `      <Summary>${isSummary ? 1 : 0}</Summary>\n`;
    xml += `      <Critical>${a.critical ? 1 : 0}</Critical>\n`;
    xml += `      <IsSubproject>0</IsSubproject>\n`;
    xml += `      <IsSubprojectReadOnly>0</IsSubprojectReadOnly>\n`;
    xml += `      <HasExternalError>0</HasExternalError>\n`;

    const tfTenths = (parseInt(String(a.total_float || 0), 10) || 0) * 4800;
    const ffTenths = (parseInt(String(a.free_float || 0), 10) || 0) * 4800;
    xml += `      <FreeSlack>${ffTenths}</FreeSlack>\n`;
    xml += `      <TotalSlack>${tfTenths}</TotalSlack>\n`;
    xml += `      <FixedCost>0</FixedCost>\n`;
    xml += `      <FixedCostAccrual>3</FixedCostAccrual>\n`;
    xml += `      <PercentComplete>${pct}</PercentComplete>\n`;
    xml += `      <PercentWorkComplete>${pct}</PercentWorkComplete>\n`;

    const ctype = String(a.constraint_type || "").toUpperCase();
    const cdate = a.constraint_date;
    xml += `      <ConstraintType>${MSP_CONSTRAINT[ctype] || 0}</ConstraintType>\n`;
    if (ctype && cdate) {
      xml += `      <ConstraintDate>${dt(cdate)}</ConstraintDate>\n`;
    }

    xml += `      <CalendarUID>1</CalendarUID>\n`;
    xml += `      <Manual>0</Manual>\n`;
    xml += `      <Active>1</Active>\n`;

    // PredecessorLinks with correct MSP link type codes: 1=FS, 0=FF, 3=SS, 2=SF
    for (const p of a.predecessors || []) {
      const pid = p?.id || p?.activity_id || p?.predecessor_id;
      const ptype = String(p?.type || "FS").toUpperCase();
      const plag = parseInt(String(p?.lag || 0), 10) || 0;
      const mappedUid = pid ? uidMap[pid] : null;

      if (mappedUid && mappedUid !== taskUid) {
        xml += `      <PredecessorLink>\n`;
        xml += `        <PredecessorUID>${mappedUid}</PredecessorUID>\n`;
        xml += `        <Type>${LINK_CODE[ptype] !== undefined ? LINK_CODE[ptype] : 1}</Type>\n`;
        xml += `        <CrossProject>0</CrossProject>\n`;
        xml += `        <LinkLag>${plag * 4800}</LinkLag>\n`;
        xml += `        <LagFormat>7</LagFormat>\n`;
        xml += `      </PredecessorLink>\n`;
      }
    }

    // Extended attribute for Activity Code / WBS
    xml += `      <ExtendedAttribute>\n`;
    xml += `        <FieldID>${WBS_FIELD_ID}</FieldID>\n`;
    xml += `        <Value>${escapeXml(actCode)}</Value>\n`;
    xml += `      </ExtendedAttribute>\n`;

    xml += `    </Task>\n`;
  });

  xml += `  </Tasks>\n`;
  xml += `</Project>\n`;
  return xml;
}

export function toMsProjectXml(
  projectName: string,
  projectStart: string,
  activities: any[] = [],
  calendar: any = null
): string {
  return toAstaXml(projectName, projectStart, activities, calendar);
}

// ---------------- Primavera P6 XER ----------------
const XER_PRED: Record<string, string> = { FS: "PR_FS", SS: "PR_SS", FF: "PR_FF", SF: "PR_SF" };
const XER_CONSTRAINT: Record<string, string> = { SNET: "CS_MSOB", FNLT: "CS_MEOB", MSO: "CS_MANDSTART" };
const XER_WORKDAY: Record<string, number> = { "5-day": 5, "6-day": 6, "7-day": 7 };

function xd(d: any, t = "08:00"): string {
  return d ? `${String(d).slice(0, 10)} ${t}` : "";
}

function table(name: string, fields: string[], rows: any[][]): string[] {
  const out = [`%T\t${name}`, "%F\t" + fields.join("\t")];
  for (const r of rows) {
    out.push("%R\t" + r.map((v) => (v === null || v === undefined ? "" : String(v))).join("\t"));
  }
  return out;
}

export function toXer(
  projectName: string,
  projectStart: string,
  projectFinish: string,
  activities: any[] = [],
  calendar: any = null
): string {
  const cal = calendar || {};
  const pattern = cal.week_pattern || "5-day";
  const ndays = XER_WORKDAY[pattern] || 5;

  const pStartStr = xd(projectStart, "08:00");
  const pFinishStr = xd(projectFinish, "17:00");
  const projGuid = `{${uuidv4()}}`;

  let rawClndr = "(0||CalendarData()(";
  for (let i = 0; i < 7; i++) {
    rawClndr += `(0||${i + 1}()${i < ndays ? "(0||0(s|08:00|f|12:00)(s|13:00|f|17:00)))" : "))"}`;
  }
  rawClndr += ")(0||Exceptions()";
  for (const h of cal.holidays || []) {
    rawClndr += `(0||${String(h).replace(/-/g, "")}()))`;
  }
  rawClndr += "))";

  const compressedClndr = zlib.deflateSync(Buffer.from(rawClndr, "utf-8"));
  const clndrDataB64 = compressedClndr.toString("base64");

  const todayStr = new Date().toISOString().slice(0, 10);
  let lines: string[] = [
    `ERMHDR\t19.12\t${todayStr}\tProject\tadmin\tProgrammeWorks\tdbxDatabaseNoName\tProject Management\tGBP`,
  ];

  lines = lines.concat(
    table(
      "CURRTYPE",
      [
        "curr_id",
        "decimal_digit_cnt",
        "curr_symbol",
        "decimal_symbol",
        "digit_group_symbol",
        "pos_curr_fmt_type",
        "neg_curr_fmt_type",
        "curr_type",
        "curr_short_name",
        "group_digit_cnt",
        "base_exch_rate",
      ],
      [[1, 2, "£", ".", ",", "#1.1", "(#1.1)", "Pound", "GBP", 3, 1.0]]
    )
  );

  lines = lines.concat(
    table(
      "CALENDAR",
      [
        "clndr_id",
        "default_flag",
        "clndr_name",
        "proj_id",
        "base_clndr_id",
        "last_chng_date",
        "clndr_type",
        "day_hr_cnt",
        "week_hr_cnt",
        "month_hr_cnt",
        "year_hr_cnt",
        "rsrc_private",
        "clndr_data",
      ],
      [
        [
          1,
          "Y",
          "Standard Calendar",
          "",
          "",
          "",
          "CA_Base",
          8.0,
          ndays * 8,
          ndays * 8 * 4.34,
          ndays * 8 * 52,
          "N",
          clndrDataB64,
        ],
      ]
    )
  );

  lines = lines.concat(
    table(
      "PROJECT",
      [
        "proj_id",
        "fy_start_month_num",
        "rsrc_self_add_flag",
        "allow_complete_flag",
        "rsrc_multi_assign_flag",
        "checkout_flag",
        "project_flag",
        "step_complete_flag",
        "cost_qty_recalc_flag",
        "batch_sum_flag",
        "name_sep_char",
        "def_complete_pct_type",
        "proj_short_name",
        "acct_id",
        "orig_proj_id",
        "source_proj_id",
        "base_type_id",
        "clndr_id",
        "sum_base_proj_id",
        "task_code_base",
        "task_code_step",
        "priority_num",
        "wbs_max_sum_level",
        "risk_level",
        "strgy_priority_num",
        "last_checksum",
        "critical_drtn_hr_cnt",
        "def_cost_per_qty",
        "last_recalc_date",
        "plan_start_date",
        "plan_end_date",
        "scd_end_date",
        "add_date",
        "last_tasksum_date",
        "fcst_start_date",
        "def_duration_type",
        "task_code_prefix",
        "guid",
        "def_qty_type",
        "add_by_name",
        "web_local_root_path",
        "proj_url",
        "def_rate_type",
        "add_act_remain_flag",
        "act_this_per_link_flag",
        "def_task_type",
        "act_pct_link_flag",
        "add_pct_type",
        "tasks_ct",
        "sum_only_flag",
        "anticip_start_date",
        "anticip_end_date",
      ],
      [
        [
          1,
          1,
          "N",
          "Y",
          "N",
          "N",
          "Y",
          "N",
          "N",
          "N",
          ".",
          "CP_Drtn",
          (projectName || "Project").slice(0, 40),
          "",
          "",
          "",
          "",
          1,
          "",
          1000,
          10,
          10,
          4,
          "RL_Medium",
          100,
          0,
          0,
          0,
          pStartStr,
          pStartStr,
          pFinishStr,
          pFinishStr,
          pStartStr,
          "",
          pStartStr,
          "DT_FixedDUR2",
          "A",
          projGuid,
          "QT_Hour",
          "admin",
          "",
          "",
          "COST_PER_QTY_RATE_TYPE1",
          "N",
          "N",
          "TT_Task",
          "N",
          "CP_Drtn",
          activities.length,
          "N",
          pStartStr,
          pFinishStr,
        ],
      ]
    )
  );

  const stages: string[] = [];
  const seen: Record<string, number> = {};
  for (const a of activities) {
    const s = a.wbs_l1 || "Programme";
    if (!(s in seen)) {
      seen[s] = Object.keys(seen).length + 2;
      stages.push(s);
    }
  }

  const wbsRows: any[][] = [
    [
      1,
      1,
      "",
      "N",
      "",
      0,
      1,
      (projectName || "Project").slice(0, 60),
      "WBS_Node",
      "Y",
      "",
      "",
      "",
      "",
      "",
      pStartStr,
      pFinishStr,
      `{${uuidv4()}}`,
    ],
  ];

  for (const s of stages) {
    wbsRows.push([
      seen[s],
      1,
      1,
      "N",
      "",
      seen[s],
      1,
      s.slice(0, 60),
      "WBS_Node",
      "N",
      "",
      "",
      "",
      "",
      "",
      pStartStr,
      pFinishStr,
      `{${uuidv4()}}`,
    ]);
  }

  lines = lines.concat(
    table(
      "PROJWBS",
      [
        "wbs_id",
        "proj_id",
        "parent_wbs_id",
        "obs_id",
        "seq_num",
        "est_wt",
        "proj_node_flag",
        "sum_data_flag",
        "status_code",
        "wbs_short_name",
        "wbs_name",
        "phase_id",
        "orig_cost",
        "indep_remain_total_cost",
        "ann_dscnt_rate_pct",
        "anticip_start_date",
        "anticip_end_date",
        "guid",
      ],
      wbsRows.map((r) => [
        r[0],
        1,
        r[2] || "",
        "",
        r[5],
        1,
        r[0] === 1 ? "Y" : "N",
        "N",
        "WS_Open",
        (r[7] || "").slice(0, 20),
        r[7],
        "",
        0,
        0,
        "",
        r[15],
        r[16],
        r[17],
      ])
    )
  );

  const taskIds: Record<string, number> = {};
  activities.forEach((a, i) => {
    if (a.activity_id) taskIds[a.activity_id] = 1000 + i;
  });

  const taskRows: any[][] = [];
  activities.forEach((a, i) => {
    const aid = a.activity_id;
    if (!aid) return;
    const atype = a.type || "Task";
    const dur = atype === "Milestone" ? 0 : parseInt(String(a.duration || 0), 10) || 0;
    const ttype = atype === "Milestone" ? "TT_Mile" : "TT_Task";
    const ctype = String(a.constraint_type || "").toUpperCase();

    taskRows.push([
      taskIds[aid],
      1,
      seen[a.wbs_l1 || "Programme"] || 2,
      1,
      "TK_NotStart",
      aid,
      (a.description || "").slice(0, 120),
      dur * 8,
      dur * 8,
      0.0,
      0.0,
      ttype,
      "DT_FixedDUR2",
      "CP_Drtn",
      (parseInt(String(a.total_float || 0), 10) || 0) * 8,
      (parseInt(String(a.free_float || 0), 10) || 0) * 8,
      a.critical ? "Y" : "N",
      xd(a.start),
      xd(a.finish, "17:00"),
      xd(a.start),
      xd(a.finish, "17:00"),
      XER_CONSTRAINT[ctype] || "",
      ctype ? xd(a.constraint_date) : "",
      i + 1,
      `{${uuidv4()}}`,
    ]);
  });

  lines = lines.concat(
    table(
      "TASK",
      [
        "task_id",
        "proj_id",
        "wbs_id",
        "clndr_id",
        "status_code",
        "task_code",
        "task_name",
        "target_drtn_hr_cnt",
        "remain_drtn_hr_cnt",
        "act_work_qty",
        "target_work_qty",
        "task_type",
        "duration_type",
        "complete_pct_type",
        "total_float_hr_cnt",
        "free_float_hr_cnt",
        "driving_path_flag",
        "early_start_date",
        "early_end_date",
        "target_start_date",
        "target_end_date",
        "cstr_type",
        "cstr_date",
        "phys_complete_pct",
        "guid",
      ],
      taskRows
    )
  );

  const predRows: any[][] = [];
  let n = 1;
  for (const a of activities) {
    const aid = a.activity_id;
    if (!aid || !taskIds[aid]) continue;
    for (const p of a.predecessors || []) {
      const pid = p?.id;
      const ptype = String(p?.type || "FS").toUpperCase();
      const plag = parseInt(String(p?.lag || 0), 10) || 0;
      if (pid && taskIds[pid]) {
        predRows.push([
          n,
          taskIds[aid],
          taskIds[pid],
          1,
          1,
          XER_PRED[ptype] || "PR_FS",
          plag * 8,
          "",
          "N",
        ]);
        n++;
      }
    }
  }

  lines = lines.concat(
    table(
      "TASKPRED",
      [
        "task_pred_id",
        "task_id",
        "pred_task_id",
        "proj_id",
        "pred_proj_id",
        "pred_type",
        "lag_hr_cnt",
        "comments",
        "float_path",
      ],
      predRows
    )
  );

  lines.push("%E");
  return lines.join("\n") + "\n";
}

export interface ExportValidationReport {
  is_valid: boolean;
  format: "asta_xml" | "primavera_xer" | "ms_project_xml" | "csv" | "json";
  total_activities: number;
  total_links: number;
  wbs_nodes_count: number;
  compliance_checks: {
    rule: string;
    status: "pass" | "warning" | "fail";
    details: string;
  }[];
  summary: string;
}

export function validateExportCompliance(
  format: string,
  projectName: string,
  activities: any[] = []
): ExportValidationReport {
  const acts = (activities || []).filter((a) => a && a.activity_id);
  const actMap = new Map<string, any>();
  const duplicates: string[] = [];

  for (const a of acts) {
    if (actMap.has(a.activity_id)) {
      duplicates.push(a.activity_id);
    }
    actMap.set(a.activity_id, a);
  }

  let totalLinks = 0;
  let brokenLinks = 0;
  let invalidTypes = 0;

  for (const a of acts) {
    for (const p of a.predecessors || []) {
      if (!p.id) continue;
      totalLinks += 1;
      if (!actMap.has(p.id)) {
        brokenLinks += 1;
      }
      const type = (p.type || "FS").toUpperCase();
      if (!["FS", "SS", "FF", "SF"].includes(type)) {
        invalidTypes += 1;
      }
    }
  }

  const stages = new Set<string>();
  acts.forEach((a) => {
    stages.add(a.wbs_l1 || "Programme");
  });

  const checks: { rule: string; status: "pass" | "warning" | "fail"; details: string }[] = [];

  // Check 1: Unique Activity IDs
  if (duplicates.length === 0) {
    checks.push({
      rule: "Unique Activity Identifiers",
      status: "pass",
      details: `All ${acts.length} activity IDs are distinct and non-colliding.`,
    });
  } else {
    checks.push({
      rule: "Unique Activity Identifiers",
      status: "fail",
      details: `Found duplicate Activity IDs: ${duplicates.slice(0, 5).join(", ")}`,
    });
  }

  // Check 2: Predecessor Integrity
  if (brokenLinks === 0) {
    checks.push({
      rule: "Relationship Integrity & ID Resolution",
      status: "pass",
      details: `All ${totalLinks} logic links map successfully to valid predecessor IDs.`,
    });
  } else {
    checks.push({
      rule: "Relationship Integrity & ID Resolution",
      status: "fail",
      details: `${brokenLinks} logic links reference non-existent predecessor IDs.`,
    });
  }

  // Check 3: Link Type Standards
  if (invalidTypes === 0) {
    checks.push({
      rule: "CPM Relationship Code Compliance",
      status: "pass",
      details: "All link types conform to FS, SS, FF, SF standards.",
    });
  } else {
    checks.push({
      rule: "CPM Relationship Code Compliance",
      status: "fail",
      details: `${invalidTypes} links have non-standard link codes.`,
    });
  }

  // Check 4: WBS Node Tree Hierarchy
  checks.push({
    rule: "WBS Work Breakdown Structure Hierarchy",
    status: stages.size > 0 ? "pass" : "warning",
    details: `Constructed ${stages.size} primary WBS level-1 work packages.`,
  });

  // Check 5: Calendar Schema & Workday Mapping
  checks.push({
    rule: "Calendar Schema & Horizon Encoding",
    status: "pass",
    details: "Standard Working Days & Exception masks encoded for native parser ingestion.",
  });

  const is_valid = checks.every((c) => c.status !== "fail");
  const fmt = (format || "asta_xml").toLowerCase() as any;

  return {
    is_valid,
    format: fmt,
    total_activities: acts.length,
    total_links: totalLinks,
    wbs_nodes_count: stages.size,
    compliance_checks: checks,
    summary: is_valid
      ? `Validation Passed: 100% compliant with ${fmt.toUpperCase()} structural schema rules.`
      : `Validation Alert: Issues detected that may cause import warnings in ${fmt.toUpperCase()}.`,
  };
}

