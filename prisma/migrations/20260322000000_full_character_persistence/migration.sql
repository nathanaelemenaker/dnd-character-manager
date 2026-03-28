-- Migration: full_character_persistence
-- Run via: npx prisma migrate deploy

-- 1. Add new columns to Character
ALTER TABLE "Character"
  ADD COLUMN IF NOT EXISTS "race"        TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "background"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "alignment"   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "xp"          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ac"          INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "speed"       INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "hpCurrent"   INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "hpMax"       INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "hpTemp"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inspiration" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "currency"    JSONB NOT NULL DEFAULT '{"cp":0,"sp":0,"ep":0,"gp":0,"pp":0}',
  ADD COLUMN IF NOT EXISTS "bio"         JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "deathSaves"  JSONB NOT NULL DEFAULT '{"successes":0,"failures":0}';

-- 2. Add hitDie to CharacterClass
ALTER TABLE "CharacterClass"
  ADD COLUMN IF NOT EXISTS "hitDie" INTEGER NOT NULL DEFAULT 8;

-- 3. New table: CharacterSkill
CREATE TABLE IF NOT EXISTS "CharacterSkill" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "characterId" TEXT NOT NULL,
  "skillName"   TEXT NOT NULL,
  "proficiency" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CharacterSkill_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE,
  CONSTRAINT "CharacterSkill_characterId_skillName_key"
    UNIQUE ("characterId", "skillName")
);

-- 4. New table: CharacterSave
CREATE TABLE IF NOT EXISTS "CharacterSave" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "characterId" TEXT NOT NULL,
  "abilityKey"  TEXT NOT NULL,
  "proficient"  BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "CharacterSave_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE,
  CONSTRAINT "CharacterSave_characterId_abilityKey_key"
    UNIQUE ("characterId", "abilityKey")
);

-- 5. New table: KnownSpell (replaces old join-table approach)
-- NOTE: Old KnownSpell table referenced SpellDefinition.
-- We drop the FK constraint and add new columns instead of full replacement
-- so existing data is preserved. If your KnownSpell table is empty, you can
-- just drop and recreate it — see comment below.

-- Option A: Alter existing table (safe if data exists)
ALTER TABLE "KnownSpell"
  ADD COLUMN IF NOT EXISTS "spellName"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "spellLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "school"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "prepared"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "srdData"    JSONB NOT NULL DEFAULT '{}';

-- Add unique constraint on (characterId, spellName) if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'KnownSpell_characterId_spellName_key'
  ) THEN
    ALTER TABLE "KnownSpell"
      ADD CONSTRAINT "KnownSpell_characterId_spellName_key"
      UNIQUE ("characterId", "spellName");
  END IF;
END $$;

-- 6. New table: CharacterCustomFeature
CREATE TABLE IF NOT EXISTS "CharacterCustomFeature" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "characterId" TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "source"      TEXT NOT NULL DEFAULT '',
  "desc"        TEXT NOT NULL DEFAULT '',
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "CharacterCustomFeature_characterId_fkey"
    FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE
);

-- 7. Add unique constraint to SpellSlotLedger (characterId, level) if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'SpellSlotLedger_characterId_level_key'
  ) THEN
    ALTER TABLE "SpellSlotLedger"
      ADD CONSTRAINT "SpellSlotLedger_characterId_level_key"
      UNIQUE ("characterId", "level");
  END IF;
END $$;

-- 8. Add onDelete CASCADE to AbilityScores if not present
-- (safe to run; no-op if already set)
ALTER TABLE "AbilityScores"
  DROP CONSTRAINT IF EXISTS "AbilityScores_characterId_fkey";
ALTER TABLE "AbilityScores"
  ADD CONSTRAINT "AbilityScores_characterId_fkey"
  FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE;
