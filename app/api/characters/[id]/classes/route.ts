// app/api/characters/[id]/classes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function ensureOwner(characterId: string, userId: string) {
  const c = await prisma.character.findFirst({
    where: { id: characterId, ownerId: userId },
    select: { id: true },
  });
  return !!c;
}

function clampInt(n: unknown, min: number, max: number, def: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

const VALID_HIT_DICE = [6, 8, 10, 12];

/**
 * GET /api/characters/[id]/classes
 * Returns { classes: [...] }
 */
export async function GET(
  _req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await ensureOwner(context.params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const classes = await prisma.characterClass.findMany({
      where: { characterId: context.params.id },
      select: { id: true, classKey: true, subclassKey: true, subclassNotes: true, level: true, hitDie: true, hpMethod: true },
      orderBy: { id: 'asc' },
    });
    return NextResponse.json({ classes }, { status: 200 });
  } catch (e) {
    console.error('GET /classes error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * PUT /api/characters/[id]/classes
 * Full replace — body: { classes: [{ classKey, subclassKey?, level, hitDie }] }
 * Deletes all existing rows and inserts fresh ones in a transaction.
 */
export async function PUT(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await ensureOwner(context.params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const incoming = Array.isArray(body?.classes) ? body.classes : [];

    if (incoming.length === 0) {
      return NextResponse.json({ error: 'classes_required' }, { status: 400 });
    }

    const validated = incoming
      .map((c: any) => ({
        classKey:      String(c.classKey ?? '').trim().slice(0, 60),
        subclassKey:   c.subclassKey ? String(c.subclassKey).trim().slice(0, 60) : null,
        subclassNotes: c.subclassNotes ? String(c.subclassNotes).trim().slice(0, 10000) : null,
        level:         clampInt(c.level, 1, 20, 1),
        hitDie:        VALID_HIT_DICE.includes(Number(c.hitDie)) ? Number(c.hitDie) : 8,
      }))
      .filter((c: any) => c.classKey.length > 0);

    if (validated.length === 0) {
      return NextResponse.json({ error: 'no_valid_classes' }, { status: 400 });
    }

    const [, classes] = await prisma.$transaction([
      prisma.characterClass.deleteMany({ where: { characterId: context.params.id } }),
      prisma.characterClass.createManyAndReturn({
        data: validated.map((c: any) => ({ ...c, characterId: context.params.id })),
        select: { id: true, classKey: true, subclassKey: true, subclassNotes: true, level: true, hitDie: true, hpMethod: true },
      }),
    ]);

    return NextResponse.json({ classes }, { status: 200 });
  } catch (e) {
    console.error('PUT /classes error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
