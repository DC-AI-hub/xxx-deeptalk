export async function fetchJson<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include', // 关键：发送 cookie（dt_uid / dt_uid_sig）
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    // 尝试解析 JSON 错误体，否则回退到纯文本，避免 “Unexpected token ...”
    try {
      const body = await res.json();
      throw new Error(body?.error || `HTTP ${res.status}`);
    } catch {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
  }

  return res.json();
}
