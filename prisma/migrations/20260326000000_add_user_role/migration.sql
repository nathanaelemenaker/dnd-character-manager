-- prisma/migrations/20260326000000_add_user_role/migration.sql

CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');

ALTER TABLE "User"
  ADD COLUMN "role"      "UserRole"  NOT NULL DEFAULT 'USER',
  ADD COLUMN "deletedAt" TIMESTAMP(3);
