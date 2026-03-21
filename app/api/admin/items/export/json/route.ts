// app/api/admin/items/export/json/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.code === 401 ? 'unauthorized' : 'forbidden' },
      { status: gate.code }
    );
  }

  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim();
  const ruleset = (sp.get('ruleset') ?? '').trim() as 'SRD_2014' | 'SRD_2024' | '';

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { srdKey: { contains: q, mode: 'insensitive' } },
      { type: { contains: q, mode: 'insensitive' } },
      { sourceAttribution: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (ruleset) where.ruleset = ruleset;

  const rows = await prisma.itemDefinition.findMany({
    where,
    orderBy: [{ name: 'asc' }],
    select: {
      id: true, ruleset: true, srdKey: true, name: true, type: true, weight: true, rarity: true,
      requiresAttunement: true, text: true, sourceAttribution: true, modifiers: true,
      // inventoryItems omitted intentionally
    },
  });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = ruleset || 'all';
  const body = JSON.stringify({ ok: true, count: rows.length, items: rows }, null, 2);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="items_export_${suffix}_${ts}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}