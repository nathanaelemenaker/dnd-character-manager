// app/characters/[id]/page.tsx
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';
import CharacterSheetClient from './CharacterSheetClient';

type Ruleset = 'SRD_2014' | 'SRD_2024';

export default async function CharacterDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  const character = await prisma.character.findFirst({
    where: { id: params.id, ownerId: session.userId },
    select: {
      id: true, name: true, level: true, ruleset: true,
      race: true, background: true, alignment: true, xp: true,
      ac: true, speed: true, hpCurrent: true, hpMax: true, hpTemp: true,
      inspiration: true, portrait: true,
      currency: true, bio: true, deathSaves: true,
      updatedAt: true,
    },
  });
  if (!character) notFound();

  const [abilityRow, skillRows, saveRows, classRows, spellRows, slotRows, inventoryRows, featureRows] =
    await Promise.all([
      prisma.abilityScores.findUnique({ where: { characterId: character.id } }),
      prisma.characterSkill.findMany({ where: { characterId: character.id }, select: { skillName: true, proficiency: true } }),
      prisma.characterSave.findMany({ where: { characterId: character.id }, select: { abilityKey: true, proficient: true } }),
      prisma.characterClass.findMany({ where: { characterId: character.id }, select: { id: true, classKey: true, subclassKey: true, subclassNotes: true, level: true, hitDie: true }, orderBy: { id: 'asc' } }),
      prisma.knownSpell.findMany({ where: { characterId: character.id }, orderBy: [{ spellLevel: 'asc' }, { spellName: 'asc' }] }),
      prisma.spellSlotLedger.findMany({ where: { characterId: character.id }, orderBy: { level: 'asc' } }),
      prisma.inventoryItem.findMany({
        where: { characterId: character.id },
        include: { itemDef: { select: { id: true, srdKey: true, name: true, type: true, weight: true, rarity: true, requiresAttunement: true, keyAbilities: true, text: true } } },
        orderBy: { id: 'desc' },
      }),
      prisma.characterCustomFeature.findMany({ where: { characterId: character.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, name: true, source: true, desc: true } }),
    ]);

  const abilities = {
    STR: abilityRow?.str ?? 10, DEX: abilityRow?.dex ?? 10, CON: abilityRow?.con ?? 10,
    INT: abilityRow?.intScore ?? 10, WIS: abilityRow?.wisScore ?? 10, CHA: abilityRow?.chaScore ?? 10,
  };

  const slotMap = Object.fromEntries(slotRows.map((s) => [s.level, s]));
  const spellSlots = Array.from({ length: 9 }, (_, i) => {
    const lv = i + 1;
    const row = slotMap[lv];
    return { level: lv, max: row?.maxSlots ?? 0, used: row?.usedSlots ?? 0 };
  });

  return (
    <CharacterSheetClient
      character={{
        id: character.id, name: character.name, level: character.level,
        ruleset: character.ruleset as Ruleset,
        race: character.race, background: character.background,
        alignment: character.alignment, xp: character.xp,
        ac: character.ac, speed: character.speed,
        hpCurrent: character.hpCurrent, hpMax: character.hpMax, hpTemp: character.hpTemp,
        inspiration: character.inspiration,
        portrait: character.portrait ?? null,
        updatedAt: character.updatedAt?.toISOString() ?? new Date().toISOString(),
        currency: character.currency as Record<string, number>,
        bio: character.bio as Record<string, string>,
        deathSaves: character.deathSaves as { successes: number; failures: number },
      }}
      initialAbilities={abilities}
      initialSkills={Object.fromEntries(skillRows.map((r) => [r.skillName, r.proficiency]))}
      initialSaves={Object.fromEntries(saveRows.map((r) => [r.abilityKey, r.proficient]))}
      initialClasses={classRows.map((c) => ({ id: c.id, name: c.classKey, subclass: c.subclassKey ?? '', subclassNotes: (c as any).subclassNotes ?? '', level: c.level, hitDie: c.hitDie }))}
      initialSpells={spellRows.map((s) => {
        const srd = (s.srdData ?? {}) as Record<string, unknown>;
        return {
          id: s.id, name: s.spellName, level: s.spellLevel, school: s.school, prepared: s.prepared,
          castingTime: String(srd.castingTime ?? ''), range: String(srd.range ?? ''),
          duration: String(srd.duration ?? ''), ritual: Boolean(srd.ritual),
          concentration: Boolean(srd.concentration), components: String(srd.components ?? ''),
          classes: String(srd.classes ?? ''), desc: String(srd.desc ?? ''),
        };
      })}
      initialSlots={spellSlots}
      initialInventory={inventoryRows.map((item) => ({
        id: item.id, quantity: item.quantity, attuned: item.attuned,
        equipped: item.equipped, notes: item.notes, containerId: item.containerId,
        itemDef: { id: item.itemDef.id, srdKey: item.itemDef.srdKey, name: item.itemDef.name, type: item.itemDef.type, weight: item.itemDef.weight, rarity: item.itemDef.rarity, requiresAttunement: item.itemDef.requiresAttunement, keyAbilities: (item.itemDef as any).keyAbilities ?? null, text: item.itemDef.text },
      }))}
      initialFeatures={featureRows}
    />
  );
}
