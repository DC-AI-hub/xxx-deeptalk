'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from './AuthProvider';

interface WelcomeProps {
  disabled: boolean;
  startButtonTextLeft?: string;
  startButtonTextRight?: string;
  // 回调签名改为：(
  //   displayName: string,      // 用于前端显示（中文）
  //   displayLanguage: string,  // 用于前端显示（中文）
  //   nameCode: string,         // 发送给后端的 name 代码（英文）
  //   languageCode: string      // 发送给后端的 language 代码（英文）
  // )
  onStartCall: (
    displayName: string,
    displayLanguage: string,
    nameCode: string,
    languageCode: string
  ) => void;
}

export const Welcome = ({
  disabled,
  startButtonTextLeft = '禹亭',
  startButtonTextRight = '小白',
  onStartCall,
  ref,
}: React.ComponentProps<'div'> & WelcomeProps) => {
  const { logout } = useAuth();
  // 前端显示用的中文选项（保持不变）
  const [languageDisplay, setLanguageDisplay] = useState<string>('普通话');

  // 映射表：中文显示 -> 后端英文代码
  const nameCodeMap: Record<string, string> = {
    禹亭: 'yuting',
    小白: 'xiaobai',
    // 若 appConfig 里是英文直接用它
    yuting: 'yuting',
    xiaobai: 'xiaobai',
  };

  const languageCodeMap: Record<string, string> = {
    普通话: 'mandarin',
    粤语: 'yue',
    English: 'english',
    english: 'english',
    mandarin: 'mandarin',
    yue: 'yue',
  };

  const handleStart = (displayName: string) => {
    const nameCode = nameCodeMap[displayName] ?? displayName;
    const languageCode = languageCodeMap[languageDisplay] ?? languageDisplay;
    // 传四个参数：中文显示 + 英文码
    onStartCall(displayName, languageDisplay, nameCode, languageCode);
  };

  return (
    <section
      ref={ref as any}
      inert={disabled}
      className={cn(
        'bg-background fixed inset-0 mx-auto flex min-h-screen flex-col items-center justify-center p-4 text-center',
        disabled ? 'z-10' : 'z-20'
      )}
    >
      <svg
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-fg0 mb-4 size-16"
      >
        <path
          d="M32 4C17.664 4 6 15.664 6 30s11.664 26 26 26 26-11.664 26-26S46.336 4 32 4z"
          fill="currentColor"
        />
      </svg>

      <p className="text-fg1 max-w-prose pt-1 leading-6 font-medium">
        Chat live with your voice AI agent
      </p>

      {/* 主容器：始终两列，小尺寸为小卡片 */}
      <div className="mt-5 flex w-full justify-center">
        <div className="w-full max-w-[520px]">
          <div className="grid grid-cols-2 items-start justify-items-center gap-4">
            <div
              className="flex flex-col items-center"
              style={{ ['--card-size' as any]: 'clamp(64px,18vw,96px)' }}
            >
              <div className="bg-muted aspect-square w-[--card-size] overflow-hidden rounded-xl shadow-sm">
                <img
                  src="/yuting.jpg"
                  alt="禹亭"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleStart(startButtonTextLeft ?? '禹亭')}
                className="mt-2 w-[--card-size] font-mono"
              >
                {startButtonTextLeft ?? '禹亭'}
              </Button>
            </div>

            <div
              className="flex flex-col items-center"
              style={{ ['--card-size' as any]: 'clamp(64px,18vw,96px)' }}
            >
              <div className="bg-muted aspect-square w-[--card-size] overflow-hidden rounded-xl shadow-sm">
                <img
                  src="/xiaobai.jpg"
                  alt="小白"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleStart(startButtonTextRight ?? '小白')}
                className="mt-2 w-[--card-size] font-mono"
              >
                {startButtonTextRight ?? '小白'}
              </Button>
            </div>
          </div>

          {/* 语言下拉，display 保持中文；提交时会把 code 发送 */}
          <div className="mt-5 flex justify-center">
            <select
              value={languageDisplay}
              onChange={(e) => setLanguageDisplay(e.target.value)}
              className="bg-background text-fg1 rounded border px-3 py-2"
              aria-label="选择语言"
            >
              <option value="普通话">普通话</option>
              <option value="粤语">粤语</option>
              <option value="English">English</option>
            </select>
          </div>
        </div>
      </div>

      <footer className="fixed bottom-5 left-0 z-20 flex w-full items-center justify-center">
        <p className="text-fg1 max-w-prose pt-1 text-xs leading-5 font-normal text-pretty md:text-sm">
          需要切换账号？{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              logout();
            }}
            className="underline"
          >
            切换账号
          </a>
          .
        </p>
      </footer>
    </section>
  );
};
