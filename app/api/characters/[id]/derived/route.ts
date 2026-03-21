// app/api/characters/[id]/derived/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function mod(score: number) {
  return Math.floor((score - 10) / 2);
}

export async function GET(_req: NextRequest, context: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const characterId = context.params.id;

  // Owner check
  const owner = await prisma.character.findFirst({
    where: { id: characterId, ownerId: session.userId },
    select: { id: true },
  });
  if (!owner) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Abilities
  const ab = await prisma.abilityScores.findUnique({
    where: { characterId },
    select: { str: true, dex: true, con: true, intScore: true, wisScore: true, chaScore: true },
  });
  const dexScore = ab?.dex ?? 10;
  const dexMod = mod(dexScore);

  // Equipped items
  const equipped = await prisma.inventoryItem.findMany({
    where: { characterId, equipped: true },
    include: {
      itemDef: { select: { id: true, type: true, weight: true, modifiers: true, requiresAttunement: true } },
    },
  });

  // Ignore modifiers of items that require attunement but aren't attuned
  const active = equipped.filter(it => it.itemDef && (!it.itemDef.requiresAttunement || it.attuned));

  let ac = 10 + dexMod; // base
  let shieldBonus = 0;
  let extraAcBonus = 0;

  for (const it of active) {
    const m = (it.itemDef.modifiers ?? {}) as any;

    // Armor: acBase + min(Dex, maxDex) + acBonus
    if (typeof m.acBase === 'number') {
      const maxDex = typeof m.maxDex === 'number' ? m.maxDex : 10;
      const dexPart = Math.min(dexMod, maxDex);
      const candidate = Math.floor(m.acBase + dexPart + (m.acBonus ?? 0));
      if (candidate > ac) ac = candidate;
    }

    // Shields
    if (typeof m.shieldBonus === 'number') {
      shieldBonus = Math.max(shieldBonus, Math.floor(m.shieldBonus));
    }

    // Other flat AC bonuses
    if (typeof m.acBonus === 'number' && m.acBase === undefined) {
      extraAcBonus += Math.floor(m.acBonus);
    }
  }

  const equippedWeight = equipped.reduce((sum, it) => sum + (it.itemDef.weight ?? 0) * it.quantity, 0);

  return NextResponse.json({
    abilityScores: {
      STR: ab?.str ?? 10,
      DEX: dexScore,
      CON: ab?.con ?? 10,
      INT: ab?.intScore ?? 10,
      WIS: ab?.wisScore ?? 10,
      CHA: ab?.chaScore ?? 10,
      dexMod,
    },
    equipment: {
      equippedCount: equipped.length,
      equippedWeight,
    },
    defense: {
      armorAC: ac,
      shieldBonus,
      extraAcBonus,
      totalAC: ac + shieldBonus + extraAcBonus,
    },
  }, { status: 200 });
}