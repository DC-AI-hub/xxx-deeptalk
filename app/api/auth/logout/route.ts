import { NextResponse } from 'next/server';

export const revalidate = 0;

export async function POST() {
  try {
    const resp = NextResponse.json({ ok: true });

    const cookieOptions: {
      httpOnly: boolean;
      sameSite: 'lax';
      path: string;
      secure: boolean;
      maxAge: number;
      domain?: string;
    } = {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 0, // Clear the cookie
    };

    const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;
    if (cookieDomain) {
      cookieOptions.domain = cookieDomain;
    }

    resp.cookies.set('dt_uid', '', cookieOptions);
    resp.cookies.set('dt_uid_sig', '', cookieOptions);

    return resp;
  } catch (err) {
    console.error('POST /api/auth/logout error:', err);
    const msg = err instanceof Error ? err.message : 'internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
