import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PATTERNS = [
  { value: "5-day", label: "5-day week (Mon–Fri)" },
  { value: "6-day", label: "6-day week (Mon–Sat)" },
  { value: "7-day", label: "7-day week (continuous)" },
];

const REGIONS = [
  { value: "none", label: "No public holidays" },
  { value: "UK", label: "UK bank holidays (England & Wales)" },
  { value: "US", label: "US federal holidays" },
];

export const CalendarDialog = ({ open, onOpenChange, projectId, calendar, onSaved }) => {
  const [pattern, setPattern] = useState("5-day");
  const [region, setRegion] = useState("none");
  const [custom, setCustom] = useState([]);
  const [newDate, setNewDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPattern(calendar?.week_pattern || "5-day");
    setRegion(calendar?.holiday_region || "none");
    setCustom(calendar?.holidays || []);
  }, [open, calendar]);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/projects/${projectId}/calendar`, {
        week_pattern: pattern,
        holiday_region: region,
        holidays: custom,
      });
      onSaved(data);
      toast.success("Calendar updated — programme rescheduled");
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-sm bg-background">
        <DialogHeader>
          <DialogTitle>Working calendar</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider">Week pattern</Label>
            <Select value={pattern} onValueChange={setPattern}>
              <SelectTrigger data-testid="calendar-week-pattern" className="rounded-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PATTERNS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider">
              Public holiday set
            </Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger data-testid="calendar-holiday-region" className="rounded-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider">
              Additional non-working dates
            </Label>
            <div className="flex gap-2">
              <Input
                data-testid="calendar-custom-date"
                type="date"
                className="rounded-sm font-mono-data"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
              <Button
                data-testid="calendar-add-date"
                variant="outline"
                className="rounded-sm"
                onClick={() => {
                  if (newDate && !custom.includes(newDate))
                    setCustom([...custom, newDate].sort());
                  setNewDate("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {custom.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {custom.map((d) => (
                  <span
                    key={d}
                    className="flex items-center gap-1 border border-border px-1.5 py-0.5 font-mono-data text-[10px]"
                  >
                    {d}
                    <button
                      data-testid={`calendar-remove-${d}`}
                      onClick={() => setCustom(custom.filter((x) => x !== d))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Shutdowns, site closures or client-specific non-working days. Public
              holidays from the set above are applied automatically.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            data-testid="calendar-save"
            className="rounded-sm"
            disabled={busy}
            onClick={save}
          >
            {busy ? "Rescheduling…" : "Save & reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
