// app/api/characters/[id]/features/route.ts
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

/**
 * GET /api/characters/[id]/features
 * Returns { features: [...] }
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
    const features = await prisma.characterCustomFeature.findMany({
      where: { characterId: context.params.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, source: true, desc: true, sortOrder: true },
    });
    return NextResponse.json({ features }, { status: 200 });
  } catch (e) {
    console.error('GET /features error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * POST /api/characters/[id]/features
 * Body: { name, source?, desc? }
 */
export async function POST(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await ensureOwner(context.params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'name_required' }, { status: 400 });

    // sortOrder = current max + 1
    const agg = await prisma.characterCustomFeature.aggregate({
      where: { characterId: context.params.id },
      _max: { sortOrder: true },
    });
    const sortOrder = (agg._max.sortOrder ?? 0) + 1;

    const feature = await prisma.characterCustomFeature.create({
      data: {
        characterId: context.params.id,
        name,
        source: String(body?.source ?? '').trim().slice(0, 100),
        desc:   String(body?.desc   ?? '').trim().slice(0, 4000),
        sortOrder,
      },
      select: { id: true, name: true, source: true, desc: true, sortOrder: true },
    });

    return NextResponse.json(feature, { status: 201 });
  } catch (e) {
    console.error('POST /features error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * PATCH /api/characters/[id]/features?featureId=xxx
 * Body: { name?, source?, desc? }
 */
export async function PATCH(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await ensureOwner(context.params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const featureId = req.nextUrl.searchParams.get('featureId');
  if (!featureId) return NextResponse.json({ error: 'featureId_required' }, { status: 400 });

  try {
    const body = await req.json().catch(() => ({}));
    const updated = await prisma.characterCustomFeature.updateMany({
      where: { id: featureId, characterId: context.params.id },
      data: {
        ...(body.name    !== undefined && { name:   String(body.name).trim().slice(0, 200) }),
        ...(body.source  !== undefined && { source: String(body.source).trim().slice(0, 100) }),
        ...(body.desc    !== undefined && { desc:   String(body.desc).trim().slice(0, 4000) }),
      },
    });
    if (!updated.count) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error('PATCH /features error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * DELETE /api/characters/[id]/features?featureId=xxx
 */
export async function DELETE(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await ensureOwner(context.params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const featureId = req.nextUrl.searchParams.get('featureId');
  if (!featureId) return NextResponse.json({ error: 'featureId_required' }, { status: 400 });

  try {
    await prisma.characterCustomFeature.deleteMany({
      where: { id: featureId, characterId: context.params.id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error('DELETE /features error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
