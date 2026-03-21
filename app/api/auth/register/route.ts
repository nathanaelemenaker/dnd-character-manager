
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/hash';
import { createSession } from '@/lib/auth/session';

export async function POST(req: NextRequest) {
  const { email, password, name } = await req.json();
  if (!email || !password) return NextResponse.json({ error: 'Missing' }, { status: 400 });

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: 'Email in use' }, { status: 409 });

  const hashedPassword = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, hashedPassword, name } });
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
