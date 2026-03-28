// app/api/characters/[id]/notes/[noteId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string; noteId: string } };

async function ensureNoteOwner(noteId: string, characterId: string, userId: string) {
  const note = await prisma.characterNote.findFirst({
    where: { id: noteId, characterId, character: { ownerId: userId } },
    select: { id: true },
  });
  return !!note;
}

// PATCH /api/characters/[id]/notes/[noteId]
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await ensureNoteOwner(params.noteId, params.id, session.userId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({} as any));
  const data: Record<string, unknown> = {};

  if (typeof body.title === 'string') data.title = body.title.slice(0, 200);
  if (typeof body.body === 'string') data.body = body.body;
  if (typeof body.sortOrder === 'number') data.sortOrder = body.sortOrder;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'no_fields' }, { status: 400 });
  }

  const note = await prisma.characterNote.update({
    where: { id: params.noteId },
    data,
    select: { id: true, title: true, body: true, sortOrder: true, updatedAt: true },
  });

  return NextResponse.json(note);
}

// DELETE /api/characters/[id]/notes/[noteId]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await ensureNoteOwner(params.noteId, params.id, session.userId))) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  await prisma.characterNote.delete({ where: { id: params.noteId } });
  return new NextResponse(null, { status: 204 });
}
