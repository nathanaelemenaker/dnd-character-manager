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

async function getAudioDuration(filePath: string): Promise<number> {
  try {
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const { stdout } = await promisify(execFile)('ffprobe', [
      '-v', 'quiet', '-print_format', 'json', '-show_streams', filePath,
    ]);
    const duration = parseFloat(JSON.parse(stdout).streams?.[0]?.duration ?? '0');
    return isNaN(duration) ? 0 : duration;
  } catch {
    return 0;
  }
}

async function transcribeChunk(filePath: string, whisperUrl: string, model: string): Promise<string> {
  const { readFile } = await import('fs/promises');
  const audioBuffer = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), path.basename(filePath));
  form.append('model', model);
  form.append('response_format', 'json');
  form.append('language', 'en');

  const res = await fetch(`${whisperUrl}/v1/audio/transcriptions`, { method: 'POST', body: form });
  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Whisper returned ${res.status}: ${errText.slice(0, 200)}`);
  }
  return ((await res.json()).text ?? '').trim();
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
    const model = process.env.WHISPER_MODEL ?? 'small';

    const duration = await getAudioDuration(filePath);
    const parts: string[] = [];

    if (duration > CHUNK_SECONDS) {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      await mkdir(chunkDir, { recursive: true });
      await promisify(execFile)('ffmpeg', [
        '-i', filePath,
        '-f', 'segment', '-segment_time', String(CHUNK_SECONDS),
        '-reset_timestamps', '1', '-c', 'copy',
        path.join(chunkDir, 'chunk_%03d.webm'), '-y',
      ]);
      chunkFiles = (await readdir(chunkDir))
        .filter(f => f.startsWith('chunk_') && f.endsWith('.webm'))
        .sort()
        .map(f => path.join(chunkDir, f));

      for (const chunk of chunkFiles) {
        parts.push(await transcribeChunk(chunk, whisperUrl, model));
      }
    } else {
      parts.push(await transcribeChunk(filePath, whisperUrl, model));
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
