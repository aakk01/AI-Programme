import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarCog,
  ClipboardList,
  Columns3,
  Download,
  History,
  Save,
  Sparkles,
  TrendingUp,
  Undo2,
  Redo2,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { api, downloadExport, errMsg } from "@/lib/api";
import { stripComputed } from "@/lib/links";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataGrid } from "@/components/DataGrid";
import { GanttChart } from "@/components/GanttChart";
import { AiChatDrawer } from "@/components/AiChatDrawer";
import { CalendarDialog } from "@/components/CalendarDialog";
import { VarianceDialog } from "@/components/VarianceDialog";
import { ThemeToggle } from "@/components/ThemeToggle";

const ZOOMS = ["day", "week", "month"];

export default function Workspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [project, setProject] = useState(null);
  const [activities, setActivities] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState("week");
  const [stageFilter, setStageFilter] = useState("__all__");
  const [selectedId, setSelectedId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [showSaveSnapshot, setShowSaveSnapshot] = useState(false);
  const [snapshotName, setSnapshotName] = useState("");
  const [baselineId, setBaselineId] = useState("__none__");
  const [baselineData, setBaselineData] = useState(null);
  const [showBaselineCols, setShowBaselineCols] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [variance, setVariance] = useState(null);
  const [showVariance, setShowVariance] = useState(false);
  const past = useRef([]);
  const future = useRef([]);
  const [historySize, setHistorySize] = useState([0, 0]);

  const syncHistory = () =>
    setHistorySize([past.current.length, future.current.length]);

  const ingest = useCallback((data) => {
    setProject(data);
    setActivities(data.activities || []);
    setSchedule(data.schedule || null);
    setDirty(false);
    past.current = [];
    future.current = [];
    setHistorySize([0, 0]);
  }, []);

  const poll = useCallback(async () => {
    for (let i = 0; i < 120; i += 1) {
      await new Promise((r) => setTimeout(r, 4000));
      try {
        const { data } = await api.get(`/projects/${id}/generation-status`);
        if (data.status === "done" && data.project) {
          ingest(data.project);
          toast.success(
            `Programme generated — ${data.project.activities.length} activities`,
          );
          return;
        }
        if (data.status === "error") {
          toast.error(data.error || "Generation failed");
          return;
        }
      } catch (e) {
        toast.error(errMsg(e));
        return;
      }
    }
    toast.error("Generation timed out. Please try again.");
  }, [id, ingest]);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      await api.post(`/projects/${id}/generate`);
      await poll();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setGenerating(false);
    }
  }, [id, poll]);

  useEffect(() => {
    api
      .get(`/projects/${id}`)
      .then(({ data }) => {
        ingest(data);
        if (params.get("generate") === "1" && (data.activities || []).length === 0) {
          setParams({}, { replace: true });
          generate();
        } else if (data.generation_status === "running") {
          setGenerating(true);
          poll().finally(() => setGenerating(false));
        }
      })
      .catch((e) => {
        toast.error(errMsg(e));
        navigate("/");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const recalc = async (next, { history = true } = {}) => {
    if (history) {
      past.current = [...past.current.slice(-49), stripComputed(activities)];
      future.current = [];
      syncHistory();
    }
    setActivities(next);
    setDirty(true);
    try {
      const { data } = await api.post(`/projects/${id}/recalculate`, {
        activities: stripComputed(next),
      });
      setActivities(data.activities);
      setSchedule({ ...data, activities: undefined });
      if (data.has_cycle) toast.error("Circular logic detected in the network");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const undo = () => {
    if (!past.current.length) return;
    const prev = past.current.pop();
    future.current = [stripComputed(activities), ...future.current.slice(0, 49)];
    syncHistory();
    recalc(prev, { history: false });
    if (!past.current.length) setDirty(false);
    toast.success("Undone");
  };

  const redo = () => {
    if (!future.current.length) return;
    const next = future.current.shift();
    past.current = [...past.current, stripComputed(activities)];
    syncHistory();
    recalc(next, { history: false });
    toast.success("Redone");
  };

  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (["input", "select", "textarea"].includes(tag)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities]);

  const reorder = (fromId, toId) => {
    const from = activities.findIndex((a) => a.activity_id === fromId);
    const to = activities.findIndex((a) => a.activity_id === toId);
    if (from < 0 || to < 0) return;
    past.current = [...past.current.slice(-49), stripComputed(activities)];
    future.current = [];
    syncHistory();
    const next = [...activities];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    recalc(next, { history: false });
  };

  const openVariance = async () => {
    setVariance(null);
    setShowVariance(true);
    try {
      const { data } = await api.get(`/projects/${id}/variance`);
      setVariance(data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const applyEdits = (edits) => {
    if (!edits?.length) return;
    const byId = {};
    edits.forEach((e) => {
      byId[e.activity_id] = { ...(byId[e.activity_id] || {}), [e.key]: e.value };
    });
    const next = activities.map((a) =>
      byId[a.activity_id] ? { ...a, ...byId[a.activity_id] } : a,
    );
    recalc(next);
  };

  const editCell = (visibleIndex, key, value) => {
    const target = visible[visibleIndex];
    if (!target) return;
    applyEdits([{ activity_id: target.activity_id, key, value }]);
  };

  const addActivity = () => {
    const n = activities.length + 1;
    const next = [
      ...activities,
      {
        activity_id: `Z${1000 + n * 10}`,
        wbs_code: "",
        wbs_l1: stageFilter === "__all__" ? "New Stage" : stageFilter,
        wbs_l2: "",
        wbs_l3: "",
        description: "New activity",
        type: "Task",
        duration: 5,
        predecessors: [],
      },
    ];
    recalc(next);
  };

  const deleteActivity = (visibleIndex) => {
    const target = visible[visibleIndex];
    const next = activities
      .filter((a) => a.activity_id !== target.activity_id)
      .map((a) => ({
        ...a,
        predecessors: (a.predecessors || []).filter(
          (p) => p.id !== target.activity_id,
        ),
      }));
    recalc(next);
  };

  const changeDuration = (visibleIndex, duration) =>
    editCell(visibleIndex, "duration", duration);

  const save = async () => {
    try {
      const { data } = await api.put(`/projects/${id}/activities`, {
        activities: stripComputed(activities),
      });
      ingest(data);
      toast.success("Programme saved");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const loadSnapshots = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${id}/snapshots`);
      setSnapshots(data);
      return data;
    } catch (e) {
      toast.error(errMsg(e));
      return [];
    }
  }, [id]);

  const saveSnapshot = async () => {
    try {
      const name = snapshotName.trim();
      const { data } = await api.post(`/projects/${id}/snapshots`, { name });
      toast.success(`Snapshot saved: ${data.label}`);
      setShowSaveSnapshot(false);
      setSnapshotName("");
      await loadSnapshots();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const openSnapshots = async () => {
    await loadSnapshots();
    setShowSnapshots(true);
  };

  const restore = async (snapshotId) => {
    try {
      const { data } = await api.post(
        `/projects/${id}/snapshots/${snapshotId}/restore`,
      );
      ingest(data);
      setShowSnapshots(false);
      toast.success("Snapshot restored");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  useEffect(() => {
    if (baselineId === "__none__") {
      setBaselineData(null);
      return;
    }
    let cancelled = false;
    api
      .get(`/projects/${id}/snapshots/${baselineId}/compare`)
      .then(({ data }) => {
        if (!cancelled) setBaselineData(data);
      })
      .catch((e) => {
        if (!cancelled) toast.error(errMsg(e));
      });
    return () => {
      cancelled = true;
    };
  }, [baselineId, id, activities]);

  useEffect(() => {
    if (project) loadSnapshots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const baselineByActivity = useMemo(() => {
    const map = {};
    (baselineData?.rows || []).forEach((r) => {
      map[r.activity_id] = r;
    });
    return map;
  }, [baselineData]);

  const stages = useMemo(
    () => [...new Set(activities.map((a) => a.wbs_l1).filter(Boolean))],
    [activities],
  );
  const visible = useMemo(
    () =>
      stageFilter === "__all__"
        ? activities
        : activities.filter((a) => a.wbs_l1 === stageFilter),
    [activities, stageFilter],
  );

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center font-mono-data text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Loading programme…
      </div>
    );

  const stat = (label, value, accent) => (
    <div className="border-l border-border px-3">
      <p className="font-mono-data text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p
        className={`font-mono-data text-[13px] ${accent ? "text-[hsl(var(--bar-critical))]" : ""}`}
      >
        {value}
      </p>
    </div>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <button
          data-testid="back-to-dashboard"
          className="flex items-center gap-1.5 font-mono-data text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="mx-2 h-6 w-px bg-border" />
        <h1 data-testid="project-title" className="text-base font-bold">
          {project?.name}
        </h1>
        {dirty && (
          <span className="font-mono-data text-[10px] uppercase tracking-wider text-[hsl(var(--bar-milestone))]">
            unsaved
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <div className="mr-1 flex border border-border">
            <button
              data-testid="undo-button"
              disabled={!historySize[0]}
              onClick={undo}
              title="Undo (Ctrl+Z)"
              className="px-2 py-1.5 transition-colors hover:bg-[hsl(var(--surface))] disabled:opacity-30"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              data-testid="redo-button"
              disabled={!historySize[1]}
              onClick={redo}
              title="Redo (Ctrl+Shift+Z)"
              className="border-l border-border px-2 py-1.5 transition-colors hover:bg-[hsl(var(--surface))] disabled:opacity-30"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger
              data-testid="stage-filter"
              className="h-8 w-[188px] rounded-sm text-xs"
            >
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All WBS L1 stages</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex border border-border">
            {ZOOMS.map((z) => (
              <button
                key={z}
                data-testid={`zoom-${z}`}
                onClick={() => setZoom(z)}
                className={`px-2.5 py-1 font-mono-data text-[10px] uppercase tracking-wider transition-colors ${
                  zoom === z
                    ? "bg-foreground text-background"
                    : "hover:bg-[hsl(var(--surface))]"
                }`}
              >
                {z}
              </button>
            ))}
          </div>

          <Button
            data-testid="calendar-button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm text-xs"
            onClick={() => setShowCalendar(true)}
          >
            <CalendarCog className="mr-1.5 h-3.5 w-3.5" />
            {project?.calendar?.week_pattern || "5-day"}
          </Button>

          <Button
            data-testid="variance-button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm text-xs"
            onClick={openVariance}
          >
            <TrendingUp className="mr-1.5 h-3.5 w-3.5" /> Variance
          </Button>

          <Button
            data-testid="assumptions-button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm text-xs"
            onClick={() => setShowAssumptions(true)}
          >
            <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
            Assumptions ({(project?.assumptions || []).length})
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-testid="snapshots-menu"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm text-xs"
              >
                <History className="mr-1.5 h-3.5 w-3.5" />
                Snapshots{snapshots.length ? ` (${snapshots.length})` : ""}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem
                data-testid="save-snapshot-menu"
                onClick={() => {
                  setSnapshotName("");
                  setShowSaveSnapshot(true);
                }}
              >
                Save baseline snapshot…
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="manage-snapshots-menu"
                onClick={openSnapshots}
              >
                Manage / restore snapshots
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="toggle-baseline-cols"
                onClick={() => setShowBaselineCols((v) => !v)}
              >
                <Columns3 className="mr-2 h-3.5 w-3.5" />
                {showBaselineCols ? "Hide" : "Show"} BL columns in grid
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Select value={baselineId} onValueChange={setBaselineId}>
            <SelectTrigger
              data-testid="baseline-selector"
              className="h-8 w-[180px] rounded-sm text-xs"
            >
              <SelectValue placeholder="No baseline" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No baseline</SelectItem>
              {snapshots.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                data-testid="export-button"
                variant="outline"
                size="sm"
                className="h-8 rounded-sm text-xs"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem
                data-testid="export-csv"
                onClick={() => downloadExport(id, "csv")}
              >
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="export-json"
                onClick={() => downloadExport(id, "json")}
              >
                JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="export-xml"
                onClick={() => downloadExport(id, "xml")}
              >
                MS Project XML (MSP / Asta)
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="export-asta"
                onClick={() => downloadExport(id, "asta")}
              >
                Asta Powerproject XML
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="export-xer"
                onClick={() => downloadExport(id, "xer")}
              >
                Primavera P6 XER
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            data-testid="save-button"
            size="sm"
            className="h-8 rounded-sm text-xs"
            onClick={save}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" /> Save
          </Button>

          <Button
            data-testid="toggle-chat"
            variant={chatOpen ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-sm text-xs"
            onClick={() => setChatOpen((o) => !o)}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" /> AI
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex items-center gap-0 border-b border-border bg-[hsl(var(--surface))] py-1.5">
        {stat("Activities", activities.length)}
        {stat("Duration", `${schedule?.duration_working_days || 0} wd`)}
        {stat("Start", schedule?.project_start || "—")}
        {stat("Finish", schedule?.project_finish || "—")}
        {stat("Critical", `${schedule?.critical_count || 0} act`, true)}
        {stat("Version", `v${project?.version || 1}`)}
        <div className="ml-auto flex items-center gap-4 px-4 font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 bg-[hsl(var(--bar))]" /> Task
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-4 bg-[hsl(var(--bar-critical))]" /> Critical
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rotate-45 bg-[hsl(var(--bar-milestone))]" />
            Milestone
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          {activities.length === 0 ? (
            <div className="grid-paper flex h-full flex-col items-center justify-center gap-4 text-center">
              <h2 className="text-lg font-bold">
                {generating ? "Drafting your programme…" : "No programme yet"}
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {generating
                  ? "Building the WBS, assigning working-day durations and closing the logic network. This takes up to a minute."
                  : "Generate an AI baseline programme from your project parameters."}
              </p>
              {!generating && (
                <Button
                  data-testid="generate-button"
                  className="rounded-sm"
                  onClick={generate}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Generate programme
                </Button>
              )}
            </div>
          ) : (
            <PanelGroup direction="vertical">
              <Panel defaultSize={52} minSize={20}>
                <DataGrid
                  activities={visible}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onApplyEdits={applyEdits}
                  onAdd={addActivity}
                  onDelete={deleteActivity}
                  onReorder={reorder}
                  reorderEnabled={stageFilter === "__all__"}
                  baselineByActivity={baselineByActivity}
                  showBaselineCols={showBaselineCols && baselineId !== "__none__"}
                />
              </Panel>
              <PanelResizeHandle className="h-1.5 border-y border-border bg-[hsl(var(--surface))] transition-colors hover:bg-[hsl(var(--bar))]/40" />
              <Panel defaultSize={48} minSize={20}>
                <GanttChart
                  activities={visible}
                  projectStart={schedule?.project_start}
                  calendar={schedule?.calendar}
                  zoom={zoom}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onDurationChange={changeDuration}
                  baselineByActivity={baselineByActivity}
                  baselineActive={baselineId !== "__none__"}
                />
              </Panel>
            </PanelGroup>
          )}
        </div>

        <AiChatDrawer
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          projectId={id}
          onApplied={ingest}
        />
      </div>

      <CalendarDialog
        open={showCalendar}
        onOpenChange={setShowCalendar}
        projectId={id}
        calendar={project?.calendar}
        onSaved={ingest}
      />

      <VarianceDialog
        open={showVariance}
        onOpenChange={setShowVariance}
        report={variance}
      />

      <Dialog open={showAssumptions} onOpenChange={setShowAssumptions}>
        <DialogContent className="max-w-2xl rounded-sm bg-background">
          <DialogHeader>
            <DialogTitle>Assumptions register</DialogTitle>
          </DialogHeader>
          {project?.summary && (
            <p className="border-l-2 border-[hsl(var(--bar))] pl-3 text-sm text-muted-foreground">
              {project.summary}
            </p>
          )}
          <div
            data-testid="assumptions-list"
            className="max-h-[52vh] space-y-px overflow-auto bg-border"
          >
            {(project?.assumptions || []).map((a, i) => (
              <div key={i} className="bg-background p-3">
                <p className="font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground">
                  {a.category || "General"}
                </p>
                <p className="mt-1 text-sm">{a.assumption}</p>
                {a.basis && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Basis: {a.basis}
                  </p>
                )}
              </div>
            ))}
            {(project?.assumptions || []).length === 0 && (
              <p className="bg-background p-3 text-sm text-muted-foreground">
                No assumptions recorded yet.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSnapshots} onOpenChange={setShowSnapshots}>
        <DialogContent className="max-w-lg rounded-sm bg-background">
          <DialogHeader>
            <DialogTitle>Snapshots / baselines</DialogTitle>
          </DialogHeader>
          {baselineData && (
            <div className="border-l-2 border-[hsl(var(--bar))] bg-[hsl(var(--surface))] px-3 py-2 text-xs">
              <p className="font-mono-data text-[10px] uppercase tracking-wider text-muted-foreground">
                Active baseline vs current
              </p>
              <p className="mt-1">
                Baseline finish: <b>{baselineData.baseline_finish || "—"}</b> ·
                Current finish: <b>{baselineData.current_finish || "—"}</b> ·
                Δ{" "}
                <span
                  className={
                    baselineData.finish_variance_days > 0
                      ? "font-semibold text-[hsl(var(--bar-critical))]"
                      : baselineData.finish_variance_days < 0
                        ? "font-semibold text-[hsl(var(--bar))]"
                        : ""
                  }
                >
                  {baselineData.finish_variance_days ?? "—"} d
                </span>
              </p>
            </div>
          )}
          <div data-testid="snapshots-list" className="space-y-px bg-border">
            {snapshots.map((v) => (
              <div
                key={v.id}
                data-testid={`snapshot-row-${v.id}`}
                className="flex items-center justify-between bg-background p-3"
              >
                <div>
                  <p className="text-sm font-medium">{v.label}</p>
                  <p className="font-mono-data text-[10px] text-muted-foreground">
                    {v.activity_count} activities ·{" "}
                    {String(v.created_at).slice(0, 16)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    data-testid={`set-baseline-${v.id}`}
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-sm text-xs"
                    onClick={() => {
                      setBaselineId(v.id);
                      setShowSnapshots(false);
                      toast.success(`Baseline set to ${v.label}`);
                    }}
                  >
                    Set as baseline
                  </Button>
                  <Button
                    data-testid={`restore-${v.id}`}
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-sm text-xs"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Restore programme to "${v.label}"? Current unsaved edits will be replaced.`,
                        )
                      )
                        restore(v.id);
                    }}
                  >
                    Restore
                  </Button>
                </div>
              </div>
            ))}
            {snapshots.length === 0 && (
              <p className="bg-background p-3 text-sm text-muted-foreground">
                No snapshots yet. Use “Save baseline snapshot” to capture the
                current state.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSaveSnapshot} onOpenChange={setShowSaveSnapshot}>
        <DialogContent className="max-w-md rounded-sm bg-background">
          <DialogHeader>
            <DialogTitle>Save baseline snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs text-muted-foreground">
              Name your snapshot (e.g. “Target Baseline Rev 0”, “Week 12 Update”)
            </label>
            <Input
              autoFocus
              data-testid="snapshot-name-input"
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveSnapshot();
              }}
              placeholder={`Snapshot ${snapshots.length + 1}`}
              className="rounded-sm"
            />
            <p className="font-mono-data text-[10px] text-muted-foreground">
              Captures the current activities and working calendar. Use the
              baseline selector afterwards to compare progress against it.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              className="rounded-sm"
              onClick={() => setShowSaveSnapshot(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="save-snapshot-confirm"
              size="sm"
              className="rounded-sm"
              onClick={saveSnapshot}
            >
              Save snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
