import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { getPrismaClient } from '../client.js'

function hashPassword(password: string, salt: string): string {
  return createHash('sha256').update(salt + password).digest('hex')
}

export function generateSalt(): string {
  return randomBytes(16).toString('hex')
}

export function createPasswordHash(password: string): string {
  const salt = generateSalt()
  return `${salt}:${hashPassword(password, salt)}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = hashPassword(password, salt)
  const a = Buffer.from(candidate, 'hex')
  const b = Buffer.from(hash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function createUser(
  email: string,
  password: string,
  role: 'Viewer' | 'Bookkeeper' | 'Admin',
) {
  const prisma = getPrismaClient()
  return prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      email,
      passwordHash: createPasswordHash(password),
      role,
    },
    select: { id: true, email: true, role: true, createdAt: true },
  })
}

export async function findUserByEmail(email: string) {
  return getPrismaClient().user.findUnique({ where: { email } })
}

export async function listUsers() {
  return getPrismaClient().user.findMany({
    select: { id: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function updateUserRole(id: string, role: string) {
  return getPrismaClient().user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, role: true },
  })
}

export async function deleteUser(id: string) {
  return getPrismaClient().user.delete({ where: { id } })
}

export async function countAdmins(): Promise<number> {
  return getPrismaClient().user.count({ where: { role: 'Admin' } })
}

export async function hasAnyUser(): Promise<boolean> {
  return (await getPrismaClient().user.count()) > 0
}
