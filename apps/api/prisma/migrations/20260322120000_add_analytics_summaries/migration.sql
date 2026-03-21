-- CreateTable
CREATE TABLE "DocumentMonthlySummary" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "netAmount" DECIMAL(19,4) NOT NULL,
    "incomeTotal" DECIMAL(19,4) NOT NULL,
    "expenseTotal" DECIMAL(19,4) NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentMonthlySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMonthlySummary" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "netAmount" DECIMAL(19,4) NOT NULL,
    "incomeTotal" DECIMAL(19,4) NOT NULL,
    "expenseTotal" DECIMAL(19,4) NOT NULL,
    "transactionCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryMonthlySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentMonthlySummary_documentId_yearMonth_currency_key" ON "DocumentMonthlySummary"("documentId", "yearMonth", "currency");

-- CreateIndex
CREATE INDEX "DocumentMonthlySummary_documentId_yearMonth_idx" ON "DocumentMonthlySummary"("documentId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMonthlySummary_documentId_yearMonth_currency_categoryKey_key" ON "CategoryMonthlySummary"("documentId", "yearMonth", "currency", "categoryKey");

-- CreateIndex
CREATE INDEX "CategoryMonthlySummary_documentId_yearMonth_idx" ON "CategoryMonthlySummary"("documentId", "yearMonth");

-- AddForeignKey
ALTER TABLE "DocumentMonthlySummary" ADD CONSTRAINT "DocumentMonthlySummary_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMonthlySummary" ADD CONSTRAINT "CategoryMonthlySummary_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
