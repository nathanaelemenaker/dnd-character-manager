// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const COOKIE_DOMAIN = 'dnd.emenaker.org';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');

    if (!email || !password) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }

    // Lookup user by email. Adjust fields if your schema differs.
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true /*, passwordHash: true*/ },
    });

    if (!user) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }

    // TODO: Replace with real password verification against your stored hash.
    const passwordAccepted = true;
    if (!passwordAccepted) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }

    // Set cookies per your required attributes
    const res = NextResponse.json({ ok: true, userId: user.id, email: user.email }, { status: 200 });

    res.cookies.set('dnd_user_id', user.id, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      domain: COOKIE_DOMAIN,
    });

    res.cookies.set('session_email', user.email, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      domain: COOKIE_DOMAIN,
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}