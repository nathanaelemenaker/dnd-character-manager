// app/api/admin/characters/reassign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/**
 * POST body options:
 *   {
 *     characterId?: string,    // transfer a single character (if omitted, transfers all from user)
 *     fromUserId?: string,     // OR (required when no characterId)
 *     fromEmail?: string,      // one of these required when no characterId
 *     toUserId?: string        // default = current admin's userId
 *   }
 */
export async function POST(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.code === 401 ? 'unauthorized' : 'forbidden' }, { status: gate.code });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const toUserId: string = body.toUserId ? String(body.toUserId) : gate.session.userId;

  // Confirm target user exists
  const toUser = await prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, email: true } });
  if (!toUser) return NextResponse.json({ error: 'to_user_not_found' }, { status: 404 });

  // Single-character transfer
  if (body.characterId) {
    const characterId = String(body.characterId);
    const character = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, ownerId: true } });
    if (!character) return NextResponse.json({ error: 'character_not_found' }, { status: 404 });
    if (character.ownerId === toUserId) return NextResponse.json({ error: 'already_owned_by_target' }, { status: 400 });
    await prisma.character.update({ where: { id: characterId }, data: { ownerId: toUserId } });
    return NextResponse.json({ ok: true, moved: 1, toUserId }, { status: 200 });
  }

  // Bulk transfer from user
  if (!body.fromUserId && !body.fromEmail) {
    return NextResponse.json({ error: 'provide_characterId_or_fromUserId_or_fromEmail' }, { status: 400 });
  }

  let fromUserId: string | null = null;
  if (body.fromUserId) {
    fromUserId = String(body.fromUserId);
  } else {
    const u = await prisma.user.findUnique({ where: { email: String(body.fromEmail) }, select: { id: true } });
    if (!u) return NextResponse.json({ error: 'from_user_not_found' }, { status: 404 });
    fromUserId = u.id;
  }

  if (fromUserId === toUserId) {
    return NextResponse.json({ error: 'from_equals_to' }, { status: 400 });
  }

  const fromUser = await prisma.user.findUnique({ where: { id: fromUserId }, select: { id: true, email: true } });
  if (!fromUser) return NextResponse.json({ error: 'from_user_not_found' }, { status: 404 });

  const result = await prisma.character.updateMany({
    where: { ownerId: fromUserId },
    data: { ownerId: toUserId },
  });

  return NextResponse.json({
    ok: true,
    moved: result.count,
    fromUserId,
    toUserId,
  }, { status: 200 });
}