// app/api/dev/clear-session/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const res = NextResponse.json({ ok: true, message: 'Session cookies cleared.' });
  const domain = 'dnd.emenaker.org';

  res.cookies.set('dnd_user_id', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    domain,
    maxAge: 0,
  });

  res.cookies.set('session_email', '', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    domain,
    maxAge: 0,
  });

  return res;
}