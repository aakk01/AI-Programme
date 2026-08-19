import { CreditCard, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBilling } from "@/context/BillingContext";

const FEATURE_COPY = {
  ai_generation: {
    title: "Unlock AI programme generation",
    body: "Pro turns your project inputs into a full CPM-driven programme in under a minute. Free accounts can build programmes by hand, but AI baseline generation is Pro-only.",
  },
  export: {
    title: "Unlock programme exports",
    body: "Pro lets you export to Primavera P6 XER, Asta Powerproject, MS Project XML, CSV and JSON — ready to hand to your planning team.",
  },
  default: {
    title: "Upgrade to Pro",
    body: "You're on the free plan. Pro unlocks AI programme generation and every export format.",
  },
};

export const PaywallDialog = () => {
  const { paywall, closePaywall, startCheckout } = useBilling();
  const copy = FEATURE_COPY[paywall.feature] || FEATURE_COPY.default;

  return (
    <Dialog open={paywall.open} onOpenChange={(o) => (o ? null : closePaywall())}>
      <DialogContent
        data-testid="paywall-dialog"
        className="max-w-md rounded-sm bg-background"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[hsl(var(--bar))]" />
            {copy.title}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{copy.body}</p>

        <div className="rounded-sm border border-border bg-[hsl(var(--surface))] p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Pro plan
            </p>
            <p className="font-mono-data text-2xl font-semibold">
              £29
              <span className="ml-1 text-xs text-muted-foreground">/ month</span>
            </p>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs">
            <li className="flex items-center gap-2">
              <Zap className="h-3 w-3 text-[hsl(var(--bar))]" />
              Unlimited AI programme generation
            </li>
            <li className="flex items-center gap-2">
              <Zap className="h-3 w-3 text-[hsl(var(--bar))]" />
              Every export format (P6 XER, Asta, MSP, CSV, JSON)
            </li>
            <li className="flex items-center gap-2">
              <Zap className="h-3 w-3 text-[hsl(var(--bar))]" />
              Snapshots, baselines and slippage tracking
            </li>
            <li className="flex items-center gap-2">
              <Zap className="h-3 w-3 text-[hsl(var(--bar))]" />
              Cancel anytime from the Billing area
            </li>
          </ul>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            className="rounded-sm"
            onClick={closePaywall}
            data-testid="paywall-cancel"
          >
            Not now
          </Button>
          <Button
            data-testid="paywall-upgrade"
            size="sm"
            className="rounded-sm"
            onClick={startCheckout}
          >
            <CreditCard className="mr-1.5 h-3.5 w-3.5" />
            Upgrade — £29/mo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
