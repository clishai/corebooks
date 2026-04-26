import { Account } from '../../core/types/account.js';
import { getPrismaClient } from '../client.js';
import { PrismaAccount, toCoreAccount, toDbAccount } from '../mappers.js';

export async function listAccounts(): Promise<Account[]> {
  const prisma = getPrismaClient();
  const rows = await prisma.account.findMany({ orderBy: { number: 'asc' } });
  return (rows as unknown as PrismaAccount[]).map(toCoreAccount);
}

export async function findAccountById(id: string): Promise<Account | null> {
  const prisma = getPrismaClient();
  const row = await prisma.account.findUnique({ where: { id } });
  if (!row) return null;
  return toCoreAccount(row as unknown as PrismaAccount);
}

export async function findAccountByNumber(number: string): Promise<Account | null> {
  const prisma = getPrismaClient();
  const row = await prisma.account.findUnique({ where: { number } });
  if (!row) return null;
  return toCoreAccount(row as unknown as PrismaAccount);
}

export async function createAccount(account: Omit<Account, 'id'>): Promise<Account> {
  const prisma = getPrismaClient();
  const row = await prisma.account.create({
    // cast is required at this Prisma adapter boundary: our Record<string,unknown>
    // shape is structurally identical to Prisma's AccountCreateInput but TypeScript
    // enums are not assignable to the generated string-literal-union enum types.
    data: toDbAccount(account as Account) as Parameters<typeof prisma.account.create>[0]['data'],
  });
  return toCoreAccount(row as unknown as PrismaAccount);
}

export async function updateAccount(id: string, updates: Partial<Omit<Account, 'id'>>): Promise<Account> {
  const prisma = getPrismaClient();
  const row = await prisma.account.update({
    where: { id },
    data: updates as Parameters<typeof prisma.account.update>[0]['data'],
  });
  return toCoreAccount(row as unknown as PrismaAccount);
}
