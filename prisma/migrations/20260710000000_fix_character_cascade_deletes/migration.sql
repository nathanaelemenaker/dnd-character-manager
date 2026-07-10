-- Fix FK constraints that were missing ON DELETE CASCADE
-- These were defined as Cascade in the Prisma schema but the DB constraints were left as RESTRICT

ALTER TABLE "AuditEvent" DROP CONSTRAINT "AuditEvent_characterId_fkey";
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CharacterFeature" DROP CONSTRAINT "CharacterFeature_characterId_fkey";
ALTER TABLE "CharacterFeature" ADD CONSTRAINT "CharacterFeature_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_characterId_fkey";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnownSpell" DROP CONSTRAINT "KnownSpell_characterId_fkey";
ALTER TABLE "KnownSpell" ADD CONSTRAINT "KnownSpell_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PreparedSpell" DROP CONSTRAINT "PreparedSpell_characterId_fkey";
ALTER TABLE "PreparedSpell" ADD CONSTRAINT "PreparedSpell_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"(id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpellSlotLedger" DROP CONSTRAINT "SpellSlotLedger_characterId_fkey";
ALTER TABLE "SpellSlotLedger" ADD CONSTRAINT "SpellSlotLedger_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"(id) ON DELETE CASCADE ON UPDATE CASCADE;
