import { getPrismaClient } from '../client.js'

export async function getAppSetting<T>(key: string, fallback: T): Promise<T> {
  const prisma = getPrismaClient()
  const row = await prisma.appSetting.findUnique({ where: { key } })
  if (!row) return fallback
  try {
    return JSON.parse(row.value) as T
  } catch {
    return fallback
  }
}

export async function setAppSetting<T>(key: string, value: T): Promise<T> {
  const prisma = getPrismaClient()
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: JSON.stringify(value), updatedAt: new Date() },
    create: { key, value: JSON.stringify(value) },
  })
  return value
}

export async function listAppSettings(): Promise<Record<string, unknown>> {
  const prisma = getPrismaClient()
  const rows = await prisma.appSetting.findMany({ orderBy: { key: 'asc' } })
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value) as unknown
    } catch {
      result[row.key] = row.value
    }
  }
  return result
}
