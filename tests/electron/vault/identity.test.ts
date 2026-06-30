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

  it('readIdentity error has code "VaultIdentityMissing" when file absent', () => {
    try {
      readIdentity(tmp)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('VaultIdentityMissing')
    }
  })

  it('readIdentity error has code "VaultIdentityInvalid" when schema mismatches', () => {
    fs.mkdirSync(path.join(tmp, '.corebooks'))
    fs.writeFileSync(path.join(tmp, '.corebooks', 'vault.json'), JSON.stringify({ schemaVersion: 99 }))
    try {
      readIdentity(tmp)
      throw new Error('expected throw')
    } catch (e) {
      expect((e as { code?: string }).code).toBe('VaultIdentityInvalid')
    }
  })

  it('writeIdentity overwrites existing file and keeps 0o600 mode', () => {
    fs.mkdirSync(path.join(tmp, '.corebooks'))
    const first = { schemaVersion: 1 as const, id: generateVaultId(), displayName: 'First', created: new Date().toISOString() }
    writeIdentity(tmp, first)
    // Simulate a mode drift that an external tool might cause.
    fs.chmodSync(path.join(tmp, '.corebooks', 'vault.json'), 0o644)
    const second = { ...first, displayName: 'Second' }
    writeIdentity(tmp, second)
    const filePath = path.join(tmp, '.corebooks', 'vault.json')
    const stat = fs.statSync(filePath)
    expect(stat.mode & 0o777).toBe(0o600)
    expect(JSON.parse(fs.readFileSync(filePath, 'utf-8')).displayName).toBe('Second')
  })

  it('writeIdentity does not leave a .tmp file on success', () => {
    fs.mkdirSync(path.join(tmp, '.corebooks'))
    const identity = { schemaVersion: 1 as const, id: generateVaultId(), displayName: 'Acme', created: new Date().toISOString() }
    writeIdentity(tmp, identity)
    const files = fs.readdirSync(path.join(tmp, '.corebooks'))
    expect(files.some(f => f.includes('.tmp'))).toBe(false)
    expect(files).toContain('vault.json')
  })
})
