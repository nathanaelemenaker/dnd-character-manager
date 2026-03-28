-- Migration: fix_knownspell_legacy_column
-- Removes the old spellId foreign key and column from KnownSpell
-- that referenced SpellDefinition. Our new KnownSpell stores spell
-- data directly via spellName/srdData fields instead.

-- Drop old FK constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'KnownSpell_spellId_fkey'
    AND table_name = 'KnownSpell'
  ) THEN
    ALTER TABLE "KnownSpell" DROP CONSTRAINT "KnownSpell_spellId_fkey";
  END IF;
END $$;

-- Drop old spellId column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'KnownSpell' AND column_name = 'spellId'
  ) THEN
    ALTER TABLE "KnownSpell" DROP COLUMN "spellId";
  END IF;
END $$;

-- Ensure new columns exist (safe to run if already applied)
ALTER TABLE "KnownSpell"
  ADD COLUMN IF NOT EXISTS "spellName"  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "spellLevel" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "school"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "prepared"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "srdData"    JSONB NOT NULL DEFAULT '{}';

-- Clean up any orphaned rows from the old schema (rows with empty spellName)
DELETE FROM "KnownSpell" WHERE "spellName" = '';

-- Add unique constraint if not already present
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
