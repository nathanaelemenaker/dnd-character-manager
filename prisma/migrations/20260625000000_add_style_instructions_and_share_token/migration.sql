-- AlterTable: add styleInstructions to Campaign
ALTER TABLE "Campaign" ADD COLUMN "styleInstructions" TEXT;

-- AlterTable: add shareToken to SessionLog
ALTER TABLE "SessionLog" ADD COLUMN "shareToken" TEXT;

-- CreateIndex: unique constraint on shareToken
CREATE UNIQUE INDEX "SessionLog_shareToken_key" ON "SessionLog"("shareToken");
