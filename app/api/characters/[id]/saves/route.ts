// app/api/characters/[id]/saves/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ABILITY_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
type AbilityKey = (typeof ABILITY_KEYS)[number];

async function ensureOwner(characterId: string, userId: string) {
  const c = await prisma.character.findFirst({
    where: { id: characterId, ownerId: userId },
    select: { id: true },
  });
  return !!c;
}

/**
 * GET /api/characters/[id]/saves
 * Returns { saves: { STR: bool, DEX: bool, ... } }
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
    const rows = await prisma.characterSave.findMany({
      where: { characterId: context.params.id },
      select: { abilityKey: true, proficient: true },
    });

    const stored = Object.fromEntries(rows.map((r) => [r.abilityKey, r.proficient]));
    const saves = Object.fromEntries(
      ABILITY_KEYS.map((k) => [k, stored[k] ?? false])
    ) as Record<AbilityKey, boolean>;

    return NextResponse.json({ saves }, { status: 200 });
  } catch (e) {
    console.error('GET /saves error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * PUT /api/characters/[id]/saves
 * Body: { saves: { STR?: bool, DEX?: bool, ... } }
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
    const incoming = body?.saves ?? {};

    const upserts = (Object.entries(incoming) as [string, unknown][])
      .filter(([k]) => (ABILITY_KEYS as readonly string[]).includes(k))
      .map(([k, v]) =>
        prisma.characterSave.upsert({
          where: { characterId_abilityKey: { characterId: context.params.id, abilityKey: k } },
          update: { proficient: Boolean(v) },
          create: { characterId: context.params.id, abilityKey: k, proficient: Boolean(v) },
        })
      );

    if (upserts.length === 0) {
      return NextResponse.json({ error: 'no_valid_keys' }, { status: 400 });
    }

    await prisma.$transaction(upserts);

    const rows = await prisma.characterSave.findMany({
      where: { characterId: context.params.id },
      select: { abilityKey: true, proficient: true },
    });
    const stored = Object.fromEntries(rows.map((r) => [r.abilityKey, r.proficient]));
    const saves = Object.fromEntries(
      ABILITY_KEYS.map((k) => [k, stored[k] ?? false])
    );

    return NextResponse.json({ saves }, { status: 200 });
  } catch (e) {
    console.error('PUT /saves error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
