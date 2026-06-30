import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generateVaultId, readIdentity, writeIdentity } from '../../../src/electron/vault/identity.js'

let tmp: string
beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-id-')) })
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('identity', () => {
  it('generateVaultId returns a v4 UUID', () => {
    const id = generateVaultId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('generateVaultId returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateVaultId()))
    expect(ids.size).toBe(100)
  })

  it('writeIdentity creates .corebooks/vault.json with 0o600 mode', () => {
    fs.mkdirSync(path.join(tmp, '.corebooks'))
    const identity = { schemaVersion: 1 as const, id: generateVaultId(), displayName: 'Acme', created: new Date().toISOString() }
    writeIdentity(tmp, identity)
    const filePath = path.join(tmp, '.corebooks', 'vault.json')
    expect(fs.existsSync(filePath)).toBe(true)
    const stat = fs.statSync(filePath)
    expect(stat.mode & 0o777).toBe(0o600)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8'))).toEqual(identity)
  })

  it('readIdentity returns the written identity', () => {
    fs.mkdirSync(path.join(tmp, '.corebooks'))
    const identity = { schemaVersion: 1 as const, id: generateVaultId(), displayName: 'Acme', created: new Date().toISOString() }
    writeIdentity(tmp, identity)
    expect(readIdentity(tmp)).toEqual(identity)
  })

  it('readIdentity throws VaultIdentityMissing when file absent', () => {
    expect(() => readIdentity(tmp)).toThrow(/VaultIdentityMissing/)
  })

  it('readIdentity throws VaultIdentityInvalid when file has wrong schema', () => {
    fs.mkdirSync(path.join(tmp, '.corebooks'))
    fs.writeFileSync(path.join(tmp, '.corebooks', 'vault.json'), JSON.stringify({ schemaVersion: 99 }))
    expect(() => readIdentity(tmp)).toThrow(/VaultIdentityInvalid/)
  })
})
