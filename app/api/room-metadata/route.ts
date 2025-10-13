import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import mysql from 'mysql2/promise';

const MYSQL_HOST = process.env.MYSQL_HOST;
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER;
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.MYSQL_DATABASE;

const METADATA_API_KEY = process.env.METADATA_API_KEY ?? '';

if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
  console.warn('room-metadata route: MySQL config missing. Ensure env vars are set.');
}

const pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const apiKey = req.headers.get('x-api-key') || '';
    if (!METADATA_API_KEY || apiKey !== METADATA_API_KEY) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const url = new URL(req.url);
    const room = url.searchParams.get('room');
    if (!room) {
      return new NextResponse('missing room param', { status: 400 });
    }

    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute<RowDataPacket[]>(
        `SELECT session_id, uid, metadata, created_at, expire_at, status
         FROM sessions
         WHERE room_name = ?
         LIMIT 1`,
        [room]
      );

      if (!rows || rows.length === 0) {
        return NextResponse.json({ found: false });
      }

      const session = rows[0] as {
        session_id: string;
        uid: string;
        metadata: string | Record<string, unknown> | null;
        created_at: string | Date;
        expire_at: string | Date;
        status: string;
      };

      // check expiry
      const now = new Date();
      const expireAt = new Date(session.expire_at as string);
      if (expireAt.getTime() < now.getTime()) {
        return NextResponse.json({ found: false });
      }

      let metadata: Record<string, unknown> = {};
      try {
        if (typeof session.metadata === 'string') {
          metadata = JSON.parse(session.metadata);
        } else if (session.metadata && typeof session.metadata === 'object') {
          metadata = session.metadata as Record<string, unknown>;
        }
      } catch {
        metadata = {};
      }

      return NextResponse.json({
        found: true,
        metadata,
        sessionId: session.session_id,
        uid: session.uid,
      });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('GET /api/room-metadata error:', err);
    return new NextResponse('internal error', { status: 500 });
  }
}
