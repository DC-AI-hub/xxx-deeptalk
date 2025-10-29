import { useCallback, useRef, useState } from 'react';
import { decodeJwt } from 'jose';
import { ConnectionDetails } from '@/app/api/connection-details/route';
import { AppConfig } from '@/lib/types';

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

// 动态参数：全部可选，按需覆盖
export type FetchConnOpts = {
  participantName?: string;
  language?: string;
  // 后端使用字段 voice 表示角色/音色
  voice?: string;
  room?: string;
  agentName?: string;
};

export default function useConnectionDetails(appConfig: AppConfig) {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);
  // 记住最近一次调用使用的参数，供 refresh 使用
  const lastOptsRef = useRef<FetchConnOpts | undefined>(undefined);

  const fetchConnectionDetails = useCallback(
    async (opts?: FetchConnOpts) => {
      setConnectionDetails(null);
      lastOptsRef.current = opts;

      const endpoint =
        process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';
      const url = new URL(endpoint, window.location.origin);

      const payload = {
        participantName: opts?.participantName ?? appConfig.startButtonText ?? 'user',
        agentName: opts?.agentName ?? appConfig.agentName,
        room: opts?.room ?? '123',
        language: opts?.language ?? '普通话',
        // 传 voice 字段（后端识别角色/音色）
        voice: opts?.voice ?? opts?.participantName ?? appConfig.startButtonText ?? 'user',
      };

      let data: ConnectionDetails;
      const res = await fetch(url.toString(), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Sandbox-Id': appConfig.sandboxId ?? '',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let errBody: any = {};
        try {
          errBody = await res.json();
        } catch {
          const txt = await res.text();
          errBody = { error: txt || `HTTP ${res.status}` };
        }
        throw new Error(errBody?.error ?? `HTTP ${res.status}`);
      }

      data = await res.json();
      setConnectionDetails(data);
      return data;
    },
    [appConfig]
  );

  const isConnectionDetailsExpired = useCallback(() => {
    const token = connectionDetails?.participantToken;
    if (!token) return true;

    const jwtPayload = decodeJwt(token);
    if (!jwtPayload.exp) return true;

    const expiresAt = new Date(jwtPayload.exp * 1000 - ONE_MINUTE_IN_MILLISECONDS);
    return expiresAt <= new Date();
  }, [connectionDetails?.participantToken]);

  // 支持带参“取已有或刷新”
  const existingOrRefreshConnectionDetails = useCallback(
    async (opts?: FetchConnOpts) => {
      if (isConnectionDetailsExpired() || !connectionDetails) {
        return fetchConnectionDetails(opts ?? lastOptsRef.current);
      } else {
        return connectionDetails;
      }
    },
    [connectionDetails, fetchConnectionDetails, isConnectionDetailsExpired]
  );

  // 供外部在断线后触发，无参时复用上次的参数
  const refreshConnectionDetails = useCallback(async () => {
    return fetchConnectionDetails(lastOptsRef.current);
  }, [fetchConnectionDetails]);

  return {
    connectionDetails,
    fetchConnectionDetails,
    existingOrRefreshConnectionDetails,
    refreshConnectionDetails,
    isConnectionDetailsExpired,
  };
}
