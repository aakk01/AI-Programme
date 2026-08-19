import { resolveHolidays } from "./holidayPresets";

export const LINK_TYPES = ["FS", "SS", "FF", "SF"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

const LINK_RE = /^\s*([A-Za-z0-9_.\-]+?)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?\s*$/i;

export const WEEK_PATTERNS: Record<string, Set<number>> = {
  "5-day": new Set([0, 1, 2, 3, 4]),
  "6-day": new Set([0, 1, 2, 3, 4, 5]),
  "7-day": new Set([0, 1, 2, 3, 4, 5, 6]),
};

export const CONSTRAINTS = new Set(["", "SNET", "FNLT", "MSO"]);

export interface Link {
  id: string;
  type: LinkType;
  lag: number;
}

export interface Activity {
  activity_id: string;
  wbs_code?: string;
  wbs_l1?: string;
  wbs_l2?: string;
  wbs_l3?: string;
  description?: string;
  type?: "Task" | "Milestone" | "Summary";
  duration?: number;
  predecessors?: Link[];
  successors?: string;
  constraint_type?: "" | "SNET" | "FNLT" | "MSO";
  constraint_date?: string | null;
  start?: string;
  finish?: string;
  es?: number;
  ef?: number;
  ls?: number;
  lf?: number;
  total_float?: number;
  free_float?: number;
  critical?: boolean;
  _cidx?: number | null;
  [key: string]: any;
}

export function parsePredecessorString(text: string | null | undefined): Link[] {
  if (!text || !String(text).trim()) {
    return [];
  }
  const out: Link[] = [];
  const parts = String(text).split(/[,;]/);
  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    const m = part.match(LINK_RE);
    if (!m) {
      throw new Error(`Invalid link syntax: '${part}'`);
    }
    const pid = m[1];
    const ltype = ((m[2] || "FS").toUpperCase()) as LinkType;
    const lagStr = m[3];
    const lag = lagStr ? parseInt(lagStr.replace(/\s+/g, ""), 10) : 0;
    out.push({ id: pid, type: ltype, lag: isNaN(lag) ? 0 : lag });
  }
  return out;
}

export function formatPredecessors(preds: Link[] = []): string {
  const parts: string[] = [];
  for (const p of preds || []) {
    const lag = p.lag || 0;
    let s = `${p.id}${p.type || "FS"}`;
    if (lag) {
      s += `${lag > 0 ? "+" : "-"}${Math.abs(lag)}d`;
    }
    parts.push(s);
  }
  return parts.join(", ");
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIsoDate(iso: string): Date {
  const clean = String(iso).slice(0, 10);
  const [y, m, d] = clean.split("-").map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(d: Date, days: number): Date {
  const res = new Date(d.getTime());
  res.setUTCDate(res.getUTCDate() + days);
  return res;
}

function getMondayBasedWeekday(d: Date): number {
  // Sunday = 0 -> 6, Monday = 1 -> 0, etc.
  const day = d.getUTCDay();
  return (day + 6) % 7;
}

export class WorkCalendar {
  weekPattern: string;
  workdays: Set<number>;
  holidayRegion: string;
  holidays: Set<string>;
  horizon: number;
  _dates: Date[] = [];
  _index: Record<string, number> = {};

  constructor(
    weekPattern = "5-day",
    holidayRegion = "none",
    holidays: string[] = [],
    horizon = 4000
  ) {
    this.weekPattern = WEEK_PATTERNS[weekPattern] ? weekPattern : "5-day";
    this.workdays = WEEK_PATTERNS[this.weekPattern];
    this.holidayRegion = holidayRegion || "none";
    this.holidays = new Set(resolveHolidays(this.holidayRegion, holidays));
    this.horizon = horizon;
  }

  static fromConfig(cfg: any = {}): WorkCalendar {
    return new WorkCalendar(
      cfg?.week_pattern || "5-day",
      cfg?.holiday_region || "none",
      cfg?.holidays || []
    );
  }

  isWorking(d: Date): boolean {
    const weekday = getMondayBasedWeekday(d);
    const iso = toIsoDate(d);
    return this.workdays.has(weekday) && !this.holidays.has(iso);
  }

  build(start: Date): this {
    let d = new Date(start.getTime());
    while (!this.isWorking(d)) {
      d = addDays(d, 1);
    }
    this._dates = [];
    this._index = {};
    for (let i = 0; i < this.horizon; i++) {
      this._dates.push(d);
      this._index[toIsoDate(d)] = this._dates.length - 1;
      d = addDays(d, 1);
      while (!this.isWorking(d)) {
        d = addDays(d, 1);
      }
    }
    return this;
  }

  dateAt(idx: number): Date {
    const safeIdx = Math.max(0, Math.min(Math.floor(idx), this._dates.length - 1));
    return this._dates[safeIdx] || new Date();
  }

  isoAt(idx: number): string {
    return toIsoDate(this.dateAt(idx));
  }

  indexOf(iso: string | null | undefined): number | null {
    if (!iso) return null;
    try {
      let d = parseIsoDate(iso);
      if (isNaN(d.getTime())) return null;
      if (this._dates.length === 0) return 0;
      if (d < this._dates[0]) return 0;
      for (let i = 0; i < 400; i++) {
        const key = toIsoDate(d);
        if (key in this._index) {
          return this._index[key];
        }
        d = addDays(d, 1);
      }
      return null;
    } catch {
      return null;
    }
  }
}

export function calculate(
  activities: any[],
  projectStart: string | Date = new Date(),
  calendarConfig: any = null
): any {
  const pStartDate =
    typeof projectStart === "string" ? parseIsoDate(projectStart) : projectStart;
  const cal = WorkCalendar.fromConfig(calendarConfig).build(pStartDate);

  const acts: Activity[] = (activities || []).map((a) => ({ ...a }));
  const net = acts.filter((a) => a.type !== "Summary");
  const byId: Record<string, Activity> = {};
  for (const a of net) {
    byId[a.activity_id] = a;
  }

  for (const a of net) {
    a.duration = a.type === "Milestone" ? 0 : Math.max(0, parseInt(String(a.duration || 0), 10) || 0);
    a.predecessors = (a.predecessors || []).filter((p) => p && p.id && byId[p.id]);
    const ctype = (a.constraint_type || "").toUpperCase() as any;
    a.constraint_type = CONSTRAINTS.has(ctype) ? ctype : "";
    a._cidx = a.constraint_type ? cal.indexOf(a.constraint_date) : null;
    if (a._cidx === null && a.constraint_date) {
      a.constraint_type = "";
    }
  }

  const succs: Record<string, Link[]> = {};
  const indeg: Record<string, number> = {};
  for (const a of net) {
    succs[a.activity_id] = [];
    indeg[a.activity_id] = 0;
  }

  for (const a of net) {
    for (const p of a.predecessors || []) {
      if (succs[p.id]) {
        succs[p.id].push({ id: a.activity_id, type: p.type || "FS", lag: p.lag || 0 });
      }
      indeg[a.activity_id] = (indeg[a.activity_id] || 0) + 1;
    }
  }

  const order: string[] = [];
  const queue: string[] = Object.keys(indeg)
    .filter((id) => indeg[id] === 0)
    .sort();

  while (queue.length > 0) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const s of succs[cur] || []) {
      indeg[s.id]--;
      if (indeg[s.id] === 0) {
        queue.push(s.id);
      }
    }
  }

  const cyclic = order.length !== net.length;
  if (cyclic) {
    const orderSet = new Set(order);
    for (const a of net) {
      if (!orderSet.has(a.activity_id)) {
        order.push(a.activity_id);
      }
    }
  }

  // Forward pass
  for (const aid of order) {
    const a = byId[aid];
    let es = 0;
    for (const p of a.predecessors || []) {
      const pr = byId[p.id];
      if (!pr || pr.es === undefined) continue;
      const lag = p.lag || 0;
      const t = p.type || "FS";
      if (t === "FS") {
        es = Math.max(es, (pr.ef || 0) + lag);
      } else if (t === "SS") {
        es = Math.max(es, (pr.es || 0) + lag);
      } else if (t === "FF") {
        es = Math.max(es, (pr.ef || 0) + lag - (a.duration || 0));
      } else {
        // SF
        es = Math.max(es, (pr.es || 0) + lag - (a.duration || 0));
      }
    }
    const ct = a.constraint_type;
    const ci = a._cidx;
    if (ct === "MSO" && ci !== null && ci !== undefined) {
      es = ci;
    } else if (ct === "SNET" && ci !== null && ci !== undefined) {
      es = Math.max(es, ci);
    }
    a.es = Math.max(0, es);
    a.ef = a.es + (a.duration || 0);
  }

  const projectFinish = Math.max(...net.map((a) => a.ef || 0), 0);

  // Backward pass
  for (const aid of [...order].reverse()) {
    const a = byId[aid];
    let lf = projectFinish;
    const ct = a.constraint_type;
    const ci = a._cidx;
    if (ct === "FNLT" && ci !== null && ci !== undefined) {
      lf = Math.min(lf, ci + 1);
    }
    if (ct === "MSO" && ci !== null && ci !== undefined) {
      lf = Math.min(lf, ci + (a.duration || 0));
    }
    for (const s of succs[aid] || []) {
      const sc = byId[s.id];
      if (!sc || sc.lf === undefined) continue;
      const lag = s.lag || 0;
      const t = s.type || "FS";
      if (t === "FS") {
        lf = Math.min(lf, (sc.ls || 0) - lag);
      } else if (t === "SS") {
        lf = Math.min(lf, (sc.ls || 0) - lag + (a.duration || 0));
      } else if (t === "FF") {
        lf = Math.min(lf, (sc.lf || 0) - lag);
      } else {
        // SF
        lf = Math.min(lf, (sc.lf || 0) - lag + (a.duration || 0));
      }
    }
    a.lf = lf;
    a.ls = a.lf - (a.duration || 0);
  }

  for (const a of net) {
    a.total_float = (a.ls || 0) - (a.es || 0);
    let ff: number | null = null;
    for (const s of succs[a.activity_id] || []) {
      const sc = byId[s.id];
      if (!sc) continue;
      const t = s.type || "FS";
      const lag = s.lag || 0;
      let slack = 0;
      if (t === "FS") {
        slack = (sc.es || 0) - lag - (a.ef || 0);
      } else if (t === "FF") {
        slack = (sc.ef || 0) - lag - (a.ef || 0);
      } else if (t === "SS") {
        slack = (sc.es || 0) - lag - (a.es || 0);
      } else {
        slack = (sc.ef || 0) - lag - (a.es || 0);
      }
      ff = ff === null ? slack : Math.min(ff, slack);
    }
    a.free_float = ff === null ? a.total_float : Math.max(0, ff);
    a.critical = (a.total_float || 0) <= 0;
    a.start = cal.isoAt(a.es || 0);
    a.finish = cal.isoAt((a.duration || 0) === 0 ? a.es || 0 : (a.ef || 1) - 1);
    a.successors = formatPredecessors(succs[a.activity_id] || []);
    delete a._cidx;
  }

  // Summary rollups
  for (const a of acts) {
    if (a.type !== "Summary") continue;
    const prefix = (a.wbs_code || "").trim();
    let kids = prefix
      ? net.filter((n) => (n.wbs_code || "").startsWith(prefix + "."))
      : net.filter((n) => n.wbs_l1 === a.wbs_l1);
    if (!kids.length && a.wbs_l1) {
      kids = net.filter((n) => n.wbs_l1 === a.wbs_l1);
    }

    if (kids.length > 0) {
      a.es = Math.min(...kids.map((k) => k.es || 0));
      a.ef = Math.max(...kids.map((k) => k.ef || 0));
      a.ls = a.es;
      a.lf = a.ef;
      a.duration = a.ef - a.es;
      a.total_float = Math.min(...kids.map((k) => k.total_float || 0));
      a.free_float = a.total_float;
      a.critical = kids.some((k) => k.critical);
      a.start = cal.isoAt(a.es);
      a.finish = cal.isoAt(Math.max(a.es, a.ef - 1));
    } else {
      a.es = 0;
      a.ef = 0;
      a.ls = 0;
      a.lf = 0;
      a.duration = 0;
      a.total_float = 0;
      a.free_float = 0;
      a.critical = false;
      a.start = cal.isoAt(0);
      a.finish = cal.isoAt(0);
    }
    a.successors = "";
    delete a._cidx;
  }

  const finishIso = cal.isoAt(Math.max(0, projectFinish - 1));

  return {
    activities: acts,
    project_start: cal.isoAt(0),
    project_finish: finishIso,
    duration_working_days: projectFinish,
    has_cycle: cyclic,
    critical_count: net.filter((a) => a.critical).length,
    calendar: {
      week_pattern: cal.weekPattern,
      holiday_region: cal.holidayRegion,
      holidays: Array.from(cal.holidays).sort(),
      working_days_per_week: cal.workdays.size,
    },
    _calendar_obj: cal,
  };
}

export function varianceReport(
  result: any,
  targetCompletion: string | null | undefined,
  activities: any[] = []
): any {
  const cal: WorkCalendar = result._calendar_obj;
  const forecast = result.project_finish;
  const out: any = {
    forecast_finish: forecast,
    target_finish: targetCompletion || null,
    variance_working_days: null,
    variance_calendar_days: null,
    status: "no_target",
    milestones: [],
    negative_float_activities: [],
    critical_path: [],
  };

  if (targetCompletion && cal) {
    const tIdx = cal.indexOf(targetCompletion);
    const fIdx = cal.indexOf(forecast);
    if (tIdx !== null && fIdx !== null) {
      out.variance_working_days = fIdx - tIdx;
      try {
        const fDate = parseIsoDate(forecast);
        const tDate = parseIsoDate(targetCompletion);
        out.variance_calendar_days = Math.round((fDate.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
        out.status =
          out.variance_working_days === 0
            ? "on_time"
            : out.variance_working_days > 0
            ? "late"
            : "early";
      } catch {
        // ignore
      }
    }
  }

  for (const a of activities) {
    if (a.type === "Milestone") {
      out.milestones.push({
        activity_id: a.activity_id,
        description: a.description || "",
        date: a.start,
        total_float: a.total_float || 0,
        critical: !!a.critical,
      });
    }
    if ((a.total_float || 0) < 0) {
      out.negative_float_activities.push({
        activity_id: a.activity_id,
        description: a.description || "",
        total_float: a.total_float,
        constraint: `${a.constraint_type || ""} ${a.constraint_date || ""}`.trim(),
      });
    }
    if (a.critical && a.type !== "Summary") {
      out.critical_path.push({
        activity_id: a.activity_id,
        description: a.description || "",
        duration: a.duration || 0,
        start: a.start,
        finish: a.finish,
      });
    }
  }

  return out;
}
