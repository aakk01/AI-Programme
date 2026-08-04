import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import Wizard from "@/pages/Wizard";
import Workspace from "@/pages/Workspace";

const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="flex h-screen items-center justify-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Loading
      </div>
    );
  return user ? children : <Navigate to="/login" replace />;
};

function App() {
  useEffect(() => {
    if (localStorage.getItem("pow_theme") === "dark")
      document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthPage />} />
            <Route
              path="/"
              element={
                <Protected>
                  <Dashboard />
                </Protected>
              }
            />
            <Route
              path="/new"
              element={
                <Protected>
                  <Wizard />
                </Protected>
              }
            />
            <Route
              path="/project/:id"
              element={
                <Protected>
                  <Workspace />
                </Protected>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="bottom-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
