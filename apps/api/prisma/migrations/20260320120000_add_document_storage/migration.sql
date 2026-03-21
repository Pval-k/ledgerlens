-- AlterTable
ALTER TABLE "Document" ADD COLUMN "storageKey" TEXT,
ADD COLUMN "contentType" TEXT,
ADD COLUMN "sizeBytes" INTEGER,
ADD COLUMN "sha256" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");
