-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AlterTable (nullable first for backfill)
ALTER TABLE "Document" ADD COLUMN "userId" TEXT;

-- Own existing rows (dev / upgrades) — password hash is not used for login
INSERT INTO "User" ("id", "email", "hashedPassword", "createdAt", "updatedAt")
VALUES (
    'usr_legacy_bootstrap',
    'legacy@ledgerlens.local',
    '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

UPDATE "Document" SET "userId" = 'usr_legacy_bootstrap' WHERE "userId" IS NULL;

ALTER TABLE "Document" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Document_userId_idx" ON "Document"("userId");
