import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const callerMembership = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
    });
    const isAdmin = hasRole(session.role, 'ADMIN');
    if (!isAdmin && callerMembership?.role !== 'DM') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const data: Record<string, unknown> = {};
    if (body?.characterId !== undefined) data.characterId = body.characterId || null;
    if (body?.role !== undefined) data.role = body.role === 'DM' ? 'DM' : 'PLAYER';

    const member = await prisma.campaignMember.update({
      where: { id: params.memberId, campaignId: params.id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true } },
        character: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(member);
  } catch (e) {
    console.error('PATCH /campaigns/[id]/members/[memberId] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; memberId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const target = await prisma.campaignMember.findUnique({
      where: { id: params.memberId, campaignId: params.id },
    });
    if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const callerMembership = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
    });
    const isAdmin = hasRole(session.role, 'ADMIN');
    const isSelf = target.userId === session.userId;
    if (!isAdmin && callerMembership?.role !== 'DM' && !isSelf) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    await prisma.campaignMember.delete({ where: { id: params.memberId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /campaigns/[id]/members/[memberId] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
