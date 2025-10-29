import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';
import { verifyUid } from '../../lib/uid-sign';

export const revalidate = 0;

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

/**
 * Normalize a key for looking up env vars / json mapping:
 * - input like "yuting", "yue", "yuting_yue" -> returns uppercased safe token
 */
function normalizeKey(s?: string) {
  if (!s) return '';
  return s
    .toString()
    .trim()
    .replace(/[^A-Za-z0-9_]/g, '_')
    .toUpperCase();
}

function normalizeRoomFromUuid(uuid: string, prefix = 'voice_assistant_') {
  const cleaned = (uuid || '').replace(/[^A-Za-z0-9_-]/g, '_');
  const maxLen = 64 - prefix.length;
  return prefix + cleaned.slice(0, Math.max(0, maxLen));
}

function parseCookie(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    const v = rest.join('=');
    if (k) out[k] = decodeURIComponent(v || '');
  }
  return out;
}

/**
 * Resolve credentials for a given voice+language key.
 *
 * Strategy (in order):
 * 1) If env LIVEKIT_CREDENTIALS_JSON is set and contains an object mapping,
 *    try map[<voice>_<language>] then map[<voice>], then map["default"].
 *    Each entry expected: { url, apiKey, apiSecret }
 * 2) Try per-key env variables:
 *    LIVEKIT_URL_<KEY>, LIVEKIT_API_KEY_<KEY>, LIVEKIT_API_SECRET_<KEY>
 *    where KEY is normalized uppercased token like YUTING_YUE or YUTING
 * 3) Fallback to top-level LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
 */
function getCredentialsFor(voice?: string, language?: string) {
  const keyCombo = normalizeKey(`${voice ?? ''}_${language ?? ''}`); // YUTING_YUE
  const keyVoice = normalizeKey(voice); // YUTING

  // 1) JSON mapping env (recommended for many combos)
  const jsonEnv = process.env.LIVEKIT_CREDENTIALS_JSON;
  if (jsonEnv) {
    try {
      const map = JSON.parse(jsonEnv);
      if (map && typeof map === 'object') {
        // prefer exact voice_language
        if (keyCombo && map[keyCombo]) {
          const entry = map[keyCombo];
          if (entry.url && entry.apiKey && entry.apiSecret) {
            return { url: entry.url, apiKey: entry.apiKey, apiSecret: entry.apiSecret };
          }
        }
        // then try voice-only
        if (keyVoice && map[keyVoice]) {
          const entry = map[keyVoice];
          if (entry.url && entry.apiKey && entry.apiSecret) {
            return { url: entry.url, apiKey: entry.apiKey, apiSecret: entry.apiSecret };
          }
        }
        // optional default
        if (map['DEFAULT'] || map['default']) {
          const entry = map['DEFAULT'] || map['default'];
          if (entry.url && entry.apiKey && entry.apiSecret) {
            return { url: entry.url, apiKey: entry.apiKey, apiSecret: entry.apiSecret };
          }
        }
      }
    } catch (err) {
      console.warn('LIVEKIT_CREDENTIALS_JSON parse error', (err as Error).message);
    }
  }

  // 2) Per-key env vars (legacy/simple)
  if (keyCombo) {
    const url = process.env[`LIVEKIT_URL_${keyCombo}`];
    const apiKey = process.env[`LIVEKIT_API_KEY_${keyCombo}`];
    const apiSecret = process.env[`LIVEKIT_API_SECRET_${keyCombo}`];
    if (url && apiKey && apiSecret) return { url, apiKey, apiSecret };
  }
  if (keyVoice) {
    const url = process.env[`LIVEKIT_URL_${keyVoice}`];
    const apiKey = process.env[`LIVEKIT_API_KEY_${keyVoice}`];
    const apiSecret = process.env[`LIVEKIT_API_SECRET_${keyVoice}`];
    if (url && apiKey && apiSecret) return { url, apiKey, apiSecret };
  }

  // 3) Fallback to default envs
  if (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    return {
      url: process.env.LIVEKIT_URL,
      apiKey: process.env.LIVEKIT_API_KEY,
      apiSecret: process.env.LIVEKIT_API_SECRET,
    };
  }

  return null;
}

export async function POST(req: Request) {
  try {
    if (!process.env) {
      return NextResponse.json({ error: 'Server environment not available' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}) as any);

    const {
      participantName: participantNameFromBody,
      participantId: participantIdFromBody,
      metadata: metadataFromBody,
      attributes: attributesFromBody,
      agentName: agentNameFromBody,
      uid: uidFromBody,
      uidSig: uidSigFromBody,
      voice: voiceFromBody,
      language: languageFromBody,
      // optional: allow caller to hint a specific credential key (e.g. "yuting_yue")
      credentialKey: credentialKeyFromBody,
    } = body ?? {};

    // read uid/uidSig from cookies as fallback
    const cookies = parseCookie(req.headers.get('cookie'));
    const uid =
      typeof uidFromBody === 'string' && uidFromBody.trim()
        ? uidFromBody.trim()
        : cookies['dt_uid'];
    const uidSig =
      typeof uidSigFromBody === 'string' && uidSigFromBody.trim()
        ? uidSigFromBody.trim()
        : cookies['dt_uid_sig'];

    if (!uid) {
      console.warn('POST /api/connection-details: missing uid (cookies/body).');
      return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }
    if (!uidSig || !verifyUid(uid, uidSig)) {
      console.warn('POST /api/connection-details: invalid uid signature for uid=', uid);
      return NextResponse.json({ error: 'Invalid uid signature' }, { status: 401 });
    }

    // fixed room derived from uid
    const roomName = normalizeRoomFromUuid(uid);

    const participantName =
      typeof participantNameFromBody === 'string' && participantNameFromBody.trim().length > 0
        ? participantNameFromBody.trim()
        : 'user';

    const identity =
      typeof participantIdFromBody === 'string' && participantIdFromBody.trim().length > 0
        ? participantIdFromBody.trim()
        : uid;

    // metadata parsing (optional JSON/object)
    let providedMetadata: any = undefined;
    if (typeof metadataFromBody === 'string') {
      try {
        providedMetadata = JSON.parse(metadataFromBody);
      } catch {
        providedMetadata = { info: metadataFromBody };
      }
    } else if (metadataFromBody && typeof metadataFromBody === 'object') {
      providedMetadata = metadataFromBody;
    }

    // attributes from body (strings only)
    let attributes: Record<string, string> | undefined;
    if (attributesFromBody && typeof attributesFromBody === 'object') {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(attributesFromBody as Record<string, unknown>)) {
        if (typeof k === 'string' && typeof v === 'string') out[k] = v;
      }
      if (Object.keys(out).length > 0) attributes = out;
    }

    const agentName =
      typeof agentNameFromBody === 'string' && agentNameFromBody.trim().length > 0
        ? agentNameFromBody.trim()
        : (body?.room_config?.agents?.[0]?.agent_name as string | undefined);

    // Resolve voice & language (expect english code from frontend)
    const voice =
      typeof voiceFromBody === 'string' && voiceFromBody.trim() ? voiceFromBody.trim() : 'default';
    const language =
      typeof languageFromBody === 'string' && languageFromBody.trim()
        ? languageFromBody.trim()
        : 'mandarin';

    // Merge/prepare metadata (do not use for voice/language control now)
    const mergedMetadata: Record<string, unknown> = {};
    if (providedMetadata && typeof providedMetadata === 'object') {
      Object.assign(mergedMetadata, providedMetadata);
    }
    const finalMetadata =
      Object.keys(mergedMetadata).length > 0 ? JSON.stringify(mergedMetadata) : undefined;

    // Ensure attributes exist and inject language and voice
    if (!attributes) attributes = {};
    attributes.language = language;
    attributes.voice = voice;

    // Determine credential lookup key: allow explicit credentialKeyFromBody as highest priority
    let creds = null;
    if (
      credentialKeyFromBody &&
      typeof credentialKeyFromBody === 'string' &&
      credentialKeyFromBody.trim()
    ) {
      // try direct credentialKey (e.g. "YUTING_YUE" or "yuting_yue")
      const explicitKey = credentialKeyFromBody.trim();
      const normalizedExplicit = normalizeKey(explicitKey);
      // try JSON mapping first then per-env
      const jsonEnv = process.env.LIVEKIT_CREDENTIALS_JSON;
      if (jsonEnv) {
        try {
          const map = JSON.parse(jsonEnv);
          if (map && (map[normalizedExplicit] || map[normalizedExplicit.toLowerCase()])) {
            const entry = map[normalizedExplicit] || map[normalizedExplicit.toLowerCase()];
            if (entry.url && entry.apiKey && entry.apiSecret)
              creds = { url: entry.url, apiKey: entry.apiKey, apiSecret: entry.apiSecret };
          }
        } catch {}
      }
      if (!creds) {
        const url = process.env[`LIVEKIT_URL_${normalizedExplicit}`];
        const apiKey = process.env[`LIVEKIT_API_KEY_${normalizedExplicit}`];
        const apiSecret = process.env[`LIVEKIT_API_SECRET_${normalizedExplicit}`];
        if (url && apiKey && apiSecret) creds = { url, apiKey, apiSecret };
      }
    }

    // If no explicit key, resolve by voice+language or voice-only
    if (!creds) creds = getCredentialsFor(voice, language);

    if (!creds) {
      console.error('No LiveKit credentials found for voice/language:', voice, language);
      return NextResponse.json(
        { error: 'LiveKit credentials not configured for requested voice/language' },
        { status: 500 }
      );
    }

    // Create token with chosen credentials
    const participantToken = await createParticipantToken(
      {
        identity,
        name: participantName,
        ...(finalMetadata ? { metadata: finalMetadata } : {}),
        attributes,
      },
      roomName,
      agentName,
      creds.apiKey,
      creds.apiSecret
    );

    const data: ConnectionDetails = {
      serverUrl: creds.url,
      roomName,
      participantToken,
      participantName,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'internal error';
    console.error('POST /api/connection-details error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  agentName: string | undefined,
  apiKey: string,
  apiSecret: string
): Promise<string> {
  const at = new AccessToken(apiKey, apiSecret, {
    ...userInfo,
    ttl: '15m',
  });
  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  };
  at.addGrant(grant);

  if (agentName) {
    at.roomConfig = new RoomConfiguration({
      agents: [{ agentName }],
    });
  }

  return at.toJwt();
}
