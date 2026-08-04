import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarCog,
  ClipboardList,
  Download,
  History,
  Save,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { api, downloadExport, errMsg } from "@/lib/api";
import { stripComputed } from "@/lib/links";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const [versions, setVersions] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [variance, setVariance] = useState(null);
  const [showVariance, setShowVariance] = useState(false);

  const ingest = useCallback((data) => {
    setProject(data);
    setActivities(data.activities || []);
    setSchedule(data.schedule || null);
    setDirty(false);
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

  const recalc = async (next) => {
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

  const reorder = (fromId, toId) => {
    const from = activities.findIndex((a) => a.activity_id === fromId);
    const to = activities.findIndex((a) => a.activity_id === toId);
    if (from < 0 || to < 0) return;
    const next = [...activities];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setActivities(next);
    setDirty(true);
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

  const editCell = (visibleIndex, key, value) => {
    const target = visible[visibleIndex];
    const next = activities.map((a) =>
      a.activity_id === target.activity_id ? { ...a, [key]: value } : a,
    );
    recalc(next);
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

  const snapshot = async () => {
    try {
      const { data } = await api.post(`/projects/${id}/versions`, {});
      toast.success(`Snapshot saved as ${data.label}`);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const openVersions = async () => {
    try {
      const { data } = await api.get(`/projects/${id}/versions`);
      setVersions(data);
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const restore = async (versionId) => {
    try {
      const { data } = await api.post(
        `/projects/${id}/versions/${versionId}/restore`,
      );
      ingest(data);
      setVersions(null);
      toast.success("Version restored");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

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

          <Button
            data-testid="versions-button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm text-xs"
            onClick={openVersions}
          >
            <History className="mr-1.5 h-3.5 w-3.5" /> Versions
          </Button>

          <Button
            data-testid="snapshot-button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm text-xs"
            onClick={snapshot}
          >
            Snapshot
          </Button>

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
                  onEdit={editCell}
                  onAdd={addActivity}
                  onDelete={deleteActivity}
                  onReorder={reorder}
                  reorderEnabled={stageFilter === "__all__"}
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

      <Dialog open={versions !== null} onOpenChange={() => setVersions(null)}>
        <DialogContent className="max-w-lg rounded-sm bg-background">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
          </DialogHeader>
          <div data-testid="versions-list" className="space-y-px bg-border">
            {(versions || []).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between bg-background p-3"
              >
                <div>
                  <p className="text-sm font-medium">{v.label}</p>
                  <p className="font-mono-data text-[10px] text-muted-foreground">
                    {v.activity_count} activities · {String(v.created_at).slice(0, 16)}
                  </p>
                </div>
                <Button
                  data-testid={`restore-${v.id}`}
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-sm text-xs"
                  onClick={() => restore(v.id)}
                >
                  Restore
                </Button>
              </div>
            ))}
            {versions?.length === 0 && (
              <p className="bg-background p-3 text-sm text-muted-foreground">
                No snapshots yet. Use “Snapshot” to capture the current baseline.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
