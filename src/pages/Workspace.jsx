import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Undo2,
  Redo2,
  Calendar as CalendarIcon,
  TrendingUp,
  Sparkles,
  Download,
  Layers,
  Camera,
  RotateCcw,
  Check,
  AlertCircle,
  FileSpreadsheet,
  FileCode2,
  SlidersHorizontal,
  Loader2,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Navbar } from "@/components/Navbar";
import { DataGrid } from "@/components/DataGrid";
import { GanttChart } from "@/components/GanttChart";
import { CalendarDialog } from "@/components/CalendarDialog";
import { VarianceDialog } from "@/components/VarianceDialog";
import { AiChatDrawer } from "@/components/AiChatDrawer";
import { SummaryDashboard } from "@/components/SummaryDashboard";
import { HealthDashboard } from "@/components/HealthDashboard";
import { ExportModule } from "@/components/ExportModule";
import { api, errMsg, downloadExport } from "@/lib/api";
import { toast } from "sonner";
import { useBilling } from "@/context/BillingContext";

export function Workspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openPaywall } = useBilling();

  // Active View Tab: "studio" | "health" | "export"
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "studio");

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["studio", "health", "export"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams(tab === "studio" ? {} : { tab });
  };

  // Project Data State
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [healthSummary, setHealthSummary] = useState(null);

  // Undo / Redo history
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // Filters & Views
  const [selectedStage, setSelectedStage] = useState("all");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [highlightedActId, setHighlightedActId] = useState(null);

  // Modals & Drawers
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [varianceOpen, setVarianceOpen] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);

  // Snapshots & Baseline Comparison
  const [snapshots, setSnapshots] = useState([]);
  const [activeBaselineId, setActiveBaselineId] = useState(null);
  const [baselineComparison, setBaselineComparison] = useState(null);
  const [showBaselineCols, setShowBaselineCols] = useState(false);
  const [saveSnapshotOpen, setSaveSnapshotOpen] = useState(false);
  const [newSnapshotName, setNewSnapshotName] = useState("");

  // Fetch Project from backend
  const fetchProject = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/projects/${id}`);
      const data = res.data.project || res.data;

      // Ensure activities array is well-formed
      if (!data.activities) data.activities = [];
      setProject(data);
      setHistory([data.activities]);
      setHistoryIdx(0);
      setIsDirty(false);

      // Fetch health summary
      try {
        const healthRes = await api.get(`/projects/${id}/health-audit`);
        setHealthSummary(healthRes.data);
      } catch {
        // ignore
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadSnapshots = useCallback(async () => {
    try {
      const res = await api.get(`/projects/${id}/snapshots`);
      setSnapshots(res.data.snapshots || res.data || []);
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    fetchProject();
    loadSnapshots();
  }, [fetchProject, loadSnapshots]);

  // Recalculate schedule via backend CPM endpoint
  const recalculateSchedule = useCallback(
    async (actsToRecalc) => {
      if (!project) return;
      const acts = actsToRecalc || project.activities;
      try {
        const res = await api.post(`/projects/${project.id}/recalculate`, {
          activities: acts,
          calendar: project.calendar,
        });

        const calculated = res.data.activities || acts;
        setProject((prev) => ({
          ...prev,
          activities: calculated,
          schedule: {
            project_start: res.data.project_start,
            project_finish: res.data.project_finish,
            duration_working_days: res.data.duration_working_days,
            critical_count: res.data.critical_count,
            has_cycle: res.data.has_cycle,
          },
        }));

        // Refresh health summary
        try {
          const healthRes = await api.get(`/projects/${project.id}/health-audit`);
          setHealthSummary(healthRes.data);
        } catch {
          // ignore
        }
      } catch (err) {
        console.error("Recalculate error:", err);
      }
    },
    [project]
  );

  // Modify activities and push to undo/redo history
  const handleActivitiesChange = (newActivities) => {
    const updatedHistory = history.slice(0, historyIdx + 1);
    updatedHistory.push(newActivities);
    setHistory(updatedHistory);
    setHistoryIdx(updatedHistory.length - 1);

    setProject((prev) => ({
      ...prev,
      activities: newActivities,
    }));
    setIsDirty(true);
    recalculateSchedule(newActivities);
  };

  const handleUndo = () => {
    if (historyIdx > 0) {
      const targetIdx = historyIdx - 1;
      const prevActs = history[targetIdx];
      setHistoryIdx(targetIdx);
      setProject((prev) => ({ ...prev, activities: prevActs }));
      recalculateSchedule(prevActs);
      setIsDirty(true);
    }
  };

  const handleRedo = () => {
    if (historyIdx < history.length - 1) {
      const targetIdx = historyIdx + 1;
      const nextActs = history[targetIdx];
      setHistoryIdx(targetIdx);
      setProject((prev) => ({ ...prev, activities: nextActs }));
      recalculateSchedule(nextActs);
      setIsDirty(true);
    }
  };

  const handleSave = async () => {
    if (!project) return;
    try {
      setSaving(true);
      await api.patch(`/projects/${project.id}`, {
        activities: project.activities,
        calendar: project.calendar,
        title: project.title || project.name,
      });
      setIsDirty(false);
      toast.success("Programme saved successfully");
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddActivity = () => {
    const current = project?.activities || [];
    const newIndex = current.length + 1;
    const newId = `A${1000 + newIndex * 10}`;
    const prevAct = current[current.length - 1];

    const newAct = {
      activity_id: newId,
      id: newId,
      description: "New Construction Task",
      wbs_l1: prevAct?.wbs_l1 || prevAct?.stage || "General Works",
      duration: 5,
      predecessors: prevAct ? [{ id: prevAct.activity_id || prevAct.id, type: "FS", lag: 0 }] : [],
      is_milestone: false,
      type: "Task",
      critical: false,
    };

    handleActivitiesChange([...current, newAct]);
  };

  const handleDeleteActivity = (actId) => {
    const current = project?.activities || [];
    const filtered = current.filter((a) => (a.activity_id || a.id) !== actId);
    handleActivitiesChange(filtered);
    toast.info(`Removed activity ${actId}`);
  };

  const handleCreateSnapshot = async () => {
    if (!newSnapshotName.trim()) return;
    try {
      await api.post(`/projects/${project.id}/snapshots`, {
        name: newSnapshotName,
      });
      toast.success(`Saved snapshot "${newSnapshotName}"`);
      setSaveSnapshotOpen(false);
      setNewSnapshotName("");
      loadSnapshots();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const handleSelectBaseline = async (snapshotId) => {
    if (!snapshotId || snapshotId === "none") {
      setActiveBaselineId(null);
      setBaselineComparison(null);
      setShowBaselineCols(false);
      return;
    }

    try {
      const res = await api.get(`/projects/${project.id}/snapshots/${snapshotId}/compare`);
      setActiveBaselineId(snapshotId);
      setBaselineComparison(res.data.comparison || res.data);
      setShowBaselineCols(true);
      toast.success("Baseline snapshot overlaid");
    } catch {
      toast.error("Could not compare baseline");
    }
  };

  const handleExport = async (format) => {
    try {
      await downloadExport(project.id, format);
      toast.success(`Exported ${format.toUpperCase()} successfully`);
    } catch (err) {
      if (err.response?.status === 402) {
        openPaywall("export");
      } else {
        toast.error(errMsg(err));
      }
    }
  };

  // Filter activities
  const displayedActivities = (project?.activities || []).filter((act) => {
    if (onlyCritical && !act.critical && (act.total_float || 0) > 0) return false;
    if (selectedStage !== "all" && act.stage !== selectedStage && act.wbs_l1 !== selectedStage) return false;

    if (statusFilter === "critical") {
      if (!act.critical && (act.total_float || 0) > 0) return false;
    } else if (statusFilter === "completed") {
      const pct = act.percent_complete ?? act.progress ?? 0;
      if (pct < 100) return false;
    } else if (statusFilter === "in_progress") {
      const pct = act.percent_complete ?? act.progress ?? 0;
      if (pct <= 0 || pct >= 100) return false;
    } else if (statusFilter === "not_started") {
      const pct = act.percent_complete ?? act.progress ?? 0;
      if (pct > 0) return false;
    }

    return true;
  });

  const stages = Array.from(new Set((project?.activities || []).map((a) => a.wbs_l1 || a.stage || "General Works")));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading Programme Intelligence Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Top Main Navigation */}
      <Navbar
        activeProjectId={project?.id}
        projectName={project?.name || project?.title}
        healthScore={healthSummary?.overall_score}
        healthRating={healthSummary?.rating}
      />

      {/* Workspace Secondary Action Bar */}
      <header className="h-12 border-b bg-card/90 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none z-20">
        {/* Left: Project Title & View Switcher */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/70">
            <Button
              variant={activeTab === "studio" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleTabChange("studio")}
              className="h-7 text-xs font-medium px-2.5 gap-1"
            >
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              Gantt & Grid Studio
            </Button>

            <Button
              variant={activeTab === "health" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleTabChange("health")}
              className="h-7 text-xs font-medium px-2.5 gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              DCMA-14 Diagnostics
              {healthSummary && (
                <span className="text-[10px] font-mono ml-0.5 px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  {healthSummary.overall_score}
                </span>
              )}
            </Button>

            <Button
              variant={activeTab === "export" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => handleTabChange("export")}
              className="h-7 text-xs font-medium px-2.5 gap-1"
            >
              <Download className="w-3.5 h-3.5 text-amber-500" />
              Asta / P6 Exporter
            </Button>
          </div>

          {isDirty && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-medium text-amber-600 bg-amber-500/10 border-amber-500/30">
              Unsaved Changes
            </Badge>
          )}
        </div>

        {/* Center: Tools & AI Drawer */}
        <div className="flex items-center gap-1.5">
          {activeTab === "studio" && (
            <>
              {/* Undo / Redo */}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleUndo}
                disabled={historyIdx <= 0}
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleRedo}
                disabled={historyIdx >= history.length - 1}
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="h-4 w-4" />
              </Button>

              <div className="h-4 w-px bg-border mx-1" />

              {/* Snapshots Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                    <Camera className="h-3.5 w-3.5" />
                    <span>Snapshots ({snapshots.length})</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => setSaveSnapshotOpen(true)}>
                    <Camera className="h-4 w-4 mr-2" /> Save Baseline Snapshot...
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                    Compare Baseline
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleSelectBaseline("none")}>
                    <span className={!activeBaselineId ? "font-bold text-primary" : ""}>None (Current Only)</span>
                  </DropdownMenuItem>
                  {snapshots.map((snap) => (
                    <DropdownMenuItem key={snap.id} onClick={() => handleSelectBaseline(snap.id)}>
                      <span className={activeBaselineId === snap.id ? "font-bold text-primary" : ""}>
                        {snap.name || `Snapshot ${snap.created_at?.slice(0, 10)}`}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Calendar Dialog */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setCalendarOpen(true)}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span>Calendar ({project?.calendar?.working_days || 5}d)</span>
              </Button>

              {/* Variance Analysis */}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={() => setVarianceOpen(true)}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                <span>Variance</span>
              </Button>
            </>
          )}

          {/* AI Refinement */}
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-xs"
            onClick={() => setAiDrawerOpen(true)}
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>AI Refine</span>
          </Button>
        </div>

        {/* Right: Save, Quick Export */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`h-8 text-xs gap-1.5 ${
              isDirty ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs" : ""
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            <span>{saving ? "Saving..." : "Save"}</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => handleExport("asta")}>
                <FileCode2 className="h-4 w-4 mr-2 text-purple-500" /> Asta Powerproject (.XML)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("xer")}>
                <FileSpreadsheet className="h-4 w-4 mr-2 text-blue-500" /> Primavera P6 (.XER)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("msproject")}>
                <FileCode2 className="h-4 w-4 mr-2 text-emerald-500" /> MS Project (.XML)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleExport("csv")}>
                <Download className="h-4 w-4 mr-2" /> Excel (.CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("json")}>
                <Download className="h-4 w-4 mr-2" /> JSON Network Schema
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Workspace Body Switcher */}
      {activeTab === "health" ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background max-w-7xl w-full mx-auto">
          <HealthDashboard
            projectId={project.id}
            activities={project.activities}
            scheduleResult={{
              project_start: project.inputs?.start_date || project.created_at?.slice(0, 10),
            }}
            targetCompletion={project.inputs?.target_completion}
            onApplyRemediation={(updatedActs) => {
              handleActivitiesChange(updatedActs);
            }}
          />
        </div>
      ) : activeTab === "export" ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background max-w-7xl w-full mx-auto">
          <ExportModule
            projectId={project.id}
            projectName={project.name || project.title}
            activities={project.activities}
            scheduleResult={{
              project_start: project.inputs?.start_date || project.created_at?.slice(0, 10),
            }}
            calendar={project.calendar}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Summary Dashboard: Duration, Number of Tasks, Percentage of Completion */}
          <SummaryDashboard
            project={project}
            activities={project?.activities || []}
            schedule={project?.schedule || {}}
            activeFilter={statusFilter}
            onFilterChange={(f) => {
              setStatusFilter(f);
              if (f === "critical") setOnlyCritical(true);
              else if (onlyCritical && f === "all") setOnlyCritical(false);
            }}
          />

          {/* Stage Filter Toolbar */}
          <div className="h-8 border-b bg-muted/30 px-4 flex items-center justify-between text-xs shrink-0 select-none">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground font-medium">Filter Stage:</span>
                <select
                  value={selectedStage}
                  onChange={(e) => setSelectedStage(e.target.value)}
                  className="bg-background border rounded px-2 py-0.5 text-xs font-medium"
                >
                  <option value="all">All Stages ({project?.activities?.length || 0})</option>
                  {stages.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyCritical || statusFilter === "critical"}
                  onChange={(e) => {
                    setOnlyCritical(e.target.checked);
                    if (e.target.checked) setStatusFilter("critical");
                    else if (statusFilter === "critical") setStatusFilter("all");
                  }}
                  className="rounded border-input text-rose-600 focus:ring-rose-500"
                />
                <span className={onlyCritical || statusFilter === "critical" ? "font-semibold text-rose-600" : "text-muted-foreground"}>
                  Critical Path Only
                </span>
              </label>

              {statusFilter !== "all" && (
                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 gap-1">
                  <span>Filter: {statusFilter.replace("_", " ")}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter("all");
                      setOnlyCritical(false);
                    }}
                    className="hover:text-destructive font-bold ml-1"
                  >
                    ×
                  </button>
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
              <span>
                Showing <strong className="text-foreground font-mono">{displayedActivities.length}</strong> of{" "}
                <strong className="text-foreground font-mono">{project?.activities?.length || 0}</strong> activities
              </span>
            </div>
          </div>

          {/* Split Workspace View */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
            {/* Left: Interactive Spreadsheet Grid */}
            <div className="h-full overflow-hidden border-r flex flex-col">
              <DataGrid
                activities={displayedActivities}
                baselineComparison={baselineComparison}
                showBaselineCols={showBaselineCols}
                onActivitiesChange={handleActivitiesChange}
                onAddActivity={handleAddActivity}
                onDeleteActivity={handleDeleteActivity}
                highlightedActivityId={highlightedActId}
                onSelectActivity={setHighlightedActId}
              />
            </div>

            {/* Right: SVG Gantt Timeline */}
            <div className="h-full overflow-hidden flex flex-col">
              <GanttChart
                activities={displayedActivities}
                schedule={project?.schedule || {}}
                baselineComparison={baselineComparison}
                highlightedActivityId={highlightedActId}
                onSelectActivity={setHighlightedActId}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modals & Drawers */}
      <CalendarDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        calendar={project?.calendar || {}}
        onSave={(cal) => {
          setProject((prev) => ({ ...prev, calendar: cal }));
          setIsDirty(true);
          recalculateSchedule();
          toast.success("Calendar updated & schedule recalculated");
        }}
      />

      <VarianceDialog
        open={varianceOpen}
        onOpenChange={setVarianceOpen}
        project={project}
      />

      <AiChatDrawer
        open={aiDrawerOpen}
        onOpenChange={setAiDrawerOpen}
        project={project}
        onApplyChanges={(newActs) => {
          handleActivitiesChange(newActs);
        }}
      />

      {/* Save Baseline Snapshot Modal */}
      <Dialog open={saveSnapshotOpen} onOpenChange={setSaveSnapshotOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Save Baseline Snapshot</DialogTitle>
            <DialogDescription>
              Lock in the current logic network and dates as a baseline to track future schedule slippages and variances.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Snapshot Name</Label>
            <Input
              placeholder="e.g. Baseline Rev 01 - Contract Execution"
              value={newSnapshotName}
              onChange={(e) => setNewSnapshotName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveSnapshotOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSnapshot} disabled={!newSnapshotName.trim()}>
              Save Snapshot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
