-- prisma/migrations/20260328000001_add_character_notes/migration.sql

CREATE TABLE "CharacterNote" (
  "id"          TEXT NOT NULL,
  "characterId" TEXT NOT NULL,
  "title"       TEXT NOT NULL DEFAULT 'Untitled',
  "body"        TEXT NOT NULL DEFAULT '',
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CharacterNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CharacterNote_characterId_fkey"
    FOREIGN KEY ("characterId")
    REFERENCES "Character"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
