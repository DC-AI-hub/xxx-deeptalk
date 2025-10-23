import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = process.env.UID_SIGNING_SECRET || '';

function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function signUid(uid: string): string {
  if (!SECRET) throw new Error('UID_SIGNING_SECRET is not set');
  const mac = createHmac('sha256', SECRET).update(uid, 'utf8').digest();
  return base64url(mac);
}

export function verifyUid(uid: string, sig: string): boolean {
  if (!SECRET) throw new Error('UID_SIGNING_SECRET is not set');
  try {
    const expected = signUid(uid);
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}
