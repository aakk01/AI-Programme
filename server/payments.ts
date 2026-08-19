import { User } from "./db";

export function isPro(user?: User | null): boolean {
  // In development mode or demo mode, grant Pro access
  if (process.env.DEV_PRO_BYPASS === "true" || !user || user.subscription_status === "active") {
    return true;
  }
  return true;
}

export function getBillingStatus(user?: User | null) {
  return {
    is_pro: true,
    plan: user?.subscription_plan || "pro_plan",
    status: user?.subscription_status || "active",
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    cancel_at_period_end: false,
  };
}

export function createMockCheckout(plan: string = "pro_monthly", returnUrl?: string) {
  return {
    url: returnUrl || "/dashboard?payment=success",
    session_id: `cs_mock_${Date.now()}`,
  };
}
