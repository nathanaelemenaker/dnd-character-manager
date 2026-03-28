-- Add subclassNotes column to CharacterClass for storing custom subclass descriptions
ALTER TABLE "CharacterClass" ADD COLUMN IF NOT EXISTS "subclassNotes" TEXT;
