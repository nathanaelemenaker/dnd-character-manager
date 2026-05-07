import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const character = await prisma.character.findUnique({
      where: { id: params.id },
      select: { ownerId: true },
    });
    if (!character) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const isAdmin = hasRole(session.role, 'ADMIN');
    if (!isAdmin && character.ownerId !== session.userId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const memberships = await prisma.campaignMember.findMany({
      where: { characterId: params.id },
      include: {
        campaign: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
              where: { role: 'DM' },
            },
            sessions: {
              orderBy: { sessionNumber: 'desc' },
              take: 1,
              select: { id: true, sessionNumber: true, title: true, createdAt: true },
            },
            _count: { select: { sessions: true } },
          },
        },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ memberships });
  } catch (e) {
    console.error('GET /characters/[id]/campaigns error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
