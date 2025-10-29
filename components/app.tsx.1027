'use client';

import LoginGate from '@/components/LoginGate';
import { useEffect, useMemo, useState } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { motion } from 'motion/react';
import { RoomAudioRenderer, RoomContext, StartAudio } from '@livekit/components-react';
import { toastAlert } from '@/components/alert-toast';
import { SessionView } from '@/components/session-view';
import { Toaster } from '@/components/ui/sonner';
import { Welcome } from '@/components/welcome';
import useConnectionDetails from '@/hooks/useConnectionDetails';
import type { AppConfig } from '@/lib/types';

const MotionWelcome = motion.create(Welcome);
const MotionSessionView = motion.create(SessionView);

interface AppProps {
  appConfig: AppConfig;
}

export function App({ appConfig }: AppProps) {
  const room = useMemo(() => new Room(), []);
  const [sessionStarted, setSessionStarted] = useState(false);

  // participantDisplay: 用于 UI（中文）
  const [participantDisplay, setParticipantDisplay] = useState<string>('user');
  // participantCode: 发送给后端的英文 code（voice）
  const [participantCode, setParticipantCode] = useState<string>('user');

  // languageDisplay: UI 显示（中文）
  const [languageDisplay, setLanguageDisplay] = useState<string>('普通话');
  // languageCode: 发送给后端的英文 code
  const [languageCode, setLanguageCode] = useState<string>('mandarin');

  const { refreshConnectionDetails, existingOrRefreshConnectionDetails } = useConnectionDetails(appConfig);

  useEffect(() => {
    const onDisconnected = () => {
      setSessionStarted(false);
      // refresh token using last params saved in hook (no-op if none)
      refreshConnectionDetails().catch(() => {});
    };
    const onMediaDevicesError = (error: Error) => {
      toastAlert({
        title: 'Encountered an error with your media devices',
        description: `${error.name}: ${error.message}`,
      });
    };
    room.on(RoomEvent.MediaDevicesError, onMediaDevicesError);
    room.on(RoomEvent.Disconnected, onDisconnected);
    return () => {
      room.off(RoomEvent.Disconnected, onDisconnected);
      room.off(RoomEvent.MediaDevicesError, onMediaDevicesError);
    };
  }, [room, refreshConnectionDetails]);

  // Welcome 回调签名：displayName, displayLanguage, nameCode, languageCode
  const handleStartCall = (
    displayName: string,
    displayLanguage: string,
    nameCode: string,
    langCode: string
  ) => {
    // 更新 UI 显示与后端发送用的 code
    setParticipantDisplay(displayName || 'user');
    setParticipantCode(nameCode || 'user');
    setLanguageDisplay(displayLanguage || '普通话');
    setLanguageCode(langCode || 'mandarin');

    // 兼容旧字段（可视需要保留）
    try {
      (appConfig as any).startButtonText = displayName ?? (appConfig as any).startButtonText;
    } catch {}

    setSessionStarted(true);
  };

  useEffect(() => {
    let aborted = false;
    if (sessionStarted && room.state === 'disconnected') {
      Promise.all([
        room.localParticipant.setMicrophoneEnabled(true, undefined, {
          preConnectBuffer: appConfig.isPreConnectBufferEnabled,
        }),
        // 把 displayName（中文）作为 participantName（前端可见），
        // 把 participantCode 与 languageCode 发送给后端作为 voice / language
        existingOrRefreshConnectionDetails({
          participantName: participantDisplay,
          language: languageCode,
          voice: participantCode,
          room: '123',
          agentName: appConfig.agentName,
        }).then((connectionDetails) =>
          room.connect(connectionDetails.serverUrl, connectionDetails.participantToken)
        ),
      ]).catch((error) => {
        if (aborted) return;
        toastAlert({
          title: 'There was an error connecting to the agent',
          description: `${error.name}: ${error.message}`,
        });
      });
    }
    return () => {
      aborted = true;
      room.disconnect();
    };
  }, [
    room,
    sessionStarted,
    appConfig.isPreConnectBufferEnabled,
    appConfig.agentName,
    existingOrRefreshConnectionDetails,
    participantDisplay,
    participantCode,
    languageCode,
  ]);

  const startLeft = (appConfig as any).startButtonTextLeft ?? '禹亭';
  const startRight = (appConfig as any).startButtonTextRight ?? '小白';

  return (
    <LoginGate>
      <main>
        <MotionWelcome
          key="welcome"
          startButtonTextLeft={startLeft}
          startButtonTextRight={startRight}
          onStartCall={handleStartCall}
          disabled={sessionStarted}
          initial={{ opacity: 1 }}
          animate={{ opacity: sessionStarted ? 0 : 1 }}
          transition={{ duration: 0.5, ease: 'linear', delay: sessionStarted ? 0 : 0.5 }}
        />

        <RoomContext.Provider value={room}>
          <RoomAudioRenderer />
          <StartAudio label="Start Audio" />
          {/* --- */}
          <MotionSessionView
            key="session-view"
            appConfig={appConfig}
            disabled={!sessionStarted}
            sessionStarted={sessionStarted}
            initial={{ opacity: 0 }}
            animate={{ opacity: sessionStarted ? 1 : 0 }}
            transition={{
              duration: 0.5,
              ease: 'linear',
              delay: sessionStarted ? 0.5 : 0,
            }}
          />
        </RoomContext.Provider>

        <Toaster />
      </main>
    </LoginGate>
  );
}
