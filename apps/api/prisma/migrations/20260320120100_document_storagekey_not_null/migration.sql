-- Backfill legacy rows (if any) before enforcing NOT NULL
UPDATE "Document"
SET "storageKey" = 'legacy/' || "id" || '/' || replace("originalFilename", '/', '_')
WHERE "storageKey" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "storageKey" SET NOT NULL;
