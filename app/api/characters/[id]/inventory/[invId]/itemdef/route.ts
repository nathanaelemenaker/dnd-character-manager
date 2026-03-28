// app/api/characters/[id]/inventory/[invId]/itemdef/route.ts
// PATCH /api/characters/[id]/inventory/[invId]/itemdef
// Updates fields on the ItemDefinition (keyAbilities, requiresAttunement)
// that are shared item metadata rather than per-character inventory state.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string; invId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: characterId, invId } = context.params;

  const owned = await prisma.character.findFirst({
    where: { id: characterId, ownerId: session.userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({}));

    // Get itemDefId for this inventory item
    const invItem = await prisma.inventoryItem.findFirst({
      where: { id: invId, characterId },
      select: { itemDefId: true },
    });
    if (!invItem) return NextResponse.json({ error: 'item_not_found' }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.keyAbilities !== undefined) {
      data.keyAbilities = body.keyAbilities
        ? String(body.keyAbilities).trim().slice(0, 500) || null
        : null;
    }
    if (body.requiresAttunement !== undefined) {
      data.requiresAttunement = Boolean(body.requiresAttunement);
    }

    if (!Object.keys(data).length) {
      return NextResponse.json({ error: 'no_fields' }, { status: 400 });
    }

    const updated = await prisma.itemDefinition.update({
      where: { id: invItem.itemDefId },
      data,
      select: { keyAbilities: true, requiresAttunement: true },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    console.error('PATCH /inventory/[invId]/itemdef error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
