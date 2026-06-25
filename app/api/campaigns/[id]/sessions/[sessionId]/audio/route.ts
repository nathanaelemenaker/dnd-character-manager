import { NextRequest } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import { Readable } from 'stream';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Streams the session's recorded audio (webm) with HTTP Range support so the
// browser <audio> element can seek/scrub.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });

  const isAdmin = hasRole(session.role, 'ADMIN');
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId: params.id, userId: session.userId } },
  });
  if (!isAdmin && !membership) return new Response('forbidden', { status: 403 });

  const log = await prisma.sessionLog.findUnique({
    where: { id: params.sessionId, campaignId: params.id },
    select: { audioPath: true },
  });
  if (!log?.audioPath || !existsSync(log.audioPath)) {
    return new Response('no_audio', { status: 404 });
  }

  const filePath = log.audioPath;
  const fileSize = statSync(filePath).size;
  const range = req.headers.get('range');

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'audio/webm',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
  };

  if (!range) {
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: { ...baseHeaders, 'Content-Length': String(fileSize) },
    });
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = match && match[1] ? parseInt(match[1], 10) : 0;
  let end = match && match[2] ? parseInt(match[2], 10) : fileSize - 1;

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
    return new Response('range_not_satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    });
  }
  end = Math.min(end, fileSize - 1);

  const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
  return new Response(stream, {
    status: 206,
    headers: {
      ...baseHeaders,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': String(end - start + 1),
    },
  });
}
