// scripts/populate-item-modifiers.ts
// One-time migration: populate ItemDefinition.modifiers for SRD items that
// set ability scores when equipped + attuned. Safe to re-run (idempotent).
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Each entry: name pattern (case-insensitive substring), modifiers to set
const ITEMS: { pattern: string; modifiers: Record<string, unknown> }[] = [
  // INT setters
  { pattern: 'headband of intellect',       modifiers: { setAbility: { INT: 19 } } },
  { pattern: 'ioun stone of intellect',     modifiers: { setAbility: { INT: 19 } } },
  // CON setter
  { pattern: 'amulet of health',            modifiers: { setAbility: { CON: 19 } } },
  // WIS setter
  { pattern: 'periapt of wisdom',           modifiers: { setAbility: { WIS: 19 } } },
  // CHA setter
  { pattern: 'ioun stone of leadership',    modifiers: { setAbility: { CHA: 19 } } },
  // STR setters — Belt of Giant Strength variants
  { pattern: 'belt of hill giant strength',   modifiers: { setAbility: { STR: 21 } } },
  { pattern: 'belt of stone giant strength',  modifiers: { setAbility: { STR: 23 } } },
  { pattern: 'belt of frost giant strength',  modifiers: { setAbility: { STR: 23 } } },
  { pattern: 'belt of fire giant strength',   modifiers: { setAbility: { STR: 25 } } },
  { pattern: 'belt of cloud giant strength',  modifiers: { setAbility: { STR: 27 } } },
  { pattern: 'belt of storm giant strength',  modifiers: { setAbility: { STR: 29 } } },
  // Gauntlets of Ogre Power — STR 19
  { pattern: 'gauntlets of ogre power',     modifiers: { setAbility: { STR: 19 } } },
];

async function main() {
  let updated = 0;
  let skipped = 0;

  for (const { pattern, modifiers } of ITEMS) {
    const matches = await prisma.itemDefinition.findMany({
      where: { name: { contains: pattern, mode: 'insensitive' } },
      select: { id: true, name: true, modifiers: true },
    });

    for (const item of matches) {
      const existing = item.modifiers as Record<string, unknown> | null;
      // Merge: don't overwrite AC-related modifiers already present
      const merged = { ...existing, ...modifiers };
      await prisma.itemDefinition.update({
        where: { id: item.id },
        data: { modifiers: merged },
      });
      console.log(`Updated: ${item.name}`);
      updated++;
    }

    if (!matches.length) {
      console.log(`No match for pattern: "${pattern}"`);
      skipped++;
    }
  }

  console.log(`\nDone: ${updated} updated, ${skipped} patterns had no matches`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
