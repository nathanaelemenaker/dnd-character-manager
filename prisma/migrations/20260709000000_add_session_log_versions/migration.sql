-- CreateTable
CREATE TABLE "SessionLogVersion" (
    "id" TEXT NOT NULL,
    "sessionLogId" TEXT NOT NULL,
    "generatedOutput" JSONB NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionLogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionLogVersion_sessionLogId_createdAt_idx" ON "SessionLogVersion"("sessionLogId", "createdAt");

-- AddForeignKey
ALTER TABLE "SessionLogVersion" ADD CONSTRAINT "SessionLogVersion_sessionLogId_fkey" FOREIGN KEY ("sessionLogId") REFERENCES "SessionLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
