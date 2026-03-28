// app/api/admin/impersonate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, resolveRole, setImpersonateCookie, clearImpersonateCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST — start impersonating { userId }
export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: e?.status ?? 403 });
  }

  const { userId } = await req.json().catch(() => ({} as any));
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const targetRole = resolveRole(target.id, target.role);

  // ADMIN cannot impersonate another ADMIN or SUPER_ADMIN
  if (actor.role === 'ADMIN' && (targetRole === 'ADMIN' || targetRole === 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: 'ADMINs cannot impersonate other ADMINs or SUPER_ADMINs' },
      { status: 403 }
    );
  }

  const res = NextResponse.json({ ok: true, impersonating: target.email });
  setImpersonateCookie(res, userId);
  return res;
}

// DELETE — stop impersonating
export async function DELETE() {
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: e?.status ?? 403 });
  }
  const res = NextResponse.json({ ok: true });
  clearImpersonateCookie(res);
  return res;
}
