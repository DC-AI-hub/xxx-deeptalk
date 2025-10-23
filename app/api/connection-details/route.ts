import { NextResponse } from 'next/server';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import { RoomConfiguration } from '@livekit/protocol';
import { verifyUid } from '../../lib/uid-sign';

const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

// don't cache the results
export const revalidate = 0;

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
};

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

export async function POST(req: Request) {
  try {
    if (!LIVEKIT_URL) throw new Error('LIVEKIT_URL is not defined');
    if (!API_KEY) throw new Error('LIVEKIT_API_KEY is not defined');
    if (!API_SECRET) throw new Error('LIVEKIT_API_SECRET is not defined');

    const body = await req.json().catch(() => ({} as any));

    const {
      participantName: participantNameFromBody,
      participantId: participantIdFromBody,
      metadata: metadataFromBody,
      attributes: attributesFromBody,
      agentName: agentNameFromBody,
      uid: uidFromBody,
      uidSig: uidSigFromBody,
    } = body ?? {};

    // read uid/uidSig from cookies as fallback
    const cookies = parseCookie(req.headers.get('cookie'));
    const uid = typeof uidFromBody === 'string' && uidFromBody.trim() ? uidFromBody.trim() : cookies['dt_uid'];
    const uidSig = typeof uidSigFromBody === 'string' && uidSigFromBody.trim() ? uidSigFromBody.trim() : cookies['dt_uid_sig'];

    if (!uid) return new NextResponse('Missing uid', { status: 400 });
    if (!uidSig || !verifyUid(uid, uidSig)) return new NextResponse('Invalid uid signature', { status: 401 });

    // fixed room by uid
    const roomName = normalizeRoomFromUuid(uid);

    const participantName =
      typeof participantNameFromBody === 'string' && participantNameFromBody.trim().length > 0
        ? participantNameFromBody.trim()
        : 'user';

    const identity =
      typeof participantIdFromBody === 'string' && participantIdFromBody.trim().length > 0
        ? participantIdFromBody.trim()
        : uid;

    // metadata can be string or object
    let metadata: string | undefined;
    if (typeof metadataFromBody === 'string') {
      metadata = metadataFromBody;
    } else if (metadataFromBody && typeof metadataFromBody === 'object') {
      metadata = JSON.stringify(metadataFromBody);
    }

    // attributes must be string->string
    let attributes: Record<string, string> | undefined;
    if (attributesFromBody && typeof attributesFromBody === 'object') {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(attributesFromBody as Record<string, unknown>)) {
        if (typeof k === 'string' && typeof v === 'string') out[k] = v;
      }
      if (Object.keys(out).length > 0) attributes = out;
    }

    // keep compatibility with old agentName path
    const agentName =
      typeof agentNameFromBody === 'string' && agentNameFromBody.trim().length > 0
        ? agentNameFromBody.trim()
        : (body?.room_config?.agents?.[0]?.agent_name as string | undefined);

    const participantToken = await createParticipantToken(
      {
        identity,
        name: participantName,
        ...(metadata ? { metadata } : {}),
        ...(attributes ? ({ attributes } as any) : {}),
      },
      roomName,
      agentName
    );

    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL,
      roomName,
      participantToken,
      participantName,
    };
    const headers = new Headers({
      'Cache-Control': 'no-store',
    });
    return NextResponse.json(data, { headers });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return new NextResponse(error.message, { status: 500 });
    }
  }
}

function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  agentName?: string
): Promise<string> {
  const at = new AccessToken(API_KEY!, API_SECRET!, {
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
