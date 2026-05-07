
  import { prisma } from '@/lib/prisma';

  async function sync5eApiSpells2014() {
    const listRes = await fetch('https://www.dnd5eapi.co/api/2014/spells');
    if (!listRes.ok) throw new Error('5e API list fetch failed');
    const { results } = await listRes.json();
    let count = 0;
    for (const ref of results) {
      const detailRes = await fetch(`https://www.dnd5eapi.co${ref.url}`);
      if (!detailRes.ok) continue;
      const s = await detailRes.json();
      await prisma.spellDefinition.upsert({
        where: { srdKey: s.index },
        update: {
          name: s.name,
          level: s.level ?? 0,
          school: s.school?.name ?? '',
          classes: (s.classes ?? []).map((c:any)=>c.index),
          ritual: !!s.ritual,
          concentration: !!s.concentration,
          text: (s.desc ?? []).join('
'),
          ruleset: 'SRD_2014',
          sourceAttribution: 'D&D 5e SRD API (CC BY 4.0)'
        },
        create: {
          srdKey: s.index,
          name: s.name,
          level: s.level ?? 0,
          school: s.school?.name ?? '',
          classes: (s.classes ?? []).map((c:any)=>c.index),
          ritual: !!s.ritual,
          concentration: !!s.concentration,
          text: (s.desc ?? []).join('
'),
          ruleset: 'SRD_2014',
          sourceAttribution: 'D&D 5e SRD API (CC BY 4.0)'
        }
      });
      count++;
    }
    console.log(`Synced ${count} spells from D&D 5e SRD API.`);
  }

  sync5eApiSpells2014().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
