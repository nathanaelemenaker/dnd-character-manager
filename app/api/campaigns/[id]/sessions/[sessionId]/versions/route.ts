import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const isAdmin = hasRole(session.role, 'ADMIN');
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
  });
  if (!isAdmin && !membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const versions = await prisma.sessionLogVersion.findMany({
    where: { sessionLogId: params.sessionId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, versionLabel: true, createdAt: true, generatedOutput: true },
  });

  return NextResponse.json({ versions });
}
