import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/context/BillingContext";

const fmtMoney = (amount, currency) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: (currency || "gbp").toUpperCase(),
  }).format((amount || 0) / 100);

const fmtDate = (unixOrIso) => {
  if (!unixOrIso) return "—";
  const d = typeof unixOrIso === "number" ? new Date(unixOrIso * 1000) : new Date(unixOrIso);
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
};

export default function BillingPage() {
  const nav = useNavigate();
  const { plan, refresh, startCheckout } = useBilling();
  const [invoices, setInvoices] = useState([]);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    refresh();
    api
      .get("/billing/invoices")
      .then(({ data }) => setInvoices(data))
      .catch(() => setInvoices([]));
  }, [refresh]);

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const { data } = await api.post("/billing/portal", {
        origin_url: window.location.origin,
      });
      window.location.href = data.portal_url;
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setPortalLoading(false);
    }
  };

  const isPro = plan?.active;
  const sub = plan?.subscription;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-8 py-4">
        <button
          onClick={() => nav(-1)}
          className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
          data-testid="billing-back"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <p className="text-xs uppercase tracking-[0.28em]">Billing</p>
      </header>

      <main className="mx-auto max-w-3xl px-8 py-12">
        <h1 className="text-4xl font-semibold">Billing & subscription</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage your Programme of Works plan, invoices and payment method.
        </p>

        <section
          data-testid="billing-plan-card"
          className="mt-8 rounded-sm border border-border bg-[hsl(var(--surface))] p-6"
        >
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Current plan
              </p>
              <p
                className="mt-1 text-2xl font-semibold"
                data-testid="billing-plan-name"
              >
                {isPro ? "Pro" : "Free"}
              </p>
              {isPro ? (
                <p className="mt-1 font-mono-data text-xs text-muted-foreground">
                  £29 / month · {sub?.status || "active"}
                  {sub?.current_period_end
                    ? ` · renews ${fmtDate(sub.current_period_end)}`
                    : ""}
                  {sub?.cancel_at_period_end
                    ? " · cancels at period end"
                    : ""}
                </p>
              ) : (
                <p className="mt-1 font-mono-data text-xs text-muted-foreground">
                  AI generation and exports are locked. Upgrade to unlock.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {isPro ? (
                <Button
                  onClick={openPortal}
                  disabled={portalLoading}
                  size="sm"
                  className="rounded-sm"
                  data-testid="billing-portal-button"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Manage subscription
                </Button>
              ) : (
                <Button
                  onClick={startCheckout}
                  size="sm"
                  className="rounded-sm"
                  data-testid="billing-upgrade-button"
                >
                  <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                  Upgrade to Pro — £29/mo
                </Button>
              )}
              <Link
                to="/"
                className="text-center text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Invoices & receipts
          </h2>
          <div className="mt-3 divide-y divide-border rounded-sm border border-border">
            {invoices.length === 0 ? (
              <p
                className="p-6 text-sm text-muted-foreground"
                data-testid="billing-no-invoices"
              >
                No invoices yet. Once you subscribe, receipts will appear here.
              </p>
            ) : (
              invoices.map((inv) => (
                <div
                  key={inv.id}
                  data-testid={`invoice-${inv.id}`}
                  className="flex items-center justify-between p-4"
                >
                  <div>
                    <p className="font-mono-data text-xs">
                      {inv.number || inv.id}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDate(inv.created)} · {inv.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-mono-data text-sm">
                      {fmtMoney(inv.amount_paid, inv.currency)}
                    </p>
                    <a
                      href={inv.hosted_invoice_url || inv.invoice_pdf || "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
                    >
                      <FileText className="h-3 w-3" /> Receipt
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
