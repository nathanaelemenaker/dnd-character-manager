-- Add keyAbilities column to ItemDefinition for storing curated ability summaries
ALTER TABLE "ItemDefinition" ADD COLUMN IF NOT EXISTS "keyAbilities" TEXT;
