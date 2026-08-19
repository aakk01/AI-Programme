import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function AuthPage() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") await login(form.email, form.password);
      else await signup(form.email, form.password, form.name);
      navigate("/", { replace: true });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div
        className="relative hidden w-[46%] shrink-0 flex-col justify-end border-r border-border bg-black bg-cover bg-center p-12 lg:flex"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(0,0,0,0.88), rgba(0,0,0,0.25), rgba(0,0,0,0.1)), url('https://images.pexels.com/photos/9741345/pexels-photo-9741345.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940')",
        }}
      >
        <div className="text-white">
          <p className="font-mono-data text-[10px] uppercase tracking-[0.35em] text-white/60">
            CPM · WBS · P6 · Asta · MSP
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-[1.05] lg:text-5xl">
            Baseline programmes
            <br />
            in minutes, not weeks.
          </h1>
          <p className="mt-5 max-w-md text-sm text-white/70">
            AI-drafted WBS, logic-linked networks, forward and backward pass,
            critical path — exportable to your planning tool of choice.
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-border px-6 py-3">
          <span className="font-mono-data text-[11px] uppercase tracking-[0.3em]">
            Programme<span className="text-[hsl(var(--bar))]">/</span>Works
          </span>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center px-6 sm:px-16">
          <form onSubmit={submit} className="w-full max-w-sm" data-testid="auth-form">
            <h2 className="text-lg font-bold md:text-lg">
              {mode === "login" ? "Sign in" : "Create your account"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Access your saved programmes."
                : "Start generating CPM programmes today."}
            </p>

            <div className="mt-8 space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider">Name</Label>
                  <Input
                    data-testid="name-input"
                    className="rounded-sm"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Alex Planner"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider">Email</Label>
                <Input
                  data-testid="email-input"
                  type="email"
                  required
                  className="rounded-sm"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@practice.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider">Password</Label>
                <Input
                  data-testid="password-input"
                  type="password"
                  required
                  minLength={6}
                  className="rounded-sm"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <Button
              data-testid="auth-submit"
              type="submit"
              disabled={busy}
              className="mt-7 w-full rounded-sm"
            >
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <button
              type="button"
              data-testid="auth-mode-toggle"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
              className="mt-5 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              {mode === "login"
                ? "No account? Create one"
                : "Already registered? Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
