import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { api, errMsg } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const BillingContext = createContext(null);

export const BillingProvider = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState({ open: false, feature: null });

  const refresh = useCallback(async () => {
    if (!localStorage.getItem("pow_token")) {
      setPlan({ active: false, plan: "guest" });
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get("/billing/plan");
      setPlan(data);
    } catch (e) {
      setPlan({ active: false, plan: "free" });
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch plan whenever the auth state changes (login / logout / signup).
  useEffect(() => {
    if (authLoading) return;
    refresh();
  }, [refresh, authLoading, user?.id, user?.email]);

  const startCheckout = useCallback(async () => {
    try {
      const { data } = await api.post("/payments/checkout", {
        lookup_key: "pow_pro_monthly",
        origin_url: window.location.origin,
      });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);

  const openPaywall = useCallback((feature = null) => {
    setPaywall({ open: true, feature });
  }, []);

  const closePaywall = useCallback(() => {
    setPaywall({ open: false, feature: null });
  }, []);

  const value = useMemo(
    () => ({
      plan,
      loading,
      isPro: !!plan?.active,
      refresh,
      startCheckout,
      paywall,
      openPaywall,
      closePaywall,
    }),
    [plan, loading, refresh, startCheckout, paywall, openPaywall, closePaywall],
  );

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
};

export const useBilling = () => {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error("useBilling must be used inside <BillingProvider>");
  return ctx;
};
