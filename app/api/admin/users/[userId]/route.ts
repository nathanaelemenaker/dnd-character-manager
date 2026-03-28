// app/api/admin/users/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, requireSuperAdmin, resolveRole } from '@/lib/auth';
import { hashPassword } from '@/lib/auth/hash';
import type { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

type Params = { params: { userId: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: e?.status ?? 403 });
  }

  const { userId } = params;
  const body = await req.json().catch(() => ({} as any));

  if (body.password !== undefined) {
    const pw = String(body.password ?? '');
    if (pw.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: userId },
      data: { hashedPassword: await hashPassword(pw) },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.role !== undefined) {
    try {
      await requireSuperAdmin();
    } catch {
      return NextResponse.json({ error: 'Only SUPER_ADMIN can change roles' }, { status: 403 });
    }
    const valid: UserRole[] = ['USER', 'ADMIN'];
    if (!valid.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (resolveRole(target.id, target.role) === 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Cannot change a SUPER_ADMIN role' }, { status: 403 });
    }
    await prisma.user.update({ where: { id: userId }, data: { role: body.role } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: e?.status ?? 403 });
  }

  const { userId } = params;
  if (actor.actorId === userId) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (resolveRole(target.id, target.role) === 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Cannot delete a SUPER_ADMIN' }, { status: 403 });
  }

  await prisma.user.update({ where: { id: userId }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
