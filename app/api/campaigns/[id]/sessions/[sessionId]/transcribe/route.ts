import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const AUDIO_DIR = '/opt/dnd-sheet/audio';

async function runTranscription(sessionId: string, filePath: string) {
  try {
    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: { transcriptStatus: 'processing' },
    });

    const whisperUrl = process.env.WHISPER_API_URL ?? 'http://whisper:8000';
    const model = process.env.WHISPER_MODEL ?? 'tiny';

    const { readFile } = await import('fs/promises');
    const audioBuffer = await readFile(filePath);
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });

    const form = new FormData();
    form.append('file', audioBlob, 'audio.webm');
    form.append('model', model);
    form.append('response_format', 'json');
    form.append('language', 'en');

    const res = await fetch(`${whisperUrl}/v1/audio/transcriptions`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      throw new Error(`Whisper returned ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    const transcript = (data.text ?? '').trim();

    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: {
        transcriptStatus: 'done',
        rawTranscript: transcript,
        transcriptError: null,
        audioPath: null,
      },
    });

    // Clean up audio file after successful transcription
    await unlink(filePath).catch(() => {});
  } catch (err: any) {
    console.error(`Transcription failed for session ${sessionId}:`, err);
    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: {
        transcriptStatus: 'error',
        transcriptError: err?.message ?? 'Unknown error',
      },
    }).catch(console.error);
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
