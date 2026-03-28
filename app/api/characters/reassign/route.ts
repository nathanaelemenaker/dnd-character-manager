// app/api/admin/characters/reassign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * POST body options:
 *   {
 *     fromUserId?: string,   // OR
 *     fromEmail?: string,    // one of these required
 *     toUserId?: string      // default = current admin's userId
 *   }
 */
export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: 'forbidden' }, { status: e?.status ?? 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || (!body.fromUserId && !body.fromEmail)) {
    return NextResponse.json({ error: 'provide_fromUserId_or_fromEmail' }, { status: 400 });
  }

  let fromUserId: string | null = null;
  if (body.fromUserId) {
    fromUserId = String(body.fromUserId);
  } else {
    const u = await prisma.user.findUnique({
      where: { email: String(body.fromEmail) },
      select: { id: true },
    });
    if (!u) return NextResponse.json({ error: 'from_user_not_found' }, { status: 404 });
    fromUserId = u.id;
  }

  const toUserId: string = body.toUserId ? String(body.toUserId) : actor.userId;
  if (fromUserId === toUserId) {
    return NextResponse.json({ error: 'from_equals_to' }, { status: 400 });
  }

  const [fromUser, toUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromUserId }, select: { id: true, email: true } }),
    prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, email: true } }),
  ]);
  if (!fromUser) return NextResponse.json({ error: 'from_user_not_found' }, { status: 404 });
  if (!toUser) return NextResponse.json({ error: 'to_user_not_found' }, { status: 404 });

  const result = await prisma.character.updateMany({
    where: { ownerId: fromUserId },
    data: { ownerId: toUserId },
  });

  return NextResponse.json({ ok: true, moved: result.count, fromUserId, toUserId }, { status: 200 });
}
