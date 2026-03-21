// app/api/dev/sync/items/dnd5e/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const BASE = 'https://www.dnd5eapi.co/api';

function toSrdKey(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
}

function parseWeight(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const ruleset = url.searchParams.get('ruleset');
  if (ruleset !== 'SRD_2014') {
    return NextResponse.json({ error: 'ruleset_must_be_SRD_2014' }, { status: 400 });
  }

  try {
    const listRes = await fetch(`${BASE}/equipment`, { method: 'GET' });
    if (!listRes.ok) throw new Error(`dnd5eapi.co HTTP ${listRes.status} on /equipment`);
    const list = await listRes.json();
    const results: Array<{ index: string; url: string; name: string }> = list?.results ?? [];

    let upserted = 0;

    // Hydrate each item’s detail
    for (const r of results) {
      const dRes = await fetch(`https://www.dnd5eapi.co${r.url}`, { method: 'GET' });
      if (!dRes.ok) continue;
      const d = await dRes.json();

      const name = String(d.name ?? '').trim();
      if (!name) continue;

      const srdKey = toSrdKey(d.index ?? name);
      const type =
        (d.equipment_category?.name as string) ??
        (d.gear_category?.name as string) ??
        (d.weapon_category as string) ??
        (d.armor_category as string) ??
        null;

      const weight =
        parseWeight(d.weight) ??
        parseWeight(d.contents?.reduce?.((sum: number, c: any) => sum + (c?.item?.weight ?? 0) * (c?.quantity ?? 0), 0));

      // Build a simple text block from properties
      const props: string[] = [];
      if (Array.isArray(d.properties)) props.push(d.properties.map((p: any) => p.name).join(', '));
      if (d.desc) props.push(Array.isArray(d.desc) ? d.desc.join('\n') : String(d.desc));
      const text = props.length ? props.join('\n\n') : null;

      await prisma.itemDefinition.upsert({
        where: { srdKey },
        update: {
          ruleset: 'SRD_2014',
          name,
          type,
          weight,
          rarity: null,
          requiresAttunement: false,
          text,
          sourceAttribution: 'dnd5eapi.co',
        },
        create: {
          ruleset: 'SRD_2014',
          srdKey,
          name,
          type,
          weight,
          rarity: null,
          requiresAttunement: false,
          text,
          sourceAttribution: 'dnd5eapi.co',
        },
      });

      upserted++;
    }

    return NextResponse.json({ ok: true, source: 'dnd5eapi.co', ruleset: 'SRD_2014', upserted }, { status: 200 });
  } catch (e: any) {
    console.error('dnd5eapi.co sync failed', e);
    return NextResponse.json({ error: 'sync_failed', message: String(e?.message ?? e) }, { status: 500 });
  }
}