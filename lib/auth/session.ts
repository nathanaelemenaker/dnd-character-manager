
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

const secret = new TextEncoder().encode(process.env.APP_SECRET || 'dev-secret');
const cookieName = 'session';

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
  cookies().set(cookieName, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
}

export async function destroySession() {
  cookies().set(cookieName, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function getSessionUser() {
  const token = cookies().get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    return user;
  } catch {
    return null;
  }
}

export async function requireUser() {
  const u = await getSessionUser();
  if (!u) throw new Response('Unauthorized', { status: 401 });
  return u;
}
