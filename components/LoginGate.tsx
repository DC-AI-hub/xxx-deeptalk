"use client";

import React from "react";
import { useAuth } from "./AuthProvider";
import LoginModal from "./LoginModal";

export default function LoginGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // 初始化状态时可显示骨架屏
  if (loading) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        <div>初始化中...</div>
      </div>
    );
  }

  // 未登录 -> 弹出登录框并遮罩
  if (!user) {
    return (
      <>
        {children}
        <LoginModal />
      </>
    );
  }

  // 已登录 -> 直接显示主界面
  return <>{children}</>;
}
