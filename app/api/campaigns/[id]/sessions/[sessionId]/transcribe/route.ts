import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, readdir, unlink, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const AUDIO_DIR = '/opt/dnd-sheet/audio';
const CHUNK_SECONDS = 600; // split files longer than 10 minutes

// Browser-recorded webm files often have no duration metadata, so we always
// chunk rather than checking duration first.
async function splitIntoChunks(filePath: string, chunkDir: string): Promise<string[]> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  await mkdir(chunkDir, { recursive: true });
  await promisify(execFile)('ffmpeg', [
    '-i', filePath,
    '-f', 'segment', '-segment_time', String(CHUNK_SECONDS),
    '-reset_timestamps', '1', '-c', 'copy',
    path.join(chunkDir, 'chunk_%03d.webm'), '-y',
  ]);
  const files = await readdir(chunkDir);
  return files
    .filter(f => f.startsWith('chunk_') && f.endsWith('.webm'))
    .sort()
    .map(f => path.join(chunkDir, f));
}

async function transcribeChunk(filePath: string, whisperUrl: string, model: string): Promise<string> {
  const { readFile } = await import('fs/promises');
  const http = await import('node:http');

  const audioBuffer = await readFile(filePath);
  const boundary = `----WhisperBoundary${Date.now()}`;

  // Build multipart/form-data body manually — avoids fetch/undici timeout issues
  const CRLF = '\r\n';
  const preamble = Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"${CRLF}Content-Type: audio/webm${CRLF}${CRLF}`
  );
  const middle = Buffer.from(
    `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="model"${CRLF}${CRLF}${model}` +
    `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="response_format"${CRLF}${CRLF}json` +
    `${CRLF}--${boundary}${CRLF}Content-Disposition: form-data; name="language"${CRLF}${CRLF}en` +
    `${CRLF}--${boundary}--${CRLF}`
  );
  const body = Buffer.concat([preamble, audioBuffer, middle]);

  const url = new URL(`${whisperUrl}/v1/audio/transcriptions`);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: parseInt(url.port || '80'),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          reject(new Error(`Whisper returned ${res.statusCode}: ${text.slice(0, 200)}`));
          return;
        }
        try {
          resolve((JSON.parse(text).text ?? '').trim());
        } catch {
          reject(new Error(`Invalid JSON from Whisper: ${text.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runTranscription(sessionId: string, filePath: string) {
  const chunkDir = path.join(AUDIO_DIR, `chunks_${sessionId}`);
  let chunkFiles: string[] = [];

  try {
    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: { transcriptStatus: 'processing' },
    });

    const whisperUrl = process.env.WHISPER_API_URL ?? 'http://whisper:8000';
    const model = process.env.WHISPER_MODEL ?? 'medium';

    // Always chunk — browser webm files often have no duration metadata so
    // we can't reliably check length upfront. Short files produce 1 chunk.
    chunkFiles = await splitIntoChunks(filePath, chunkDir);
    const parts: string[] = [];
    for (const chunk of chunkFiles) {
      parts.push(await transcribeChunk(chunk, whisperUrl, model));
    }

    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: {
        transcriptStatus: 'done',
        rawTranscript: parts.join(' ').trim(),
        transcriptError: null,
        audioPath: null,
      },
    });

    await unlink(filePath).catch(() => {});
  } catch (err: any) {
    console.error(`Transcription failed for session ${sessionId}:`, err);
    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: { transcriptStatus: 'error', transcriptError: err?.message ?? 'Unknown error' },
    }).catch(console.error);
  } finally {
    if (chunkFiles.length > 0) {
      await Promise.all(chunkFiles.map(f => unlink(f).catch(() => {})));
      await rm(chunkDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

export async function POST(
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

    const sessionLog = await prisma.sessionLog.findUnique({
      where: { id: params.sessionId, campaignId: params.id },
    });
    if (!sessionLog) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    // Reject if already processing
    if (sessionLog.transcriptStatus === 'pending' || sessionLog.transcriptStatus === 'processing') {
      return NextResponse.json({ error: 'already_in_progress', status: sessionLog.transcriptStatus }, { status: 409 });
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    if (!audioFile) return NextResponse.json({ error: 'audio file required' }, { status: 400 });

    // Save audio to disk
    if (!existsSync(AUDIO_DIR)) {
      await mkdir(AUDIO_DIR, { recursive: true });
    }

    const filePath = path.join(AUDIO_DIR, `${params.sessionId}.webm`);
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    await writeFile(filePath, audioBuffer);

    // Mark as pending immediately
    await prisma.sessionLog.update({
      where: { id: params.sessionId },
      data: { transcriptStatus: 'pending', audioPath: filePath, transcriptError: null },
    });

    // Fire and forget — runs in background while response is returned
    // Safe in a persistent Docker container (not serverless)
    runTranscription(params.sessionId, filePath);

    return NextResponse.json({ status: 'pending' });
  } catch (e) {
    console.error('POST /transcribe error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// Re-trigger transcription from existing audioPath on disk (no upload required)
export async function PUT(
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

    const sessionLog = await prisma.sessionLog.findUnique({
      where: { id: params.sessionId, campaignId: params.id },
    });
    if (!sessionLog) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!sessionLog.audioPath) return NextResponse.json({ error: 'no_audio_file' }, { status: 400 });
    if (!existsSync(sessionLog.audioPath)) return NextResponse.json({ error: 'audio_file_missing' }, { status: 404 });

    if (sessionLog.transcriptStatus === 'pending' || sessionLog.transcriptStatus === 'processing') {
      return NextResponse.json({ error: 'already_in_progress' }, { status: 409 });
    }

    await prisma.sessionLog.update({
      where: { id: params.sessionId },
      data: { transcriptStatus: 'pending', transcriptError: null },
    });

    runTranscription(params.sessionId, sessionLog.audioPath);

    return NextResponse.json({ status: 'pending' });
  } catch (e) {
    console.error('PUT /transcribe error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// Allow re-triggering a failed transcription
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const sessionLog = await prisma.sessionLog.findUnique({
      where: { id: params.sessionId, campaignId: params.id },
    });
    if (!sessionLog) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (sessionLog.audioPath) {
      await unlink(sessionLog.audioPath).catch(() => {});
    }

    await prisma.sessionLog.update({
      where: { id: params.sessionId },
      data: { transcriptStatus: null, transcriptError: null, audioPath: null },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /transcribe error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
