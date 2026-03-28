// app/api/characters/[id]/portrait/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

export const dynamic = 'force-dynamic';

const PORTRAITS_DIR = path.join(process.cwd(), 'public', 'uploads', 'portraits');
const MAX_DIMENSION = 400; // px — max width or height after resize
const MAX_BYTES = 5 * 1024 * 1024; // 5MB input limit

type Params = { params: { id: string } };

async function ensureDir() {
  if (!existsSync(PORTRAITS_DIR)) {
    await mkdir(PORTRAITS_DIR, { recursive: true });
  }
}

async function getCharacter(characterId: string, userId: string) {
  return prisma.character.findFirst({
    where: { id: characterId, ownerId: userId },
    select: { id: true, portrait: true },
  });
}

// POST /api/characters/[id]/portrait — upload portrait
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const character = await getCharacter(params.id, session.userId);
  if (!character) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: 'invalid_form' }, { status: 400 });

  const file = formData.get('portrait') as File | null;
  if (!file) return NextResponse.json({ error: 'no_file' }, { status: 400 });

  // Validate type
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'invalid_file_type' }, { status: 400 });
  }

  // Validate size
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file_too_large' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Resize with sharp — preserve aspect ratio, max 400px on longest side
  const resized = await sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  await ensureDir();

  const filename = `${character.id}.webp`;
  const filepath = path.join(PORTRAITS_DIR, filename);

  await writeFile(filepath, resized);

  const portraitUrl = `/api/portraits/${filename}`;

  await prisma.character.update({
    where: { id: character.id },
    data: { portrait: portraitUrl },
  });

  return NextResponse.json({ ok: true, portrait: portraitUrl });
}

// DELETE /api/characters/[id]/portrait — remove portrait
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const character = await getCharacter(params.id, session.userId);
  if (!character) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Delete file if it exists
  if (character.portrait) {
    const filename = path.basename(character.portrait);
    const filepath = path.join(PORTRAITS_DIR, filename);
    if (existsSync(filepath)) {
      await unlink(filepath).catch(() => {});
    }
  }

  await prisma.character.update({
    where: { id: character.id },
    data: { portrait: null },
  });

  return NextResponse.json({ ok: true });
}
