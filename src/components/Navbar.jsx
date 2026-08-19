import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Activity,
  Sparkles,
  ShieldCheck,
  Download,
  FolderKanban,
  Layers,
  ChevronDown,
  Plus,
  Crown,
  FileCheck2,
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
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/context/AuthContext";
import { useBilling } from "@/context/BillingContext";

export function Navbar({ activeProjectId = null, projectName = null, healthScore = null, healthRating = null }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isPro, openPaywall } = useBilling();

  const currentPath = location.pathname;

  const getScoreBadgeColor = (score) => {
    if (score === null || score === undefined) return "bg-muted text-muted-foreground";
    if (score >= 90) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    if (score >= 75) return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
    if (score >= 50) return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    return "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30";
  };

  return (
    <header className="h-14 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 px-4 flex items-center justify-between transition-colors">
      {/* Left: Brand & Project Context */}
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors shadow-xs">
            <Activity className="w-4 h-4 stroke-[2.2]" />
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-sm tracking-tight leading-none text-foreground flex items-center gap-1.5">
              Programme Intelligence Suite
              <span className="text-[10px] uppercase font-mono px-1 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                PRO
              </span>
            </span>
            <span className="text-[11px] text-muted-foreground leading-tight hidden sm:inline">
              Construction & Engineering Planning
            </span>
          </div>
        </Link>

        {activeProjectId && (
          <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium max-w-[200px] truncate">
              <Layers className="w-3.5 h-3.5 text-primary/70 shrink-0" />
              <span className="text-foreground truncate">{projectName || "Active Programme"}</span>
            </div>
            {healthScore !== null && (
              <Badge variant="outline" className={`text-[10px] h-5 px-1.5 font-mono font-medium ${getScoreBadgeColor(healthScore)}`}>
                <ShieldCheck className="w-3 h-3 mr-1 inline" />
                {healthScore}/100 {healthRating || ""}
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Center: Primary Navigation Tabs */}
      <nav className="hidden md:flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/60">
        <Button
          variant={currentPath === "/" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => navigate("/")}
          className="h-8 text-xs font-medium px-3 gap-1.5"
        >
          <FolderKanban className="w-3.5 h-3.5" />
          Projects
        </Button>

        <Button
          variant={currentPath.includes("/wizard") || currentPath.includes("/generator") ? "secondary" : "ghost"}
          size="sm"
          onClick={() => navigate(activeProjectId ? `/workspace/${activeProjectId}?tab=generator` : "/wizard")}
          className="h-8 text-xs font-medium px-3 gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          AI Generator
        </Button>

        <Button
          variant={currentPath.includes("/health") ? "secondary" : "ghost"}
          size="sm"
          onClick={() => navigate(activeProjectId ? `/health/${activeProjectId}` : "/health")}
          className="h-8 text-xs font-medium px-3 gap-1.5"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          Health & DCMA-14
        </Button>

        {activeProjectId && (
          <Button
            variant={currentPath.includes("/workspace") ? "secondary" : "ghost"}
            size="sm"
            onClick={() => navigate(`/workspace/${activeProjectId}`)}
            className="h-8 text-xs font-medium px-3 gap-1.5"
          >
            <Activity className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            Schedule Studio
          </Button>
        )}

        <Button
          variant={currentPath.includes("/export") ? "secondary" : "ghost"}
          size="sm"
          onClick={() => navigate(activeProjectId ? `/export/${activeProjectId}` : "/export")}
          className="h-8 text-xs font-medium px-3 gap-1.5"
        >
          <Download className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          Export (Asta/P6)
        </Button>
      </nav>

      {/* Right: Quick Actions & Profile */}
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={() => navigate("/wizard")}
          className="h-8 text-xs font-medium gap-1.5 shadow-xs"
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New Programme</span>
        </Button>

        {!isPro && (
          <Button
            variant="outline"
            size="sm"
            onClick={openPaywall}
            className="h-8 text-xs font-medium gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
          >
            <Crown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Upgrade</span>
          </Button>
        )}

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full border border-border">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                {user?.email?.slice(0, 2).toUpperCase() || "PI"}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-xs font-medium leading-none">{user?.email || "Planner Account"}</p>
                <p className="text-[11px] leading-none text-muted-foreground">
                  {isPro ? "Enterprise Pro License" : "Free Planner Edition"}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/wizard")}>
              <Sparkles className="w-3.5 h-3.5 mr-2 text-primary" />
              AI Schedule Generator
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(activeProjectId ? `/health/${activeProjectId}` : "/health")}>
              <ShieldCheck className="w-3.5 h-3.5 mr-2 text-emerald-600" />
              Programme Health Audit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(activeProjectId ? `/export/${activeProjectId}` : "/export")}>
              <Download className="w-3.5 h-3.5 mr-2 text-amber-600" />
              Asta / P6 Exporter
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/billing")}>
              <Crown className="w-3.5 h-3.5 mr-2 text-primary" />
              Subscription & Billing
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-rose-600 dark:text-rose-400">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
