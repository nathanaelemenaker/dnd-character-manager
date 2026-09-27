-- AlterTable: add appearance to Character
ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "appearance" TEXT;

-- AlterTable: add guestCharacterAppearance to CampaignMember
ALTER TABLE "CampaignMember" ADD COLUMN IF NOT EXISTS "guestCharacterAppearance" TEXT;

-- AlterTable: add sessionImages to SessionLog
ALTER TABLE "SessionLog" ADD COLUMN IF NOT EXISTS "sessionImages" JSONB;
