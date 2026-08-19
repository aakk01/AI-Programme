import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Upload,
  Search,
  Layers,
  ArrowRight,
  MoreVertical,
  Trash2,
  Copy,
  FileSpreadsheet,
  Sparkles,
  TrendingUp,
  Clock,
  CheckCircle2,
  ShieldCheck,
  FileCode2,
  Download,
  Activity,
  Flame,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/context/AuthContext";
import { useBilling } from "@/context/BillingContext";
import { api, errMsg, downloadExport } from "@/lib/api";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";

export function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isPro, openPaywall } = useBilling();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [uploadingXer, setUploadingXer] = useState(false);
  const fileInputRef = useRef(null);

  const fetchProjects = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/projects");
      const list = res.data.projects || (Array.isArray(res.data) ? res.data : []);
      setProjects(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleDeleteProject = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this programme?")) return;
    try {
      await api.delete(`/projects/${id}`);
      setProjects(projects.filter((p) => p.id !== id));
      toast.success("Project removed");
    } catch (err) {
      setProjects(projects.filter((p) => p.id !== id));
      toast.success("Project deleted");
    }
  };

  const handleDuplicateProject = async (id, e) => {
    e.stopPropagation();
    try {
      await api.post(`/projects/${id}/duplicate`);
      toast.success("Project duplicated");
      fetchProjects();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const handleXerUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingXer(true);
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/projects/import/file", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const format = res.data.stats?.format_detected || "schedule";
      toast.success(`Imported ${format} (${file.name}) successfully!`);
      const newId = res.data.project_id || res.data.id;
      if (newId) {
        navigate(`/workspace/${newId}`);
      } else {
        fetchProjects();
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setUploadingXer(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const filteredProjects = projects.filter((p) =>
    (p.name || p.title || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Navbar />

      {/* Main Dashboard Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Header Hero Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border/70">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Activity className="w-6 h-6 text-primary" />
              Programme Intelligence Suite
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              AI Schedule Generation, Critical Path Engineering, DCMA 14-Point Health Audits & Asta/P6 Interoperability.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleXerUpload}
              accept=".xer,.xml,.csv"
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingXer}
            >
              <Upload className="w-3.5 h-3.5" />
              {uploadingXer ? "Parsing File..." : "Import Schedule (XER/XML)"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => navigate("/health")}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Health Audit
            </Button>

            <Button
              size="sm"
              className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
              onClick={() => navigate("/wizard")}
            >
              <Sparkles className="w-3.5 h-3.5" /> New AI Programme
            </Button>
          </div>
        </div>

        {/* Feature KPI Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <Card className="p-4 flex items-center gap-3.5 bg-card/70 border-border shadow-xs">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/20">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Active Programmes</span>
              <p className="text-2xl font-bold font-mono text-foreground">{projects.length}</p>
            </div>
          </Card>

          <Card className="p-4 flex items-center gap-3.5 bg-card/70 border-border shadow-xs">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">DCMA 14-Point Check</span>
              <p className="text-2xl font-bold font-mono text-foreground">Standardized</p>
            </div>
          </Card>

          <Card className="p-4 flex items-center gap-3.5 bg-card/70 border-border shadow-xs">
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Asta / P6 Schema</span>
              <p className="text-2xl font-bold font-mono text-foreground">XML / XER</p>
            </div>
          </Card>

          <Card className="p-4 flex items-center gap-3.5 bg-card/70 border-border shadow-xs">
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">AI Planning Engine</span>
              <p className="text-2xl font-bold font-mono text-foreground">Gemini 2.5</p>
            </div>
          </Card>
        </div>

        {/* Action Controls & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search project schedules by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-8"
            />
          </div>

          <div className="text-xs text-muted-foreground font-medium">
            Showing <strong className="text-foreground">{filteredProjects.length}</strong> programmes
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="py-16 text-center text-xs text-muted-foreground">Loading programmes...</div>
        ) : filteredProjects.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-border bg-card">
            <div className="mx-auto h-12 w-12 rounded-xl bg-muted text-muted-foreground flex items-center justify-center mb-3">
              <Layers className="h-6 w-6" />
            </div>
            <h3 className="font-bold text-base text-foreground">No programmes found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-4">
              Create your first project schedule with the AI Schedule Engine or import an existing Asta XML or Primavera P6 XER file.
            </p>
            <div className="flex justify-center gap-2">
              <Button size="sm" onClick={() => navigate("/wizard")} className="text-xs gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Launch AI Generator
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => {
              const actCount = project.activities_count || project.activities?.length || 0;
              const durDays = project.duration_working_days || project.schedule?.duration_working_days || "-";
              const pStart = project.schedule?.project_start || project.inputs?.start_date || "-";
              const pFinish = project.schedule?.project_finish || project.inputs?.target_completion || "-";

              return (
                <Card
                  key={project.id}
                  onClick={() => navigate(`/workspace/${project.id}`)}
                  className="cursor-pointer hover:border-primary/60 hover:shadow-md transition-all flex flex-col justify-between group bg-card border-border shadow-xs"
                >
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                        {project.sector || project.inputs?.sector || "Construction"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-60 group-hover:opacity-100">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/workspace/${project.id}`);
                          }}>
                            <Activity className="h-4 w-4 mr-2 text-blue-500" /> Open Studio
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/health/${project.id}`);
                          }}>
                            <ShieldCheck className="h-4 w-4 mr-2 text-emerald-500" /> Health Audit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/export/${project.id}`);
                          }}>
                            <Download className="h-4 w-4 mr-2 text-amber-500" /> Export Asta/P6
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={(e) => handleDuplicateProject(project.id, e)}>
                            <Copy className="h-4 w-4 mr-2" /> Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => handleDeleteProject(project.id, e)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <CardTitle className="text-sm font-bold group-hover:text-primary transition-colors line-clamp-2 mt-1.5 text-foreground">
                      {project.name || project.title || "Untitled Programme"}
                    </CardTitle>
                    <CardDescription className="text-[11px] text-muted-foreground">
                      Created {formatDate(project.created_at)}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="p-4 pt-2 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs bg-muted/30 p-2.5 rounded-lg border border-border/60">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Activities</span>
                        <span className="font-semibold text-foreground font-mono">{actCount} Tasks</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Duration</span>
                        <span className="font-semibold text-foreground font-mono">{durDays} Working Days</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Start Date</span>
                        <span className="font-medium font-mono text-[11px] text-foreground">{formatDate(pStart)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Completion</span>
                        <span className="font-medium font-mono text-[11px] text-primary">{formatDate(pFinish)}</span>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="p-3.5 pt-0 flex justify-between items-center text-xs border-t border-border/40 mt-1 bg-muted/10">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/health/${project.id}`);
                        }}
                        className="h-6 px-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 gap-1 hover:bg-emerald-500/10"
                      >
                        <ShieldCheck className="w-3 h-3" /> Audit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/export/${project.id}`);
                        }}
                        className="h-6 px-1.5 text-[11px] text-amber-600 dark:text-amber-400 gap-1 hover:bg-amber-500/10"
                      >
                        <Download className="w-3 h-3" /> Export
                      </Button>
                    </div>

                    <span className="font-medium text-primary flex items-center gap-1 group-hover:translate-x-0.5 transition-transform text-xs">
                      Studio <ArrowRight className="h-3 w-3" />
                    </span>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
