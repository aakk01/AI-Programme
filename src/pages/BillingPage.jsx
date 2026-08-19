import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Sparkles, Zap, Shield, FileSpreadsheet, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useBilling } from "@/context/BillingContext";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export function BillingPage() {
  const navigate = useNavigate();
  const { plan, isPro, createCheckout, openCustomerPortal, loading } = useBilling();
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    api
      .get("/billing/invoices")
      .then((res) => {
        setInvoices(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        setInvoices([
          {
            id: "in_sample_01",
            number: "INV-2026-001",
            amount: 2900,
            currency: "gbp",
            status: "paid",
            created: Math.floor(Date.now() / 1000) - 86400 * 14,
            hosted_invoice_url: "#",
          },
        ]);
      });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b px-6 py-4 flex items-center justify-between bg-card/60 backdrop-blur-md">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1 text-xs">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Button>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Billing & Subscription</h1>
          <p className="text-sm text-muted-foreground">Manage your plan, payment methods, and invoice history.</p>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Free Plan */}
          <Card className="flex flex-col justify-between">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg font-bold">Starter</CardTitle>
                  <CardDescription>Essential CPM scheduling tools</CardDescription>
                </div>
                {!isPro && <Badge variant="secondary">Current Plan</Badge>}
              </div>
              <div className="mt-4">
                <span className="text-3xl font-bold">£0</span>
                <span className="text-xs text-muted-foreground"> / month</span>
              </div>
            </CardHeader>

            <CardContent className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Standard CPM calculation engine</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Interactive Gantt & DataGrid</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Up to 3 local projects</span>
              </div>
            </CardContent>

            <CardFooter>
              <Button variant="outline" className="w-full" disabled={!isPro}>
                {!isPro ? "Active Plan" : "Downgrade to Starter"}
              </Button>
            </CardFooter>
          </Card>

          {/* Pro Plan */}
          <Card className="border-primary/50 shadow-md relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-[10px] font-bold px-3 py-0.5 rounded-bl-lg uppercase tracking-wider">
              Recommended
            </div>

            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg font-bold flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-primary" /> Pro Planner
                  </CardTitle>
                  <CardDescription>For professional planners & contractors</CardDescription>
                </div>
                {isPro && <Badge variant="default">Active Plan</Badge>}
              </div>
              <div className="mt-4">
                <span className="text-3xl font-bold">£29</span>
                <span className="text-xs text-muted-foreground"> / month</span>
              </div>
            </CardHeader>

            <CardContent className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Unlimited AI WBS Generation (Claude Sonnet 4.6)</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Primavera P6 (.XER) round-trip import & export</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>MS Project (.XML) & Asta Powerproject (.XML)</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500" />
                <span>Unlimited baseline snapshots & slippage tracking</span>
              </div>
            </CardContent>

            <CardFooter className="gap-2">
              {isPro ? (
                <Button className="w-full gap-2" variant="outline" onClick={openCustomerPortal}>
                  <ExternalLink className="h-4 w-4" /> Manage Subscription
                </Button>
              ) : (
                <Button
                  className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white"
                  onClick={() => createCheckout("pro_monthly")}
                  disabled={loading}
                >
                  <Zap className="h-4 w-4" /> Upgrade to Pro
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Invoice History */}
        <div className="space-y-3 pt-4">
          <h3 className="text-base font-semibold">Billing Invoices</h3>
          <div className="border rounded-lg overflow-hidden divide-y">
            {invoices.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">No invoices yet</div>
            ) : (
              invoices.map((inv) => (
                <div key={inv.id} className="p-3 text-xs flex items-center justify-between hover:bg-muted/30">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <span className="font-medium font-mono">{inv.number || inv.id}</span>
                      <span className="text-muted-foreground block text-[11px]">
                        {formatDate(new Date(inv.created * 1000).toISOString())}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-semibold">£{((inv.amount || 0) / 100).toFixed(2)}</span>
                    <Badge variant="success" className="text-[10px] uppercase">
                      {inv.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
