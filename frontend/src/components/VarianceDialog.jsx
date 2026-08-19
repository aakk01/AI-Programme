import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS = {
  late: { label: "Behind target", cls: "text-[hsl(var(--bar-critical))]" },
  early: { label: "Ahead of target", cls: "text-[hsl(var(--bar))]" },
  on_time: { label: "On target", cls: "text-[hsl(var(--bar))]" },
  no_target: { label: "No target set", cls: "text-muted-foreground" },
};

const Metric = ({ label, value, cls }) => (
  <div className="border border-border p-3">
    <p className="font-mono-data text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
      {label}
    </p>
    <p className={`mt-1 font-mono-data text-[15px] ${cls || ""}`}>{value}</p>
  </div>
);

export const VarianceDialog = ({ open, onOpenChange, report }) => {
  const s = STATUS[report?.status || "no_target"];
  const v = report?.variance_working_days;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl rounded-sm bg-background">
        <DialogHeader>
          <DialogTitle>Target completion variance</DialogTitle>
        </DialogHeader>

        {!report ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div data-testid="variance-report" className="space-y-5">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Forecast finish" value={report.forecast_finish} />
              <Metric label="Target finish" value={report.target_finish || "—"} />
              <Metric
                label="Variance (wd)"
                value={v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}`}
                cls={s.cls}
              />
              <Metric label="Status" value={s.label} cls={s.cls} />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric
                label="Calendar days"
                value={
                  report.variance_calendar_days === null ||
                  report.variance_calendar_days === undefined
                    ? "—"
                    : report.variance_calendar_days
                }
              />
              <Metric label="Duration" value={`${report.duration_working_days} wd`} />
              <Metric label="Week pattern" value={report.calendar?.week_pattern} />
              <Metric
                label="Holidays"
                value={`${(report.calendar?.holidays || []).length} days`}
              />
            </div>

            {report.negative_float_activities?.length > 0 && (
              <div>
                <h3 className="font-mono-data text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--bar-critical))]">
                  Negative float ({report.negative_float_activities.length})
                </h3>
                <div className="mt-2 max-h-40 overflow-auto border border-border">
                  {report.negative_float_activities.map((a) => (
                    <div
                      key={a.activity_id}
                      className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono-data text-[11px] last:border-0"
                    >
                      <span className="truncate">
                        {a.activity_id} · {a.description}
                        {a.constraint ? ` · ${a.constraint}` : ""}
                      </span>
                      <span className="text-[hsl(var(--bar-critical))]">
                        {a.total_float}d
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-mono-data text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Key milestones ({report.milestones?.length || 0})
              </h3>
              <div className="mt-2 max-h-48 overflow-auto border border-border">
                {(report.milestones || []).map((m) => (
                  <div
                    key={m.activity_id}
                    className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono-data text-[11px] last:border-0"
                  >
                    <span className="truncate">
                      {m.activity_id} · {m.description}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span>{m.date}</span>
                      <span
                        className={
                          m.total_float < 0
                            ? "text-[hsl(var(--bar-critical))]"
                            : "text-muted-foreground"
                        }
                      >
                        {m.total_float}d float
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p className="font-mono-data text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Critical path: {report.critical_path?.length || 0} activities
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
