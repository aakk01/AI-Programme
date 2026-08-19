import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Sparkles,
  Zap,
  RotateCcw,
  Layers,
  ArrowRight,
  RefreshCw,
  Wrench,
  AlertCircle,
  FileCheck2,
  Clock,
  Link2,
  Sliders,
  HelpCircle,
  Check,
  ChevronRight,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

export function HealthDashboard({
  projectId = null,
  activities = [],
  scheduleResult = null,
  targetCompletion = null,
  onApplyRemediation = null,
}) {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAdvisor, setAiAdvisor] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");

  const runAudit = useCallback(async () => {
    setLoading(true);
    try {
      if (projectId) {
        const res = await api.get(`/projects/${projectId}/health-audit`);
        setAudit(res.data);
      } else {
        const res = await api.post("/api/health-audit", {
          activities,
          start_date: scheduleResult?.project_start,
          target_completion: targetCompletion,
        });
        setAudit(res.data);
      }
    } catch (err) {
      console.error("Health audit failed:", err);
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, activities, scheduleResult, targetCompletion]);

  useEffect(() => {
    runAudit();
  }, [runAudit]);

  const handleRemediate = async (remediationType = "apply_all_fixes") => {
    setRemediating(true);
    try {
      if (projectId) {
        const res = await api.post(`/projects/${projectId}/health-remediation`, {
          remediation_type: remediationType,
        });
        setAudit(res.data.audit);
        toast.success(`Applied health fixes: ${res.data.fixes_applied} adjustments made.`);
        if (onApplyRemediation) {
          onApplyRemediation(res.data.activities);
        }
      } else {
        const res = await api.post("/api/health-remediation/raw", {
          activities,
          remediation_type: remediationType,
          start_date: scheduleResult?.project_start,
        });
        setAudit(res.data.audit);
        toast.success(`Applied health fixes: ${res.data.fixes_applied} adjustments made.`);
        if (onApplyRemediation) {
          onApplyRemediation(res.data.activities);
        }
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setRemediating(false);
    }
  };

  const handleFetchAiRecommendations = async () => {
    setAiLoading(true);
    try {
      let res;
      if (projectId) {
        res = await api.post(`/projects/${projectId}/health-recommendations`);
      } else {
        res = await api.post("/api/health-recommendations", {
          activities,
          start_date: scheduleResult?.project_start,
        });
      }
      setAiAdvisor(res.data);
      toast.success("Generated AI delay mitigation recommendations.");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setAiLoading(false);
    }
  };

  if (loading && !audit) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary mb-3" />
        <p className="text-sm font-medium text-foreground">Running DCMA 14-Point Health Audit...</p>
        <p className="text-xs text-muted-foreground mt-1">Analyzing network topology, logic loops, float distributions, and constraints.</p>
      </div>
    );
  }

  if (!audit) {
    return (
      <div className="p-8 text-center border border-dashed rounded-xl border-border bg-card">
        <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">No audit data available</p>
        <Button onClick={runAudit} variant="outline" size="sm" className="mt-3">
          Run Diagnostics
        </Button>
      </div>
    );
  }

  const { overall_score, rating, summary, dcma_metrics = [], issues = [] } = audit;

  // Filter issues
  const filteredIssues = issues.filter((iss) => {
    if (activeCategory !== "all" && iss.category !== activeCategory) return false;
    if (severityFilter !== "all" && iss.severity !== severityFilter) return false;
    return true;
  });

  const getScoreColor = (score) => {
    if (score >= 90) return "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    if (score >= 75) return "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/30";
    if (score >= 50) return "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30";
    return "text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30";
  };

  const passingDcmaCount = dcma_metrics.filter((m) => m.status === "pass").length;

  return (
    <div className="space-y-6">
      {/* 1. Executive Health Score Header */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Main Score Gauge Card */}
        <Card className="md:col-span-4 bg-card/70 backdrop-blur border-border/80 shadow-xs relative overflow-hidden flex flex-col justify-between">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Overall Schedule Integrity
              </span>
              <Badge variant="outline" className={`text-[11px] font-semibold px-2 py-0.5 ${getScoreColor(overall_score)}`}>
                {rating}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold font-mono tracking-tight text-foreground">{overall_score}</span>
              <span className="text-muted-foreground text-sm font-medium">/ 100</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  overall_score >= 90
                    ? "bg-emerald-500"
                    : overall_score >= 75
                    ? "bg-blue-500"
                    : overall_score >= 50
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${overall_score}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2.5">
              {passingDcmaCount} of {dcma_metrics.length} DCMA 14-Point metrics meet industry compliance benchmarks.
            </p>
          </CardContent>
          <CardFooter className="pt-0 border-t border-border/40 py-2.5 bg-muted/20 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">DCMA Pass Rate</span>
            <span className="font-mono font-medium text-foreground">
              {Math.round((passingDcmaCount / (dcma_metrics.length || 1)) * 100)}%
            </span>
          </CardFooter>
        </Card>

        {/* Key Executive KPI Metric Cards */}
        <div className="md:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* CPLI */}
          <Card className="bg-card/70 border-border/80 p-3.5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-muted-foreground">CPLI Index</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] h-4 px-1 ${
                    summary.cpli >= 1.0 ? "text-emerald-600 bg-emerald-500/10" : "text-rose-600 bg-rose-500/10"
                  }`}
                >
                  {summary.cpli >= 1.0 ? "Healthy" : "At Risk"}
                </Badge>
              </div>
              <div className="text-2xl font-bold font-mono text-foreground">{summary.cpli}</div>
            </div>
            <span className="text-[10px] text-muted-foreground mt-1">Benchmark ≥ 1.00</span>
          </Card>

          {/* Logic Density */}
          <Card className="bg-card/70 border-border/80 p-3.5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-muted-foreground">Logic Density</span>
                <Badge
                  variant="outline"
                  className={`text-[10px] h-4 px-1 ${
                    summary.logic_density >= 1.4 ? "text-emerald-600 bg-emerald-500/10" : "text-amber-600 bg-amber-500/10"
                  }`}
                >
                  {summary.logic_density >= 1.4 ? "Sound" : "Loose"}
                </Badge>
              </div>
              <div className="text-2xl font-bold font-mono text-foreground">{summary.logic_density}</div>
            </div>
            <span className="text-[10px] text-muted-foreground mt-1">Links / Activity (1.4–2.0)</span>
          </Card>

          {/* Critical Path Ratio */}
          <Card className="bg-card/70 border-border/80 p-3.5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-muted-foreground">Critical Path</span>
                <Flame className="w-3.5 h-3.5 text-rose-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-foreground">{summary.critical_percent}%</div>
            </div>
            <span className="text-[10px] text-muted-foreground mt-1">
              {summary.critical_count} of {summary.total_activities} tasks
            </span>
          </Card>

          {/* Schedule Performance Index (SPI) */}
          <Card className="bg-card/70 border-border/80 p-3.5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-medium text-muted-foreground">Earned Progress</span>
                <TrendingUp className="w-3.5 h-3.5 text-blue-500" />
              </div>
              <div className="text-2xl font-bold font-mono text-foreground">{summary.duration_weighted_progress}%</div>
            </div>
            <span className="text-[10px] text-muted-foreground mt-1">
              {summary.earned_working_days} / {summary.total_planned_working_days} wd
            </span>
          </Card>

          {/* Remediation Action Bar (Span Full 4 cols) */}
          <div className="col-span-2 sm:col-span-4 bg-muted/40 border border-border/70 rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">One-Click Logic Remediation:</span>
              <span className="text-xs text-muted-foreground hidden lg:inline">
                Automatically repair open logic, soften hard constraints, and fix leads.
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant="default"
                size="sm"
                onClick={() => handleRemediate("apply_all_fixes")}
                disabled={remediating || issues.length === 0}
                className="h-7 text-xs gap-1 font-medium bg-primary text-primary-foreground shadow-xs"
              >
                <Zap className="w-3 h-3" />
                {remediating ? "Repairing..." : "Apply All Fixes"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRemediate("close_open_ends")}
                disabled={remediating}
                className="h-7 text-xs gap-1"
              >
                <Link2 className="w-3 h-3 text-blue-500" />
                Close Open Ends
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRemediate("fix_negative_lags")}
                disabled={remediating}
                className="h-7 text-xs gap-1"
              >
                <Clock className="w-3 h-3 text-amber-500" />
                Fix Leads (Negative Lags)
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRemediate("break_loops")}
                disabled={remediating || !summary.has_logic_loops}
                className="h-7 text-xs gap-1"
              >
                <RotateCcw className="w-3 h-3 text-rose-500" />
                Break Loops
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Circular Logic Loops Alert Banner (If present) */}
      {summary.has_logic_loops && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-300 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              <span className="font-semibold text-sm">
                Critical Logic Loops Detected ({summary.loops_count})
              </span>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleRemediate("break_loops")}
              disabled={remediating}
              className="h-7 text-xs font-medium gap-1"
            >
              <Zap className="w-3 h-3" />
              Sever Loop Back-Edges
            </Button>
          </div>
          <p className="text-xs text-rose-700 dark:text-rose-300/90">
            Circular dependencies prevent CPM forward and backward float calculations. The following loop cycles were detected:
          </p>
          <div className="space-y-1 mt-2">
            {summary.loop_paths.map((path, idx) => (
              <div key={idx} className="font-mono text-xs bg-background/50 px-2.5 py-1 rounded border border-rose-500/20">
                {path.join(" ➔ ")}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. DCMA 14-Point Assessment Checklist Table */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-primary" />
                DCMA 14-Point & Schedule Quality Assessment
              </CardTitle>
              <CardDescription className="text-xs">
                Industry-standard benchmark compliance audit for Defence, Infrastructure, and Major Construction programmes.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={runAudit} className="h-7 text-xs gap-1">
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
              Re-evaluate
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-muted-foreground font-medium">
                <th className="py-2.5 px-4">Metric / Check</th>
                <th className="py-2.5 px-4">Standard Threshold</th>
                <th className="py-2.5 px-4">Current Value</th>
                <th className="py-2.5 px-4">Affected Items</th>
                <th className="py-2.5 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 font-sans">
              {dcma_metrics.map((metric) => (
                <tr key={metric.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 px-4 font-medium text-foreground">
                    <div className="font-semibold">{metric.name}</div>
                    <div className="text-[11px] text-muted-foreground">{metric.description}</div>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-muted-foreground">{metric.pass_threshold}</td>
                  <td className="py-2.5 px-4 font-mono font-medium text-foreground">
                    {metric.actual_value}
                    {metric.actual_unit === "%" ? "%" : metric.actual_unit === "count" ? " tasks" : ""}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-muted-foreground">
                    {metric.affected_count > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">{metric.affected_count}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    {metric.status === "pass" ? (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] h-5">
                        <CheckCircle2 className="w-3 h-3 mr-1 inline" /> PASS
                      </Badge>
                    ) : metric.status === "warning" ? (
                      <Badge variant="outline" className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] h-5">
                        <AlertTriangle className="w-3 h-3 mr-1 inline" /> WARNING
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[10px] h-5">
                        <XCircle className="w-3 h-3 mr-1 inline" /> FAIL
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* 4. Identified Issues Breakdown & Surgical Fixes */}
      <Card className="bg-card border-border shadow-xs">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Schedule Health Diagnostic Issues ({issues.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Detailed task-level anomalies affecting network logic, critical path accuracy, or float values.
              </CardDescription>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                variant={activeCategory === "all" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveCategory("all")}
                className="h-7 text-xs px-2"
              >
                All ({issues.length})
              </Button>
              <Button
                variant={activeCategory === "open_logic" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveCategory("open_logic")}
                className="h-7 text-xs px-2"
              >
                Open Logic
              </Button>
              <Button
                variant={activeCategory === "float_anomaly" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveCategory("float_anomaly")}
                className="h-7 text-xs px-2"
              >
                Float Anomaly
              </Button>
              <Button
                variant={activeCategory === "lead_lag" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveCategory("lead_lag")}
                className="h-7 text-xs px-2"
              >
                Leads / Lags
              </Button>
              <Button
                variant={activeCategory === "constraint" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setActiveCategory("constraint")}
                className="h-7 text-xs px-2"
              >
                Constraints
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-border/60">
          {filteredIssues.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
              No issues detected for the selected filter. Schedule logic network is clean.
            </div>
          ) : (
            filteredIssues.map((iss, idx) => (
              <div key={`health-issue-${iss.id || idx}-${idx}`} className="p-3.5 hover:bg-muted/20 transition-colors flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] h-4.5 px-1.5 font-medium ${
                        iss.severity === "critical"
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30"
                          : iss.severity === "warning"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                      }`}
                    >
                      {iss.severity.toUpperCase()}
                    </Badge>
                    <span className="font-semibold text-xs text-foreground">{iss.title}</span>
                    <span className="text-[11px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      ID: {iss.activity_id}
                    </span>
                  </div>
                  <p className="text-xs text-foreground font-medium">Task: {iss.activity_name}</p>
                  <p className="text-xs text-muted-foreground">{iss.description}</p>
                </div>

                {iss.remediation_type && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemediate(iss.remediation_type)}
                    disabled={remediating}
                    className="h-7 text-xs font-medium gap-1 shrink-0 text-primary border-primary/30 hover:bg-primary/10"
                  >
                    <Wrench className="w-3 h-3" />
                    {iss.remediation_label || "Fix"}
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* 5. AI Schedule Advisor & Delay Mitigation Optimizer */}
      <Card className="bg-gradient-to-br from-card to-primary/5 border-primary/20 shadow-xs">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">AI Schedule Enhancement & Optimization Advisor</CardTitle>
                <CardDescription className="text-xs">
                  Gemini intelligence evaluates critical path buffers, sequencing risks, and fast-tracking proposals.
                </CardDescription>
              </div>
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={handleFetchAiRecommendations}
              disabled={aiLoading}
              className="h-8 text-xs font-medium gap-1.5"
            >
              <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? "animate-spin" : ""}`} />
              {aiLoading ? "Analyzing Programme..." : aiAdvisor ? "Re-generate Advice" : "Analyze with AI"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {!aiAdvisor && !aiLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Click &quot;Analyze with AI&quot; to generate director-level delay mitigation proposals and schedule fast-tracking opportunities.
            </p>
          ) : aiLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-xs text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              Gemini model is performing delay risk assessment across all {summary.total_activities} activities...
            </div>
          ) : (
            <div className="space-y-4">
              {/* Executive Summary */}
              <div className="p-3 rounded-lg bg-background/80 border border-border text-xs leading-relaxed text-foreground">
                <span className="font-semibold text-primary block mb-1">Executive Delay Assessment:</span>
                {aiAdvisor.executive_summary}
              </div>

              {/* Recommendations */}
              {aiAdvisor.recommendations?.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                    Strategic Planning Recommendations:
                  </span>
                  <ul className="space-y-1.5">
                    {aiAdvisor.recommendations.map((rec, i) => (
                      <li key={`rec-item-${i}`} className="text-xs text-muted-foreground flex items-start gap-2 bg-background/50 p-2 rounded border border-border/60">
                        <ChevronRight className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="text-foreground">{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fast-Tracking Opportunities */}
              {aiAdvisor.fast_track_proposals?.length > 0 && (
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    Fast-Tracking / Schedule Compression Proposals:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {aiAdvisor.fast_track_proposals.map((prop, i) => (
                      <div key={`fast-track-prop-${i}`} className="p-3 rounded-lg bg-card border border-border space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-foreground">{prop.strategy}</span>
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            Save ~{prop.potential_saving_days} wd
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{prop.impact}</p>
                        <div className="text-[10px] text-muted-foreground font-mono pt-1">
                          Risk Level: <span className="font-medium text-foreground">{prop.risk_level}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
