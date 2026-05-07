-- AlterTable: make rawTranscript optional with empty default, add transcription tracking fields
ALTER TABLE "SessionLog"
  ALTER COLUMN "rawTranscript" SET DEFAULT '',
  ADD COLUMN "transcriptStatus" TEXT,
  ADD COLUMN "transcriptError"  TEXT,
  ADD COLUMN "audioPath"        TEXT;
