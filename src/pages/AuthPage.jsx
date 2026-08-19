import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HardHat, Sparkles, ArrowRight, Shield, Zap, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AuthPage() {
  const navigate = useNavigate();
  const { login, signup } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("planner@programme-of-works.ai");
  const [password, setPassword] = useState("planner123");
  const [fullName, setFullName] = useState("Senior Project Planner");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Please enter email and password");
      return;
    }

    try {
      setLoading(true);
      if (isLogin) {
        await login(email, password);
        toast.success("Welcome back to Programme of Works");
      } else {
        await signup(email, password, fullName);
        toast.success("Account created successfully");
      }
      navigate("/");
    } catch (err) {
      toast.error("Authentication error. Entering demo mode.");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleOneClickDemo = async () => {
    try {
      setLoading(true);
      await login("demo.planner@programme-of-works.ai", "demo12345");
      toast.success("Entering Planner Workspace Demo");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between bg-background text-foreground">
      <header className="p-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-2 font-bold text-lg">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
            <HardHat className="h-5 w-5" />
          </div>
          <span>Programme of Works</span>
        </div>
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-border/80">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-2">
              <HardHat className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl font-bold">
              {isLogin ? "Sign in to your Workspace" : "Create your Planner Account"}
            </CardTitle>
            <CardDescription>
              AI-driven Critical Path Method (CPM) and WBS schedule generation.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              {!isLogin && (
                <div className="space-y-1.5">
                  <Label>Full Name</Label>
                  <Input
                    placeholder="e.g. Sarah Jenkins"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Email Address</Label>
                <Input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? "Processing..." : isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full border-primary/40 hover:bg-primary/5 text-primary gap-2"
              onClick={handleOneClickDemo}
              disabled={loading}
            >
              <Zap className="h-4 w-4" /> One-Click Demo Access
            </Button>
          </CardContent>

          <CardFooter className="flex justify-center border-t py-4 text-xs text-muted-foreground">
            {isLogin ? (
              <span>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className="text-primary font-semibold hover:underline"
                >
                  Sign up
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setIsLogin(true)}
                  className="text-primary font-semibold hover:underline"
                >
                  Sign in
                </button>
              </span>
            )}
          </CardFooter>
        </Card>
      </div>

      <footer className="p-4 border-t text-center text-xs text-muted-foreground">
        AI Programme of Works Generator • CPM Engine with Primavera P6, Asta & MS Project Interoperability
      </footer>
    </div>
  );
}
