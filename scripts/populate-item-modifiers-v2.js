// scripts/populate-item-modifiers-v2.js
// Migration: populate modifiers for items with saveBonus, spellAttackBonus,
// saveDCBonus, attackBonus, damageBonus, proficiencyBonus, speedBonus, initBonus.
// Safe to re-run (merges, does not overwrite existing keys).

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const ITEMS = [
  // ── Saving throw + AC ───────────────────────────────────────────────────────
  { pattern: 'cloak of protection',        modifiers: { acBonus: 1, saveBonus: 1 } },
  { pattern: 'ring of protection',         modifiers: { acBonus: 1, saveBonus: 1 } },
  { pattern: 'ioun stone of protection',   modifiers: { acBonus: 1 } },

  // ── Spell attack / save DC ──────────────────────────────────────────────────
  { pattern: 'wand of the war mage, +1',  modifiers: { spellAttackBonus: 1 } },
  { pattern: 'wand of the war mage, +2',  modifiers: { spellAttackBonus: 2 } },
  { pattern: 'wand of the war mage, +3',  modifiers: { spellAttackBonus: 3 } },
  // Generic "wand of the war mage" (no +X suffix) → +1
  { pattern: 'wand of the war mage',       modifiers: { spellAttackBonus: 1 } },
  { pattern: 'arcane grimoire, +1',        modifiers: { spellAttackBonus: 1, saveDCBonus: 1 } },
  { pattern: 'arcane grimoire, +2',        modifiers: { spellAttackBonus: 2, saveDCBonus: 2 } },
  { pattern: 'arcane grimoire, +3',        modifiers: { spellAttackBonus: 3, saveDCBonus: 3 } },
  { pattern: 'arcane grimoire',            modifiers: { spellAttackBonus: 1, saveDCBonus: 1 } },
  { pattern: 'bloodwell vial, +1',         modifiers: { spellAttackBonus: 1, saveDCBonus: 1 } },
  { pattern: 'bloodwell vial, +2',         modifiers: { spellAttackBonus: 2, saveDCBonus: 2 } },
  { pattern: 'bloodwell vial, +3',         modifiers: { spellAttackBonus: 3, saveDCBonus: 3 } },
  { pattern: 'bloodwell vial',             modifiers: { spellAttackBonus: 1, saveDCBonus: 1 } },
  { pattern: 'staff of power',             modifiers: { spellAttackBonus: 2, saveDCBonus: 2, attackBonus: 2, damageBonus: 2, acBonus: 2 } },
  { pattern: 'staff of the magi',          modifiers: { spellAttackBonus: 2, saveDCBonus: 2 } },
  { pattern: 'rod of the pact keeper, +1', modifiers: { spellAttackBonus: 1, saveDCBonus: 1 } },
  { pattern: 'rod of the pact keeper, +2', modifiers: { spellAttackBonus: 2, saveDCBonus: 2 } },
  { pattern: 'rod of the pact keeper, +3', modifiers: { spellAttackBonus: 3, saveDCBonus: 3 } },
  { pattern: 'rod of the pact keeper',     modifiers: { spellAttackBonus: 1, saveDCBonus: 1 } },

  // ── Moon Sickle (druid/ranger) ──────────────────────────────────────────────
  { pattern: 'moon sickle, +1',            modifiers: { spellAttackBonus: 1, attackBonus: 1, damageBonus: 1 } },
  { pattern: 'moon sickle, +2',            modifiers: { spellAttackBonus: 2, attackBonus: 2, damageBonus: 2 } },
  { pattern: 'moon sickle, +3',            modifiers: { spellAttackBonus: 3, attackBonus: 3, damageBonus: 3 } },
  { pattern: 'moon sickle',                modifiers: { spellAttackBonus: 1, attackBonus: 1, damageBonus: 1 } },

  // ── Weapon attack/damage (+1/+2/+3 weapons) ─────────────────────────────────
  // These use name patterns: "longsword, +1", "+1 longsword", etc.
  // We handle the common named magic weapons; generic +X weapons are handled
  // via the name suffix patterns below.
  { pattern: 'vicious weapon',             modifiers: { attackBonus: 0, damageBonus: 0 } }, // placeholder; text says +7 dmg on 20
  { pattern: 'flame tongue',               modifiers: { attackBonus: 0, damageBonus: 0 } }, // fire damage, no flat bonus
  { pattern: 'holy avenger',               modifiers: { attackBonus: 3, damageBonus: 3 } },
  { pattern: 'vorpal sword',               modifiers: { attackBonus: 3, damageBonus: 3 } },
  { pattern: 'nine lives stealer',         modifiers: { attackBonus: 2, damageBonus: 2 } },
  { pattern: 'oathbow',                    modifiers: { attackBonus: 3, damageBonus: 3 } },
  { pattern: 'scimitar of speed',          modifiers: { attackBonus: 2, damageBonus: 2 } },
  { pattern: 'sword of wounding',          modifiers: { attackBonus: 2, damageBonus: 2 } },
  { pattern: 'sword of answering',         modifiers: { attackBonus: 3, damageBonus: 3 } },
  { pattern: 'defender',                   modifiers: { attackBonus: 3, damageBonus: 3 } },

  // ── Proficiency bonus ────────────────────────────────────────────────────────
  { pattern: 'ioun stone of mastery',      modifiers: { proficiencyBonus: 1 } },

  // ── Speed ────────────────────────────────────────────────────────────────────
  { pattern: 'boots of speed',             modifiers: { speedBonus: 30 } },
  { pattern: 'boots of striding',          modifiers: { speedBonus: 10 } },
  { pattern: 'boots of the winterlands',   modifiers: { speedBonus: 0 } }, // special movement, not flat bonus

  // ── Initiative ───────────────────────────────────────────────────────────────
  { pattern: 'ioun stone of agility',      modifiers: { initBonus: 2 } },
  { pattern: 'sentinel shield',            modifiers: { initBonus: 0 } }, // advantage on init, not a flat bonus
];

async function main() {
  let updated = 0;
  let noMatch = 0;

  for (const { pattern, modifiers } of ITEMS) {
    // Skip placeholder entries (all values 0 = no mechanical effect to add)
    if (Object.values(modifiers).every(v => v === 0)) continue;

    const matches = await prisma.itemDefinition.findMany({
      where: { name: { contains: pattern, mode: 'insensitive' } },
      select: { id: true, name: true, modifiers: true },
    });

    for (const item of matches) {
      const existing = (item.modifiers ?? {});
      const merged = { ...existing, ...modifiers };
      await prisma.itemDefinition.update({
        where: { id: item.id },
        data: { modifiers: merged },
      });
      console.log(`Updated: ${item.name}`);
      updated++;
    }

    if (!matches.length) {
      console.log(`No match for: "${pattern}"`);
      noMatch++;
    }
  }

  // Also handle generic "+X weapon" names via suffix pattern
  // These have names ending in ", +1" / ", +2" / ", +3"
  const bonusWeapons = await prisma.itemDefinition.findMany({
    where: {
      name: { contains: '+', mode: 'insensitive' },
      type: { in: ['Weapon', 'Melee Weapon', 'Ranged Weapon', 'Simple Weapon', 'Martial Weapon',
                   'Simple Melee Weapon', 'Martial Melee Weapon', 'Simple Ranged Weapon', 'Martial Ranged Weapon'] },
    },
    select: { id: true, name: true, modifiers: true, type: true },
  });

  for (const item of bonusWeapons) {
    const m = item.name.match(/,?\s*\+(\d+)\s*$/);
    if (!m) continue;
    const bonus = parseInt(m[1]);
    if (bonus < 1 || bonus > 3) continue;

    const existing = (item.modifiers ?? {}) as Record<string, unknown>;
    // Don't overwrite if already set
    if (existing.attackBonus !== undefined) continue;

    await prisma.itemDefinition.update({
      where: { id: item.id },
      data: { modifiers: { ...existing, attackBonus: bonus, damageBonus: bonus } },
    });
    console.log(`Auto-bonus: ${item.name} → +${bonus} atk/dmg`);
    updated++;
  }

  console.log(`\nDone: ${updated} updated, ${noMatch} patterns had no matches`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
