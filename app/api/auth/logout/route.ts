// app/api/auth/logout/route.ts
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  const expire = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/', maxAge: 0 };
  res.cookies.set('dnd_user_id', '', expire);
  res.cookies.set('session_email', '', expire);
  res.cookies.set('impersonate', '', expire);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function GET() {
  return POST();
}
