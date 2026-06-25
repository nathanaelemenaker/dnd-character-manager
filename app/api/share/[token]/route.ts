import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const log = await prisma.sessionLog.findUnique({
      where: { shareToken: params.token },
      select: {
        sessionNumber: true,
        title: true,
        generatedOutput: true,
        campaign: { select: { name: true, description: true } },
      },
    });

    if (!log || !log.generatedOutput) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ session: log });
  } catch (e) {
    console.error('GET /api/share/[token] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
