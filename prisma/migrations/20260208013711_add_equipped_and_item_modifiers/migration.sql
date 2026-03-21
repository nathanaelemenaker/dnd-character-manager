-- CreateEnum
CREATE TYPE "Ruleset" AS ENUM ('SRD_2014', 'SRD_2024');

-- CreateEnum
CREATE TYPE "HpMethod" AS ENUM ('FIXED', 'ROLL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleset" "Ruleset" NOT NULL DEFAULT 'SRD_2014',
    "level" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterClass" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "classKey" TEXT NOT NULL,
    "subclassKey" TEXT,
    "level" INTEGER NOT NULL,
    "hpMethod" "HpMethod" NOT NULL DEFAULT 'FIXED',

    CONSTRAINT "CharacterClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbilityScores" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "str" INTEGER NOT NULL DEFAULT 10,
    "dex" INTEGER NOT NULL DEFAULT 10,
    "con" INTEGER NOT NULL DEFAULT 10,
    "int" INTEGER NOT NULL DEFAULT 10,
    "wis" INTEGER NOT NULL DEFAULT 10,
    "cha" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "AbilityScores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpellDefinition" (
    "id" TEXT NOT NULL,
    "ruleset" "Ruleset" NOT NULL,
    "srdKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "school" TEXT NOT NULL,
    "classes" TEXT[],
    "ritual" BOOLEAN NOT NULL,
    "concentration" BOOLEAN NOT NULL,
    "text" TEXT NOT NULL,
    "sourceAttribution" TEXT NOT NULL,

    CONSTRAINT "SpellDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDefinition" (
    "id" TEXT NOT NULL,
    "ruleset" "Ruleset" NOT NULL,
    "srdKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "weight" DOUBLE PRECISION,
    "rarity" TEXT,
    "requiresAttunement" BOOLEAN,
    "text" TEXT,
    "sourceAttribution" TEXT NOT NULL,
    "modifiers" JSONB,

    CONSTRAINT "ItemDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureDefinition" (
    "id" TEXT NOT NULL,
    "ruleset" "Ruleset" NOT NULL,
    "srdKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classKey" TEXT,
    "subclassKey" TEXT,
    "level" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "sourceAttribution" TEXT NOT NULL,

    CONSTRAINT "FeatureDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownSpell" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "spellId" TEXT NOT NULL,

    CONSTRAINT "KnownSpell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreparedSpell" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "spellId" TEXT NOT NULL,

    CONSTRAINT "PreparedSpell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpellSlotLedger" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "ruleset" "Ruleset" NOT NULL,
    "level" INTEGER NOT NULL,
    "maxSlots" INTEGER NOT NULL,
    "usedSlots" INTEGER NOT NULL DEFAULT 0,
    "asOfLevel" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpellSlotLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "attuned" BOOLEAN NOT NULL DEFAULT false,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "containerId" TEXT,
    "notes" TEXT,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterFeature" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "choicePayload" JSONB,

    CONSTRAINT "CharacterFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AbilityScores_characterId_key" ON "AbilityScores"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "SpellDefinition_srdKey_key" ON "SpellDefinition"("srdKey");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDefinition_srdKey_key" ON "ItemDefinition"("srdKey");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureDefinition_srdKey_key" ON "FeatureDefinition"("srdKey");

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterClass" ADD CONSTRAINT "CharacterClass_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbilityScores" ADD CONSTRAINT "AbilityScores_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownSpell" ADD CONSTRAINT "KnownSpell_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnownSpell" ADD CONSTRAINT "KnownSpell_spellId_fkey" FOREIGN KEY ("spellId") REFERENCES "SpellDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparedSpell" ADD CONSTRAINT "PreparedSpell_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreparedSpell" ADD CONSTRAINT "PreparedSpell_spellId_fkey" FOREIGN KEY ("spellId") REFERENCES "SpellDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpellSlotLedger" ADD CONSTRAINT "SpellSlotLedger_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFeature" ADD CONSTRAINT "CharacterFeature_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterFeature" ADD CONSTRAINT "CharacterFeature_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "FeatureDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
