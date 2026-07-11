// app/api/characters/[id]/inventory/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function clampInt(n: unknown, min: number, max: number, def: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

async function getOwnedCharacter(characterId: string, ownerId: string) {
  return prisma.character.findFirst({
    where: { id: characterId, ownerId },
    select: { id: true, ruleset: true },
  });
}

function inferKeyAbilities(itemName: string, desc: string | null): string | null {
  const abilities: string[] = [];
  const n = itemName.toLowerCase();

  if (desc) {
    const spellAtk = desc.match(/\+(\d+)\s+bonus\s+to\s+spell attack/i);
    if (spellAtk) abilities.push(`+${spellAtk[1]} spell attack rolls`);

    const atkDmg = desc.match(/\+(\d+)\s+bonus\s+to\s+(?:attack and damage|attack (?:and|&) damage)/i);
    if (atkDmg) abilities.push(`+${atkDmg[1]} attack & damage rolls`);

    const acMatch = desc.match(/\+(\d+)\s+(?:bonus\s+to\s+)?(?:armor class|AC\b)/i);
    if (acMatch) abilities.push(`+${acMatch[1]} AC`);

    const saves = desc.match(/\+(\d+)\s+(?:bonus\s+to\s+)?saving throws?/i);
    if (saves) abilities.push(`+${saves[1]} saving throws`);

    if (/ignore half.?cover/i.test(desc)) abilities.push('Ignore half cover when making spell attacks');

    const resist = desc.match(/resistance to ([\w\s,]+?) damage/i);
    if (resist) abilities.push(`Resistance: ${resist[1].trim()} damage`);

    const charges = desc.match(/has (\d+) charges?/i);
    if (charges) abilities.push(`${charges[1]} charges`);

    const bold = [...desc.matchAll(/\*\*([\w][^\*]{2,30})\*\*/g)];
    for (const m of bold) {
      const ab = m[1].trim();
      if (ab.length < 50 && !abilities.includes(ab)) abilities.push(ab);
    }

    const headers = [...desc.matchAll(/(?:^|\. )([A-Z][a-zA-Z ]{2,25})\.\s+(?:While|You|When|As|The)/gm)];
    for (const m of headers) {
      const ab = m[1].trim();
      if (ab.split(' ').length <= 4 && !abilities.includes(ab)) abilities.push(ab);
    }
  }

  if (!abilities.length) {
    const magicMatch = n.match(/\+(\d+)\s*$/);
    if (magicMatch) {
      const bonus = magicMatch[1];
      if (n.includes('wand') || n.includes('rod')) {
        abilities.push(`+${bonus} spell attack rolls`);
        if (n.includes('war mage')) abilities.push('Ignore half cover when making spell attacks');
      } else if (n.includes('staff') && !n.includes('walking')) {
        abilities.push(`+${bonus} spell attack rolls`);
        abilities.push(`+${bonus} attack & damage rolls`);
      } else if (['sword','axe','bow','dagger','mace','hammer','spear','flail',
                  'rapier','scimitar','quarterstaff','maul','warhammer','lance',
                  'trident','halberd','glaive','pike','club','whip'].some(w => n.includes(w))) {
        abilities.push(`+${bonus} attack & damage rolls`);
      } else if (n.includes('shield')) {
        abilities.push(`+${bonus} AC`); abilities.push(`+${bonus} saving throws`);
      } else if (n.includes('armor') || n.includes('mail') || n.includes('plate') || n.includes('leather')) {
        abilities.push(`+${bonus} AC`);
      } else if (n.includes('ring') || n.includes('cloak') || n.includes('amulet')) {
        abilities.push(`+${bonus} AC`); abilities.push(`+${bonus} saving throws`);
      } else {
        abilities.push(`+${bonus} bonus`);
      }
    }
  }

  if (!abilities.length) return null;
  return [...new Set(abilities)].slice(0, 8).join(' · ');
}

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const characterId = context.params.id;
  const owned = await getOwnedCharacter(characterId, session.userId);
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const sp = request.nextUrl.searchParams;
    const q = sp.get('q') ?? '';
    const where = q
      ? { characterId, itemDef: { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { srdKey: { contains: q, mode: 'insensitive' as const } }] } }
      : { characterId };

    const items = await prisma.inventoryItem.findMany({
      where,
      include: {
        itemDef: { select: { id: true, srdKey: true, name: true, type: true, weight: true, rarity: true, requiresAttunement: true, keyAbilities: true, text: true, modifiers: true, sourceAttribution: true } },
      },
      orderBy: { id: 'desc' },
    });
    return NextResponse.json({ items }, { status: 200 });
  } catch (e) {
    console.error('GET /inventory error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const characterId = context.params.id;
  const owned = await getOwnedCharacter(characterId, session.userId);
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({} as any));
    const { itemDefId, srdKey, name } = body ?? {};

    const customType     = typeof body?.customType === 'string' ? body.customType.trim() : null;
    const customRarity   = typeof body?.customRarity === 'string' ? body.customRarity.trim() : null;
    const customWeight   = typeof body?.customWeight === 'number' ? body.customWeight : null;
    const customRequires = typeof body?.customRequiresAttunement === 'boolean' ? body.customRequiresAttunement : null;
    const customDesc     = typeof body?.customDesc === 'string' ? body.customDesc.trim() : null;

    let itemDef: { id: string } | null = null;

    // 1. Lookup by explicit itemDefId
    if (typeof itemDefId === 'string' && itemDefId.trim()) {
      itemDef = await prisma.itemDefinition.findUnique({ where: { id: itemDefId.trim() }, select: { id: true } });
    }
    // 2. Lookup by srdKey — backfill text/keyAbilities if we now have better data
    else if (typeof srdKey === 'string' && srdKey.trim()) {
      const existing = await prisma.itemDefinition.findUnique({
        where: { srdKey: srdKey.trim() },
        select: { id: true, text: true, keyAbilities: true },
      });
      if (existing) {
        const updates: Record<string, unknown> = {};
        if (customDesc && !existing.text) updates.text = customDesc;
        if (!existing.keyAbilities) {
          const descToUse = existing.text || customDesc || null;
          const auto = inferKeyAbilities(typeof name === 'string' ? name.trim() : '', descToUse);
          if (auto) updates.keyAbilities = auto;
        }
        if (Object.keys(updates).length > 0) {
          await prisma.itemDefinition.update({ where: { id: existing.id }, data: updates });
        }
        itemDef = { id: existing.id };
      } else {
      }
    }
    // 3. Lookup by name — same backfill logic
    else if (typeof name === 'string' && name.trim()) {
      const existing =
        (await prisma.itemDefinition.findFirst({
          where: { name: { contains: name.trim(), mode: 'insensitive' }, ruleset: owned.ruleset },
          select: { id: true, text: true, keyAbilities: true },
          orderBy: { name: 'asc' },
        })) ??
        (await prisma.itemDefinition.findFirst({
          where: { name: { contains: name.trim(), mode: 'insensitive' } },
          select: { id: true, text: true, keyAbilities: true },
          orderBy: { name: 'asc' },
        }));
      if (existing) {
        const updates: Record<string, unknown> = {};
        if (customDesc && !existing.text) updates.text = customDesc;
        if (!existing.keyAbilities) {
          const descToUse = existing.text || customDesc || null;
          const auto = inferKeyAbilities(name.trim(), descToUse);
          if (auto) updates.keyAbilities = auto;
        }
        if (Object.keys(updates).length > 0) {
          await prisma.itemDefinition.update({ where: { id: existing.id }, data: updates });
        }
        itemDef = { id: existing.id };
      }
    }

    // 4. Not found — create a new ItemDefinition
    if (!itemDef && typeof name === 'string' && name.trim()) {
      const autoKeyAbilities = inferKeyAbilities(name.trim(), customDesc || null);
      itemDef = await prisma.itemDefinition.create({
        data: {
          ruleset: owned.ruleset,
          srdKey: typeof srdKey === 'string' && srdKey.trim() ? srdKey.trim() : `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: name.trim().slice(0, 200),
          type: customType ?? 'Custom',
          weight: customWeight ?? 0,
          rarity: customRarity || null,
          requiresAttunement: customRequires ?? false,
          keyAbilities: autoKeyAbilities,
          text: customDesc || null,
          sourceAttribution: 'Custom',
        },
        select: { id: true },
      });
    }

    if (!itemDef) return NextResponse.json({ error: 'item_not_found' }, { status: 400 });

    const quantity    = clampInt(body?.quantity, 1, 999, 1);
    const attuned     = Boolean(body?.attuned);
    const containerId = typeof body?.containerId === 'string' && body.containerId.trim() ? body.containerId.trim() : null;
    const notes       = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    const created = await prisma.inventoryItem.create({
      data: { characterId, itemDefId: itemDef.id, quantity, attuned, containerId, notes },
      include: {
        itemDef: { select: { id: true, srdKey: true, name: true, type: true, weight: true, rarity: true, requiresAttunement: true, keyAbilities: true, text: true, modifiers: true } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error('POST /inventory error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const characterId = context.params.id;
  const owned = await getOwnedCharacter(characterId, session.userId);
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const url = request.nextUrl.pathname;
  const invId = url.split('/inventory/')[1]?.split('/')[0];
  if (!invId) return NextResponse.json({ error: 'invId_required' }, { status: 400 });

  try {
    const body = await request.json().catch(() => ({}));
    const data: Record<string, unknown> = {};

    if (body.quantity !== undefined) data.quantity = clampInt(body.quantity, 1, 999, 1);
    if (body.equipped !== undefined) data.equipped = Boolean(body.equipped);
    if (body.attuned  !== undefined) data.attuned  = Boolean(body.attuned);
    if (body.notes    !== undefined) data.notes    = String(body.notes ?? '').trim().slice(0, 1000) || null;

    if (Object.keys(data).length === 0) return NextResponse.json({ error: 'no_fields' }, { status: 400 });

    const updated = await prisma.inventoryItem.update({
      where: { id: invId, characterId },
      data,
      include: {
        itemDef: { select: { id: true, srdKey: true, name: true, type: true, weight: true, rarity: true, requiresAttunement: true, keyAbilities: true, text: true, modifiers: true } },
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    console.error('PATCH /inventory error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const characterId = context.params.id;
  const owned = await getOwnedCharacter(characterId, session.userId);
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const url = request.nextUrl.pathname;
  const invId = url.split('/inventory/')[1]?.split('/')[0];
  if (!invId) return NextResponse.json({ error: 'invId_required' }, { status: 400 });

  try {
    await prisma.inventoryItem.delete({ where: { id: invId, characterId } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error('DELETE /inventory error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
