import React from "react";
import { AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, Calendar, AlertOctagon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export function VarianceDialog({ open, onOpenChange, project }) {
  if (!project) return null;

  const activities = project.activities || [];
  const schedule = project.schedule || {};
  const inputs = project.inputs || {};

  const targetFinish = inputs.target_completion || inputs.end_date || schedule.project_finish;
  const forecastFinish = schedule.project_finish || "-";

  // Calculate variance in days if both dates exist
  let varianceDays = 0;
  let isDelayed = false;
  if (targetFinish && forecastFinish && targetFinish !== "-" && forecastFinish !== "-") {
    const tTime = new Date(targetFinish).getTime();
    const fTime = new Date(forecastFinish).getTime();
    varianceDays = Math.round((fTime - tTime) / (1000 * 60 * 60 * 24));
    isDelayed = varianceDays > 0;
  }

  // Activities with negative float or on critical path with total float <= 0
  const negativeFloatActs = activities.filter((a) => (a.total_float !== undefined && a.total_float < 0));
  const criticalActs = activities.filter((a) => a.critical || a.total_float === 0);
  const milestones = activities.filter((a) => a.is_milestone || a.duration === 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <DialogTitle>Programme Variance & Completion Analysis</DialogTitle>
          </div>
          <DialogDescription>
            Comprehensive baseline comparison, target completion variance, and negative float risk analysis.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Top KPI Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Target Completion</span>
              <div className="text-base font-semibold mt-1 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{formatDate(targetFinish)}</span>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Forecast Completion</span>
              <div className="text-base font-semibold mt-1 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                <span>{formatDate(forecastFinish)}</span>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <span className="text-xs font-medium text-muted-foreground">Schedule Variance</span>
              <div className="mt-1 flex items-center gap-1.5">
                {isDelayed ? (
                  <Badge variant="critical" className="text-xs py-1 px-2">
                    <TrendingDown className="h-3 w-3 mr-1" />
                    +{varianceDays}d Late
                  </Badge>
                ) : (
                  <Badge variant="success" className="text-xs py-1 px-2">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    {varianceDays === 0 ? "On Target" : `${Math.abs(varianceDays)}d Ahead`}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Negative Float & Critical Path Warning */}
          {negativeFloatActs.length > 0 ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-sm">
                <AlertOctagon className="h-4 w-4" />
                <span>{negativeFloatActs.length} Activities with Negative Total Float</span>
              </div>
              <p className="text-xs text-rose-700/80 dark:text-rose-300/80">
                Network constraints or target completion dates cannot be satisfied with current predecessor lags and durations.
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {negativeFloatActs.map((act, idx) => {
                  const actId = act.id || act.activity_id || `neg-${idx + 1}`;
                  const actName = act.name || act.description || actId;
                  return (
                    <div key={`neg-act-${actId}-${idx}`} className="flex justify-between items-center text-xs py-1 px-2 rounded bg-background/80 border">
                      <span className="font-medium truncate max-w-[340px]">{actId}: {actName}</span>
                      <span className="font-mono text-rose-600 font-semibold">{act.total_float}d float</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Logic network is fully compliant. No negative float detected across {activities.length} activities.</span>
            </div>
          )}

          {/* Key Milestones Variance */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Key Project Milestones ({milestones.length})
            </h4>
            <div className="border rounded-md divide-y max-h-44 overflow-y-auto">
              {milestones.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground text-center">No milestone activities defined</div>
              ) : (
                milestones.map((m, idx) => {
                  const mId = m.id || m.activity_id || `ms-${idx + 1}`;
                  const mName = m.name || m.description || mId;
                  return (
                    <div key={`milestone-${mId}-${idx}`} className="p-2.5 flex items-center justify-between text-xs hover:bg-muted/30">
                      <div>
                        <span className="font-mono text-primary font-medium mr-2">{mId}</span>
                        <span className="font-medium">{mName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">{formatDate(m.early_finish || m.finish || m.late_finish)}</span>
                        {m.critical ? (
                          <Badge variant="critical">Critical</Badge>
                        ) : (
                          <Badge variant="secondary">Float: {m.total_float || 0}d</Badge>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange?.(false)}>Close Report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
