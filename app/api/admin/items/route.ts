// app/api/admin/items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

function clampInt(n: unknown, min: number, max: number, d: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return d;
  return Math.max(min, Math.min(max, v));
}

function normalizeSrdKey(input: string) {
  const s = (input ?? '').trim().toLowerCase();
  if (!s) return '';
  return s.replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

/** GET (list/search) */
export async function GET(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.code === 401 ? 'unauthorized' : 'forbidden' }, { status: gate.code });

  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim();
  const ruleset = (sp.get('ruleset') ?? '').trim() as 'SRD_2014' | 'SRD_2024' | '';
  const page = clampInt(sp.get('page'), 1, 100000, 1);
  const pageSize = clampInt(sp.get('pageSize'), 1, 200, 25);

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { srdKey: { contains: q, mode: 'insensitive' } },
      { type: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (ruleset) where.ruleset = ruleset;

  const [total, items] = await Promise.all([
    prisma.itemDefinition.count({ where }),
    prisma.itemDefinition.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, ruleset: true, srdKey: true, name: true, type: true, weight: true, rarity: true,
        requiresAttunement: true, text: true, sourceAttribution: true, modifiers: true,
      },
    }),
  ]);

  return NextResponse.json({ page, pageSize, total, items }, { status: 200 });
}

/** PATCH (update one) */
export async function PATCH(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.code === 401 ? 'unauthorized' : 'forbidden' }, { status: gate.code });

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'invalid_id' }, { status: 400 });

  const data: any = {};
  const keys: Array<keyof typeof body> = ['name','type','weight','rarity','requiresAttunement','text','ruleset','modifiers'];
  for (const k of keys) if (k in body) data[k] = body[k];

  const updated = await prisma.itemDefinition.update({
    where: { id: String(body.id) },
    data,
    select: {
      id: true, ruleset: true, srdKey: true, name: true, type: true, weight: true, rarity: true,
      requiresAttunement: true, text: true, sourceAttribution: true, modifiers: true,
    },
  });

  return NextResponse.json(updated, { status: 200 });
}

/** POST (create new) */
export async function POST(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.code === 401 ? 'unauthorized' : 'forbidden' }, { status: gate.code });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });

  const ruleset = (String(body.ruleset ?? '').trim() === 'SRD_2024') ? 'SRD_2024' : 'SRD_2014';
  const name = String(body.name ?? '').trim();
  const type = String(body.type ?? '').trim();
  if (!name || !type) {
    return NextResponse.json({ error: 'name_and_type_required' }, { status: 400 });
  }

  // srdKey: use provided or derive from name
  const srdKeyRaw = String(body.srdKey ?? '').trim();
  const srdKey = normalizeSrdKey(srdKeyRaw || name);
  if (!srdKey) return NextResponse.json({ error: 'srdKey_required' }, { status: 400 });

  let modifiers: any = null;
  if (body.modifiers !== undefined && body.modifiers !== null) {
    try {
      modifiers = typeof body.modifiers === 'string' ? JSON.parse(body.modifiers) : body.modifiers;
    } catch {
      return NextResponse.json({ error: 'modifiers_invalid_json' }, { status: 400 });
    }
  }

  try {
    const created = await prisma.itemDefinition.create({
      data: {
        ruleset: ruleset as 'SRD_2014' | 'SRD_2024',
        srdKey,
        name,
        type,
        weight: (body.weight === '' || body.weight === null || body.weight === undefined) ? null : Number(body.weight),
        rarity: (String(body.rarity ?? '').trim() || null),
        requiresAttunement: Boolean(body.requiresAttunement ?? false),
        text: (String(body.text ?? '').trim() || null),
        sourceAttribution: String(body.sourceAttribution ?? 'Custom'),
        modifiers,
      },
      select: {
        id: true, ruleset: true, srdKey: true, name: true, type: true, weight: true, rarity: true,
        requiresAttunement: true, text: true, sourceAttribution: true, modifiers: true,
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e: any) {
    // Unique constraint on srdKey will throw if duplicate
    console.error('POST /api/admin/items error', e?.code ?? e);
    return NextResponse.json({ error: 'create_failed' }, { status: 500 });
  }
}