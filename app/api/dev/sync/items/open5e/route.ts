// app/api/dev/sync/items/open5e/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type Ruleset = 'SRD_2014' | 'SRD_2024';

const OPEN5E_BASE = 'https://api.open5e.com';
const OPEN5E_EQUIPMENT = `${OPEN5E_BASE}/equipment/`;
const OPEN5E_MAGIC = `${OPEN5E_BASE}/magicitems/`;

function clampInt(n: unknown, min: number, max: number, d: number) {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return d;
  return Math.max(min, Math.min(max, v));
}

function toSrdKey(input: string | null | undefined) {
  const s = (input ?? '').trim();
  if (!s) return null;
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

function parseWeight(val: any): number | null {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function parseRequiresAttunement(text: string | null): boolean | null {
  if (!text) return null;
  const s = text.toLowerCase();
  return s.includes('requires attunement') ? true : null;
}

async function fetchAll(baseUrl: string, params: URLSearchParams, maxPages: number) {
  const all: any[] = [];
  let next: string | null = `${baseUrl}?${params.toString()}`;
  let page = 0;
  while (next && page < maxPages) {
    const res = await fetch(next, { method: 'GET' });
    if (!res.ok) throw new Error(`Open5e HTTP ${res.status} on ${next}`);
    const j = await res.json();
    const results = Array.isArray(j.results) ? j.results : [];
    all.push(...results);
    next = typeof j.next === 'string' ? j.next : null;
    page++;
  }
  return all;
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const ruleset = url.searchParams.get('ruleset') as Ruleset | null;
  const docSlug = url.searchParams.get('docSlug')?.trim(); // e.g., '5esrd'
  const limit = clampInt(url.searchParams.get('limit'), 1, 200, 50);
  const maxPages = clampInt(url.searchParams.get('maxPages'), 1, 1000, 50);

  if (ruleset !== 'SRD_2014' && ruleset !== 'SRD_2024') {
    return NextResponse.json({ error: 'ruleset_required' }, { status: 400 });
  }

  try {
    let upserted = 0;
    const progress: Record<string, any> = { ruleset };

    // Equipment: do NOT pass docSlug (some Open5e deployments 404 on this filter)
    const eqParams = new URLSearchParams();
    eqParams.set('limit', String(limit));

    let equipment: any[] = [];
    try {
      equipment = await fetchAll(OPEN5E_EQUIPMENT, eqParams, maxPages);
      progress.equipment_count = equipment.length;
    } catch (e: any) {
      progress.equipment_error = String(e?.message ?? e);
    }

    // Magic items: try docSlug if provided; if it fails, retry without it.
    const miParams = new URLSearchParams();
    miParams.set('limit', String(limit));
    if (docSlug) miParams.set('document__slug', docSlug);

    let magic: any[] = [];
    try {
      magic = await fetchAll(OPEN5E_MAGIC, miParams, maxPages);
      progress.magic_count = magic.length;
    } catch (e: any) {
      progress.magic_error_first = String(e?.message ?? e);
      try {
        const retryParams = new URLSearchParams();
        retryParams.set('limit', String(limit));
        magic = await fetchAll(OPEN5E_MAGIC, retryParams, maxPages);
        progress.magic_retry_no_docslug = magic.length;
      } catch (e2: any) {
        progress.magic_error_retry = String(e2?.message ?? e2);
      }
    }

    const ingest = async (r: any, isMagic: boolean) => {
      const rawName = String(r.name ?? '').trim();
      if (!rawName) return;

      const key = toSrdKey((r.slug as string) ?? rawName);
      if (!key) return;

      const type =
        (r.type as string) ??
        (r.category as string) ??
        (isMagic ? 'Magic Item' : null);

      const rarity = isMagic ? (r.rarity ?? null) : null;

      const weight =
        parseWeight((r.weight ?? r.weight_lbs ?? null) as any) ?? null;

      const textParts: string[] = [];
      if (typeof r.desc === 'string') textParts.push(r.desc);
      if (typeof r.description === 'string') textParts.push(r.description);
      if (Array.isArray(r.entries)) textParts.push(r.entries.join('\n\n'));
      const text = textParts.length ? textParts.join('\n\n') : null;

      const requiresAttunement =
        isMagic
          ? (typeof r.requires_attunement === 'boolean'
              ? r.requires_attunement
              : parseRequiresAttunement(
                  [r.desc, r.requirements, r.attunement_text]
                    .filter(Boolean)
                    .join('\n')
                ))
          : false;

      await prisma.itemDefinition.upsert({
        where: { srdKey: key },
        update: {
          ruleset,
          name: rawName,
          type,
          weight,
          rarity,
          requiresAttunement,
          text,
          sourceAttribution: 'Open5e',
        },
        create: {
          ruleset,
          srdKey: key,
          name: rawName,
          type,
          weight,
          rarity,
          requiresAttunement,
          text,
          sourceAttribution: 'Open5e',
        },
      });

      upserted++;
    };

    for (const r of equipment) await ingest(r, false);
    for (const r of magic) await ingest(r, true);

    return NextResponse.json(
      { ok: true, source: 'open5e', ruleset, upserted, progress, _version: 'open5e-sync:equipment+magicitems' },
      { status: 200 }
    );
  } catch (e: any) {
    console.error('Open5e sync failed', e);
    return NextResponse.json(
      { error: 'sync_failed', message: String(e?.message ?? e), _version: 'open5e-sync:equipment+magicitems' },
      { status: 500 }
    );
  }
}