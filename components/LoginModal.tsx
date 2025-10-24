"use client";

import React, { useState } from "react";
import { useAuth } from "./AuthProvider";

export default function LoginModal() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    try {
      await login(username, password);
      setMsg(null);
    } catch (err: any) {
      setMsg(err?.message || "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: 360,
          background: "#fff",
          borderRadius: 8,
          padding: 24,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
        }}
      >
        <h3 style={{ margin: "0 0 16px" }}>用户登录</h3>
        <label style={{ display: "block", marginBottom: 8 }}>
          用户名（邮箱或手机）
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入邮箱或手机"
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>
        {msg && <div style={{ color: "#c00", marginBottom: 8 }}>{msg}</div>}
        <button type="submit" disabled={submitting} style={{ width: "100%", padding: "8px 12px" }}>
          {submitting ? "登录中..." : "登录"}
        </button>
      </form>
    </div>
  );
}
