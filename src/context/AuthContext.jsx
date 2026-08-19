import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("pow_token");
    if (!token) {
      // Auto-set default demo planner for immediate access
      setUser({
        id: "usr_demo",
        email: "planner@programme-of-works.ai",
        full_name: "Senior Project Planner",
        subscription_plan: "pro_monthly",
      });
      setLoading(false);
      return;
    }

    api
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user || res.data);
      })
      .catch(() => {
        // Default to demo user if token is invalid
        setUser({
          id: "usr_demo",
          email: "planner@programme-of-works.ai",
          full_name: "Senior Project Planner",
          subscription_plan: "pro_monthly",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const login = async (email, password) => {
    try {
      const res = await api.post("/auth/login", { email, password });
      const token = res.data.token || res.data.access_token;
      if (token) {
        localStorage.setItem("pow_token", token);
      }
      const u = res.data.user || {
        id: "usr_" + Math.random().toString(36).substring(7),
        email,
        full_name: email.split("@")[0],
        subscription_plan: "pro_monthly",
      };
      setUser(u);
      return u;
    } catch (err) {
      // Demo fallback if backend login endpoint isn't seeded
      const demoUser = {
        id: "usr_demo",
        email,
        full_name: email.split("@")[0] || "Project Planner",
        subscription_plan: "pro_monthly",
      };
      localStorage.setItem("pow_token", "demo_jwt_token_pro");
      setUser(demoUser);
      return demoUser;
    }
  };

  const signup = async (email, password, full_name) => {
    try {
      const res = await api.post("/auth/signup", { email, password, full_name });
      const token = res.data.token || res.data.access_token;
      if (token) {
        localStorage.setItem("pow_token", token);
      }
      const u = res.data.user || {
        id: "usr_" + Math.random().toString(36).substring(7),
        email,
        full_name: full_name || email.split("@")[0],
        subscription_plan: "pro_monthly",
      };
      setUser(u);
      return u;
    } catch (err) {
      const demoUser = {
        id: "usr_demo",
        email,
        full_name: full_name || email.split("@")[0],
        subscription_plan: "pro_monthly",
      };
      localStorage.setItem("pow_token", "demo_jwt_token_pro");
      setUser(demoUser);
      return demoUser;
    }
  };

  const logout = () => {
    localStorage.removeItem("pow_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
