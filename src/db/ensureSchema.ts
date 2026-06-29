import type Database from 'better-sqlite3-multiple-ciphers';

type Db = InstanceType<typeof Database>;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "normalBalance" TEXT NOT NULL,
    "isContra" BOOLEAN NOT NULL DEFAULT false,
    "contraTo" TEXT,
    "classification" TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "Account_number_key" ON "Account"("number");

CREATE TABLE IF NOT EXISTS "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "memo" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "reversalOf" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RecurringTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "schedule" TEXT NOT NULL,
    "customCron" TEXT,
    "nextDue" DATETIME NOT NULL,
    "autoPost" BOOLEAN NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RecurringLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    FOREIGN KEY ("templateId") REFERENCES "RecurringTemplate"("id") ON DELETE CASCADE,
    FOREIGN KEY ("accountId") REFERENCES "Account"("id")
);
`;

export function ensureSchema(db: Db): void {
  db.exec(SCHEMA_SQL);
    // Idempotent column migrations for databases created before this column existed.
    const cols = (db.prepare('PRAGMA table_info(Account)').all() as { name: string }[]).map(c => c.name);
    if (!cols.includes('classification')) {
      db.exec('ALTER TABLE "Account" ADD COLUMN "classification" TEXT');
    }
    db.exec(`CREATE TABLE IF NOT EXISTS "PeriodConfig" ("id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton', "fiscalYearEndMonth" INTEGER NOT NULL DEFAULT 12, "fiscalYearEndDay" INTEGER NOT NULL DEFAULT 31, "closeFrequency" TEXT NOT NULL DEFAULT 'year-end', "retainedEarningsAcctId" TEXT)`);
    db.exec(`CREATE TABLE IF NOT EXISTS "ClosedPeriod" ("id" TEXT NOT NULL PRIMARY KEY, "year" INTEGER NOT NULL, "month" INTEGER NOT NULL, "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "entryId" TEXT NOT NULL)`);
    db.exec(`CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "passwordHash" TEXT NOT NULL, "role" TEXT NOT NULL DEFAULT 'Viewer', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

    const entryCols = (db.prepare('PRAGMA table_info(JournalEntry)').all() as { name: string }[]).map(c => c.name);
    if (!entryCols.includes('postedVia')) db.exec('ALTER TABLE "JournalEntry" ADD COLUMN "postedVia" TEXT');
    if (!entryCols.includes('sourceType')) db.exec('ALTER TABLE "JournalEntry" ADD COLUMN "sourceType" TEXT');
    if (!entryCols.includes('sourceId')) db.exec('ALTER TABLE "JournalEntry" ADD COLUMN "sourceId" TEXT');

    db.exec(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    db.exec(`CREATE TABLE IF NOT EXISTS "AuditEvent" ("id" TEXT NOT NULL PRIMARY KEY, "action" TEXT NOT NULL, "entityType" TEXT NOT NULL, "entityId" TEXT, "detailJson" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    db.exec(`CREATE TABLE IF NOT EXISTS "BankRule" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "priority" INTEGER NOT NULL DEFAULT 100, "enabled" BOOLEAN NOT NULL DEFAULT 1, "matchField" TEXT NOT NULL, "matchType" TEXT NOT NULL, "pattern" TEXT NOT NULL, "accountId" TEXT, "entryType" TEXT NOT NULL DEFAULT 'expense', "memo" TEXT, "paymentMethod" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    db.exec(`CREATE TABLE IF NOT EXISTS "ReconciliationSession" ("id" TEXT NOT NULL PRIMARY KEY, "accountId" TEXT NOT NULL, "statementDate" DATETIME NOT NULL, "endingBalance" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'open', "notes" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    db.exec(`CREATE TABLE IF NOT EXISTS "ReconciliationItem" ("id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "entryId" TEXT NOT NULL, "cleared" BOOLEAN NOT NULL DEFAULT 0, FOREIGN KEY ("sessionId") REFERENCES "ReconciliationSession"("id") ON DELETE CASCADE)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS "ReconciliationItem_sessionId_entryId_key" ON "ReconciliationItem"("sessionId", "entryId")`);
  db.exec(`CREATE TABLE IF NOT EXISTS "PluginCategory" ("id" TEXT NOT NULL PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT NOT NULL, "permissions" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT 0, "builtIn" BOOLEAN NOT NULL DEFAULT 1, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}
