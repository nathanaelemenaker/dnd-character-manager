import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const isAdmin = hasRole(session.role, 'ADMIN');
    const membership = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
    });
    if (!isAdmin && !membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const sessions = await prisma.sessionLog.findMany({
      where: { campaignId: params.id },
      orderBy: { sessionNumber: 'desc' },
      select: {
        id: true, sessionNumber: true, title: true, createdAt: true,
        generatedOutput: true,
      },
    });

    return NextResponse.json({ sessions });
  } catch (e) {
    console.error('GET /campaigns/[id]/sessions error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const isAdmin = hasRole(session.role, 'ADMIN');
    const membership = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
    });
    if (!isAdmin && !membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json().catch(() => null);
    const rawTranscript = (body?.rawTranscript ?? '').toString().trim();
    const title = (body?.title ?? '').toString().trim() || null;

    const lastSession = await prisma.sessionLog.findFirst({
      where: { campaignId: params.id },
      orderBy: { sessionNumber: 'desc' },
      select: { sessionNumber: true },
    });
    const sessionNumber = (lastSession?.sessionNumber ?? 0) + 1;

    const log = await prisma.sessionLog.create({
      data: {
        campaignId: params.id,
        sessionNumber,
        title,
        rawTranscript,
      },
    });

    return NextResponse.json(log, { status: 201 });
  } catch (e) {
    console.error('POST /campaigns/[id]/sessions error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
