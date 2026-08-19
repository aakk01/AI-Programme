import { Activity, Link, WorkCalendar, parsePredecessorString, formatPredecessors, calculate } from "./cpm";
import { GoogleGenAI } from "@google/genai";

export interface ScheduleHealthIssue {
  id: string;
  category: "open_logic" | "float_anomaly" | "constraint" | "duration_risk" | "logic_loop" | "lead_lag" | "out_of_sequence" | "broken_ref";
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  activity_id: string;
  activity_name: string;
  details?: any;
  remediation_type?: string;
  remediation_label?: string;
}

export interface DcmaMetric {
  id: string;
  name: string;
  standard: string;
  pass_threshold: string;
  actual_value: number;
  actual_unit: "%" | "count" | "ratio" | "index";
  status: "pass" | "warning" | "fail";
  affected_count: number;
  description: string;
}

export interface HealthAuditResult {
  overall_score: number; // 0 to 100
  rating: "Excellent" | "Good" | "Requires Action" | "Critical Risk";
  summary: {
    total_activities: number;
    tasks_count: number;
    milestones_count: number;
    critical_count: number;
    critical_percent: number;
    total_relationships: number;
    logic_density: number;
    project_start: string;
    project_finish: string;
    duration_working_days: number;
    cpli: number; // Critical Path Length Index
    spi: number; // Schedule Performance Index
    earned_working_days: number;
    total_planned_working_days: number;
    duration_weighted_progress: number;
    has_logic_loops: boolean;
    loops_count: number;
    loop_paths: string[][];
  };
  dcma_metrics: DcmaMetric[];
  issues: ScheduleHealthIssue[];
  issues_by_category: Record<string, ScheduleHealthIssue[]>;
  relationship_distribution: {
    fs: number;
    ss: number;
    ff: number;
    sf: number;
    total: number;
    fs_percent: number;
  };
  remediation_available: {
    can_auto_close_open_ends: boolean;
    can_auto_fix_negative_lags: boolean;
    can_auto_fix_zero_durations: boolean;
    can_auto_remove_hard_constraints: boolean;
    can_auto_break_loops: boolean;
  };
}

/**
 * Detect all circular dependency cycles (logic loops) in activity network
 */
export function detectLogicLoops(activities: Activity[]): { hasLoops: boolean; loopPaths: string[][] } {
  const actMap = new Map<string, Activity>();
  for (const a of activities) {
    if (a.activity_id) actMap.set(a.activity_id, a);
  }

  const adj = new Map<string, string[]>();
  for (const a of activities) {
    const list: string[] = [];
    for (const p of a.predecessors || []) {
      if (p.id && actMap.has(p.id)) {
        // Predecessor -> Successor directed edge
        const succs = adj.get(p.id) || [];
        succs.push(a.activity_id);
        adj.set(p.id, succs);
      }
    }
  }

  const visited = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited
  const loopPaths: string[][] = [];
  const currentPath: string[] = [];

  function dfs(node: string) {
    visited.set(node, 1);
    currentPath.push(node);

    const neighbors = adj.get(node) || [];
    for (const n of neighbors) {
      const state = visited.get(n) || 0;
      if (state === 1) {
        // Found loop
        const loopStartIndex = currentPath.indexOf(n);
        if (loopStartIndex !== -1) {
          const loop = currentPath.slice(loopStartIndex);
          loop.push(n);
          // Avoid duplicate loop recordings
          const loopStr = loop.join("->");
          if (!loopPaths.some((p) => p.join("->") === loopStr)) {
            loopPaths.push(loop);
          }
        }
      } else if (state === 0) {
        dfs(n);
      }
    }

    currentPath.pop();
    visited.set(node, 2);
  }

  for (const id of actMap.keys()) {
    if ((visited.get(id) || 0) === 0) {
      dfs(id);
    }
  }

  return {
    hasLoops: loopPaths.length > 0,
    loopPaths,
  };
}

/**
 * Comprehensive DCMA 14-Point & Logic Integrity Health Audit
 */
export function runProgrammeHealthAudit(
  activities: Activity[] = [],
  scheduleResult?: any,
  targetCompletion?: string
): HealthAuditResult {
  const acts = (activities || []).filter((a) => a && a.activity_id);
  const totalCount = acts.length;

  const actMap = new Map<string, Activity>();
  for (const a of acts) {
    actMap.set(a.activity_id, a);
  }

  // Calculate CPM if not provided
  const calResult =
    scheduleResult ||
    calculate(
      acts,
      acts[0]?.start || new Date().toISOString().slice(0, 10),
      { week_pattern: "5-day", holiday_region: "none", holidays: [] }
    );

  const cpmActs = calResult.activities || acts;
  const cpmMap = new Map<string, Activity>();
  for (const a of cpmActs) {
    if (a.activity_id) cpmMap.set(a.activity_id, a);
  }

  // 1. Build Predecessor & Successor Directed Graph
  const predMap = new Map<string, Link[]>();
  const succMap = new Map<string, { id: string; type: string; lag: number }[]>();

  for (const a of cpmActs) {
    predMap.set(a.activity_id, a.predecessors || []);
    succMap.set(a.activity_id, []);
  }

  let totalRelationships = 0;
  let fsCount = 0;
  let ssCount = 0;
  let ffCount = 0;
  let sfCount = 0;

  for (const a of cpmActs) {
    const preds = a.predecessors || [];
    for (const p of preds) {
      if (!p.id) continue;
      totalRelationships += 1;
      const t = (p.type || "FS").toUpperCase();
      if (t === "SS") ssCount += 1;
      else if (t === "FF") ffCount += 1;
      else if (t === "SF") sfCount += 1;
      else fsCount += 1;

      if (succMap.has(p.id)) {
        succMap.get(p.id)!.push({ id: a.activity_id, type: t, lag: p.lag || 0 });
      }
    }
  }

  // 2. Classify tasks and identify key milestones
  let taskCount = 0;
  let milestoneCount = 0;
  let criticalCount = 0;
  let totalPlannedDur = 0;
  let totalEarnedDur = 0;

  let startMilestoneId: string | null = null;
  let finishMilestoneId: string | null = null;

  cpmActs.forEach((a, idx) => {
    const dur = Math.max(0, parseInt(String(a.duration), 10) || 0);
    const isMile = a.type === "Milestone" || dur === 0;
    const isCrit = !!a.critical || (a.total_float !== undefined && a.total_float <= 0);
    const pct = Math.min(100, Math.max(0, parseFloat(String(a.percent_complete ?? a.progress ?? 0)) || 0));

    if (isMile) {
      milestoneCount += 1;
      if (idx === 0 || a.description?.toLowerCase().includes("start") || a.description?.toLowerCase().includes("possession")) {
        if (!startMilestoneId) startMilestoneId = a.activity_id;
      }
      if (idx === cpmActs.length - 1 || a.description?.toLowerCase().includes("complete") || a.description?.toLowerCase().includes("handover")) {
        finishMilestoneId = a.activity_id;
      }
    } else {
      taskCount += 1;
    }

    if (isCrit) criticalCount += 1;
    totalPlannedDur += dur;
    totalEarnedDur += dur * (pct / 100);
  });

  if (!startMilestoneId && cpmActs.length > 0) startMilestoneId = cpmActs[0].activity_id;
  if (!finishMilestoneId && cpmActs.length > 0) finishMilestoneId = cpmActs[cpmActs.length - 1].activity_id;

  // 3. Detect Circular Logic Loops
  const loopResult = detectLogicLoops(cpmActs);

  // 4. Audit Specific Issues
  const issues: ScheduleHealthIssue[] = [];

  // Issue Counters for DCMA Metrics
  let missingPredCount = 0;
  let missingSuccCount = 0;
  let negativeLagCount = 0;
  let excessiveLagCount = 0;
  let hardConstraintCount = 0;
  let negativeFloatCount = 0;
  let highFloatCount = 0;
  let highDurationCount = 0;
  let zeroDurationRiskCount = 0;
  let brokenRefCount = 0;
  let sfLinkCount = sfCount;

  // 4.1 Check Circular Logic Loops
  if (loopResult.hasLoops) {
    loopResult.loopPaths.forEach((path, i) => {
      issues.push({
        id: `loop_${i}`,
        category: "logic_loop",
        severity: "critical",
        title: "Circular Logic Loop Detected",
        description: `Closed dependency loop: ${path.join(" ➔ ")}. This blocks Critical Path calculation.`,
        activity_id: path[0],
        activity_name: cpmMap.get(path[0])?.description || path[0],
        details: { path },
        remediation_type: "break_loop",
        remediation_label: "Break Loop (Sever Backward Link)",
      });
    });
  }

  // 4.2 Check Individual Activity Issues
  cpmActs.forEach((a) => {
    const id = a.activity_id;
    const name = a.description || id;
    const dur = Math.max(0, parseInt(String(a.duration), 10) || 0);
    const isMile = a.type === "Milestone" || dur === 0;
    const preds = predMap.get(id) || [];
    const succs = succMap.get(id) || [];
    const tf = a.total_float !== undefined ? a.total_float : 0;
    const constraint = (a.constraint_type || "").toUpperCase();

    // Broken references
    preds.forEach((p) => {
      if (!cpmMap.has(p.id)) {
        brokenRefCount += 1;
        issues.push({
          id: `broken_${id}_${p.id}`,
          category: "broken_ref",
          severity: "critical",
          title: "Broken Predecessor Reference",
          description: `Activity references non-existent Predecessor ID '${p.id}'.`,
          activity_id: id,
          activity_name: name,
          details: { missing_id: p.id },
          remediation_type: "remove_broken_pred",
          remediation_label: "Remove Invalid Link",
        });
      }
    });

    // Open Ends - Missing Predecessors (allowed only for first activity or start milestone)
    if (preds.length === 0 && id !== startMilestoneId && id !== cpmActs[0]?.activity_id) {
      missingPredCount += 1;
      issues.push({
        id: `open_pred_${id}`,
        category: "open_logic",
        severity: "warning",
        title: "Dangling Start (Missing Predecessors)",
        description: `Activity has no predecessor logic. It can float without network driver.`,
        activity_id: id,
        activity_name: name,
        remediation_type: "link_to_start",
        remediation_label: "Link to Project Start",
      });
    }

    // Open Ends - Missing Successors (allowed only for last activity or completion milestone)
    if (succs.length === 0 && id !== finishMilestoneId && id !== cpmActs[cpmActs.length - 1]?.activity_id) {
      missingSuccCount += 1;
      issues.push({
        id: `open_succ_${id}`,
        category: "open_logic",
        severity: "warning",
        title: "Dangling Finish (Missing Successors)",
        description: `Activity has no successor logic. Its completion does not drive downstream work.`,
        activity_id: id,
        activity_name: name,
        remediation_type: "link_to_finish",
        remediation_label: "Link to Practical Completion",
      });
    }

    // Negative Float
    if (tf < 0) {
      negativeFloatCount += 1;
      issues.push({
        id: `neg_float_${id}`,
        category: "float_anomaly",
        severity: "critical",
        title: `Negative Float (${tf} working days)`,
        description: `Activity is in delay or constrained by a hard target that cannot be met.`,
        activity_id: id,
        activity_name: name,
        details: { total_float: tf, constraint },
        remediation_type: "clear_hard_constraint",
        remediation_label: "Remove Conflicting Constraint",
      });
    }

    // High Float (> 44 working days, DCMA standard ~2 months)
    if (tf > 44 && !isMile) {
      highFloatCount += 1;
      issues.push({
        id: `high_float_${id}`,
        category: "float_anomaly",
        severity: "info",
        title: `High Total Float (${tf} working days)`,
        description: `Excessive float indicates loose logic links or missing driving dependencies.`,
        activity_id: id,
        activity_name: name,
        details: { total_float: tf },
      });
    }

    // Hard Constraints
    if (constraint === "MSO" || constraint === "MFO") {
      hardConstraintCount += 1;
      issues.push({
        id: `hard_const_${id}`,
        category: "constraint",
        severity: "warning",
        title: `Hard Constraint Applied (${constraint})`,
        description: `Must Start/Finish constraints override dynamic CPM float calculations and mask delays.`,
        activity_id: id,
        activity_name: name,
        details: { constraint, date: a.constraint_date },
        remediation_type: "convert_to_soft_constraint",
        remediation_label: "Convert to Soft Constraint (SNET)",
      });
    }

    // Zero Duration Risk (Standard Task marked with 0 days or non-milestone with 0 duration)
    if (dur === 0 && a.type !== "Milestone") {
      zeroDurationRiskCount += 1;
      issues.push({
        id: `zero_dur_${id}`,
        category: "duration_risk",
        severity: "warning",
        title: "Zero-Duration Task Classification Risk",
        description: `Task has 0 working days duration but is typed as 'Task' instead of 'Milestone'.`,
        activity_id: id,
        activity_name: name,
        remediation_type: "convert_to_milestone",
        remediation_label: "Convert to Milestone",
      });
    }

    // High Duration Tasks (> 44 working days)
    if (dur > 44 && a.type !== "Summary") {
      highDurationCount += 1;
      issues.push({
        id: `high_dur_${id}`,
        category: "duration_risk",
        severity: "info",
        title: `Long Duration Activity (${dur} working days)`,
        description: `Task exceeds 44 working days. Industry standards recommend breaking into sub-tasks.`,
        activity_id: id,
        activity_name: name,
        details: { duration: dur },
      });
    }

    // Leads & Lags in Predecessors
    preds.forEach((p) => {
      const lag = p.lag || 0;
      if (lag < 0) {
        negativeLagCount += 1;
        issues.push({
          id: `lead_${id}_${p.id}`,
          category: "lead_lag",
          severity: "critical",
          title: `Negative Lag / Lead Detected (${lag}d)`,
          description: `Negative lag (${p.id} ${p.type}${lag}d) violates standard CPM logic integrity.`,
          activity_id: id,
          activity_name: name,
          details: { predecessor_id: p.id, lag },
          remediation_type: "convert_lead_to_ss",
          remediation_label: "Convert to Start-to-Start (SS)",
        });
      } else if (lag > 10 || (dur > 0 && lag > dur)) {
        excessiveLagCount += 1;
        issues.push({
          id: `excess_lag_${id}_${p.id}`,
          category: "lead_lag",
          severity: "info",
          title: `Excessive Lag (${lag} working days)`,
          description: `Large positive lag between ${p.id} and ${id} should be modeled as an explicit curing or procurement task.`,
          activity_id: id,
          activity_name: name,
          details: { predecessor_id: p.id, lag },
        });
      }

      if ((p.type || "").toUpperCase() === "SF") {
        issues.push({
          id: `sf_link_${id}_${p.id}`,
          category: "out_of_sequence",
          severity: "warning",
          title: `Start-to-Finish (SF) Link Used`,
          description: `Start-to-Finish logic relationship with ${p.id} is discouraged across UK/US planning standards.`,
          activity_id: id,
          activity_name: name,
          details: { predecessor_id: p.id },
        });
      }
    });
  });

  // 5. Compute Advanced Metrics (CPLI, SPI, Logic Density)
  const durationWeightedProgress =
    totalPlannedDur > 0 ? Math.round((totalEarnedDur / totalPlannedDur) * 1000) / 10 : 0;
  const logicDensity = totalCount > 0 ? Math.round((totalRelationships / totalCount) * 100) / 100 : 0;

  // Critical Path Length Index (CPLI)
  const critDuration = calResult.duration_working_days || totalPlannedDur;
  let minFloatOnCrit = 0;
  cpmActs.forEach((a) => {
    if (a.critical && a.total_float !== undefined) {
      if (a.total_float < minFloatOnCrit) minFloatOnCrit = a.total_float;
    }
  });
  const cpli =
    critDuration > 0
      ? Math.round(((critDuration + minFloatOnCrit) / critDuration) * 100) / 100
      : 1.0;

  // Schedule Performance Index (SPI)
  const spi =
    totalPlannedDur > 0
      ? Math.min(1.5, Math.max(0.2, Math.round((totalEarnedDur / Math.max(1, totalPlannedDur * 0.5)) * 100) / 100))
      : 1.0;

  // 6. Build DCMA 14-Point Assessment Table
  const nonMilestoneCount = Math.max(1, taskCount);
  const dcma_metrics: DcmaMetric[] = [
    {
      id: "dcma_1_logic",
      name: "1. Missing Logic (Open Ends)",
      standard: "Missing Predecessors or Successors < 5%",
      pass_threshold: "≤ 5%",
      actual_value: Math.round(((missingPredCount + missingSuccCount) / (totalCount * 2 || 1)) * 1000) / 10,
      actual_unit: "%",
      status: (missingPredCount + missingSuccCount) / (totalCount * 2 || 1) <= 0.05 ? "pass" : "fail",
      affected_count: missingPredCount + missingSuccCount,
      description: "Tasks with missing predecessor or successor links.",
    },
    {
      id: "dcma_2_leads",
      name: "2. Negative Lags (Leads)",
      standard: "No negative lags allowed (0%)",
      pass_threshold: "0%",
      actual_value: negativeLagCount,
      actual_unit: "count",
      status: negativeLagCount === 0 ? "pass" : "fail",
      affected_count: negativeLagCount,
      description: "Negative lags distort critical path and logic validity.",
    },
    {
      id: "dcma_3_lags",
      name: "3. Positive Lags",
      standard: "Relationships with positive lag < 5%",
      pass_threshold: "≤ 5%",
      actual_value:
        totalRelationships > 0
          ? Math.round((excessiveLagCount / totalRelationships) * 1000) / 10
          : 0,
      actual_unit: "%",
      status: (excessiveLagCount / Math.max(1, totalRelationships)) <= 0.05 ? "pass" : "warning",
      affected_count: excessiveLagCount,
      description: "Excessive lags mask hidden scope or buffer duration.",
    },
    {
      id: "dcma_4_rel_types",
      name: "4. Relationship Types (FS Dominance)",
      standard: "Finish-to-Start (FS) links ≥ 90%",
      pass_threshold: "≥ 90%",
      actual_value:
        totalRelationships > 0 ? Math.round((fsCount / totalRelationships) * 1000) / 10 : 100,
      actual_unit: "%",
      status: (fsCount / Math.max(1, totalRelationships)) >= 0.9 ? "pass" : "warning",
      affected_count: totalRelationships - fsCount,
      description: "Predominance of simple FS relationships ensures predictable execution.",
    },
    {
      id: "dcma_5_hard_constraints",
      name: "5. Hard Constraints",
      standard: "Hard date constraints < 5%",
      pass_threshold: "≤ 5%",
      actual_value: Math.round((hardConstraintCount / nonMilestoneCount) * 1000) / 10,
      actual_unit: "%",
      status: hardConstraintCount / nonMilestoneCount <= 0.05 ? "pass" : "fail",
      affected_count: hardConstraintCount,
      description: "Must Start/Finish constraints break forward/backward float passes.",
    },
    {
      id: "dcma_6_high_float",
      name: "6. High Float (> 44 days)",
      standard: "Activities with TF > 44 days < 5%",
      pass_threshold: "≤ 5%",
      actual_value: Math.round((highFloatCount / nonMilestoneCount) * 1000) / 10,
      actual_unit: "%",
      status: highFloatCount / nonMilestoneCount <= 0.05 ? "pass" : "warning",
      affected_count: highFloatCount,
      description: "Excessive float signifies missing successor logic.",
    },
    {
      id: "dcma_7_negative_float",
      name: "7. Negative Float",
      standard: "No negative float allowed (0%)",
      pass_threshold: "0%",
      actual_value: negativeFloatCount,
      actual_unit: "count",
      status: negativeFloatCount === 0 ? "pass" : "fail",
      affected_count: negativeFloatCount,
      description: "Negative float signals breach of contractual completion dates.",
    },
    {
      id: "dcma_8_high_duration",
      name: "8. High Duration Tasks (> 44 days)",
      standard: "Tasks with duration > 44 days < 5%",
      pass_threshold: "≤ 5%",
      actual_value: Math.round((highDurationCount / nonMilestoneCount) * 1000) / 10,
      actual_unit: "%",
      status: highDurationCount / nonMilestoneCount <= 0.05 ? "pass" : "warning",
      affected_count: highDurationCount,
      description: "Long tasks lack discrete monitoring milestones.",
    },
    {
      id: "dcma_9_cpli",
      name: "9. Critical Path Length Index (CPLI)",
      standard: "Target CPLI ≥ 1.0 (Critical path on time)",
      pass_threshold: "≥ 1.0",
      actual_value: cpli,
      actual_unit: "index",
      status: cpli >= 1.0 ? "pass" : cpli >= 0.95 ? "warning" : "fail",
      affected_count: cpli < 1.0 ? criticalCount : 0,
      description: "Measures feasibility of meeting project finish milestone.",
    },
    {
      id: "dcma_10_logic_density",
      name: "10. Logic Network Density",
      standard: "Ratio between 1.4 and 2.0 links per activity",
      pass_threshold: "1.4 - 2.0",
      actual_value: logicDensity,
      actual_unit: "ratio",
      status: logicDensity >= 1.3 ? "pass" : "warning",
      affected_count: logicDensity < 1.3 ? totalCount : 0,
      description: "Ensures comprehensive structural linking without over-constraint.",
    },
  ];

  // 7. Calculate Overall Health Score (0-100)
  let score = 100;
  if (loopResult.hasLoops) score -= 40;
  if (negativeLagCount > 0) score -= Math.min(25, negativeLagCount * 10);
  if (brokenRefCount > 0) score -= Math.min(20, brokenRefCount * 10);
  if (negativeFloatCount > 0) score -= Math.min(20, negativeFloatCount * 5);
  if (missingPredCount + missingSuccCount > 0) {
    const openPct = (missingPredCount + missingSuccCount) / (totalCount * 2 || 1);
    if (openPct > 0.1) score -= 15;
    else if (openPct > 0.05) score -= 8;
  }
  if (hardConstraintCount > 0) score -= Math.min(10, hardConstraintCount * 3);
  if (zeroDurationRiskCount > 0) score -= Math.min(5, zeroDurationRiskCount * 2);
  if (logicDensity < 1.2 && totalCount > 5) score -= 10;
  if (cpli < 0.95) score -= 10;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let rating: "Excellent" | "Good" | "Requires Action" | "Critical Risk" = "Excellent";
  if (score < 50 || loopResult.hasLoops || brokenRefCount > 0) rating = "Critical Risk";
  else if (score < 75) rating = "Requires Action";
  else if (score < 90) rating = "Good";

  // Group issues by category
  const issues_by_category: Record<string, ScheduleHealthIssue[]> = {};
  issues.forEach((iss) => {
    if (!issues_by_category[iss.category]) issues_by_category[iss.category] = [];
    issues_by_category[iss.category].push(iss);
  });

  return {
    overall_score: score,
    rating,
    summary: {
      total_activities: totalCount,
      tasks_count: taskCount,
      milestones_count: milestoneCount,
      critical_count: criticalCount,
      critical_percent: totalCount > 0 ? Math.round((criticalCount / totalCount) * 100) : 0,
      total_relationships: totalRelationships,
      logic_density: logicDensity,
      project_start: calResult.project_start,
      project_finish: calResult.project_finish,
      duration_working_days: calResult.duration_working_days,
      cpli,
      spi,
      earned_working_days: Math.round(totalEarnedDur * 10) / 10,
      total_planned_working_days: totalPlannedDur,
      duration_weighted_progress: durationWeightedProgress,
      has_logic_loops: loopResult.hasLoops,
      loops_count: loopResult.loopPaths.length,
      loop_paths: loopResult.loopPaths,
    },
    dcma_metrics,
    issues,
    issues_by_category,
    relationship_distribution: {
      fs: fsCount,
      ss: ssCount,
      ff: ffCount,
      sf: sfCount,
      total: totalRelationships,
      fs_percent: totalRelationships > 0 ? Math.round((fsCount / totalRelationships) * 100) : 100,
    },
    remediation_available: {
      can_auto_close_open_ends: missingPredCount > 0 || missingSuccCount > 0,
      can_auto_fix_negative_lags: negativeLagCount > 0,
      can_auto_fix_zero_durations: zeroDurationRiskCount > 0,
      can_auto_remove_hard_constraints: hardConstraintCount > 0,
      can_auto_break_loops: loopResult.hasLoops,
    },
  };
}

/**
 * Automated Remediation Engine for Schedule Health
 */
export function applyHealthRemediation(
  activities: Activity[],
  remediationType: "close_open_ends" | "fix_negative_lags" | "fix_zero_durations" | "remove_hard_constraints" | "break_loops" | "remove_broken_links" | "apply_all_fixes"
): { activities: Activity[]; fixesApplied: number; description: string } {
  let modified: Activity[] = JSON.parse(JSON.stringify(activities));
  let fixes = 0;
  const actions: string[] = [];

  const actMap = new Map<string, Activity>();
  for (const a of modified) {
    if (a.activity_id) actMap.set(a.activity_id, a);
  }

  // 1. Remove Broken References
  if (remediationType === "remove_broken_links" || remediationType === "apply_all_fixes") {
    let brokenFixed = 0;
    modified.forEach((a) => {
      const origCount = (a.predecessors || []).length;
      a.predecessors = (a.predecessors || []).filter((p) => p.id && actMap.has(p.id));
      if (a.predecessors.length < origCount) {
        brokenFixed += origCount - a.predecessors.length;
      }
    });
    if (brokenFixed > 0) {
      fixes += brokenFixed;
      actions.push(`Removed ${brokenFixed} broken logic links referencing non-existent tasks.`);
    }
  }

  // 2. Fix Negative Lags (Convert Leads to SS or zero lag)
  if (remediationType === "fix_negative_lags" || remediationType === "apply_all_fixes") {
    let leadFixed = 0;
    modified.forEach((a) => {
      (a.predecessors || []).forEach((p) => {
        if ((p.lag || 0) < 0) {
          p.type = "SS";
          p.lag = Math.max(0, Math.abs(p.lag));
          leadFixed += 1;
        }
      });
    });
    if (leadFixed > 0) {
      fixes += leadFixed;
      actions.push(`Converted ${leadFixed} negative lag leads to Start-to-Start (SS) relationships.`);
    }
  }

  // 3. Fix Zero-Duration Tasks (Convert to Milestone)
  if (remediationType === "fix_zero_durations" || remediationType === "apply_all_fixes") {
    let zeroFixed = 0;
    modified.forEach((a) => {
      const dur = parseInt(String(a.duration), 10) || 0;
      if (dur === 0 && a.type !== "Milestone") {
        a.type = "Milestone";
        a.is_milestone = true;
        zeroFixed += 1;
      }
    });
    if (zeroFixed > 0) {
      fixes += zeroFixed;
      actions.push(`Reclassified ${zeroFixed} zero-duration items to explicit Milestone type.`);
    }
  }

  // 4. Remove / Soften Hard Constraints
  if (remediationType === "remove_hard_constraints" || remediationType === "apply_all_fixes") {
    let constFixed = 0;
    modified.forEach((a) => {
      if (a.constraint_type === "MSO" || a.constraint_type === "MFO") {
        a.constraint_type = "SNET";
        constFixed += 1;
      }
    });
    if (constFixed > 0) {
      fixes += constFixed;
      actions.push(`Softened ${constFixed} hard constraints to Start No Earlier Than (SNET).`);
    }
  }

  // 5. Close Open Ends
  if (remediationType === "close_open_ends" || remediationType === "apply_all_fixes") {
    const startId = modified[0]?.activity_id;
    const finishId = modified[modified.length - 1]?.activity_id;

    // Find all predecessors & successors
    const predSet = new Set<string>();
    const succSet = new Set<string>();

    modified.forEach((a) => {
      if ((a.predecessors || []).length > 0) predSet.add(a.activity_id);
      (a.predecessors || []).forEach((p) => {
        if (p.id) succSet.add(p.id);
      });
    });

    let openStartFixed = 0;
    let openFinishFixed = 0;

    modified.forEach((a, idx) => {
      // Missing predecessor
      if (idx > 0 && a.activity_id !== startId && !predSet.has(a.activity_id)) {
        a.predecessors = a.predecessors || [];
        a.predecessors.push({ id: startId, type: "FS", lag: 0 });
        openStartFixed += 1;
      }

      // Missing successor
      if (idx < modified.length - 1 && a.activity_id !== finishId && !succSet.has(a.activity_id)) {
        const finishAct = actMap.get(finishId);
        if (finishAct) {
          finishAct.predecessors = finishAct.predecessors || [];
          if (!finishAct.predecessors.some((p) => p.id === a.activity_id)) {
            finishAct.predecessors.push({ id: a.activity_id, type: "FS", lag: 0 });
            openFinishFixed += 1;
          }
        }
      }
    });

    if (openStartFixed + openFinishFixed > 0) {
      fixes += openStartFixed + openFinishFixed;
      actions.push(`Closed open logic for ${openStartFixed} unlinked starts and ${openFinishFixed} unlinked finishes.`);
    }
  }

  // 6. Break Circular Logic Loops
  if (remediationType === "break_loops" || remediationType === "apply_all_fixes") {
    const loops = detectLogicLoops(modified);
    let loopsBroken = 0;
    if (loops.hasLoops) {
      loops.loopPaths.forEach((path) => {
        if (path.length >= 2) {
          const from = path[path.length - 2];
          const to = path[path.length - 1];
          const toAct = actMap.get(to);
          if (toAct && toAct.predecessors) {
            const initialLen = toAct.predecessors.length;
            toAct.predecessors = toAct.predecessors.filter((p) => p.id !== from);
            if (toAct.predecessors.length < initialLen) {
              loopsBroken += 1;
            }
          }
        }
      });
      if (loopsBroken > 0) {
        fixes += loopsBroken;
        actions.push(`Severed ${loopsBroken} circular loop backward links to restore linear critical path.`);
      }
    }
  }

  return {
    activities: modified,
    fixesApplied: fixes,
    description: actions.length > 0 ? actions.join(" ") : "No applicable automated health remediations found.",
  };
}

/**
 * AI-Powered Schedule Enhancement & Director-Level Optimization Recommendations
 */
export async function generateAiHealthRecommendations(
  audit: HealthAuditResult,
  activities: Activity[],
  projectContext?: any
): Promise<{ recommendations: string[]; executive_summary: string; fast_track_proposals: any[] }> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Domain fallback recommendations
    const recs: string[] = [];
    const proposals: any[] = [];

    if (audit.summary.has_logic_loops) {
      recs.push("CRITICAL: Break circular dependency loop immediately. Closed logic loops prevent forward and backward pass CPM calculations.");
    }
    if (audit.dcma_metrics.find((m) => m.id === "dcma_2_leads")?.status === "fail") {
      recs.push("Replace negative lag relationships with Start-to-Start (SS) links with positive lag to prevent artificial float distortion.");
    }
    if (audit.summary.logic_density < 1.4) {
      recs.push("Logic density is below recommended 1.4 links/activity. Link dangling procurement and enabling tasks to strengthen network integrity.");
    }
    if (audit.summary.cpli < 1.0) {
      recs.push("Critical Path Length Index (CPLI) is below 1.0 indicating completion milestone risk. Review top 3 critical path trade packages for concurrency.");
    }

    recs.push("Conduct weekly progress updates to maintain valid earned working days tracking and variance forecasting against baseline.");

    proposals.push({
      strategy: "Concurrent Internal Fit-Out & Façade",
      potential_saving_days: 12,
      impact: "Convert Façade Completion to Internal 1st Fix from FS to SS+6d lag once lower floors are weathertight.",
      risk_level: "Low",
    });

    proposals.push({
      strategy: "Off-Site Pre-Fabricated MEP Racks & Utility Skids",
      potential_saving_days: 15,
      impact: "Procure modular MEP risers early to compress on-site containment and pipe installation durations by 30%.",
      risk_level: "Medium",
    });

    return {
      recommendations: recs,
      executive_summary: `Programme Health Score is ${audit.overall_score}/100 (${audit.rating}). Network contains ${audit.summary.total_activities} activities across ${audit.summary.duration_working_days} working days with ${audit.summary.critical_percent}% critical path density.`,
      fast_track_proposals: proposals,
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const prompt = `You are a Senior Delay Analyst & Principal Construction Planning Expert (Fellow CIOB).
Analyze this construction programme health audit and provide executive-level optimization recommendations.

Audit Summary:
- Overall Score: ${audit.overall_score}/100 (${audit.rating})
- Total Activities: ${audit.summary.total_activities}
- Duration: ${audit.summary.duration_working_days} working days
- Critical Path Count: ${audit.summary.critical_count} (${audit.summary.critical_percent}%)
- Logic Density: ${audit.summary.logic_density} links/activity
- CPLI: ${audit.summary.cpli}
- SPI: ${audit.summary.spi}
- Logic Loops: ${audit.summary.has_logic_loops ? `YES (${audit.summary.loops_count} loops)` : "None"}

Specific Identified Issues (${audit.issues.length} total):
${audit.issues.slice(0, 15).map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description} (Activity ${i.activity_id}: ${i.activity_name})`).join("\n")}

Instructions:
1. Provide a concise, professional executive summary of schedule health and delay risks.
2. Provide 3 to 5 targeted, high-impact recommendations to improve logic robustness and DCMA 14-point compliance.
3. Provide 2 to 3 realistic schedule compression / fast-tracking proposals (with estimated working days saved and risk level).

Output ONLY valid JSON adhering to:
{
  "executive_summary": "string",
  "recommendations": ["string", "string"],
  "fast_track_proposals": [
    {
      "strategy": "string",
      "potential_saving_days": number,
      "impact": "string",
      "risk_level": "Low" | "Medium" | "High"
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "{}";
    const data = JSON.parse(text);
    return {
      executive_summary: data.executive_summary || `Programme Health Score: ${audit.overall_score}/100.`,
      recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
      fast_track_proposals: Array.isArray(data.fast_track_proposals) ? data.fast_track_proposals : [],
    };
  } catch (err) {
    console.error("AI recommendations error:", err);
    return {
      executive_summary: `Programme Health Score is ${audit.overall_score}/100 (${audit.rating}).`,
      recommendations: [
        "Audit and close any dangling logic to eliminate excessive float.",
        "Ensure all zero-duration items are assigned Milestone classification.",
        "Review critical path float to ensure contractual handover milestone feasibility.",
      ],
      fast_track_proposals: [
        {
          strategy: "Trade Overlap Optimization",
          potential_saving_days: 10,
          impact: "Introduce Start-to-Start lags between sequential fit-out stages.",
          risk_level: "Low",
        },
      ],
    };
  }
}
