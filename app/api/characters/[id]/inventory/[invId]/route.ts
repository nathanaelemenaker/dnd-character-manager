// app/api/characters/[id]/inventory/[invId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function clampInt(n: unknown, min: number, max: number, def: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

// Accept both param casings to be defensive
function getInvId(params: Record<string, string | undefined>): string | null {
  return params?.invId ?? (params as any)?.invID ?? null;
}

async function ensureItemOwnership(invId: string, characterId: string, ownerId: string) {
  return prisma.inventoryItem.findFirst({
    where: {
      id: invId,
      character: { id: characterId, ownerId },
    },
    select: { id: true },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string; invId?: string; invID?: string } }
) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const characterId = context.params.id;
  const invId = getInvId(context.params);
  if (!invId) return NextResponse.json({ error: 'invalid_inv_id' }, { status: 400 });

  const item = await ensureItemOwnership(invId, characterId, session.userId);
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({} as any));
    const data: {
      quantity?: number;
      attuned?: boolean;
      equipped?: boolean;
      notes?: string | null;
      containerId?: string | null;
    } = {};

    if (body?.quantity !== undefined) data.quantity = clampInt(body.quantity, 1, 999, 1);
    if (body?.attuned !== undefined) data.attuned = Boolean(body.attuned);
    if (body?.equipped !== undefined) data.equipped = Boolean(body.equipped);
    if (body?.notes !== undefined) {
      data.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;
    }
    if (body?.containerId !== undefined) {
      data.containerId = typeof body.containerId === 'string' && body.containerId.trim()
        ? body.containerId.trim()
        : null;
    }

    if (!('quantity' in data) && !('attuned' in data) && !('equipped' in data) && !('notes' in data) && !('containerId' in data)) {
      return NextResponse.json({ error: 'no_fields' }, { status: 400 });
    }

    const updated = await prisma.inventoryItem.update({
      where: { id: invId },
      data,
      include: {
        itemDef: {
          select: {
            id: true,
            srdKey: true,
            name: true,
            type: true,
            weight: true,
            rarity: true,
            requiresAttunement: true,
            text: true,
            sourceAttribution: true,
          },
        },
      },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    console.error('PATCH /inventory/[invId] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string; invId?: string; invID?: string } }
) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const characterId = context.params.id;
  const invId = getInvId(context.params);
  if (!invId) return NextResponse.json({ error: 'invalid_inv_id' }, { status: 400 });

  const item = await ensureItemOwnership(invId, characterId, session.userId);
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    await prisma.inventoryItem.delete({ where: { id: invId } });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error('DELETE /inventory/[invId] error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}