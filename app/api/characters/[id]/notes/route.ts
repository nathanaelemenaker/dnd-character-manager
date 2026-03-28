// app/api/characters/[id]/notes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

async function ensureOwner(characterId: string, userId: string) {
  const c = await prisma.character.findFirst({
    where: { id: characterId, ownerId: userId },
    select: { id: true },
  });
  return !!c;
}

// GET /api/characters/[id]/notes
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await ensureOwner(params.id, session.userId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const notes = await prisma.characterNote.findMany({
    where: { characterId: params.id },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, body: true, sortOrder: true, updatedAt: true },
  });

  return NextResponse.json({ notes });
}

// POST /api/characters/[id]/notes
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await ensureOwner(params.id, session.userId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({} as any));
  const title = String(body?.title ?? 'Untitled').slice(0, 200);
  const noteBody = String(body?.body ?? '');

  // Place new note at end
  const last = await prisma.characterNote.findFirst({
    where: { characterId: params.id },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? 0) + 1;

  const note = await prisma.characterNote.create({
    data: { characterId: params.id, title, body: noteBody, sortOrder },
    select: { id: true, title: true, body: true, sortOrder: true, updatedAt: true },
  });

  return NextResponse.json(note, { status: 201 });
}
