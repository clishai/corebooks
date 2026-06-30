import fs from 'node:fs'
import path from 'node:path'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type { AuditActor, AuditEvent } from './types.js'

const AUDIT_FILE = path.join('.corebooks', 'audit.jsonl')

export const GENESIS_PREV_HASH = '0'.repeat(64)

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  const keys = Object.keys(value as Record<string, unknown>).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson((value as Record<string, unknown>)[k])).join(',') + '}'
}

function hashEvent(e: Omit<AuditEvent, 'hash'>): string {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalJson(e))))
}

interface AppendInput {
  actor: AuditActor
  event: string
  data: unknown
}

export function appendAuditEvent(vaultPath: string, input: AppendInput): AuditEvent {
  const file = path.join(vaultPath, AUDIT_FILE)
  const existing = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    : []
  const seq = existing.length
  const prevHash = seq === 0
    ? GENESIS_PREV_HASH
    : (JSON.parse(existing[existing.length - 1]) as AuditEvent).hash
  const skeleton = {
    seq,
    at: new Date().toISOString(),
    actor: input.actor,
    event: input.event,
    data: input.data,
    prevHash,
  }
  const event: AuditEvent = { ...skeleton, hash: hashEvent(skeleton) }
  fs.appendFileSync(file, JSON.stringify(event) + '\n', { mode: 0o600 })
  return event
}

export function readAuditLog(vaultPath: string): AuditEvent[] {
  const file = path.join(vaultPath, AUDIT_FILE)
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as AuditEvent)
}

export type VerifyResult = { ok: true } | { ok: false; brokenAt: number }

export function verifyAuditChain(vaultPath: string): VerifyResult {
  const log = readAuditLog(vaultPath)
  let prev = GENESIS_PREV_HASH
  for (let i = 0; i < log.length; i++) {
    const e = log[i]
    if (e.seq !== i) return { ok: false, brokenAt: i }
    if (e.prevHash !== prev) return { ok: false, brokenAt: i }
    const { hash, ...rest } = e
    if (hashEvent(rest) !== hash) return { ok: false, brokenAt: i }
    prev = hash
  }
  return { ok: true }
}
