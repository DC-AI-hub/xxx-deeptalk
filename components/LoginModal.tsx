'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthProvider';

export default function LoginModal() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      setMsg(err?.message || '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-gray-200/20 bg-white/60 p-6 shadow-2xl backdrop-blur-xl dark:border-zinc-700/30 dark:bg-zinc-900/40"
      >
        <h3 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">用户登录</h3>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            用户名（邮箱或手机）
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="请输入邮箱或手机"
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-blue-400"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            密码
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder-gray-500 dark:focus:border-blue-400"
          />
        </label>

        {msg && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {msg}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {submitting ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  );
}
