// app/api/dev/set-session/route.ts
import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY utility route to seed the exact cookies our app expects.
// Remove this file after you confirm your normal login flow sets these cookies.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = (url.searchParams.get('userId') || '').trim();
  const email = (url.searchParams.get('email') || '').trim();

  if (!userId) {
    return NextResponse.json(
      { error: 'missing_userId', hint: 'Provide ?userId=<cuid>' },
      { status: 400 },
    );
  }

  // IMPORTANT: Cookies must match production attributes
  // HttpOnly=true, Secure=true, SameSite=None, Path=/, Domain=dnd.emenaker.org
  const res = NextResponse.json(
    {
      ok: true,
      message: 'Session cookies set for this browser. You can now visit /characters.',
      userId,
      email: email || undefined,
    },
    { status: 200 },
  );

  const domain = 'dnd.emenaker.org'; // exact host per your infra decision

  // Required cookie
  res.cookies.set('dnd_user_id', userId, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    path: '/',
    domain,
  });

  // Optional email cookie
  if (email) {
    res.cookies.set('session_email', email, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      domain,
    });
  }

  return res;
}