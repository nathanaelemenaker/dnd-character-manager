import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { getSession, hasRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const COMFYUI_URL = process.env.COMFYUI_URL ?? 'http://192.168.128.95:8188';
const IMAGE_DIR = () => path.join(process.cwd(), 'public', 'uploads', 'session-images');

interface GeneratedOutput {
  summary?: string;
  epicMoment?: string;
  sessionTitle?: string;
}

async function buildImagePrompt(
  recap: GeneratedOutput,
  characters: Array<{ name: string; appearance: string }>,
): Promise<string> {
  // Claude writes only the scene — action, location, mood, composition.
  // Character appearances are appended verbatim so no details get lost in summarization.
  const characterNames = characters.map(c => c.name);
  const nameList = characterNames.length > 0 ? characterNames.join(', ') : 'the party';

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are writing the scene and composition portion of an AI image generation prompt for a D&D fantasy illustration.

Session recap:
${recap.epicMoment ?? recap.summary ?? ''}

Characters in this scene: ${nameList}

Write 3-4 sentences covering:
1. What is happening in the most visually striking moment and the setting/location/mood
2. Where each character (${nameList}) is positioned in the frame, their pose, and what action they are performing

Do NOT describe character appearances (clothing, hair, skin, etc.) — those will be appended separately. Medieval fantasy only — no modern elements. No explanation or preamble, output only the scene and composition sentences.`,
    }],
  });

  const sceneText = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

  // Append character appearances verbatim after the scene — no summarization
  const charLines = characters.length > 0
    ? 'Character appearances: ' + characters.map(c => `${c.name} — ${c.appearance}`).join('; ')
    : '';

  const parts = [sceneText, charLines, 'Epic fantasy digital painting, D&D 5e sourcebook illustration style, cinematic lighting, highly detailed.'].filter(Boolean);
  return parts.join(' ');
}

async function enqueueFlux2(prompt: string): Promise<string> {
  const workflow = {
    "1": { class_type: "UNETLoader", inputs: { unet_name: "flux2_dev_fp8mixed.safetensors", weight_dtype: "default" } },
    "2": { class_type: "CLIPLoader", inputs: { clip_name: "mistral_3_small_flux2_bf16.safetensors", type: "flux2" } },
    "3": { class_type: "VAELoader", inputs: { vae_name: "flux2-vae.safetensors" } },
    "5": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: prompt } },
    "6": { class_type: "CLIPTextEncode", inputs: { clip: ["2", 0], text: "blurry, low quality, bad anatomy, text, watermark, modern clothing, suit, tie, contemporary, sci-fi, ugly, poorly drawn" } },
    "7": { class_type: "EmptyLatentImage", inputs: { width: 1024, height: 768, batch_size: 1 } },
    "8": { class_type: "KSampler", inputs: { model: ["1", 0], positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0], seed: Math.floor(Math.random() * 2 ** 32), steps: 20, cfg: 1, sampler_name: "euler", scheduler: "simple", denoise: 1 } },
    "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
    "10": { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: "dnd_session" } },
  };

  const res = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ComfyUI enqueue failed: ${res.status}`);
  const data = await res.json();
  return data.prompt_id as string;
}

async function pollUntilDone(promptId: string, timeoutMs = 240_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await fetch(`${COMFYUI_URL}/history/${promptId}`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) continue;
    const history = await res.json();
    const entry = history[promptId];
    if (!entry) continue;
    if (entry.status?.completed) {
      const outputs = entry.outputs ?? {};
      for (const node of Object.values(outputs) as any[]) {
        if (node.images?.length) return node.images[0].filename as string;
      }
      throw new Error('Job completed but no image output found');
    }
    if (entry.status?.status_str === 'error') throw new Error('ComfyUI job failed');
  }
  throw new Error('ComfyUI timed out after 4 minutes');
}

async function fetchAndSaveImage(filename: string, sessionId: string): Promise<string> {
  const res = await fetch(`${COMFYUI_URL}/view?filename=${encodeURIComponent(filename)}&type=output`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Failed to fetch image from ComfyUI: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const dir = IMAGE_DIR();
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const outFilename = `${sessionId}-${Date.now()}.png`;
  await writeFile(path.join(dir, outFilename), buffer);
  return `/api/session-images/${outFilename}`;
}

async function loadPromptData(campaignId: string, sessionId: string) {
  const sessionLog = await prisma.sessionLog.findUnique({
    where: { id: sessionId, campaignId },
    select: { generatedOutput: true, attendees: true },
  });
  if (!sessionLog?.generatedOutput) return null;

  const attendeeIds = (sessionLog.attendees as string[] | null) ?? [];
  const members = await prisma.campaignMember.findMany({
    where: { id: { in: attendeeIds }, campaignId },
    select: {
      guestCharacterName: true,
      guestCharacterAppearance: true,
      character: { select: { name: true, appearance: true } },
    },
  });

  const characters = members
    .map(m => {
      const name = m.character?.name ?? m.guestCharacterName;
      const appearance = m.character?.appearance ?? m.guestCharacterAppearance;
      return name && appearance ? { name, appearance } : null;
    })
    .filter((x): x is { name: string; appearance: string } => x !== null);

  return { recap: sessionLog.generatedOutput as GeneratedOutput, characters };
}

async function authCheck(campaignId: string, userId: string, role: string) {
  if (hasRole(role, 'ADMIN')) return true;
  const membership = await prisma.campaignMember.findUnique({
    where: { campaignId_userId: { campaignId, userId } },
  });
  return membership?.role === 'DM';
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    if (!await authCheck(params.id, session.userId, session.role)) {
      return NextResponse.json({ error: 'forbidden — DM only' }, { status: 403 });
    }

    const data = await loadPromptData(params.id, params.sessionId);
    if (!data) return NextResponse.json({ error: 'no_recap — generate session log first' }, { status: 400 });

    const prompt = await buildImagePrompt(data.recap, data.characters);
    return NextResponse.json({ prompt });
  } catch (err: any) {
    console.error('GET /generate-image error:', err);
    return NextResponse.json({ error: 'failed to build prompt', message: err?.message }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; sessionId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    if (!await authCheck(params.id, session.userId, session.role)) {
      return NextResponse.json({ error: 'forbidden — DM only' }, { status: 403 });
    }

    const data = await loadPromptData(params.id, params.sessionId);
    if (!data) return NextResponse.json({ error: 'no_recap — generate session log first' }, { status: 400 });

    // Build prompt via Claude
    const imagePrompt = await buildImagePrompt(data.recap, data.characters);

    // Enqueue in ComfyUI and wait
    const promptId = await enqueueFlux2(imagePrompt);
    const filename = await pollUntilDone(promptId);
    const imagePath = await fetchAndSaveImage(filename, params.sessionId);

    // Save to session
    const existing = await prisma.sessionLog.findUnique({
      where: { id: params.sessionId },
      select: { sessionImages: true },
    });
    const images = (existing?.sessionImages as any[] | null) ?? [];
    images.unshift({ url: imagePath, prompt: imagePrompt, generatedAt: new Date().toISOString() });

    await prisma.sessionLog.update({
      where: { id: params.sessionId },
      data: { sessionImages: images },
    });

    return NextResponse.json({ url: imagePath, prompt: imagePrompt });
  } catch (err: any) {
    console.error('POST /generate-image error:', err);
    const msg = err?.message ?? 'unknown error';
    const isComfyDown = msg.includes('fetch failed') || msg.includes('ECONNREFUSED');
    return NextResponse.json(
      { error: isComfyDown ? 'comfyui_offline' : 'generation_failed', message: msg },
      { status: isComfyDown ? 503 : 500 },
    );
  }
}
