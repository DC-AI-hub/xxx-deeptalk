import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import mysql from 'mysql2/promise';
import { verifyUid } from '../../lib/uid-sign';

// Environment variables required:
// LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL
// MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
// SESSION_TTL_MS (optional, default 15min)
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

const MYSQL_HOST = process.env.MYSQL_HOST;
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER;
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.MYSQL_DATABASE;

const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS ?? 15 * 60 * 1000);

// don't cache results
export const revalidate = 0;

// simple pool
const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// allowed metadata fields (whitelist) — stored into sessions table only
const ALLOWED_META_KEYS = new Set([
  'participantName',
  'language',
  'voice',
  'gender',
  'llmChoice',
  'system_prompt',
  'prompt_text',
]);

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

export type ConnectionDetails = {
  serverUrl: string;
  roomName: string;
  participantName: string;
  participantToken: string;
  sessionId: string;
};

export async function POST(req: Request) {
  try {
    if (!LIVEKIT_URL || !API_KEY || !API_SECRET) {
      return NextResponse.json({ error: 'LiveKit configuration missing (LIVEKIT_URL/API_KEY/API_SECRET).' }, { status: 500 });
    }
    if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
      return NextResponse.json({ error: 'MySQL configuration missing (MYSQL_HOST/MYSQL_USER/MYSQL_DATABASE).' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({} as any));

    // 1) prefer body uid/uidSig; 2) fallback to cookies
    const cookies = parseCookie(req.headers.get('cookie'));
    const uid = typeof body?.uid === 'string' && body.uid.trim() ? body.uid.trim() : cookies['dt_uid'];
    const uidSig = typeof body?.uidSig === 'string' && body.uidSig.trim() ? body.uidSig.trim() : cookies['dt_uid_sig'];

    if (!uid) {
      console.warn('POST /api/sessions: missing uid (cookies/body).');
      return NextResponse.json({ error: 'Missing uid' }, { status: 400 });
    }
    if (!uidSig || !verifyUid(uid, uidSig)) {
      console.warn('POST /api/sessions: invalid uid signature for uid=', uid);
      return NextResponse.json({ error: 'Invalid uid signature' }, { status: 401 });
    }

    // fixed room from uid
    const roomName = normalizeRoomFromUuid(uid);

    const participantName =
      typeof body?.participantName === 'string' && body.participantName.trim().length > 0
        ? body.participantName.trim()
        : 'user';

    // identity: prefer participantId, else uid
    const participantId =
      typeof body?.participantId === 'string' && body.participantId.trim().length > 0
        ? body.participantId.trim()
        : uid;

    // token metadata/attributes (for LiveKit token; decoupled from sessions table)
    let tokenMetadata: string | undefined;
    if (typeof body?.metadata === 'string') {
      tokenMetadata = body.metadata;
    } else if (body?.metadata && typeof body.metadata === 'object') {
      try {
        tokenMetadata = JSON.stringify(body.metadata);
      } catch {
        return NextResponse.json({ error: 'Invalid metadata object' }, { status: 400 });
      }
    }

    let tokenAttributes: Record<string, string> | undefined;
    if (body?.attributes && typeof body.attributes === 'object') {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.attributes as Record<string, unknown>)) {
        if (typeof k === 'string' && typeof v === 'string') out[k] = v;
      }
      if (Object.keys(out).length > 0) tokenAttributes = out;
    }

    const agentName: string | undefined =
      typeof body?.agentName === 'string' && body.agentName.trim().length > 0
        ? body.agentName.trim()
        : undefined;

    // only store whitelisted metadata to sessions table
    const sessionMeta: Record<string, unknown> = {};
    for (const k of Object.keys(body ?? {})) {
      if (ALLOWED_META_KEYS.has(k)) {
        sessionMeta[k] = (body as Record<string, unknown>)[k as string];
      }
    }

    // create a session row
    const sessionId = randomUUID();
    const createdAt = new Date();
    const expireAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const insertSql = `INSERT INTO sessions
        (session_id, room_name, uid, metadata, created_at, expire_at, status, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      await conn.execute(insertSql, [
        sessionId,
        roomName,
        uid,
        JSON.stringify(sessionMeta),
        formatDateForMySQL(createdAt),
        formatDateForMySQL(expireAt),
        'active',
        1,
      ]);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      console.error('DB insert session failed:', e);
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    } finally {
      conn.release();
    }

    // create LiveKit token
    const participantToken = await createParticipantToken(
      {
        identity: participantId,
        name: participantName,
        ...(tokenMetadata ? { metadata: tokenMetadata } : {}),
        ...(tokenAttributes ? ({ attributes: tokenAttributes } as any) : {}),
      },
      roomName,
      agentName
    );

    const data: ConnectionDetails = {
      serverUrl: LIVEKIT_URL!,
      roomName,
      participantToken,
      participantName,
      sessionId,
    };

    const headers = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
    });
    return new NextResponse(JSON.stringify(data), { headers });
  } catch (err) {
    console.error('POST /api/sessions error:', err);
    const msg = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// helper: create token using livekit-server-sdk (async)
async function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string,
  agentName?: string
): Promise<string> {
  const at = new AccessToken(API_KEY!, API_SECRET!, {
    ...userInfo,
    ttl: `${Math.ceil(SESSION_TTL_MS / 1000)}s`,
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
    // use plain object to avoid importing @livekit/protocol here
    (at as any).roomConfig = {
      agents: [{ agentName }],
    };
  }

  return await at.toJwt();
}

function formatDateForMySQL(d: Date) {
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
