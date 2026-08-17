import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useBilling } from "@/context/BillingContext";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30_000;

export function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [state, setState] = useState("polling"); // polling | paid | timeout | error
  const startedAt = useRef(Date.now());
  const { refresh } = useBilling();

  useEffect(() => {
    if (!sessionId) {
      setState("error");
      return;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        if (data.payment_status === "paid") {
          setState("paid");
          refresh();
          return;
        }
        if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
          setState("timeout");
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      } catch {
        if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
          setState("error");
          return;
        }
        setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [sessionId, refresh]);

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-8"
      data-testid="payment-success-page"
    >
      <div className="w-full max-w-md text-center">
        {state === "polling" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-[hsl(var(--bar))]" />
            <h1 className="mt-6 text-2xl font-semibold">Confirming payment…</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Please hang on while we verify with Stripe.
            </p>
          </>
        )}
        {state === "paid" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-[hsl(var(--bar))]" />
            <h1
              className="mt-6 text-2xl font-semibold"
              data-testid="payment-success-title"
            >
              You're on Pro
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              AI generation and every export format are unlocked.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/">
                <Button size="sm" className="rounded-sm">
                  Go to dashboard
                </Button>
              </Link>
              <Link to="/billing">
                <Button variant="outline" size="sm" className="rounded-sm">
                  Manage subscription
                </Button>
              </Link>
            </div>
          </>
        )}
        {(state === "timeout" || state === "error") && (
          <>
            <XCircle className="mx-auto h-10 w-10 text-[hsl(var(--bar-critical))]" />
            <h1 className="mt-6 text-2xl font-semibold">
              Still confirming payment
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We couldn't confirm the payment in time. If your card was charged
              it will unlock shortly — head to Billing to double-check.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/billing">
                <Button size="sm" className="rounded-sm">
                  Open billing
                </Button>
              </Link>
              <Link to="/">
                <Button variant="outline" size="sm" className="rounded-sm">
                  Back to dashboard
                </Button>
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function PaymentCancel() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background px-8"
      data-testid="payment-cancel-page"
    >
      <div className="w-full max-w-md text-center">
        <XCircle className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-6 text-2xl font-semibold">Payment cancelled</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No worries — you weren't charged. You can upgrade any time from the
          Billing area.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/">
            <Button size="sm" className="rounded-sm">
              Back to dashboard
            </Button>
          </Link>
          <Link to="/billing">
            <Button variant="outline" size="sm" className="rounded-sm">
              Try again
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
