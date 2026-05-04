-- CreateTable
CREATE TABLE "PeriodConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12,
    "fiscalYearEndDay" INTEGER NOT NULL DEFAULT 31,
    "closeFrequency" TEXT NOT NULL DEFAULT 'year-end',
    "retainedEarningsAcctId" TEXT
);

-- CreateTable
CREATE TABLE "ClosedPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryId" TEXT NOT NULL
);
