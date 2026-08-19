import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { BillingProvider } from "@/context/BillingContext";
import { PaywallDialog } from "@/components/PaywallDialog";
import { Dashboard } from "@/pages/Dashboard";
import { Workspace } from "@/pages/Workspace";
import { Wizard } from "@/pages/Wizard";
import { HealthPage } from "@/pages/HealthPage";
import { ExportPage } from "@/pages/ExportPage";
import { AuthPage } from "@/pages/AuthPage";
import { BillingPage } from "@/pages/BillingPage";
import { PaymentReturn } from "@/pages/PaymentReturn";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BillingProvider>
          <div className="min-h-screen bg-background text-foreground flex flex-col font-sans selection:bg-primary/20">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/workspace/:id" element={<Workspace />} />
              <Route path="/project/:id" element={<Workspace />} />
              <Route path="/wizard" element={<Wizard />} />
              <Route path="/health" element={<HealthPage />} />
              <Route path="/health/:id" element={<HealthPage />} />
              <Route path="/export" element={<ExportPage />} />
              <Route path="/export/:id" element={<ExportPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/payment/success" element={<PaymentReturn />} />
              <Route path="/payment/cancel" element={<PaymentReturn />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <PaywallDialog />
            <Toaster position="top-right" richColors closeButton />
          </div>
        </BillingProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
