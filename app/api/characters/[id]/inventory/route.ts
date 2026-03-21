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

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const characterId = context.params.id;
  const owned = await getOwnedCharacter(characterId, session.userId);
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const sp = request.nextUrl.searchParams;
    let page = clampInt(sp.get('page'), 1, 10_000, 1);
    let pageSize = clampInt(sp.get('pageSize'), 1, 100, 20);
    const q = (sp.get('q') ?? '').trim();

    const where = {
      characterId,
      ...(q
        ? {
            itemDef: {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { type: { contains: q, mode: 'insensitive' } },
                { srdKey: { contains: q, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    } as const;

    const [total, items] = await Promise.all([
      prisma.inventoryItem.count({ where }),
      prisma.inventoryItem.findMany({
        where,
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
        orderBy: { id: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json(
      { page, pageSize, total, items },
      { status: 200 },
    );
  } catch (e) {
    console.error('GET /inventory error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const characterId = context.params.id;
  const owned = await getOwnedCharacter(characterId, session.userId);
  if (!owned) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await request.json().catch(() => ({} as any));
    const { itemDefId, srdKey, name } = body ?? {};
    let itemDef: { id: string } | null = null;

    if (typeof itemDefId === 'string' && itemDefId.trim()) {
      itemDef = await prisma.itemDefinition.findUnique({
        where: { id: itemDefId.trim() },
        select: { id: true },
      });
    } else if (typeof srdKey === 'string' && srdKey.trim()) {
      itemDef = await prisma.itemDefinition.findUnique({
        where: { srdKey: srdKey.trim() },
        select: { id: true },
      });
    } else if (typeof name === 'string' && name.trim()) {
      // Try to pick the best match within the same ruleset first
      itemDef =
        (await prisma.itemDefinition.findFirst({
          where: {
            name: { contains: name.trim(), mode: 'insensitive' },
            ruleset: owned.ruleset,
          },
          select: { id: true },
          orderBy: { name: 'asc' },
        })) ??
        (await prisma.itemDefinition.findFirst({
          where: { name: { contains: name.trim(), mode: 'insensitive' } },
          select: { id: true },
          orderBy: { name: 'asc' },
        }));
    }

    if (!itemDef) {
      return NextResponse.json({ error: 'item_not_found' }, { status: 400 });
    }

    const quantity = clampInt(body?.quantity, 1, 999, 1);
    const attuned = Boolean(body?.attuned);
    const containerId =
      typeof body?.containerId === 'string' && body.containerId.trim()
        ? body.containerId.trim()
        : null;
    const notes =
      typeof body?.notes === 'string' && body.notes.trim()
        ? body.notes.trim()
        : null;

    const created = await prisma.inventoryItem.create({
      data: {
        characterId,
        itemDefId: itemDef.id,
        quantity,
        attuned,
        containerId,
        notes,
      },
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
          },
        },
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error('POST /inventory error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}