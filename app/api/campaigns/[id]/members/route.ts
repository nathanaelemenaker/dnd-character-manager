import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const existingMembership = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
    });
    const isAdmin = hasRole(session.role, 'ADMIN');
    if (!isAdmin && existingMembership?.role !== 'DM') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const targetEmail = (body?.email ?? '').toString().trim().toLowerCase();
    const characterId = body?.characterId ?? null;
    const role = body?.role === 'DM' ? 'DM' : 'PLAYER';

    if (!targetEmail) return NextResponse.json({ error: 'email required' }, { status: 400 });

    const targetUser = await prisma.user.findFirst({
      where: { email: targetEmail, deletedAt: null },
      select: { id: true },
    });
    if (!targetUser) return NextResponse.json({ error: 'user_not_found' }, { status: 404 });

    const member = await prisma.campaignMember.upsert({
      where: { campaignId_userId: { campaignId: params.id, userId: targetUser.id } },
      update: { role, characterId: characterId ?? undefined },
      create: { campaignId: params.id, userId: targetUser.id, role, characterId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        character: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(member, { status: 201 });
  } catch (e) {
    console.error('POST /campaigns/[id]/members error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
