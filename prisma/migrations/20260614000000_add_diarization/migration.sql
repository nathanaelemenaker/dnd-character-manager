-- AlterTable: add diarization fields to SessionLog
ALTER TABLE "SessionLog" ADD COLUMN "diarizedSegments" JSONB;
ALTER TABLE "SessionLog" ADD COLUMN "speakerMap" JSONB;
