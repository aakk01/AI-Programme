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
      className={`bg-card/95 backdrop-blur-xs border-b transition-all duration-200 ${className}`}
      id="summary-dashboard"
    >
      {/* Primary KPI Header Row */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Metric 1: Duration */}
        <div className="flex items-center gap-3 pr-4 border-r border-border/70">
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Total Duration
              </span>
              {metrics.calendarDays > 0 && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded font-mono">
                  {metrics.calendarDays} cal days
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tracking-tight text-foreground">
                {metrics.workingDays} <span className="text-xs font-normal text-muted-foreground">working days</span>
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono flex items-center gap-1">
              <span>{formatDate(metrics.startDate)}</span>
              <span>→</span>
              <span className="text-primary font-semibold">{formatDate(metrics.finishDate)}</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Number of Tasks */}
        <div className="flex items-center gap-3 pr-4 border-r border-border/70">
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <ListTodo className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Schedule Activities
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                {metrics.totalCount} Total
              </Badge>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono tracking-tight text-foreground">
                {metrics.standardTaskCount}{" "}
                <span className="text-xs font-normal text-muted-foreground">tasks</span>
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 font-mono">
                {metrics.milestoneCount} <span className="text-xs font-normal text-muted-foreground">milestones</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => onFilterChange?.(activeFilter === "critical" ? "all" : "critical")}
                className={`flex items-center gap-1 font-medium transition-colors ${
                  activeFilter === "critical"
                    ? "text-rose-600 dark:text-rose-400 underline underline-offset-2"
                    : "text-muted-foreground hover:text-rose-600"
                }`}
                title="Filter critical path activities"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500 inline-block animate-pulse" />
                <strong className="text-rose-600 dark:text-rose-400 font-mono">{metrics.criticalCount}</strong> Critical ({metrics.criticalPercent}%)
              </button>
            </div>
          </div>
        </div>

        {/* Metric 3: Percentage of Completion */}
        <div className="flex items-center gap-3 pr-4 border-r border-border/70 flex-1 min-w-[220px]">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Percent className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Completion Progress
              </span>
              <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {metrics.durationWeightedPercent}%
              </span>
            </div>
            {/* Visual Progress Bar */}
            <div className="w-full bg-muted/80 rounded-full h-2.5 my-1 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all duration-500 rounded-full"
                style={{ width: `${Math.min(100, metrics.durationWeightedPercent)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span>
                Earned: <strong className="text-foreground">{metrics.totalEarnedDuration}d</strong> / {metrics.totalPlannedDuration}d
              </span>
              <span>
                {metrics.completedCount}/{metrics.totalCount} completed
              </span>
            </div>
          </div>
        </div>

        {/* Quick Filter Buttons & Expand Toggle */}
        <div className="flex items-center gap-2">
          {/* Status Breakdown Pills */}
          <div className="hidden sm:flex items-center gap-1 text-xs">
            <Button
              variant={activeFilter === "completed" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onFilterChange?.(activeFilter === "completed" ? "all" : "completed")}
              className="h-7 px-2 text-xs gap-1 text-emerald-600 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-3 w-3" />
              <span>{metrics.completedCount} Done</span>
            </Button>
            <Button
              variant={activeFilter === "in_progress" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onFilterChange?.(activeFilter === "in_progress" ? "all" : "in_progress")}
              className="h-7 px-2 text-xs gap-1 text-blue-600 dark:text-blue-400"
            >
              <Hourglass className="h-3 w-3" />
              <span>{metrics.inProgressCount} In-Prog</span>
            </Button>
            <Button
              variant={activeFilter === "not_started" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => onFilterChange?.(activeFilter === "not_started" ? "all" : "not_started")}
              className="h-7 px-2 text-xs gap-1 text-muted-foreground"
            >
              <CircleDot className="h-3 w-3" />
              <span>{metrics.notStartedCount} Pending</span>
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 text-xs gap-1.5"
            title="Toggle Detailed Schedule Analytics"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="hidden md:inline">{isExpanded ? "Collapse Analytics" : "Stage Breakdown"}</span>
            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
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
