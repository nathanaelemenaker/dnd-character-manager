-- AlterTable: make userId optional and add guestName to CampaignMember
ALTER TABLE "CampaignMember" ADD COLUMN "guestName" TEXT;
ALTER TABLE "CampaignMember" ALTER COLUMN "userId" DROP NOT NULL;
