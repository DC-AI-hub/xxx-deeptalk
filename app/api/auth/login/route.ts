import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import mysql from 'mysql2/promise';
import { signUid } from '../../../lib/uid-sign';

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

function isEmail(s: string) {
  return /\S+@\S+\.\S+/.test(s);
}

export async function POST(req: Request) {
  try {
    if (!MYSQL_HOST || !MYSQL_USER || !MYSQL_DATABASE) {
      return NextResponse.json(
        { error: 'MySQL configuration missing (MYSQL_HOST/MYSQL_USER/MYSQL_DATABASE).' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}) as any);
    const username: string = (body?.username || '').trim();
    const password: string = (body?.password || '').trim();

    if (!username || !password) {
      return NextResponse.json({ error: '用户名或密码不能为空' }, { status: 400 });
    }

    const conn = await pool.getConnection();
    try {
      const isMail = isEmail(username);
      const sql = isMail
        ? 'SELECT uuid, name, password FROM user_table WHERE mail = ? LIMIT 1'
        : 'SELECT uuid, name, password FROM user_table WHERE phone = ? LIMIT 1';
      const [rows] = await conn.execute(sql, [username]);
      const arr = rows as Array<{ uuid: string; name: string; password: string }>;
      if (arr.length === 0) {
        return NextResponse.json({ error: '用户名不存在' }, { status: 404 });
      }
      const { uuid, name, password: hashed } = arr[0];

      const md5 = createHash('md5').update(password, 'utf8').digest('hex').toLowerCase();
      if (md5 !== (hashed || '').toLowerCase()) {
        return NextResponse.json({ error: '密码错误！' }, { status: 401 });
      }

      // success: set readable cookies dt_uid & dt_uid_sig and return JSON
      const resp = NextResponse.json({ ok: true, uuid, name });

      const cookieBase = `Path=/; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
      const uidSig = signUid(uuid);

      resp.headers.append('Set-Cookie', `dt_uid=${encodeURIComponent(uuid)}; ${cookieBase}`);
      resp.headers.append('Set-Cookie', `dt_uid_sig=${encodeURIComponent(uidSig)}; ${cookieBase}`);

      return resp;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    const msg = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
