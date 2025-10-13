import { NextResponse } from 'next/server';
import { randomBytes, randomUUID } from 'crypto';
import { AccessToken, type AccessTokenOptions, type VideoGrant } from 'livekit-server-sdk';
import mysql from 'mysql2/promise';

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

// allowed metadata fields (whitelist)
const ALLOWED_META_KEYS = new Set([
  'participantName',
  'language',
  'voice',
  'gender',
  'llmChoice',
  'system_prompt',
  'prompt_text',
]);

// validate room name: letters, numbers, underscore, dash, 1-64
function isValidRoomName(name: string) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(name);
}

function genRoomName() {
  return `voice_assistant_${randomBytes(4).toString('hex')}`;
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
      throw new Error('LiveKit configuration missing (LIVEKIT_URL/API_KEY/API_SECRET).');
    }
    if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
      throw new Error('MySQL configuration missing (MYSQL_HOST/MYSQL_USER/MYSQL_DATABASE).');
    }

    const body = await req.json();

    // uid must be provided (or you can allow anonymous by setting uid = null)
    const uid =
      typeof body?.uid === 'string' && body.uid.trim().length > 0 ? body.uid.trim() : null;
    if (!uid) {
      return new NextResponse('Missing uid', { status: 400 });
    }

    // requestedRoom optional (validate if provided)
    const requestedRoom =
      typeof body?.room === 'string' && body.room.trim().length > 0 ? body.room.trim() : undefined;
    if (requestedRoom && !isValidRoomName(requestedRoom)) {
      return new NextResponse('Invalid room name', { status: 400 });
    }

    // build metadata by picking only allowed keys
    const metadata: Record<string, unknown> = {};
    for (const k of Object.keys(body ?? {})) {
      if (ALLOWED_META_KEYS.has(k)) {
        metadata[k] = (body as Record<string, unknown>)[k as string];
      }
    }

    // participantName optional fallback
    const participantName =
      typeof body?.participantName === 'string' && body.participantName.trim().length > 0
        ? body.participantName.trim()
        : 'user';

    // Generate session id and room name. Use provided requestedRoom if any, otherwise server generates.
    const sessionId = randomUUID();
    const roomName = requestedRoom ?? genRoomName();
    const createdAt = new Date();
    const expireAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

    // Persist session in MySQL in a transaction (atomic)
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
        JSON.stringify(metadata),
        formatDateForMySQL(createdAt),
        formatDateForMySQL(expireAt),
        'active',
        1,
      ]);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    // Create LiveKit participant token for the room (await async toJwt)
    const participantIdentity = `voice_assistant_user_${Math.floor(Math.random() * 10000)}`;
    const participantToken = await createParticipantToken(
      { identity: participantIdentity, name: participantName },
      roomName
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
    if (err instanceof Error) {
      return new NextResponse(err.message, { status: 500 });
    }
    return new NextResponse('internal error', { status: 500 });
  }
}

// helper: create token using livekit-server-sdk (async)
async function createParticipantToken(
  userInfo: AccessTokenOptions,
  roomName: string
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
  return await at.toJwt();
}

function formatDateForMySQL(d: Date) {
  const pad = (n: number) => (n < 10 ? '0' + n : '' + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
