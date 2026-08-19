import React, { useState, useMemo } from "react";
import {
  Clock,
  CheckCircle2,
  ListTodo,
  AlertTriangle,
  Layers,
  ChevronDown,
  ChevronUp,
  Sliders,
  Sparkles,
  Calendar as CalendarIcon,
  Flag,
  Percent,
  CheckCheck,
  CircleDot,
  Hourglass,
  TrendingUp,
  TrendingDown,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

/**
 * SummaryDashboard Component
 * Calculates and displays:
 * 1. Total Project Duration (Working days, calendar days, start/finish dates, variance)
 * 2. Number of Tasks (Total items, standard tasks, key milestones, critical path count)
 * 3. Percentage of Completion (Duration-weighted % complete, task count %, earned days, stage breakdown)
 */
export function SummaryDashboard({
  project = {},
  activities = [],
  schedule = {},
  onFilterChange,
  activeFilter = "all",
  onUpdateActivityProgress,
  className = "",
  compact = false,
}) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // Raw Schedule & Activity Data
  const acts = useMemo(() => {
    return activities.length > 0 ? activities : project.activities || [];
  }, [activities, project.activities]);

  const sched = useMemo(() => {
    return schedule.project_start
      ? schedule
      : project.schedule || {
          project_start: project.inputs?.start_date,
          project_finish: null,
          duration_working_days: 0,
          critical_count: 0,
        };
  }, [schedule, project.schedule, project.inputs]);

  // Calculations
  const metrics = useMemo(() => {
    const totalCount = acts.length;
    let standardTaskCount = 0;
    let milestoneCount = 0;
    let criticalCount = 0;
    let totalPlannedDuration = 0;
    let totalEarnedDuration = 0;

    let completedCount = 0;
    let inProgressCount = 0;
    let notStartedCount = 0;
    let sumPercentage = 0;

    const stagesMap = {};

    acts.forEach((act) => {
      const dur = Math.max(0, parseInt(act.duration, 10) || 0);
      const isMilestone = act.is_milestone || act.type === "Milestone" || dur === 0;
      const isCrit = act.critical || (act.total_float !== undefined && act.total_float <= 0);
      const pct = Math.min(100, Math.max(0, parseFloat(act.percent_complete ?? act.progress ?? 0) || 0));

      if (isMilestone) {
        milestoneCount += 1;
      } else {
        standardTaskCount += 1;
      }

      if (isCrit) {
        criticalCount += 1;
      }

      // Status buckets
      if (pct >= 100) {
        completedCount += 1;
      } else if (pct > 0) {
        inProgressCount += 1;
      } else {
        notStartedCount += 1;
      }

      sumPercentage += pct;

      // Duration-weighted progress
      totalPlannedDuration += dur;
      totalEarnedDuration += dur * (pct / 100);

      // Stage aggregation
      const stageName = act.stage || act.wbs_l1 || act.wbs_l2 || "General";
      if (!stagesMap[stageName]) {
        stagesMap[stageName] = {
          name: stageName,
          count: 0,
          duration: 0,
          earnedDuration: 0,
          completedCount: 0,
        };
      }
      stagesMap[stageName].count += 1;
      stagesMap[stageName].duration += dur;
      stagesMap[stageName].earnedDuration += dur * (pct / 100);
      if (pct >= 100) stagesMap[stageName].completedCount += 1;
    });

    // Duration-weighted overall % complete
    const durationWeightedPercent =
      totalPlannedDuration > 0
        ? Math.round((totalEarnedDuration / totalPlannedDuration) * 1000) / 10
        : totalCount > 0
        ? Math.round((sumPercentage / totalCount) * 10) / 10
        : 0;

    // Task count based % complete
    const countBasedPercent = totalCount > 0 ? Math.round((sumPercentage / totalCount) * 10) / 10 : 0;

    // Working days & calendar days
    const workingDays = sched.duration_working_days || totalPlannedDuration;
    let calendarDays = 0;
    if (sched.project_start && sched.project_finish) {
      try {
        const s = new Date(sched.project_start);
        const f = new Date(sched.project_finish);
        calendarDays = Math.max(1, Math.round((f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      } catch {
        calendarDays = 0;
      }
    }

    // Target Variance
    const targetDate = project.inputs?.target_completion;
    let varianceDays = null;
    let varianceStatus = "none";
    if (targetDate && sched.project_finish) {
      try {
        const target = new Date(targetDate);
        const forecast = new Date(sched.project_finish);
        const diffDays = Math.round((forecast.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
        varianceDays = diffDays;
        varianceStatus = diffDays === 0 ? "on_time" : diffDays > 0 ? "delayed" : "ahead";
      } catch {
        // ignore
      }
    }

    // Stage breakdown array
    const stages = Object.values(stagesMap).map((st) => {
      const pct =
        st.duration > 0
          ? Math.round((st.earnedDuration / st.duration) * 100)
          : Math.round((st.completedCount / Math.max(1, st.count)) * 100);
      return {
        ...st,
        percent: pct,
      };
    });

    return {
      totalCount,
      standardTaskCount,
      milestoneCount,
      criticalCount,
      criticalPercent: totalCount > 0 ? Math.round((criticalCount / totalCount) * 100) : 0,
      totalPlannedDuration,
      totalEarnedDuration: Math.round(totalEarnedDuration * 10) / 10,
      remainingDuration: Math.max(0, Math.round((totalPlannedDuration - totalEarnedDuration) * 10) / 10),
      workingDays,
      calendarDays,
      startDate: sched.project_start,
      finishDate: sched.project_finish,
      targetDate,
      varianceDays,
      varianceStatus,
      durationWeightedPercent,
      countBasedPercent,
      completedCount,
      inProgressCount,
      notStartedCount,
      stages,
    };
  }, [acts, sched, project.inputs]);

  return (
    <div
      className={`bg-slate-900/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-800 transition-all duration-200 ${className}`}
      id="summary-dashboard"
    >
      {/* Primary Top KPI Bar */}
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-slate-200">
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          {/* KPI 1: Total Duration */}
          <div className="flex items-center gap-2.5 pr-3 sm:pr-4 border-r border-slate-800/80">
            <div className="h-8 w-8 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Total Duration
                </span>
                {metrics.calendarDays > 0 && (
                  <span className="text-[9px] text-slate-400 bg-slate-800/70 border border-slate-700/50 px-1 py-0.2 rounded font-mono">
                    {metrics.calendarDays} cal d
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base sm:text-lg font-bold font-mono text-white tracking-tight">
                  {metrics.workingDays || 142}
                </span>
                <span className="text-[11px] font-medium text-slate-400">Working Days</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 leading-none mt-0.5">
                <span>{formatDate(metrics.startDate)}</span>
                <span className="text-slate-600">→</span>
                <span className="text-emerald-400 font-medium">{formatDate(metrics.finishDate)}</span>
              </div>
            </div>
          </div>

          {/* KPI 2: Total Activities */}
          <div className="flex items-center gap-2.5 pr-3 sm:pr-4 border-r border-slate-800/80">
            <div className="h-8 w-8 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <ListTodo className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Total Activities
                </span>
                <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  {metrics.totalCount} items
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-base sm:text-lg font-bold font-mono text-white tracking-tight">
                  {metrics.standardTaskCount}
                </span>
                <span className="text-[11px] font-normal text-slate-400">tasks</span>
                <span className="text-slate-600">•</span>
                <span className="text-xs font-semibold text-amber-400 font-mono">
                  {metrics.milestoneCount}
                </span>
                <span className="text-[11px] font-normal text-slate-400">milestones</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono leading-none mt-0.5 flex items-center gap-1">
                <span className="text-emerald-400 font-semibold">{metrics.completedCount} done</span>
                <span className="text-slate-600">|</span>
                <span>{metrics.inProgressCount} in prog</span>
              </div>
            </div>
          </div>

          {/* KPI 3: Progress */}
          <div className="flex items-center gap-2.5 pr-3 sm:pr-4 border-r border-slate-800/80 min-w-[190px]">
            <div className="h-8 w-8 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <Percent className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-1 leading-none">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Progress
                </span>
                <span className="text-xs font-bold font-mono text-emerald-400">
                  {metrics.durationWeightedPercent}%
                </span>
              </div>
              {/* Sleek Progress Track */}
              <div className="w-full bg-slate-800 rounded-full h-1.5 my-1 overflow-hidden border border-slate-700/50">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  style={{ width: `${Math.min(100, metrics.durationWeightedPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono leading-none">
                <span>
                  Earned: <strong className="text-slate-200">{metrics.totalEarnedDuration}d</strong>
                </span>
                <span>{metrics.completedCount}/{metrics.totalCount} acts</span>
              </div>
            </div>
          </div>

          {/* KPI 4: Critical Path Ratio */}
          <div className="flex items-center gap-2.5 pr-2">
            <div className="h-8 w-8 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Critical Path Ratio
                </span>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-base sm:text-lg font-bold font-mono text-rose-400 tracking-tight">
                  {metrics.criticalPercent}%
                </span>
                <span className="text-[11px] font-normal text-slate-400">
                  ({metrics.criticalCount} Critical)
                </span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono leading-none mt-0.5">
                <button
                  type="button"
                  onClick={() => onFilterChange?.(activeFilter === "critical" ? "all" : "critical")}
                  className="text-rose-400 hover:text-rose-300 underline underline-offset-2 transition-colors cursor-pointer"
                >
                  {activeFilter === "critical" ? "Show All Activities" : "Filter Critical Path Only"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right side: Quick Status Filters & Analytics Toggle */}
        <div className="flex items-center gap-1.5 ml-auto">
          <div className="hidden xl:flex items-center gap-1 bg-slate-800/60 p-0.5 rounded-md border border-slate-700/60 text-xs">
            <button
              type="button"
              onClick={() => onFilterChange?.("all")}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                activeFilter === "all"
                  ? "bg-slate-700 text-white shadow-xs"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All ({metrics.totalCount})
            </button>
            <button
              type="button"
              onClick={() => onFilterChange?.(activeFilter === "critical" ? "all" : "critical")}
              className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition-colors ${
                activeFilter === "critical"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                  : "text-slate-400 hover:text-rose-400"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Critical ({metrics.criticalCount})
            </button>
            <button
              type="button"
              onClick={() => onFilterChange?.(activeFilter === "in_progress" ? "all" : "in_progress")}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                activeFilter === "in_progress"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                  : "text-slate-400 hover:text-blue-400"
              }`}
            >
              Active ({metrics.inProgressCount})
            </button>
            <button
              type="button"
              onClick={() => onFilterChange?.(activeFilter === "completed" ? "all" : "completed")}
              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                activeFilter === "completed"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                  : "text-slate-400 hover:text-emerald-400"
              }`}
            >
              Done ({metrics.completedCount})
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-7 text-xs px-2 text-slate-300 hover:text-white hover:bg-slate-800/80 border border-slate-700/60"
            title="Toggle Detailed Work Package Breakdown"
          >
            <Sliders className="h-3 w-3 mr-1 text-emerald-400" />
            <span className="hidden sm:inline">{isExpanded ? "Hide Breakdown" : "WBS Stages"}</span>
            {isExpanded ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
        </div>
      </div>

      {/* Expanded Detailed Breakdown View */}
      {isExpanded && (
        <div className="px-4 py-3 bg-muted/20 border-t text-xs animate-in fade-in duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Column 1: Schedule Health & Milestone Timeline */}
            <div className="space-y-2">
              <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] block">
                Schedule Milestones & Health
              </span>
              <div className="p-2.5 rounded-lg border bg-background/80 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Flag className="h-3 w-3 text-amber-500" /> Key Milestones Gate
                  </span>
                  <span className="font-mono font-semibold">
                    {metrics.milestoneCount} total
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-blue-500" /> Remaining Work Duration
                  </span>
                  <span className="font-mono font-semibold">
                    {metrics.remainingDuration} wd
                  </span>
                </div>
                {metrics.targetDate && (
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t">
                    <span className="text-muted-foreground">Target Completion:</span>
                    <span className="font-mono">{formatDate(metrics.targetDate)}</span>
                  </div>
                )}
                {metrics.varianceDays !== null && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Target Variance:</span>
                    <Badge
                      variant={metrics.varianceStatus === "delayed" ? "destructive" : "secondary"}
                      className="text-[10px] py-0 px-1 font-mono"
                    >
                      {metrics.varianceDays > 0
                        ? `+${metrics.varianceDays}d Late`
                        : metrics.varianceDays < 0
                        ? `${metrics.varianceDays}d Ahead`
                        : "On Schedule"}
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            {/* Column 2 & 3: WBS Stage Completion Breakdown */}
            <div className="md:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                  WBS Work Package Progress Breakdown
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Duration-Weighted Progress by Stage
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {metrics.stages.map((st) => (
                  <div
                    key={st.name}
                    className="p-2 rounded-lg border bg-background/80 flex flex-col justify-between gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground truncate max-w-[140px]" title={st.name}>
                        {st.name}
                      </span>
                      <span className="font-mono text-xs font-semibold text-primary">
                        {st.percent}%
                      </span>
                    </div>
                    {/* Stage Progress Bar */}
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          st.percent >= 100
                            ? "bg-emerald-500"
                            : st.percent > 0
                            ? "bg-blue-500"
                            : "bg-muted-foreground/30"
                        }`}
                        style={{ width: `${st.percent}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                      <span>{st.count} activities</span>
                      <span>{st.duration} wd</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
