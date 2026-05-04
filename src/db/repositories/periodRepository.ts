import { getPrismaClient } from '../client.js';

export interface PeriodConfigRow {
  id: string;
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  closeFrequency: string;
  retainedEarningsAcctId: string | null;
}

export interface ClosedPeriodRow {
  id: string;
  year: number;
  month: number;
  closedAt: Date;
  entryId: string;
}

const DEFAULT_CONFIG: PeriodConfigRow = {
  id: 'singleton',
  fiscalYearEndMonth: 12,
  fiscalYearEndDay: 31,
  closeFrequency: 'year-end',
  retainedEarningsAcctId: null,
};

export async function getPeriodConfig(): Promise<PeriodConfigRow> {
  const prisma = getPrismaClient();
  const config = await (prisma as unknown as {
    periodConfig: {
      findUnique: (args: { where: { id: string } }) => Promise<PeriodConfigRow | null>;
    };
  }).periodConfig.findUnique({ where: { id: 'singleton' } });
  return config ?? DEFAULT_CONFIG;
}

export async function savePeriodConfig(data: {
  fiscalYearEndMonth: number;
  fiscalYearEndDay: number;
  closeFrequency: string;
  retainedEarningsAcctId: string | null;
}): Promise<PeriodConfigRow> {
  const prisma = getPrismaClient();
  return (prisma as unknown as {
    periodConfig: {
      upsert: (args: {
        where: { id: string };
        create: PeriodConfigRow;
        update: typeof data;
      }) => Promise<PeriodConfigRow>;
    };
  }).periodConfig.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', ...data },
    update: data,
  });
}

export async function getClosedPeriods(): Promise<ClosedPeriodRow[]> {
  const prisma = getPrismaClient();
  return (prisma as unknown as {
    closedPeriod: {
      findMany: (args: { orderBy: Array<Record<string, string>> }) => Promise<ClosedPeriodRow[]>;
    };
  }).closedPeriod.findMany({ orderBy: [{ year: 'desc' }, { month: 'desc' }] });
}

export async function isPeriodClosed(year: number, month: number): Promise<boolean> {
  const prisma = getPrismaClient();
  const row = await (prisma as unknown as {
    closedPeriod: {
      findFirst: (args: { where: { year: number; month: number } }) => Promise<ClosedPeriodRow | null>;
    };
  }).closedPeriod.findFirst({ where: { year, month } });
  return row !== null;
}

export async function closePeriod(year: number, month: number, entryId: string): Promise<ClosedPeriodRow> {
  const prisma = getPrismaClient();
  return (prisma as unknown as {
    closedPeriod: {
      create: (args: { data: Omit<ClosedPeriodRow, 'closedAt'> }) => Promise<ClosedPeriodRow>;
    };
  }).closedPeriod.create({
    data: { id: crypto.randomUUID(), year, month, entryId },
  });
}
