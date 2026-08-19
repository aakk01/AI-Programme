import React from "react";
import { Check, Sparkles, Zap, Shield, FileSpreadsheet, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBilling } from "@/context/BillingContext";

export function PaywallDialog() {
  const { paywallOpen, closePaywall, paywallFeature, createCheckout, loading } = useBilling();

  const featureInfo = {
    ai_generation: {
      title: "Unlock AI Baseline Programme Generation",
      description: "Generate deep multi-level WBS programmes with CPM logic and verified trade constraints in seconds.",
    },
    export: {
      title: "Unlock Professional Schedule Exports",
      description: "Export full-fidelity files to Primavera P6 (.XER), MS Project (.XML), Asta Powerproject, CSV and JSON.",
    },
    ai_refine: {
      title: "Unlock AI Programme Refinement",
      description: "Prompt Claude Sonnet to accelerate critical path activities, balance trades, or compress schedules.",
    },
  }[paywallFeature] || {
    title: "Upgrade to Programme of Works Pro",
    description: "Access unlimited AI generation, P6 & MSP exports, and full snapshot comparisons.",
  };

  return (
    <Dialog open={paywallOpen} onOpenChange={closePaywall}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="default" className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 gap-1">
              <Sparkles className="h-3 w-3" /> Pro Feature
            </Badge>
          </div>
          <DialogTitle className="text-xl font-bold">{featureInfo.title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground pt-1">
            {featureInfo.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <h4 className="font-semibold text-base">Pro Planner</h4>
                <p className="text-xs text-muted-foreground">For planning engineers & project managers</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold">£29</span>
                <span className="text-xs text-muted-foreground"> / month</span>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t text-sm">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Unlimited AI WBS & Critical Path Generation</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Primavera P6 (.XER) round-trip import & export</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>MS Project & Asta Powerproject XML outputs</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>Unlimited baseline snapshots & slippage tracking</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={closePaywall} disabled={loading}>
            Continue Free
          </Button>
          <Button
            className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
            onClick={() => createCheckout("pro_monthly")}
            disabled={loading}
          >
            <Zap className="h-4 w-4" />
            {loading ? "Preparing Checkout..." : "Upgrade Now (£29/mo)"}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
