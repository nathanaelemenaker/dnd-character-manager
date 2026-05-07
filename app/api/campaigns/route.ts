import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const isAdmin = hasRole(session.role, 'ADMIN');

    const campaigns = await prisma.campaign.findMany({
      where: isAdmin ? undefined : {
        members: { some: { userId: session.userId } },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            character: { select: { id: true, name: true, classes: { select: { classKey: true, level: true } } } },
          },
        },
        _count: { select: { sessions: true } },
      },
    });

    return NextResponse.json({ campaigns });
  } catch (e) {
    console.error('GET /campaigns error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => null);
    const name = (body?.name ?? '').toString().trim();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const description = (body?.description ?? '').toString().trim() || null;

    const campaign = await prisma.campaign.create({
      data: {
        name,
        description,
        members: {
          create: {
            userId: session.userId,
            role: 'DM',
          },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true } },
            character: { select: { id: true, name: true } },
          },
        },
        _count: { select: { sessions: true } },
      },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (e) {
    console.error('POST /campaigns error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
