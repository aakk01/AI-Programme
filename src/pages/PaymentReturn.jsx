import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { useBilling } from "@/context/BillingContext";

export function PaymentReturn() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refreshBilling } = useBilling();
  const [status, setStatus] = useState("verifying"); // 'verifying' | 'success' | 'cancelled'

  useEffect(() => {
    const isSuccess = !window.location.pathname.includes("cancel");
    if (isSuccess) {
      refreshBilling().then(() => {
        setStatus("success");
      });
    } else {
      setStatus("cancelled");
    }
  }, [refreshBilling]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
      <Card className="w-full max-w-md shadow-xl text-center">
        <CardHeader>
          <div className="mx-auto mb-2">
            {status === "verifying" && <Loader2 className="h-12 w-12 text-primary animate-spin" />}
            {status === "success" && <CheckCircle2 className="h-12 w-12 text-emerald-500" />}
            {status === "cancelled" && <XCircle className="h-12 w-12 text-amber-500" />}
          </div>
          <CardTitle className="text-xl font-bold">
            {status === "verifying" && "Confirming Subscription..."}
            {status === "success" && "Subscription Activated!"}
            {status === "cancelled" && "Payment Cancelled"}
          </CardTitle>
          <CardDescription>
            {status === "verifying" && "Verifying your transaction with Stripe..."}
            {status === "success" && "Welcome to Programme of Works Pro. All features and exports are now unlocked."}
            {status === "cancelled" && "You have not been charged. You can upgrade anytime from your dashboard."}
          </CardDescription>
        </CardHeader>

        <CardFooter className="flex justify-center border-t pt-4">
          <Button onClick={() => navigate("/")} className="gap-2">
            Go to Dashboard <ArrowRight className="h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
