// app/api/admin/items/bulk/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

type Ruleset = 'SRD_2014' | 'SRD_2024';
type InItem = {
  ruleset?: Ruleset;
  name: string;
  type: string;
  srdKey?: string;
  weight?: number | null;
  rarity?: string | null;
  requiresAttunement?: boolean;
  sourceAttribution?: string;
  text?: string | null;
  modifiers?: any;
};

function normalizeSrdKey(input: string) {
  const s = (input ?? '').trim().toLowerCase();
  if (!s) return '';
  return s.replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

function parseCSV(text: string): InItem[] {
  // Very lightweight CSV parser supporting quoted fields and commas inside quotes.
  // Expected headers:
  // ruleset,name,type,srdKey,weight,rarity,requiresAttunement,sourceAttribution,text,modifiers
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = splitCSV(lines[0]).map(h => h.trim());
  const idx = (k: string) => header.findIndex(h => h.toLowerCase() === k.toLowerCase());

  const out: InItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSV(lines[i]);
    if (cols.length === 0) continue;
    const get = (k: string) => {
      const j = idx(k);
      return j >= 0 ? cols[j] : '';
    };
    const modifiersRaw = get('modifiers') ?? '';
    let modifiers: any = undefined;
    if (modifiersRaw && String(modifiersRaw).trim()) {
      try { modifiers = JSON.parse(modifiersRaw); } catch { modifiers = undefined; }
    }

    const rulesetRaw = (get('ruleset') ?? '').trim();
    const item: InItem = {
      ruleset: rulesetRaw === 'SRD_2024' ? 'SRD_2024' : 'SRD_2014',
      name: String(get('name') ?? '').trim(),
      type: String(get('type') ?? '').trim(),
      srdKey: String(get('srdKey') ?? '').trim(),
      weight: ((): number | null => {
        const v = String(get('weight') ?? '').trim();
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })(),
      rarity: ((): string | null => {
        const v = String(get('rarity') ?? '').trim();
        return v || null;
      })(),
      requiresAttunement: /^(true|1|yes)$/i.test(String(get('requiresAttunement') ?? '').trim()),
      sourceAttribution: String(get('sourceAttribution') ?? 'Import').trim() || 'Import',
      text: ((): string | null => {
        const v = String(get('text') ?? '').trim();
        return v || null;
      })(),
      modifiers,
    };
    if (!item.name || !item.type) continue;
    out.push(item);
  }
  return out;
}

function splitCSV(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export async function POST(req: NextRequest) {
  const gate = requireAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.code === 401 ? 'unauthorized' : 'forbidden' }, { status: gate.code });

  const ctype = req.headers.get('content-type') || '';
  let items: InItem[] = [];
  try {
    if (ctype.includes('application/json')) {
      const body = await req.json();
      if (Array.isArray(body)) items = body as InItem[];
      else if (Array.isArray(body.items)) items = body.items as InItem[];
      else if (body?.mode === 'csv' && typeof body?.text === 'string') items = parseCSV(body.text);
      else return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
    } else {
      // For convenience, accept raw CSV in text body with ?mode=csv
      const url = new URL(req.url);
      if ((url.searchParams.get('mode') ?? '').toLowerCase() !== 'csv') {
        return NextResponse.json({ error: 'unsupported_content_type' }, { status: 400 });
      }
      const text = await req.text();
      items = parseCSV(text);
    }
  } catch {
    return NextResponse.json({ error: 'parse_error' }, { status: 400 });
  }

  if (!items.length) return NextResponse.json({ error: 'no_items' }, { status: 400 });

  let created = 0, updated = 0;
  const errors: { srdKey?: string; name: string; message: string }[] = [];

  for (const raw of items) {
    try {
      const rs: Ruleset = raw.ruleset === 'SRD_2024' ? 'SRD_2024' : 'SRD_2014';
      const name = (raw.name ?? '').trim();
      const type = (raw.type ?? '').trim();
      const key = normalizeSrdKey((raw.srdKey ?? name));
      if (!name || !type || !key) {
        errors.push({ srdKey: key, name, message: 'missing_required_fields' });
        continue;
      }

      const data = {
        ruleset: rs,
        srdKey: key,
        name,
        type,
        weight: raw.weight ?? null,
        rarity: raw.rarity ?? null,
        requiresAttunement: !!raw.requiresAttunement,
        text: raw.text ?? null,
        sourceAttribution: (raw.sourceAttribution ?? 'Import') || 'Import',
        modifiers: raw.modifiers ?? null,
      };

      const existing = await prisma.itemDefinition.findUnique({ where: { srdKey: key }, select: { id: true } });
      if (existing) {
        await prisma.itemDefinition.update({ where: { srdKey: key }, data });
        updated++;
      } else {
        await prisma.itemDefinition.create({ data });
        created++;
      }
    } catch (e: any) {
      errors.push({ srdKey: raw.srdKey, name: raw.name, message: String(e?.message ?? e) });
    }
  }

  return NextResponse.json({ ok: true, created, updated, errors }, { status: 200 });
}