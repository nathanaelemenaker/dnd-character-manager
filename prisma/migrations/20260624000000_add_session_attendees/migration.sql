-- AlterTable: add attendees field to SessionLog
ALTER TABLE "SessionLog" ADD COLUMN "attendees" JSONB;
