import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';
import { renderLabeledTranscript, type DiarizedSegment } from '@/lib/transcript';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const AUDIO_DIR = '/opt/dnd-sheet/audio';

// Transcode to 16 kHz mono WAV — fixes browser webm missing-duration metadata
// and produces a file the WhisperX aligner handles reliably.
async function transcodeToWav(inputPath: string, outputPath: string): Promise<void> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  await promisify(execFile)('ffmpeg', [
    '-i', inputPath,
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
    outputPath, '-y',
  ]);
}

async function callDiarize(
  wavPath: string,
  whisperUrl: string,
  maxSpeakers?: number,
): Promise<DiarizedSegment[]> {
  const http = await import('node:http');
  const url = new URL(`${whisperUrl}/diarize`);
  const body = Buffer.from(JSON.stringify({
    path: wavPath,
    language: 'en',
    ...(maxSpeakers ? { max_speakers: maxSpeakers } : {}),
  }));

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: parseInt(url.port || '80'),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length,
      },
      // No timeout — diarizing a long session can take hours on CPU
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode !== 200) {
          reject(new Error(`WhisperX returned ${res.statusCode}: ${text.slice(0, 300)}`));
          return;
        }
        try {
          const data = JSON.parse(text);
          resolve(data.segments ?? []);
        } catch {
          reject(new Error(`Invalid JSON from WhisperX: ${text.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function runTranscription(sessionId: string, campaignId: string, webmPath: string) {
  const wavPath = webmPath.replace(/\.webm$/, '.wav');

  try {
    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: { transcriptStatus: 'processing' },
    });

    // Count campaign members to hint pyannote's speaker count
    const memberCount = await prisma.campaignMember.count({ where: { campaignId } });

    const whisperUrl = process.env.WHISPER_API_URL ?? 'http://whisper:8000';

    await transcodeToWav(webmPath, wavPath);

    // The WhisperX container shares the /audio NAS mount; pass it the internal path
    const containerWavPath = '/audio/' + path.basename(wavPath);
    const segments = await callDiarize(containerWavPath, whisperUrl, memberCount || undefined);

    const rawTranscript = renderLabeledTranscript(segments, {});

    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: {
        transcriptStatus: 'done',
        rawTranscript,
        diarizedSegments: segments as any,
        speakerMap: {},
        transcriptError: null,
        audioPath: null,
      },
    });

    await unlink(webmPath).catch(() => {});
    await unlink(wavPath).catch(() => {});
  } catch (err: any) {
    console.error(`Transcription failed for session ${sessionId}:`, err);
    await prisma.sessionLog.update({
      where: { id: sessionId },
      data: { transcriptStatus: 'error', transcriptError: err?.message ?? 'Unknown error' },
    }).catch(console.error);
    await unlink(wavPath).catch(() => {});
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

    if (sessionLog.transcriptStatus === 'pending' || sessionLog.transcriptStatus === 'processing') {
      return NextResponse.json({ error: 'already_in_progress', status: sessionLog.transcriptStatus }, { status: 409 });
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    if (!audioFile) return NextResponse.json({ error: 'audio file required' }, { status: 400 });

    if (!existsSync(AUDIO_DIR)) {
      await mkdir(AUDIO_DIR, { recursive: true });
    }

    const webmPath = path.join(AUDIO_DIR, `${params.sessionId}.webm`);
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    await writeFile(webmPath, audioBuffer);

    await prisma.sessionLog.update({
      where: { id: params.sessionId },
      data: { transcriptStatus: 'pending', audioPath: webmPath, transcriptError: null },
    });

    runTranscription(params.sessionId, params.id, webmPath);

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

    runTranscription(params.sessionId, params.id, sessionLog.audioPath);

    return NextResponse.json({ status: 'pending' });
  } catch (e) {
    console.error('PUT /transcribe error', e);
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
    const sessionLog = await prisma.sessionLog.findUnique({
      where: { id: params.sessionId, campaignId: params.id },
    });
    if (!sessionLog) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    if (sessionLog.audioPath) {
      await unlink(sessionLog.audioPath).catch(() => {});
      await unlink(sessionLog.audioPath.replace(/\.webm$/, '.wav')).catch(() => {});
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
