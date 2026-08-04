import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThemeToggle } from "@/components/ThemeToggle";

const PROJECT_TYPES = [
  "Residential — high rise",
  "Residential — low rise",
  "Commercial office (CAT A)",
  "Commercial fit-out (CAT B)",
  "Retail",
  "Education",
  "Healthcare",
  "Industrial / logistics warehouse",
  "Data centre",
  "Hotel",
  "Mixed use",
  "Highways / infrastructure",
  "Rail",
  "Water / utilities",
  "Refurbishment",
];

const PROCUREMENT = [
  "Traditional (single stage)",
  "Two-stage design & build",
  "Design & build (single stage)",
  "Construction management",
  "Management contracting",
  "Framework / NEC option C",
];

const STEPS = ["Project", "Scale", "Commercial", "Constraints"];

export default function Wizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    project_type: "",
    gia: "",
    gia_unit: "sqm",
    floors: "",
    linear_km: "",
    budget: "",
    currency: "GBP",
    start_date: "",
    completion_date: "",
    procurement: "",
    long_lead_items: "",
    site_constraints: "",
    sectional_completions: "",
    notes: "",
  });

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const num = (v) => (v === "" || v === null ? null : Number(v));

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/projects", {
        name: form.name || `${form.project_type || "New"} programme`,
        inputs: {
          project_type: form.project_type,
          gia: num(form.gia),
          gia_unit: form.gia_unit,
          floors: num(form.floors),
          linear_km: num(form.linear_km),
          budget: num(form.budget),
          currency: form.currency,
          start_date: form.start_date || null,
          completion_date: form.completion_date || null,
          procurement: form.procurement,
          long_lead_items: form.long_lead_items,
          site_constraints: form.site_constraints,
          sectional_completions: form.sectional_completions,
          notes: form.notes,
        },
      });
      navigate(`/project/${data.id}?generate=1`);
    } catch (e) {
      toast.error(errMsg(e));
      setBusy(false);
    }
  };

  const field = (label, node, hint) => (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider">{label}</Label>
      {node}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <button
          data-testid="wizard-back-dashboard"
          className="flex items-center gap-2 font-mono-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </button>
        <ThemeToggle />
      </header>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="font-mono-data text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Step {step + 1} / {STEPS.length} — {STEPS[step]}
        </p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
          Project parameters
        </h1>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">
          Anything you leave blank is filled with an industry-standard default
          and logged explicitly in the assumptions register.
        </p>

        <div className="mt-8 flex gap-px border border-border bg-border">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 ${i <= step ? "bg-[hsl(var(--bar))]" : "bg-[hsl(var(--surface))]"}`}
            />
          ))}
        </div>

        <div className="mt-8 space-y-5 border border-border p-6">
          {step === 0 && (
            <>
              {field(
                "Programme name",
                <Input
                  data-testid="wizard-name"
                  className="rounded-sm"
                  value={form.name}
                  onChange={(e) => set("name")(e.target.value)}
                  placeholder="Riverside Tower — Baseline"
                />,
              )}
              {field(
                "Project type",
                <Select value={form.project_type} onValueChange={set("project_type")}>
                  <SelectTrigger data-testid="wizard-project-type" className="rounded-sm">
                    <SelectValue placeholder="Select project type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>,
              )}
              {field(
                "Procurement strategy",
                <Select value={form.procurement} onValueChange={set("procurement")}>
                  <SelectTrigger data-testid="wizard-procurement" className="rounded-sm">
                    <SelectValue placeholder="Select strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROCUREMENT.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>,
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  {field(
                    "Gross internal area",
                    <Input
                      data-testid="wizard-gia"
                      type="number"
                      className="rounded-sm font-mono-data"
                      value={form.gia}
                      onChange={(e) => set("gia")(e.target.value)}
                      placeholder="18500"
                    />,
                  )}
                </div>
                {field(
                  "Unit",
                  <Select value={form.gia_unit} onValueChange={set("gia_unit")}>
                    <SelectTrigger data-testid="wizard-gia-unit" className="rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sqm">sqm</SelectItem>
                      <SelectItem value="sqft">sqft</SelectItem>
                    </SelectContent>
                  </Select>,
                )}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {field(
                  "Number of floors",
                  <Input
                    data-testid="wizard-floors"
                    type="number"
                    className="rounded-sm font-mono-data"
                    value={form.floors}
                    onChange={(e) => set("floors")(e.target.value)}
                    placeholder="14"
                  />,
                )}
                {field(
                  "Linear length (km)",
                  <Input
                    data-testid="wizard-linear"
                    type="number"
                    className="rounded-sm font-mono-data"
                    value={form.linear_km}
                    onChange={(e) => set("linear_km")(e.target.value)}
                    placeholder="For linear infrastructure only"
                  />,
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="grid gap-5 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  {field(
                    "Construction budget",
                    <Input
                      data-testid="wizard-budget"
                      type="number"
                      className="rounded-sm font-mono-data"
                      value={form.budget}
                      onChange={(e) => set("budget")(e.target.value)}
                      placeholder="42000000"
                    />,
                  )}
                </div>
                {field(
                  "Currency",
                  <Select value={form.currency} onValueChange={set("currency")}>
                    <SelectTrigger data-testid="wizard-currency" className="rounded-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["GBP", "USD", "EUR", "AUD", "AED", "CAD"].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>,
                )}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {field(
                  "Target start (NTP)",
                  <Input
                    data-testid="wizard-start-date"
                    type="date"
                    className="rounded-sm font-mono-data"
                    value={form.start_date}
                    onChange={(e) => set("start_date")(e.target.value)}
                  />,
                  "Defaults to today if left blank.",
                )}
                {field(
                  "Target completion",
                  <Input
                    data-testid="wizard-completion-date"
                    type="date"
                    className="rounded-sm font-mono-data"
                    value={form.completion_date}
                    onChange={(e) => set("completion_date")(e.target.value)}
                  />,
                )}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {field(
                "Long-lead items",
                <Textarea
                  data-testid="wizard-long-lead"
                  className="rounded-sm"
                  rows={2}
                  value={form.long_lead_items}
                  onChange={(e) => set("long_lead_items")(e.target.value)}
                  placeholder="Unitised façade, switchgear, lifts, chillers…"
                />,
              )}
              {field(
                "Site constraints",
                <Textarea
                  data-testid="wizard-constraints"
                  className="rounded-sm"
                  rows={2}
                  value={form.site_constraints}
                  onChange={(e) => set("site_constraints")(e.target.value)}
                  placeholder="City centre, single access, no weekend working, live railway adjacent…"
                />,
              )}
              {field(
                "Sectional completions",
                <Input
                  data-testid="wizard-sectional"
                  className="rounded-sm"
                  value={form.sectional_completions}
                  onChange={(e) => set("sectional_completions")(e.target.value)}
                  placeholder="Retail units at L00 handed over 8 weeks early"
                />,
              )}
              {field(
                "Additional notes",
                <Textarea
                  data-testid="wizard-notes"
                  className="rounded-sm"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set("notes")(e.target.value)}
                  placeholder="Anything else the planner should know."
                />,
              )}
            </>
          )}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Button
            data-testid="wizard-prev"
            variant="outline"
            className="rounded-sm"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              data-testid="wizard-next"
              className="rounded-sm"
              onClick={() => setStep((s) => s + 1)}
            >
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button
              data-testid="wizard-generate"
              className="rounded-sm"
              disabled={busy}
              onClick={submit}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              {busy ? "Creating…" : "Generate programme"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
