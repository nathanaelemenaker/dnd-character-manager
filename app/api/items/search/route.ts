// app/api/items/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function clampInt(n: unknown, min: number, max: number, def: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

export async function GET(request: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const sp = request.nextUrl.searchParams;
    const q = (sp.get('q') ?? '').trim();
    const ruleset = (sp.get('ruleset') ?? '').trim() as 'SRD_2014' | 'SRD_2024' | '';
    let page = clampInt(sp.get('page'), 1, 10_000, 1);
    let pageSize = clampInt(sp.get('pageSize'), 1, 100, 10);

    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { type: { contains: q, mode: 'insensitive' } },
        { srdKey: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (ruleset === 'SRD_2014' || ruleset === 'SRD_2024') {
      where.ruleset = ruleset;
    }

    const [total, items] = await Promise.all([
      prisma.itemDefinition.count({ where }),
      prisma.itemDefinition.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          srdKey: true,
          name: true,
          type: true,
          weight: true,
          rarity: true,
          requiresAttunement: true,
          ruleset: true,
		  text: true,
        },
      }),
    ]);

    return NextResponse.json({ page, pageSize, total, items }, { status: 200 });
  } catch (e) {
    console.error('GET /api/items/search error', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}