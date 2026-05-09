// app/api/srd/route.ts
// Server-side proxy for dnd5eapi.co (2014) and open5e.com (2024)
// Also searches the ClaudeCache table so previously Claude-found spells/items appear here.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Updated: dnd5eapi.co moved spell/equipment under /api/2014/
const DND5E_BASE  = 'https://www.dnd5eapi.co/api/2014';
const OPEN5E_BASE = 'https://api.open5e.com/v1';

async function fetchJSON(url: string) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Upstream ${res.status}: ${url}`);
  return res.json();
}

/**
 * GET /api/srd?type=spells&ruleset=SRD_2014&q=fireball
 * GET /api/srd?type=items&ruleset=SRD_2014&q=longsword
 */
export async function GET(req: NextRequest) {
  const sp      = req.nextUrl.searchParams;
  const type    = sp.get('type');
  const ruleset = sp.get('ruleset') ?? 'SRD_2014';
  const q       = (sp.get('q') ?? '').trim();

  if (!q) return NextResponse.json({ results: [] });

  try {
    // ── Spell search — both rulesets search both APIs and merge ─────────────
    if (type === 'spells') {
      // Search both dnd5eapi (2014) and open5e (2024) in parallel regardless of ruleset
      const [dnd5eListData, open5eData] = await Promise.allSettled([
        fetchJSON(`${DND5E_BASE}/spells/?name=${encodeURIComponent(q)}`),
        fetchJSON(`${OPEN5E_BASE}/spells/?search=${encodeURIComponent(q)}&limit=12`),
      ]);

      const spells: any[] = [];
      const seen = new Set<string>();

      // ── ClaudeCache — previously Claude-fetched spells ───────────────────
      try {
        const cachedSpells = await prisma.claudeCache.findMany({
          where: { type: 'spell', name: { contains: q, mode: 'insensitive' } },
          take: 6,
        });
        for (const row of cachedSpells) {
          const d = row.data as any;
          const key = (d.name ?? row.name).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          spells.push({ ...d, _fromCache: true });
        }
      } catch { /* DB unavailable — continue with upstream */ }

      // dnd5eapi results — fetch full details for each hit
      if (dnd5eListData.status === 'fulfilled') {
        const hits = (dnd5eListData.value.results ?? []).slice(0, 10);
        const details = await Promise.allSettled(
          hits.map((h: { url: string }) => fetchJSON(`https://www.dnd5eapi.co${h.url}`))
        );
        for (const r of details) {
          if (r.status !== 'fulfilled') continue;
          const sp = r.value;
          const key = sp.name?.toLowerCase() ?? '';
          if (!key || seen.has(key)) continue;
          seen.add(key);
          spells.push({
            name:          sp.name ?? '',
            level:         sp.level ?? 0,
            school:        sp.school?.name ?? '',
            castingTime:   sp.casting_time ?? '',
            range:         sp.range ?? '',
            duration:      sp.duration ?? '',
            ritual:        sp.ritual ?? false,
            concentration: sp.concentration ?? false,
            components:    [
              ...(sp.components ?? []),
              sp.material ? `(${sp.material})` : '',
            ].filter(Boolean).join(', '),
            classes: (sp.classes ?? []).map((c: any) => c.name).join(', '),
            desc:    Array.isArray(sp.desc) ? sp.desc.join(' ') : (sp.desc ?? ''),
          });
        }
      }

      // open5e results — add anything not already found via dnd5eapi
      if (open5eData.status === 'fulfilled') {
        for (const sp of (open5eData.value.results ?? [])) {
          const key = sp.name?.toLowerCase() ?? '';
          if (!key || seen.has(key)) continue;
          seen.add(key);
          spells.push({
            name:          sp.name ?? '',
            level:         sp.level_int ?? 0,
            school:        sp.school ?? '',
            castingTime:   sp.casting_time ?? '',
            range:         sp.range ?? '',
            duration:      sp.duration ?? '',
            ritual:        sp.ritual === 'yes' || sp.ritual === true,
            concentration: sp.concentration === 'yes' || sp.concentration === true,
            components:    sp.components ?? '',
            classes:       sp.dnd_class ?? '',
            desc:          sp.desc ?? '',
          });
        }
      }

      return NextResponse.json({ results: spells.slice(0, 12) });
    }

    // ── Item search ───────────────────────────────────────────────────────
    if (type === 'items') {
      if (ruleset === 'SRD_2014') {
        // Search both mundane equipment (dnd5eapi) AND magic items (open5e) in parallel
        const [equipData, magicData] = await Promise.allSettled([
          fetchJSON(`${DND5E_BASE}/equipment/?name=${encodeURIComponent(q)}`),
          fetchJSON(`https://api.open5e.com/v1/magicitems/?search=${encodeURIComponent(q)}&limit=8`),
        ]);

        const items: any[] = [];

        // ── ClaudeCache — previously Claude-fetched items ────────────────────
        try {
          const cachedItems = await prisma.claudeCache.findMany({
            where: { type: 'item', name: { contains: q, mode: 'insensitive' } },
            take: 6,
          });
          for (const row of cachedItems) {
            items.push({ ...(row.data as any), _fromCache: true });
          }
        } catch { /* DB unavailable — continue */ }

        // Mundane equipment from dnd5eapi
        if (equipData.status === 'fulfilled') {
          const hits = (equipData.value.results ?? []).slice(0, 8);
          const details = await Promise.allSettled(
            hits.map((h: { url: string }) => fetchJSON(`https://www.dnd5eapi.co${h.url}`))
          );
          for (const r of details) {
            if (r.status !== 'fulfilled') continue;
            const it = r.value;
            items.push({
              srdKey:     it.index ?? '',
              name:       it.name ?? '',
              type:       it.equipment_category?.name ?? it.gear_category?.name
                          ?? it.weapon_category ?? it.armor_category ?? '',
              weight:     it.weight ?? 0,
              cost:       it.cost ? `${it.cost.quantity} ${it.cost.unit}` : '',
              damage:     it.damage ? `${it.damage.damage_dice} ${it.damage.damage_type?.name ?? ''}`.trim() : '',
              armorClass: it.armor_class ? `${it.armor_class.base}${it.armor_class.dex_bonus ? ' + Dex' : ''}` : '',
              desc:       Array.isArray(it.desc) ? it.desc.join(' ') : (it.special ?? it.desc ?? ''),
              requiresAttunement: false,
            });
          }
        }

        // Magic items from open5e (has descriptions!)
        if (magicData.status === 'fulfilled') {
          for (const it of (magicData.value.results ?? []).slice(0, 8)) {
            items.push({
              srdKey:     it.slug ?? '',
              name:       it.name ?? '',
              type:       it.type ?? 'Magic Item',
              weight:     0,
              cost:       '',
              damage:     '',
              armorClass: '',
              desc:       it.desc ?? '',
              rarity:     it.rarity ?? '',
              requiresAttunement: it.requires_attunement === 'requires attunement' || it.requires_attunement === true,
            });
          }
        }

        // Deduplicate by name, limit to 12
        const seen = new Set<string>();
        const unique = items.filter(it => {
          const k = it.name.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k); return true;
        }).slice(0, 12);

        return NextResponse.json({ results: unique });

      } else {
        // SRD 2024 — search magic items, weapons, armor (open5e) AND mundane equipment (dnd5eapi) in parallel
        const [magicData, weaponData, armorData, equipData] = await Promise.allSettled([
          fetchJSON(`https://api.open5e.com/v1/magicitems/?search=${encodeURIComponent(q)}&limit=8`),
          fetchJSON(`https://api.open5e.com/v2/weapons/?search=${encodeURIComponent(q)}&limit=6`),
          fetchJSON(`https://api.open5e.com/v2/armor/?search=${encodeURIComponent(q)}&limit=6`),
          fetchJSON(`${DND5E_BASE}/equipment/?name=${encodeURIComponent(q)}`),
        ]);

        const items: any[] = [];

        // ── ClaudeCache — previously Claude-fetched items ────────────────────
        try {
          const cachedItems = await prisma.claudeCache.findMany({
            where: { type: 'item', name: { contains: q, mode: 'insensitive' } },
            take: 6,
          });
          for (const row of cachedItems) {
            items.push({ ...(row.data as any), _fromCache: true });
          }
        } catch { /* DB unavailable — continue */ }

        // Magic items (open5e) — richest descriptions
        if (magicData.status === 'fulfilled') {
          for (const it of (magicData.value.results ?? []).slice(0, 8)) {
            items.push({
              srdKey:             it.slug ?? '',
              name:               it.name ?? '',
              type:               it.type ?? 'Magic Item',
              weight:             0,
              cost:               '',
              damage:             '',
              armorClass:         '',
              rarity:             it.rarity ?? '',
              requiresAttunement: it.requires_attunement === 'requires attunement' || it.requires_attunement === true,
              desc:               it.desc ?? '',
            });
          }
        }

        // Weapons (open5e v2)
        if (weaponData.status === 'fulfilled') {
          for (const it of (weaponData.value.results ?? []).slice(0, 6)) {
            items.push({
              srdKey:     it.key ?? it.slug ?? '',
              name:       it.name ?? '',
              type:       'Weapon',
              weight:     it.weight_lb ?? 0,
              cost:       it.cost ?? '',
              damage:     it.damage_dice ? `${it.damage_dice} ${it.damage_type ?? ''}`.trim() : '',
              armorClass: '',
              desc:       it.desc ?? '',
            });
          }
        }

        // Armor (open5e v2)
        if (armorData.status === 'fulfilled') {
          for (const it of (armorData.value.results ?? []).slice(0, 6)) {
            items.push({
              srdKey:     it.key ?? it.slug ?? '',
              name:       it.name ?? '',
              type:       'Armor',
              weight:     it.weight_lb ?? 0,
              cost:       it.cost ?? '',
              damage:     '',
              armorClass: it.ac_base ? `${it.ac_base}${it.ac_add_dex ? ' + Dex' : ''}` : '',
              desc:       it.desc ?? '',
            });
          }
        }

        // Mundane equipment fallback (dnd5eapi — catches anything open5e missed)
        if (equipData.status === 'fulfilled') {
          const hits = (equipData.value.results ?? []).slice(0, 6);
          const details = await Promise.allSettled(
            hits.map((h: { url: string }) => fetchJSON(`https://www.dnd5eapi.co${h.url}`))
          );
          for (const r of details) {
            if (r.status !== 'fulfilled') continue;
            const it = r.value;
            items.push({
              srdKey:     it.index ?? '',
              name:       it.name ?? '',
              type:       it.equipment_category?.name ?? it.gear_category?.name
                          ?? it.weapon_category ?? it.armor_category ?? '',
              weight:     it.weight ?? 0,
              cost:       it.cost ? `${it.cost.quantity} ${it.cost.unit}` : '',
              damage:     it.damage ? `${it.damage.damage_dice} ${it.damage.damage_type?.name ?? ''}`.trim() : '',
              armorClass: it.armor_class ? `${it.armor_class.base}${it.armor_class.dex_bonus ? ' + Dex' : ''}` : '',
              desc:       Array.isArray(it.desc) ? it.desc.join(' ') : (it.special ?? it.desc ?? ''),
            });
          }
        }

        // Deduplicate by name and limit to 12
        const seen = new Set<string>();
        const unique = items.filter(it => {
          if (seen.has(it.name.toLowerCase())) return false;
          seen.add(it.name.toLowerCase());
          return true;
        }).slice(0, 12);

        return NextResponse.json({ results: unique });
      }
    }

    return NextResponse.json({ error: 'invalid_type' }, { status: 400 });

  } catch (e: any) {
    console.error('[SRD proxy error]', e?.message ?? e);
    return NextResponse.json(
      { error: 'upstream_error', message: e?.message },
      { status: 502 }
    );
  }
}
