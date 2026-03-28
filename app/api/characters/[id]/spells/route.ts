// app/api/characters/[id]/spells/route.ts
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

function formatSpell(row: any) {
  const srd = (row.srdData ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    name: row.spellName,
    level: row.spellLevel,
    school: row.school,
    prepared: row.prepared,
    castingTime: srd.castingTime ?? '',
    range: srd.range ?? '',
    duration: srd.duration ?? '',
    ritual: srd.ritual ?? false,
    concentration: srd.concentration ?? false,
    components: srd.components ?? '',
    classes: srd.classes ?? '',
    desc: srd.desc ?? '',
  };
}

/**
 * GET /api/characters/[id]/spells
 * Returns { spells, slots }
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
    const [spellRows, slotRows] = await Promise.all([
      prisma.knownSpell.findMany({
        where: { characterId: context.params.id },
        orderBy: [{ spellLevel: 'asc' }, { spellName: 'asc' }],
      }),
      prisma.spellSlotLedger.findMany({
        where: { characterId: context.params.id },
        orderBy: { level: 'asc' },
      }),
    ]);

    // Ensure all 9 slot levels are represented
    const slotMap = Object.fromEntries(slotRows.map((s) => [s.level, s]));
    const slots = Array.from({ length: 9 }, (_, i) => {
      const lv = i + 1;
      const row = slotMap[lv];
      return { level: lv, max: row?.maxSlots ?? 0, used: row?.usedSlots ?? 0 };
    });

    return NextResponse.json({ spells: spellRows.map(formatSpell), slots }, { status: 200 });
  } catch (e) {
    console.error('GET /spells error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * POST /api/characters/[id]/spells
 * Body: { name, level, school, prepared, castingTime, range, duration,
 *         ritual, concentration, components, classes, desc }
 * Upserts on (characterId, spellName) so re-adding the same spell is idempotent.
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

    const srdData = {
      castingTime: body.castingTime ?? '',
      range: body.range ?? '',
      duration: body.duration ?? '',
      ritual: Boolean(body.ritual),
      concentration: Boolean(body.concentration),
      components: body.components ?? '',
      classes: body.classes ?? '',
      desc: body.desc ?? '',
    };

    const row = await prisma.knownSpell.upsert({
      where: { characterId_spellName: { characterId: context.params.id, spellName: name } },
      update: {
        spellLevel: Math.max(0, Math.min(9, Number(body.level) || 0)),
        school: String(body.school ?? '').slice(0, 60),
        prepared: Boolean(body.prepared ?? true),
        srdData,
      },
      create: {
        characterId: context.params.id,
        spellName: name,
        spellLevel: Math.max(0, Math.min(9, Number(body.level) || 0)),
        school: String(body.school ?? '').slice(0, 60),
        prepared: Boolean(body.prepared ?? true),
        srdData,
      },
    });

    return NextResponse.json(formatSpell(row), { status: 201 });
  } catch (e) {
    console.error('POST /spells error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * PUT /api/characters/[id]/spells
 * Used for bulk updates: toggle prepared, update slots.
 * Body: { spellId?, prepared?, slots?: [{ level, max, used }] }
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
    const ops: Promise<unknown>[] = [];

    // Toggle prepared on a single spell
    if (body.spellId && typeof body.prepared === 'boolean') {
      ops.push(
        prisma.knownSpell.update({
          where: { id: body.spellId },
          data: { prepared: body.prepared },
        })
      );
    }

    // Bulk upsert spell slots
    if (Array.isArray(body.slots)) {
      for (const slot of body.slots) {
        const level = Math.max(1, Math.min(9, Number(slot.level)));
        const max   = Math.max(0, Math.min(20, Number(slot.max)  ?? 0));
        const used  = Math.max(0, Math.min(max, Number(slot.used) ?? 0));
        ops.push(
          prisma.spellSlotLedger.upsert({
            where: { characterId_level: { characterId: context.params.id, level } },
            update: { maxSlots: max, usedSlots: used },
            create: {
              characterId: context.params.id,
              ruleset: 'SRD_2014',
              level, maxSlots: max, usedSlots: used, asOfLevel: 1,
            },
          })
        );
      }
    }

    if (ops.length === 0) return NextResponse.json({ error: 'no_ops' }, { status: 400 });
    await Promise.all(ops);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error('PUT /spells error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/**
 * DELETE /api/characters/[id]/spells?spellId=xxx
 */
export async function DELETE(
  req: NextRequest,
  context: { params: { id: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const ok = await ensureOwner(context.params.id, session.userId);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const spellId = req.nextUrl.searchParams.get('spellId');
  if (!spellId) return NextResponse.json({ error: 'spellId_required' }, { status: 400 });

  try {
    await prisma.knownSpell.deleteMany({
      where: { id: spellId, characterId: context.params.id },
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error('DELETE /spells error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
