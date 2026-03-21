// app/api/admin/items/export/csv/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

function csvCell(val: any): string {
  if (val === null || val === undefined) return '';
  const s = typeof val === 'string' ? val : JSON.stringify(val);
  const needsQuote = /[",\n]/.test(s);
  const out = s.replace(/"/g, '""');
  return needsQuote ? `"${out}"` : out;
}

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
    },
  });

  const header = [
    'id','ruleset','srdKey','name','type','weight','rarity',
    'requiresAttunement','sourceAttribution','text','modifiers'
  ].join(',');

  const lines = rows.map(r => [
    csvCell(r.id),
    csvCell(r.ruleset),
    csvCell(r.srdKey),
    csvCell(r.name),
    csvCell(r.type),
    csvCell(r.weight),
    csvCell(r.rarity),
    csvCell(r.requiresAttunement),
    csvCell(r.sourceAttribution),
    csvCell(r.text ?? ''),
    csvCell(r.modifiers ?? null), // stays JSON string in a cell
  ].join(','));

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = ruleset || 'all';
  const csv = [header, ...lines].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="items_export_${suffix}_${ts}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}