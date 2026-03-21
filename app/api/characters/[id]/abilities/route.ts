// app/api/characters/[id]/abilities/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
type AbilityKey = (typeof ABILITIES)[number];

type AbilityMap = Record<AbilityKey, number>;

function baseDefault(): AbilityMap {
  return { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
}

function clampScore(n: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return 10;
  return Math.max(1, Math.min(30, v));
}

function mod(score: number) {
  return Math.floor((score - 10) / 2);
}

async function ensureOwner(characterId: string, userId: string) {
  const exists = await prisma.character.findFirst({
    where: { id: characterId, ownerId: userId },
    select: { id: true },
  });
  return !!exists;
}

/**
 * GET /api/characters/[id]/abilities
 * Returns { abilities: {STR..CHA}, modifiers: {STR..CHA} }
 * Reads from AbilityScores (single row per character). Defaults to 10s if not present yet.
 */
export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const characterId = context.params.id;

  // Owner check
  const ok = await ensureOwner(characterId, session.userId);
  if (!ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    const row = await prisma.abilityScores.findUnique({
      where: { characterId },
      select: {
        str: true,
        dex: true,
        con: true,
        intScore: true, // mapped to "int" in DB
        wisScore: true, // mapped to "wis" in DB
        chaScore: true, // mapped to "cha" in DB
      },
    });

    const abilities: AbilityMap = row
      ? {
          STR: clampScore(row.str),
          DEX: clampScore(row.dex),
          CON: clampScore(row.con),
          INT: clampScore(row.intScore),
          WIS: clampScore(row.wisScore),
          CHA: clampScore(row.chaScore),
        }
      : baseDefault();

    const modifiers = {
      STR: mod(abilities.STR),
      DEX: mod(abilities.DEX),
      CON: mod(abilities.CON),
      INT: mod(abilities.INT),
      WIS: mod(abilities.WIS),
      CHA: mod(abilities.CHA),
    };

    return NextResponse.json({ abilities, modifiers }, { status: 200 });
  } catch (e) {
    console.error('GET /abilities error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * PUT /api/characters/[id]/abilities
 * Body: { abilities?: { STR?: number, DEX?: number, ... } }
 * Writes to AbilityScores via upsert on unique characterId.
 */
export async function PUT(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const characterId = context.params.id;

  // Owner check
  const ok = await ensureOwner(characterId, session.userId);
  if (!ok) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    const body = await request.json().catch(() => ({} as any));
    const incoming = (body?.abilities ?? {}) as Partial<Record<AbilityKey, number>>;

    const keys = (Object.keys(incoming) as AbilityKey[]).filter((k) => ABILITIES.includes(k));
    if (keys.length === 0) {
      return NextResponse.json({ error: 'no_fields' }, { status: 400 });
    }

    // Map incoming to AbilityScores fields
    const updates: Partial<{
      str: number;
      dex: number;
      con: number;
      intScore: number;
      wisScore: number;
      chaScore: number;
    }> = {};

    if (incoming.STR !== undefined) updates.str = clampScore(incoming.STR);
    if (incoming.DEX !== undefined) updates.dex = clampScore(incoming.DEX);
    if (incoming.CON !== undefined) updates.con = clampScore(incoming.CON);
    if (incoming.INT !== undefined) updates.intScore = clampScore(incoming.INT);
    if (incoming.WIS !== undefined) updates.wisScore = clampScore(incoming.WIS);
    if (incoming.CHA !== undefined) updates.chaScore = clampScore(incoming.CHA);

    // Create values (defaults to 10 if unspecified)
    const createData = {
      characterId,
      str: updates.str ?? 10,
      dex: updates.dex ?? 10,
      con: updates.con ?? 10,
      intScore: updates.intScore ?? 10,
      wisScore: updates.wisScore ?? 10,
      chaScore: updates.chaScore ?? 10,
    };

    const saved = await prisma.abilityScores.upsert({
      where: { characterId },
      update: updates,
      create: createData,
      select: {
        str: true,
        dex: true,
        con: true,
        intScore: true,
        wisScore: true,
        chaScore: true,
      },
    });

    const abilities: AbilityMap = {
      STR: clampScore(saved.str),
      DEX: clampScore(saved.dex),
      CON: clampScore(saved.con),
      INT: clampScore(saved.intScore),
      WIS: clampScore(saved.wisScore),
      CHA: clampScore(saved.chaScore),
    };

    const modifiers = {
      STR: mod(abilities.STR),
      DEX: mod(abilities.DEX),
      CON: mod(abilities.CON),
      INT: mod(abilities.INT),
      WIS: mod(abilities.WIS),
      CHA: mod(abilities.CHA),
    };

    return NextResponse.json({ abilities, modifiers }, { status: 200 });
  } catch (e) {
    console.error('PUT /abilities error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
