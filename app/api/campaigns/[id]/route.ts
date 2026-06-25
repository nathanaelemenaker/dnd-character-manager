import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function getCampaignMembership(campaignId: string, userId: string) {
  return prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, characters: { select: { id: true, name: true } } } },
            character: {
              select: {
                id: true, name: true, level: true, portrait: true,
                classes: { select: { classKey: true, level: true } },
              },
            },
          },
          orderBy: [{ role: 'asc' }, { id: 'asc' }],
        },
        sessions: {
          select: { id: true, sessionNumber: true, title: true, createdAt: true, generatedOutput: true },
          orderBy: { sessionNumber: 'desc' },
        },
        _count: { select: { sessions: true } },
      },
    });

    if (!campaign) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const isAdmin = hasRole(session.role, 'ADMIN');
    const membership = campaign.members.find(m => m.userId === session.userId);
    if (!isAdmin && !membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    return NextResponse.json({ campaign, membership, isAdmin });
  } catch (e) {
    console.error('GET /campaigns/[id] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const membership = await getCampaignMembership(params.id, session.userId);
    const isAdmin = hasRole(session.role, 'ADMIN');
    if (!isAdmin && membership?.role !== 'DM') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const data: Record<string, unknown> = {};
    if (body?.name !== undefined) data.name = body.name.toString().trim();
    if (body?.description !== undefined) data.description = body.description.toString().trim() || null;
    if (body?.notes !== undefined) data.notes = body.notes.toString();
    if (body?.styleInstructions !== undefined) data.styleInstructions = body.styleInstructions.toString().trim() || null;

    const campaign = await prisma.campaign.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(campaign);
  } catch (e) {
    console.error('PATCH /campaigns/[id] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const membership = await getCampaignMembership(params.id, session.userId);
    const isAdmin = hasRole(session.role, 'ADMIN');
    if (!isAdmin && membership?.role !== 'DM') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    await prisma.campaign.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /campaigns/[id] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
