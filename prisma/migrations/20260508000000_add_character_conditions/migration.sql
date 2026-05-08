-- AlterTable: add conditions JSON column to Character
ALTER TABLE "Character" ADD COLUMN "conditions" JSONB NOT NULL DEFAULT '[]';
