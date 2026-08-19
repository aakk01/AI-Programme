import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const BillingContext = createContext(null);

export function BillingProvider({ children }) {
  const { user } = useAuth();
  const [plan, setPlan] = useState("pro_monthly");
  const [active, setActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState("ai_generation");

  const refreshBilling = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/billing/plan");
      if (res.data) {
        setPlan(res.data.plan || "pro_monthly");
        setActive(res.data.active ?? true);
      }
    } catch {
      // Free or demo default
      setPlan("pro_monthly");
      setActive(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshBilling();
  }, [user, refreshBilling]);

  const openPaywall = (feature = "ai_generation") => {
    setPaywallFeature(feature);
    setPaywallOpen(true);
  };

  const closePaywall = () => {
    setPaywallOpen(false);
  };

  const createCheckout = async (planType = "pro_monthly") => {
    try {
      setLoading(true);
      const origin_url = window.location.origin;
      const res = await api.post("/payments/checkout", {
        plan: planType,
        return_url: `${origin_url}/payment/success`,
        origin_url,
      });

      if (res.data?.url || res.data?.checkout_url) {
        window.location.href = res.data.url || res.data.checkout_url;
      } else {
        toast.success("Pro Subscription Activated!");
        setPlan(planType);
        setActive(true);
        setPaywallOpen(false);
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const openCustomerPortal = async () => {
    try {
      setLoading(true);
      const res = await api.post("/billing/portal");
      if (res.data?.portal_url) {
        window.location.href = res.data.portal_url;
      } else {
        toast.info("Managing billing in settings");
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <BillingContext.Provider
      value={{
        plan,
        active,
        loading,
        paywallOpen,
        paywallFeature,
        openPaywall,
        closePaywall,
        refreshBilling,
        createCheckout,
        openCustomerPortal,
        isPro: active && plan !== "free",
      }}
    >
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling() {
  const ctx = useContext(BillingContext);
  if (!ctx) {
    throw new Error("useBilling must be used within a BillingProvider");
  }
  return ctx;
}
