import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; sessionId: string; versionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const isAdmin = hasRole(session.role, 'ADMIN');
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
  });
  if (!isAdmin && !membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  await prisma.sessionLogVersion.delete({ where: { id: params.versionId } });

  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; sessionId: string; versionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const isAdmin = hasRole(session.role, 'ADMIN');
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
  });
  if (!isAdmin && !membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [version, sessionLog] = await Promise.all([
    prisma.sessionLogVersion.findUnique({ where: { id: params.versionId } }),
    prisma.sessionLog.findUnique({ where: { id: params.sessionId } }),
  ]);

  if (!version || !sessionLog) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Save the current output as a version before restoring
  if (sessionLog.generatedOutput) {
    const versionCount = await prisma.sessionLogVersion.count({ where: { sessionLogId: params.sessionId } });
    await prisma.sessionLogVersion.create({
      data: {
        sessionLogId: params.sessionId,
        generatedOutput: sessionLog.generatedOutput as any,
        versionLabel: `v${versionCount + 1} — before restore of "${version.versionLabel}"`,
      },
    });
  }

  // Restore the chosen version
  const updated = await prisma.sessionLog.update({
    where: { id: params.sessionId },
    data: { generatedOutput: version.generatedOutput as any },
  });

  return NextResponse.json({ session: updated, generatedOutput: version.generatedOutput });
}
