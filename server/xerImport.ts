const TYPE_MAP: Record<string, "Milestone" | "Summary" | "Task"> = {
  TT_Mile: "Milestone",
  TT_FinMile: "Milestone",
  TT_StartMile: "Milestone",
  TT_WBS: "Summary",
  TT_LOE: "Summary",
  TT_Task: "Task",
  TT_Rsrc: "Task",
};

const PRED_MAP: Record<string, "FS" | "SS" | "FF" | "SF"> = {
  PR_FS: "FS",
  PR_SS: "SS",
  PR_FF: "FF",
  PR_SF: "SF",
};

const CSTR_MAP: Record<string, "" | "SNET" | "FNLT" | "MSO"> = {
  CS_MSO: "SNET",
  CS_MSOB: "SNET",
  CS_ALAP: "",
  CS_MANDSTART: "MSO",
  CS_MEO: "FNLT",
  CS_MEOB: "FNLT",
  CS_MANDFIN: "FNLT",
  CS_MSOA: "SNET",
  CS_MEOA: "FNLT",
};

export function parseTables(text: string): Record<string, Record<string, string>[]> {
  const tables: Record<string, Record<string, string>[]> = {};
  let name: string | null = null;
  let fields: string[] = [];

  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    if (!raw || raw.startsWith("ERMHDR")) continue;
    const parts = raw.split("\t");
    const tag = parts[0];
    if (tag === "%T") {
      name = parts[1]?.trim() || "";
      tables[name] = [];
      fields = [];
    } else if (tag === "%F") {
      fields = parts.slice(1).map((p) => p.trim());
    } else if (tag === "%R" && name && fields.length > 0) {
      const values = parts.slice(1);
      const row: Record<string, string> = {};
      for (let i = 0; i < fields.length; i++) {
        row[fields[i]] = i < values.length ? values[i] : "";
      }
      tables[name].push(row);
    } else if (tag === "%E") {
      break;
    }
  }
  return tables;
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.trim().match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function hoursToDays(value: any): number {
  try {
    const num = parseFloat(value || "0");
    return Math.max(0, Math.round(num / 8.0));
  } catch {
    return 0;
  }
}

function buildWbsPaths(rows: Record<string, string>[] = []): Record<string, { names: string[]; code: string }> {
  const byId: Record<string, Record<string, string>> = {};
  const children: Record<string, Record<string, string>[]> = {};

  for (const r of rows) {
    byId[r.wbs_id] = r;
    const parentId = r.parent_wbs_id || "";
    if (!children[parentId]) children[parentId] = [];
    children[parentId].push(r);
  }

  for (const parentId in children) {
    children[parentId].sort((a, b) => {
      const seqA = parseInt(a.seq_num || "0", 10) || 0;
      const seqB = parseInt(b.seq_num || "0", 10) || 0;
      if (seqA !== seqB) return seqA - seqB;
      return (a.wbs_name || "").localeCompare(b.wbs_name || "");
    });
  }

  const out: Record<string, { names: string[]; code: string }> = {};

  function walk(nodeId: string, names: string[], code: string) {
    const kids = children[nodeId] || [];
    kids.forEach((kid, idx) => {
      const isRoot = kid.proj_node_flag === "Y";
      const kidNames = isRoot ? names : [...names, kid.wbs_name || ""];
      const num = idx + 1;
      const kidCode = isRoot ? code : code ? `${code}.${num}` : String(num);
      out[kid.wbs_id] = { names: kidNames, code: kidCode };
      walk(kid.wbs_id, kidNames, kidCode);
    });
  }

  const roots = rows.filter((r) => !r.parent_wbs_id || !byId[r.parent_wbs_id]);
  for (const r of roots) {
    const isRoot = r.proj_node_flag === "Y";
    const names = isRoot ? [] : [r.wbs_name || ""];
    const code = isRoot ? "" : "1";
    out[r.wbs_id] = { names, code };
    walk(r.wbs_id, names, code);
  }

  return out;
}

export function importXer(text: string): any {
  const tables = parseTables(text);
  const tasks = tables["TASK"] || [];
  if (tasks.length === 0) {
    throw new Error("No TASK table found — this does not look like a P6 XER file");
  }

  const wbs = buildWbsPaths(tables["PROJWBS"] || []);
  const used = new Set<string>();
  const idByTask: Record<string, string> = {};
  const activities: any[] = [];

  for (const t of tasks) {
    let code = (t.task_code || "").trim() || `A${String(activities.length + 1).padStart(4, "0")}`;
    while (used.has(code)) {
      code = `${code}_1`;
    }
    used.add(code);
    idByTask[t.task_id] = code;

    const path = wbs[t.wbs_id] || { names: [], code: "" };
    const names = path.names;
    const atype = TYPE_MAP[(t.task_type || "").trim()] || "Task";
    const duration = atype === "Milestone" ? 0 : hoursToDays(t.target_drtn_hr_cnt);

    activities.push({
      activity_id: code,
      wbs_code: path.code,
      wbs_l1: names.length > 0 ? names[0] : "Imported",
      wbs_l2: names.length > 1 ? names[1] : "",
      wbs_l3: names.length > 2 ? names.slice(2).join(" / ") : "",
      description: (t.task_name || code).trim(),
      type: atype,
      duration,
      predecessors: [],
      constraint_type: CSTR_MAP[(t.cstr_type || "").trim()] || "",
      constraint_date: parseDate(t.cstr_date),
      _start: parseDate(t.target_start_date) || parseDate(t.early_start_date),
    });
  }

  const byCode: Record<string, any> = {};
  for (const a of activities) {
    byCode[a.activity_id] = a;
  }

  for (const link of tables["TASKPRED"] || []) {
    const succ = idByTask[link.task_id];
    const pred = idByTask[link.pred_task_id];
    if (!succ || !pred || succ === pred || !byCode[succ]) continue;

    byCode[succ].predecessors.push({
      id: pred,
      type: PRED_MAP[(link.pred_type || "").trim()] || "FS",
      lag: hoursToDays(link.lag_hr_cnt),
    });
  }

  const projectRows = tables["PROJECT"] || [];
  let start: string | null = null;
  if (projectRows.length > 0) {
    const p = projectRows[0];
    start = parseDate(p.plan_start_date) || parseDate(p.scd_end_date);
  }
  if (!start) {
    const starts = activities.map((a) => a._start).filter(Boolean);
    start = starts.length > 0 ? starts.sort()[0] : new Date().toISOString().slice(0, 10);
  }

  let name = "";
  if (projectRows.length > 0) {
    name = (projectRows[0].proj_short_name || "").trim();
  }

  let weekDays = 5;
  let holidays: string[] = [];
  for (const c of tables["CALENDAR"] || []) {
    const data = c.clndr_data || "";
    const workingMatches = data.match(/\(0\|\|\d\(\)\(0\|\|0/g);
    if (workingMatches && workingMatches.length > 0) {
      weekDays = Math.min(7, Math.max(1, workingMatches.length));
    }
    const exc = data.split("Exceptions");
    if (exc.length > 1) {
      const hMatches = exc[1].match(/\b(\d{8})\b/g) || [];
      const set = new Set<string>();
      for (const m of hMatches) {
        const y = parseInt(m.slice(0, 4), 10);
        const mon = parseInt(m.slice(4, 6), 10);
        const day = parseInt(m.slice(6, 8), 10);
        if (y >= 1990 && y <= 2100 && mon >= 1 && mon <= 12 && day >= 1 && day <= 31) {
          set.add(`${m.slice(0, 4)}-${m.slice(4, 6)}-${m.slice(6, 8)}`);
        }
      }
      holidays = Array.from(set).sort();
    }
    if (workingMatches || holidays.length > 0) {
      break;
    }
  }

  for (const a of activities) {
    delete a._start;
  }

  return {
    name: name || "Imported programme",
    start_date: start,
    week_pattern: weekDays === 6 ? "6-day" : weekDays === 7 ? "7-day" : "5-day",
    holidays,
    activities,
    stats: {
      activities: activities.length,
      links: activities.reduce((sum, a) => sum + (a.predecessors?.length || 0), 0),
      milestones: activities.filter((a) => a.type === "Milestone").length,
      wbs_nodes: Object.keys(wbs).length,
      holidays: holidays.length,
    },
  };
}
