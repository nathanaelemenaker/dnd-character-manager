// app/api/srd/class/route.ts
// Server-side proxy for class data from dnd5eapi.co
// GET /api/srd/class?name=druid                  → class overview + all levels
// GET /api/srd/class?name=druid&level=2          → features at specific level
// GET /api/srd/class?name=druid&subclasses=true  → subclass list with descriptions

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
const BASE = 'https://www.dnd5eapi.co/api/2014';

async function fetchJSON(url: string) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Upstream ${res.status}: ${url}`);
  return res.json();
}

function classIndex(name: string) {
  // Handle multiclass names like "Arcane Trickster" → rogue isn't the index but
  // the user stores classKey as plain class name e.g. "Druid", "Fighter"
  const overrides: Record<string, string> = {};
  return overrides[name] ?? name.trim().toLowerCase().replace(/\s+/g, '-');
}

function getSubclassLevel(className: string): number {
  const map: Record<string, number> = {
    'Barbarian': 3, 'Bard': 3, 'Cleric': 1, 'Druid': 2,
    'Fighter': 3, 'Monk': 3, 'Paladin': 3, 'Ranger': 3,
    'Rogue': 3, 'Sorcerer': 1, 'Warlock': 1, 'Wizard': 2,
  };
  return map[className] ?? 3;
}

function getSubclassLabel(className: string): string {
  const map: Record<string, string> = {
    'Barbarian': 'Primal Path', 'Bard': 'Bard College',
    'Cleric': 'Divine Domain', 'Druid': 'Druid Circle',
    'Fighter': 'Martial Archetype', 'Monk': 'Monastic Tradition',
    'Paladin': 'Sacred Oath', 'Ranger': 'Ranger Archetype',
    'Rogue': 'Roguish Archetype', 'Sorcerer': 'Sorcerous Origin',
    'Warlock': 'Otherworldly Patron', 'Wizard': 'Arcane Tradition',
  };
  return map[className] ?? 'Subclass';
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rawName = (sp.get('name') ?? '').trim();
  const levelParam = sp.get('level');
  const subclassesOnly = sp.get('subclasses') === 'true';

  if (!rawName) return NextResponse.json({ error: 'name_required' }, { status: 400 });
  const idx = classIndex(rawName);

  try {
    // ── Subclass list ─────────────────────────────────────────────────────
    if (subclassesOnly) {
      const classData = await fetchJSON(`${BASE}/classes/${idx}`);
      const subclassRefs: { url: string; name: string }[] = classData.subclasses ?? [];

      const results = await Promise.allSettled(
        subclassRefs.map((s) => fetchJSON(`https://www.dnd5eapi.co${s.url}`))
      );

      const subclasses = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map((r) => {
          const d = r.value;
          // Fetch subclass levels to get feature progression
          return {
            index:      d.index,
            name:       d.name,
            desc:       Array.isArray(d.desc) ? d.desc.join('\n\n') : (d.desc ?? ''),
            subclassOf: d.class?.name ?? rawName,
          };
        });

      return NextResponse.json({ subclasses });
    }

    // ── Full class level data ─────────────────────────────────────────────
    const [classData, levelsData] = await Promise.all([
      fetchJSON(`${BASE}/classes/${idx}`),
      fetchJSON(`${BASE}/classes/${idx}/levels`),
    ]);

    // If fetching a specific level, only get feature details for that level
    const targetLevels: any[] = levelParam
      ? (levelsData as any[]).filter((l: any) => l.level === parseInt(levelParam))
      : levelsData as any[];

    // Fetch feature details (cap parallel requests)
    const featureRefs = targetLevels.flatMap((l: any) => l.features ?? []).slice(0, 24);
    const featureResults = await Promise.allSettled(
      featureRefs.map((f: { url: string; index: string }) =>
        fetchJSON(`https://www.dnd5eapi.co${f.url}`)
      )
    );
    const featureMap: Record<string, string> = {};
    featureResults
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
      .forEach((r) => {
        featureMap[r.value.index] = Array.isArray(r.value.desc)
          ? r.value.desc.join('\n\n')
          : (r.value.desc ?? '');
      });

    const levels = (levelsData as any[]).map((l: any) => {
      const sc = l.spellcasting ?? null;
      return {
        level:       l.level,
        profBonus:   l.prof_bonus,
        features:    (l.features ?? []).map((f: any) => ({
          name:  f.name,
          index: f.index,
          desc:  featureMap[f.index] ?? '',
        })),
        spellSlots:  sc ? {
          cantripsKnown: sc.cantrips_known ?? 0,
          spellsKnown:   sc.spells_known ?? null,
          slots: [1,2,3,4,5,6,7,8,9].map((n) => sc[`spell_slots_level_${n}`] ?? 0),
        } : null,
        classSpecific:            l.class_specific ?? null,
        abilityScoreImprovement:  (l.features ?? []).some((f: any) =>
          f.name.toLowerCase().includes('ability score improvement')
        ),
        subclassUnlock: (l.features ?? []).some((f: any) =>
          ['circle', 'archetype', 'domain', 'patron', 'tradition',
           'path', 'oath', 'college', 'origin'].some((kw) =>
            f.name.toLowerCase().includes(kw))
        ),
      };
    });

    return NextResponse.json({
      index:         classData.index,
      name:          classData.name,
      hitDie:        classData.hit_die,
      subclassLabel: getSubclassLabel(classData.name),
      subclassLevel: getSubclassLevel(classData.name),
      spellcasting:  classData.spellcasting
        ? { ability: classData.spellcasting.spellcasting_ability?.name ?? '' }
        : null,
      levels,
    });

  } catch (e: any) {
    console.error('[class proxy error]', e?.message);
    return NextResponse.json({ error: 'upstream_error', message: e?.message }, { status: 502 });
  }
}
