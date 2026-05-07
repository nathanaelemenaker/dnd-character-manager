
import { prisma } from '@/lib/prisma';

async function syncOpen5eSpells2014() {
  let url: string | null = 'https://api.open5e.com/spells/?document__slug=5e-srd&limit=100';
  let count = 0;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open5e fetch failed: ${res.status}`);
    const data = await res.json();
    for (const s of data.results) {
      await prisma.spellDefinition.upsert({
        where: { srdKey: s.slug },
        update: {
          name: s.name,
          level: s.level_int ?? Number(s.level) ?? 0,
          school: s.school ?? '',
          classes: Array.isArray(s.spell_lists) ? s.spell_lists : [],
          ritual: !!s.ritual,
          concentration: !!s.concentration,
          text: s.desc ?? '',
          ruleset: 'SRD_2014',
          sourceAttribution: 'Open5e SRD 5e (CC BY 4.0)'
        },
        create: {
          srdKey: s.slug,
          name: s.name,
          level: s.level_int ?? Number(s.level) ?? 0,
          school: s.school ?? '',
          classes: Array.isArray(s.spell_lists) ? s.spell_lists : [],
          ritual: !!s.ritual,
          concentration: !!s.concentration,
          text: s.desc ?? '',
          ruleset: 'SRD_2014',
          sourceAttribution: 'Open5e SRD 5e (CC BY 4.0)'
        }
      });
      count++;
    }
    url = data.next;
  }
  console.log(`Synced ${count} spells from Open5e.`);
}

syncOpen5eSpells2014().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
