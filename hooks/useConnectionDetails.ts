import { useCallback, useState } from 'react';
import { decodeJwt } from 'jose';
import { ConnectionDetails } from '@/app/api/connection-details/route';
import { AppConfig } from '@/lib/types';

const ONE_MINUTE_IN_MILLISECONDS = 60 * 1000;

export default function useConnectionDetails(appConfig: AppConfig) {
  const [connectionDetails, setConnectionDetails] = useState<ConnectionDetails | null>(null);

  const fetchConnectionDetails = useCallback(async () => {
    setConnectionDetails(null);
    const endpoint = process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';
    const url = new URL(endpoint, window.location.origin);

    let data: ConnectionDetails;
    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        credentials: 'include', // ensure cookies (dt_uid/dt_uid_sig) are sent when present
        headers: {
          'Content-Type': 'application/json',
          'X-Sandbox-Id': appConfig.sandboxId ?? '',
        },
        body: JSON.stringify({
          participantName: appConfig.startButtonText ?? 'user',
          agentName: appConfig.agentName,
          room: '123',
          language: 'yue',
          vlice: '小白'
        }),
      });

      if (!res.ok) {
        // robust error parsing
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
    } catch (error) {
      console.error('Error fetching connection details:', error);
      throw error;
    }

    setConnectionDetails(data);
    return data;
  }, [appConfig]);

  // remove the automatic useEffect that fetched on mount;
  // caller (e.g. App) should call fetchConnectionDetails() when user clicks Start

  const isConnectionDetailsExpired = useCallback(() => {
    const token = connectionDetails?.participantToken;
    if (!token) {
      return true;
    }

    const jwtPayload = decodeJwt(token);
    if (!jwtPayload.exp) {
      return true;
    }
    const expiresAt = new Date(jwtPayload.exp * 1000 - ONE_MINUTE_IN_MILLISECONDS);

    const now = new Date();
    return expiresAt <= now;
  }, [connectionDetails?.participantToken]);

  const existingOrRefreshConnectionDetails = useCallback(async () => {
    if (isConnectionDetailsExpired() || !connectionDetails) {
      return fetchConnectionDetails();
    } else {
      return connectionDetails;
    }
  }, [connectionDetails, fetchConnectionDetails, isConnectionDetailsExpired]);

  return {
    connectionDetails,
    fetchConnectionDetails,
    existingOrRefreshConnectionDetails,
    isConnectionDetailsExpired,
  };
}
