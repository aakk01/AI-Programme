import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  Upload,
  FileSpreadsheet,
  Layers,
  Sparkles,
  RefreshCw,
  ArrowLeft,
  Activity,
  FileCode2,
  Check,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Navbar } from "@/components/Navbar";
import { HealthDashboard } from "@/components/HealthDashboard";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

export function HealthPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(id || null);
  const [currentProject, setCurrentProject] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Paste raw text modal / tab
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [pastedName, setPastedName] = useState("");
  const [parsingPaste, setParsingPaste] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await api.get("/projects");
      const list = res.data.projects || (Array.isArray(res.data) ? res.data : []);
      setProjects(list);
      if (!selectedProjectId && list.length > 0) {
        setSelectedProjectId(list[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  }, [selectedProjectId]);

  const fetchCurrentProject = useCallback(async (projId) => {
    if (!projId) return;
    setLoading(true);
    try {
      const res = await api.get(`/projects/${projId}`);
      setCurrentProject(res.data.project || res.data);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (selectedProjectId) {
      fetchCurrentProject(selectedProjectId);
    }
  }, [selectedProjectId, fetchCurrentProject]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/projects/import/file", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const format = res.data.stats?.format_detected || "schedule";
      toast.success(`Successfully imported ${format} with ${res.data.activities_count} activities.`);
      const newId = res.data.id || res.data.project_id;
      setSelectedProjectId(newId);
      navigate(`/health/${newId}`);
      fetchProjects();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handlePasteSubmit = async () => {
    if (!pastedText.trim()) {
      toast.error("Please paste schedule table data or activity list");
      return;
    }

    setParsingPaste(true);
    try {
      const res = await api.post("/projects/paste-schedule", {
        raw_text: pastedText,
        name: pastedName || "Pasted Schedule Audit",
      });
      toast.success(`Parsed ${res.data.activities_count} activities for diagnostics.`);
      setShowPasteModal(false);
      setPastedText("");
      const newId = res.data.id || res.data.project_id;
      setSelectedProjectId(newId);
      navigate(`/health/${newId}`);
      fetchProjects();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setParsingPaste(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar
        activeProjectId={currentProject?.id}
        projectName={currentProject?.name}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Top Header & Project Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/70">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              Programme Health & Logic Check Dashboard
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              DCMA 14-Point Assessment, Open-Ended Logic Audits, Loop Cycle Detection & Automated Delay Remediations.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Project Selector Dropdown */}
            {projects.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-medium">Audit Programme:</span>
                <select
                  value={selectedProjectId || ""}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    navigate(`/health/${e.target.value}`);
                  }}
                  className="h-8 text-xs font-medium bg-card border border-border rounded-lg px-2.5 text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary max-w-[220px] truncate"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.title || p.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xer,.xml,.csv"
              className="hidden"
            />

            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-8 text-xs gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              {uploading ? "Uploading..." : "Upload Schedule (XER/XML)"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPasteModal(true)}
              className="h-8 text-xs gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Paste Raw Schedule
            </Button>

            {currentProject && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/workspace/${currentProject.id}`)}
                className="h-8 text-xs gap-1.5"
              >
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                Open Studio
              </Button>
            )}
          </div>
        </div>

        {/* Paste Schedule Modal */}
        {showPasteModal && (
          <Card className="border-primary/40 shadow-lg bg-card mb-6">
            <CardHeader className="pb-3 border-b border-border/60">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                Paste Schedule / Activity Table Data
              </CardTitle>
              <CardDescription className="text-xs">
                Paste tab-separated, comma-separated, or raw activity lines (Activity ID, Name, Duration, Predecessors).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div>
                <Label className="text-xs font-medium">Programme Title (Optional)</Label>
                <Input
                  value={pastedName}
                  onChange={(e) => setPastedName(e.target.value)}
                  placeholder="e.g. Substructure & Fit-out Schedule"
                  className="h-8 text-xs mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-medium">Paste Schedule Data</Label>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Activity ID\tDescription\tDuration\tPredecessors\nA1000\tSite Possession & Setup\t0\t\nA1010\tDemolition & Site Clearance\t10\tA1000FS\nA1020\tPiling Works\t15\tA1010FS\nA1030\tRC Ground Beams\t12\tA1020FS\nA1040\tPractical Completion\t0\tA1030FS`}
                  rows={8}
                  className="w-full mt-1 p-2.5 text-xs font-mono bg-muted/40 border border-border rounded-lg focus:outline-hidden focus:ring-1 focus:ring-primary leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowPasteModal(false)} className="h-8 text-xs">
                  Cancel
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handlePasteSubmit}
                  disabled={parsingPaste}
                  className="h-8 text-xs font-medium gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {parsingPaste ? "Parsing Logic..." : "Ingest & Audit Schedule"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Health Dashboard Component */}
        {currentProject ? (
          <HealthDashboard
            projectId={currentProject.id}
            activities={currentProject.activities || []}
            scheduleResult={{
              project_start: currentProject.inputs?.start_date || currentProject.created_at?.slice(0, 10),
            }}
            targetCompletion={currentProject.inputs?.target_completion}
            onApplyRemediation={(updatedActs) => {
              setCurrentProject((prev) => ({ ...prev, activities: updatedActs }));
            }}
          />
        ) : (
          <div className="py-16 text-center border border-dashed rounded-xl border-border bg-card p-6">
            <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground">No Programme Selected for Health Audit</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
              Select an existing programme from the menu above, upload an Asta XML or Primavera P6 XER file, or generate a new AI schedule.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" onClick={() => navigate("/wizard")} className="gap-1.5 text-xs">
                <Sparkles className="w-3.5 h-3.5" /> Generate AI Programme
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowPasteModal(true)} className="gap-1.5 text-xs">
                <FileSpreadsheet className="w-3.5 h-3.5" /> Paste Raw Schedule
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
