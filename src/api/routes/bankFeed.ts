import { FastifyPluginAsync } from 'fastify'
import {
  BANK_RULE_TEMPLATES,
  createBankRule,
  deleteBankRule,
  listBankRules,
  updateBankRule,
  type BankRuleInput,
} from '../../db/repositories/bankRuleRepository.js'
import { importBankFeedCsv } from '../services/bankFeedService.js'

function parseRuleInput(body: Record<string, unknown>): BankRuleInput {
  return {
    name: String(body['name'] ?? '').trim(),
    priority: Number(body['priority'] ?? 100),
    enabled: body['enabled'] !== false,
    matchField: String(body['matchField'] ?? 'memo') as BankRuleInput['matchField'],
    matchType: String(body['matchType'] ?? 'contains') as BankRuleInput['matchType'],
    pattern: String(body['pattern'] ?? '').trim(),
    accountId: typeof body['accountId'] === 'string' && body['accountId'] ? body['accountId'] : null,
    entryType: String(body['entryType'] ?? 'expense') as BankRuleInput['entryType'],
    memo: typeof body['memo'] === 'string' && body['memo'] ? body['memo'] : null,
    paymentMethod: typeof body['paymentMethod'] === 'string' && body['paymentMethod'] ? body['paymentMethod'] : null,
  }
}

function parseRulePatch(body: Record<string, unknown>): Partial<BankRuleInput> {
  const patch: Partial<BankRuleInput> = {}
  if ('name' in body) patch.name = String(body['name'] ?? '').trim()
  if ('priority' in body) patch.priority = Number(body['priority'])
  if ('enabled' in body) patch.enabled = body['enabled'] !== false
  if ('matchField' in body) patch.matchField = String(body['matchField']) as BankRuleInput['matchField']
  if ('matchType' in body) patch.matchType = String(body['matchType']) as BankRuleInput['matchType']
  if ('pattern' in body) patch.pattern = String(body['pattern'] ?? '').trim()
  if ('accountId' in body) patch.accountId = typeof body['accountId'] === 'string' && body['accountId'] ? body['accountId'] : null
  if ('entryType' in body) patch.entryType = String(body['entryType']) as BankRuleInput['entryType']
  if ('memo' in body) patch.memo = typeof body['memo'] === 'string' && body['memo'] ? body['memo'] : null
  if ('paymentMethod' in body) patch.paymentMethod = typeof body['paymentMethod'] === 'string' && body['paymentMethod'] ? body['paymentMethod'] : null
  return patch
}

export const bankFeedRoutes: FastifyPluginAsync = async (app) => {
  app.get('/rules', async () => listBankRules())
  app.get('/rule-templates', async () => BANK_RULE_TEMPLATES)

  app.post<{ Body: Record<string, unknown> }>('/rules', async (req, reply) => {
    const input = parseRuleInput(req.body)
    if (!input.name || !input.pattern) return reply.badRequest('Rule name and pattern are required.')
    return reply.code(201).send(await createBankRule(input))
  })

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>('/rules/:id', async (req) => {
    return updateBankRule(req.params.id, parseRulePatch(req.body))
  })

  app.delete<{ Params: { id: string } }>('/rules/:id', async (req, reply) => {
    await deleteBankRule(req.params.id)
    return reply.code(204).send()
  })

  app.post<{ Body: { data?: string; bankAccountId?: string } }>('/import-csv', async (req, reply) => {
    if (!req.body.data?.trim()) return reply.badRequest('data is required.')
    if (!req.body.bankAccountId) return reply.badRequest('bankAccountId is required.')
    return importBankFeedCsv(req.body.data, { bankAccountId: req.body.bankAccountId })
  })
}
