import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarClock,
  CreditCard,
  Copy,
  LayoutGrid,
  LogOut,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useBilling } from "@/context/BillingContext";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const { isPro } = useBilling();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);

  const importXer = async (file) => {
    if (!file) return;
    setImporting(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const { data } = await api.post("/projects/import/xer", body);
      toast.success(
        `Imported ${data.import_stats.activities} activities and ${data.import_stats.links} links`,
      );
      navigate(`/project/${data.id}`);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const load = () =>
    api
      .get("/projects")
      .then((r) => setProjects(r.data))
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const duplicate = async (id) => {
    try {
      await api.post(`/projects/${id}/duplicate`);
      toast.success("Programme duplicated");
      load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/projects/${id}`);
      setProjects((p) => p.filter((x) => x.id !== id));
      toast.success("Programme deleted");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background px-6 py-3">
        <span className="font-mono-data text-[11px] uppercase tracking-[0.3em]">
          Programme<span className="text-[hsl(var(--bar))]">/</span>Works
        </span>
        <div className="flex items-center gap-2">
          <span className="hidden font-mono-data text-[11px] text-muted-foreground sm:inline">
            {user?.email}
          </span>
          <ThemeToggle />
          <Button
            data-testid="billing-button"
            variant="outline"
            size="sm"
            className="h-8 rounded-sm text-[11px] uppercase tracking-[0.14em]"
            onClick={() => navigate("/billing")}
          >
            <CreditCard className="mr-1.5 h-3.5 w-3.5" />
            {isPro ? "Pro" : "Upgrade"}
          </Button>
          <Button
            data-testid="logout-button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-sm"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="px-6 py-10 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <p className="font-mono-data text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Workspace
            </p>
            <h1 className="mt-2 text-4xl font-bold sm:text-5xl">Programmes</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              data-testid="import-xer-button"
              variant="outline"
              className="rounded-sm"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
            >
              <Upload className="mr-2 h-4 w-4" />
              {importing ? "Importing…" : "Import P6 XER"}
            </Button>
            <input
              ref={fileRef}
              data-testid="xer-file-input"
              type="file"
              accept=".xer,text/plain"
              className="hidden"
              onChange={(e) => importXer(e.target.files?.[0])}
            />
            <Button
              data-testid="create-project-button"
              className="rounded-sm"
              onClick={() => navigate("/new")}
            >
              <Plus className="mr-2 h-4 w-4" />
              New programme
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="mt-10 font-mono-data text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Loading…
          </p>
        ) : projects.length === 0 ? (
          <div
            data-testid="empty-state"
            className="mt-10 grid-paper border border-border p-16 text-center"
          >
            <LayoutGrid className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-5 text-lg font-bold">No programmes yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Create your first project and let the planner draft a fully
              logic-linked baseline programme with a critical path.
            </p>
            <Button
              data-testid="empty-create-button"
              className="mt-6 rounded-sm"
              onClick={() => navigate("/new")}
            >
              <Plus className="mr-2 h-4 w-4" /> Create programme
            </Button>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => (
              <div
                key={p.id}
                data-testid={`project-card-${p.id}`}
                className="group flex cursor-pointer flex-col justify-between border border-border bg-background p-5 transition-colors hover:bg-[hsl(var(--surface))]"
                onClick={() => navigate(`/project/${p.id}`)}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-bold leading-snug">{p.name}</h3>
                    <span className="shrink-0 border border-border px-1.5 py-0.5 font-mono-data text-[10px] uppercase text-muted-foreground">
                      v{p.version}
                    </span>
                  </div>
                  <p className="mt-1 font-mono-data text-[11px] uppercase tracking-wider text-muted-foreground">
                    {p.inputs?.project_type || "Unclassified"}
                  </p>
                </div>
                <div className="mt-6 space-y-1.5 font-mono-data text-[11px]">
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <span className="text-muted-foreground">Activities</span>
                    <span>{p.activity_count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{p.duration_working_days || 0} wd</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Finish</span>
                    <span>{p.project_finish || "—"}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono-data text-[10px] text-muted-foreground">
                    <CalendarClock className="h-3 w-3" />
                    {String(p.updated_at || "").slice(0, 10)}
                  </span>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      data-testid={`duplicate-${p.id}`}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicate(p.id);
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      data-testid={`delete-${p.id}`}
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-sm text-[hsl(var(--bar-critical))]"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(p.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
