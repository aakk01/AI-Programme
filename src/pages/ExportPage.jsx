import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Download,
  FileCode2,
  FileSpreadsheet,
  Layers,
  ArrowLeft,
  Activity,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { ExportModule } from "@/components/ExportModule";
import { api, errMsg } from "@/lib/api";
import { toast } from "sonner";

export function ExportPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(id || null);
  const [currentProject, setCurrentProject] = useState(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar
        activeProjectId={currentProject?.id}
        projectName={currentProject?.name}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Header & Switcher */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/70">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
              <Download className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              Robust Export & Converter Engine
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Generate 100% compliant Asta Powerproject XML, Primavera P6 XER, MS Project XML, and CSV schedules.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {projects.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-medium">Export Programme:</span>
                <select
                  value={selectedProjectId || ""}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    navigate(`/export/${e.target.value}`);
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

            {currentProject && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/health/${currentProject.id}`)}
                  className="h-8 text-xs gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Health Audit
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate(`/workspace/${currentProject.id}`)}
                  className="h-8 text-xs gap-1.5"
                >
                  <Activity className="w-3.5 h-3.5 text-blue-500" />
                  Schedule Studio
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Active Export Module */}
        {currentProject ? (
          <ExportModule
            projectId={currentProject.id}
            projectName={currentProject.name || "Programme of Works"}
            activities={currentProject.activities || []}
            scheduleResult={{
              project_start: currentProject.inputs?.start_date || currentProject.created_at?.slice(0, 10),
            }}
            calendar={currentProject.calendar}
          />
        ) : (
          <div className="py-16 text-center border border-dashed rounded-xl border-border bg-card p-6">
            <Download className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-base font-semibold text-foreground">No Programme Selected for Export</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
              Select an existing programme or generate a new AI schedule to export into Asta XML or Primavera P6 XER.
            </p>
            <Button size="sm" onClick={() => navigate("/wizard")} className="gap-1.5 text-xs">
              <Sparkles className="w-3.5 h-3.5" /> Generate AI Programme
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
