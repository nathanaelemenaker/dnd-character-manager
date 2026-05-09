-- CreateTable: shared Claude API result cache
CREATE TABLE "ClaudeCache" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaudeCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClaudeCache_type_cacheKey_key" ON "ClaudeCache"("type", "cacheKey");
CREATE INDEX "ClaudeCache_type_name_idx" ON "ClaudeCache"("type", "name");
