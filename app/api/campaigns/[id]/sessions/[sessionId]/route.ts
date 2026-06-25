import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';
import { renderLabeledTranscript, type DiarizedSegment } from '@/lib/transcript';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const isAdmin = hasRole(session.role, 'ADMIN');
    const membership = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
    });
    if (!isAdmin && !membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const log = await prisma.sessionLog.findUnique({
      where: { id: params.sessionId, campaignId: params.id },
    });
    if (!log) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    return NextResponse.json({ session: log });
  } catch (e) {
    console.error('GET /campaigns/[id]/sessions/[sessionId] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const isAdmin = hasRole(session.role, 'ADMIN');
    const membership = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
    });
    if (!isAdmin && !membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.rawTranscript === 'string') data.rawTranscript = body.rawTranscript;
    if (typeof body.title === 'string') data.title = body.title || null;
    if (typeof body.corrections === 'string') data.corrections = body.corrections || null;
    if (Array.isArray(body.attendees)) data.attendees = body.attendees;
    if (typeof body.shareToken === 'string') data.shareToken = body.shareToken || null;

    // When speakerMap is updated, re-render rawTranscript from stored segments
    if (body.speakerMap !== undefined && typeof body.speakerMap === 'object') {
      const existing = await prisma.sessionLog.findUnique({
        where: { id: params.sessionId, campaignId: params.id },
        select: { diarizedSegments: true },
      });
      const segments = (existing?.diarizedSegments ?? []) as DiarizedSegment[];
      data.speakerMap = body.speakerMap;
      if (segments.length) {
        data.rawTranscript = renderLabeledTranscript(segments, body.speakerMap as Record<string, string>);
      }
    }

    const log = await prisma.sessionLog.update({
      where: { id: params.sessionId, campaignId: params.id },
      data,
    });
    return NextResponse.json({ session: log });
  } catch (e) {
    console.error('PATCH /campaigns/[id]/sessions/[sessionId] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const isAdmin = hasRole(session.role, 'ADMIN');
    const membership = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
    });
    if (!isAdmin && membership?.role !== 'DM') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    await prisma.sessionLog.delete({ where: { id: params.sessionId, campaignId: params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /campaigns/[id]/sessions/[sessionId] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
