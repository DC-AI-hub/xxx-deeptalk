"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { fetchJson } from "../lib/api";

type User = { uuid: string; name: string } | null;

type AuthContextValue = {
  user: User;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>; // 预留
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson<{ ok: boolean; uuid: string; name: string }>("/api/auth/me", {
        method: "GET",
      });
      if (data?.uuid) {
        setUser({ uuid: data.uuid, name: data.name });
      } else {
        setUser(null);
      }
    } catch (e: any) {
      setUser(null);
      // 401 未登录是正常情况，不弹错
      if (!(`${e?.message}`.includes("401") || `${e?.message}`.includes("Unauthorized"))) {
        setError(e?.message || "Failed to fetch auth state");
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    setError(null);
    await fetchJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    // 后端会通过 Set-Cookie 设置 dt_uid/dt_uid_sig，这里刷新用户信息
    await refresh();
  };

  const logout = async () => {
    // 预留：如果后端有 logout 路由，这里调用；目前前端可提示清 cookie 或让后端补充 /api/auth/logout
    setUser(null);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider />");
  return ctx;
}
