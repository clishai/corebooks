import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  appendAuditEvent,
  readAuditLog,
  verifyAuditChain,
  canonicalJson,
  GENESIS_PREV_HASH,
} from '../../../src/electron/vault/audit.js'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-aud-'))
  fs.mkdirSync(path.join(tmp, '.corebooks'))
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('audit', () => {
  it('canonicalJson sorts keys deterministically', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}')
    expect(canonicalJson({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}')
  })

  it('first append writes genesis entry with GENESIS_PREV_HASH', () => {
    appendAuditEvent(tmp, { actor: 'system', event: 'vault.created', data: { id: 'test' } })
    const log = readAuditLog(tmp)
    expect(log).toHaveLength(1)
    expect(log[0].seq).toBe(0)
    expect(log[0].prevHash).toBe(GENESIS_PREV_HASH)
    expect(log[0].hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('subsequent appends chain prevHash to previous hash', () => {
    appendAuditEvent(tmp, { actor: 'system', event: 'a', data: {} })
    appendAuditEvent(tmp, { actor: 'system', event: 'b', data: {} })
    const log = readAuditLog(tmp)
    expect(log).toHaveLength(2)
    expect(log[1].seq).toBe(1)
    expect(log[1].prevHash).toBe(log[0].hash)
  })

  it('verifyAuditChain returns ok:true for intact chain', () => {
    appendAuditEvent(tmp, { actor: 'system', event: 'a', data: {} })
    appendAuditEvent(tmp, { actor: 'system', event: 'b', data: {} })
    appendAuditEvent(tmp, { actor: 'system', event: 'c', data: {} })
    expect(verifyAuditChain(tmp)).toEqual({ ok: true })
  })

  // Spec test T4
  it('detects tampered audit line at correct index', () => {
    for (let i = 0; i < 5; i++) appendAuditEvent(tmp, { actor: 'system', event: `e${i}`, data: {} })
    const file = path.join(tmp, '.corebooks', 'audit.jsonl')
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    const obj = JSON.parse(lines[2])
    obj.event = 'TAMPERED'
    lines[2] = JSON.stringify(obj)
    fs.writeFileSync(file, lines.join('\n') + '\n')
    expect(verifyAuditChain(tmp)).toEqual({ ok: false, brokenAt: 2 })
  })

  it('appending after tampering still succeeds; verify keeps reporting same brokenAt', () => {
    for (let i = 0; i < 3; i++) appendAuditEvent(tmp, { actor: 'system', event: `e${i}`, data: {} })
    const file = path.join(tmp, '.corebooks', 'audit.jsonl')
    const lines = fs.readFileSync(file, 'utf-8').split('\n').filter(Boolean)
    const obj = JSON.parse(lines[1])
    obj.event = 'X'
    lines[1] = JSON.stringify(obj)
    fs.writeFileSync(file, lines.join('\n') + '\n')
    appendAuditEvent(tmp, { actor: 'system', event: 'post-tamper', data: {} })
    expect(verifyAuditChain(tmp)).toEqual({ ok: false, brokenAt: 1 })
  })
})
