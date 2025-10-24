import { NextResponse } from 'next/server';
import mysql from 'mysql2/promise';
import { verifyUid } from '../../../lib/uid-sign';

const MYSQL_HOST = process.env.MYSQL_HOST;
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER;
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.MYSQL_DATABASE;

export const revalidate = 0;

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

export async function GET(req: Request) {
  try {
    if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
      return NextResponse.json({ error: 'MySQL configuration missing (MYSQL_HOST/MYSQL_USER/MYSQL_DATABASE).' }, { status: 500 });
    }

    const cookies = parseCookie(req.headers.get('cookie'));
    const uid = cookies['dt_uid'];
    const uidSig = cookies['dt_uid_sig'];

    if (!uid || !uidSig || !verifyUid(uid, uidSig)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // fetch name for display (optional; you could skip the query and just return uid)
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute('SELECT name FROM user_table WHERE uuid = ? LIMIT 1', [uid]);
      const arr = rows as Array<{ name: string }>;
      const name = arr.length > 0 ? arr[0].name : '';
      return NextResponse.json({ ok: true, uuid: uid, name });
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('GET /api/auth/me error:', err);
    const msg = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
