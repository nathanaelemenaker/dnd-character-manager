// app/api/characters/[id]/inventory/[invId]/attunement/route.ts
// PUT /api/characters/[id]/inventory/[invId]/attunement
// Toggles requiresAttunement on the ItemDefinition for this inventory item.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  context: { params: { id: string; invId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id: characterId, invId } = context.params;

  // Verify ownership
  const owned = await prisma.character.findFirst({
    where: { id: characterId, ownerId: session.userId },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({}));
    const requiresAttunement = Boolean(body?.requiresAttunement);

    // Get the itemDefId for this inventory item
    const invItem = await prisma.inventoryItem.findFirst({
      where: { id: invId, characterId },
      select: { itemDefId: true },
    });
    if (!invItem) return NextResponse.json({ error: 'item_not_found' }, { status: 404 });

    await prisma.itemDefinition.update({
      where: { id: invItem.itemDefId },
      data: { requiresAttunement },
    });

    return NextResponse.json({ requiresAttunement }, { status: 200 });
  } catch (e) {
    console.error('PUT /inventory/[invId]/attunement error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
