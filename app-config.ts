import type { AppConfig } from './lib/types';

export const APP_CONFIG_DEFAULTS: AppConfig & { providerUrls?: Record<string, any> } = {
  companyName: 'DingChi',
  pageTitle: 'Deep IP Diagnosis Agent',
  pageDescription: 'A voice agent built with LiveKit',

  supportsChatInput: true,
  supportsVideoInput: true,
  supportsScreenShare: false,
  isPreConnectBufferEnabled: true,

  logo: '/lk-logo.svg',
  accent: '#002cf2',
  logoDark: '/lk-logo-dark.svg',
  accentDark: '#1fd5f9',

  startButtonTextLeft: '禹亭',
  startButtonTextRight: '小白',
  startButtonText: 'Start call',

  agentName: undefined,
};
