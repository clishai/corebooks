import { getPrismaClient } from '../client.js'

export interface PluginCategoryMeta {
  id: string
  name: string
  description: string
  permissions: string[]
  enabled: boolean
  builtIn: boolean
}

const DEFAULT_CATEGORIES: PluginCategoryMeta[] = [
  {
    id: 'payments',
    name: 'Payments',
    description: 'Stripe, Square, PayPal, and payment processor import adapters.',
    permissions: ['network', 'create-drafts', 'read-accounts'],
    enabled: false,
    builtIn: true,
  },
  {
    id: 'payroll',
    name: 'Payroll',
    description: 'Payroll provider summaries and jurisdiction-specific payroll draft entries.',
    permissions: ['network', 'create-drafts', 'read-accounts'],
    enabled: false,
    builtIn: true,
  },
  {
    id: 'commerce',
    name: 'Commerce',
    description: 'Shopify, WooCommerce, marketplace, and point-of-sale integrations.',
    permissions: ['network', 'create-drafts', 'read-accounts'],
    enabled: false,
    builtIn: true,
  },
  {
    id: 'documents',
    name: 'Documents',
    description: 'Receipt OCR, statement enrichment, and document processing providers.',
    permissions: ['read-vault-files', 'create-drafts'],
    enabled: false,
    builtIn: true,
  },
  {
    id: 'tax',
    name: 'Tax exports',
    description: 'Country-specific tax reports and filing export packages.',
    permissions: ['read-reports', 'export-data'],
    enabled: false,
    builtIn: true,
  },
]

function fromRow(row: {
  id: string
  name: string
  description: string
  permissions: string
  enabled: boolean
  builtIn: boolean
}): PluginCategoryMeta {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: JSON.parse(row.permissions) as string[],
    enabled: row.enabled,
    builtIn: row.builtIn,
  }
}

export async function ensurePluginCategories(): Promise<void> {
  const prisma = getPrismaClient()
  for (const category of DEFAULT_CATEGORIES) {
    await prisma.pluginCategory.upsert({
      where: { id: category.id },
      update: {
        name: category.name,
        description: category.description,
        permissions: JSON.stringify(category.permissions),
        builtIn: category.builtIn,
      },
      create: {
        id: category.id,
        name: category.name,
        description: category.description,
        permissions: JSON.stringify(category.permissions),
        enabled: category.enabled,
        builtIn: category.builtIn,
      },
    })
  }
}

export async function listPluginCategories(): Promise<PluginCategoryMeta[]> {
  await ensurePluginCategories()
  const prisma = getPrismaClient()
  const rows = await prisma.pluginCategory.findMany({ orderBy: { name: 'asc' } })
  return rows.map(fromRow)
}

export async function setPluginCategoryEnabled(id: string, enabled: boolean): Promise<PluginCategoryMeta> {
  await ensurePluginCategories()
  const prisma = getPrismaClient()
  const row = await prisma.pluginCategory.update({
    where: { id },
    data: { enabled, updatedAt: new Date() },
  })
  return fromRow(row)
}
