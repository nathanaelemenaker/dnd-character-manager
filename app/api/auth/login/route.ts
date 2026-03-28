// app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/hash';
import { setAuthCookies } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');

    if (!email || !password) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email, deletedAt: null },
      select: { id: true, email: true, hashedPassword: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.hashedPassword);
    if (!valid) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, userId: user.id, email: user.email }, { status: 200 });
    setAuthCookies(res, user.id, user.email);
    return res;
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}