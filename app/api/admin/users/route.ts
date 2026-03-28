// app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';
import { hashPassword } from '@/lib/auth/hash';

export const dynamic = 'force-dynamic';

// GET /api/admin/users — list all non-deleted users
export async function GET() {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: e?.status ?? 403 });
  }

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      _count: { select: { characters: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Apply env-var SUPER_ADMIN override so the panel shows the correct role
  const { resolveRole } = await import('@/lib/auth');
  const resolved = users.map((u) => ({ ...u, role: resolveRole(u.id, u.role) }));

  return NextResponse.json({ users: resolved });
}

// POST /api/admin/users — create a new user
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: e?.status ?? 403 });
  }

  const body = await req.json().catch(() => ({} as any));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  const name = String(body?.name ?? '').trim() || null;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
  }

  const hashedPassword = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, hashedPassword, name },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return NextResponse.json(user, { status: 201 });
}
