import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { VaultManager } from '../../src/electron/vaultManager.js'
import type { VaultEncryption } from '../../src/electron/vaultTypes.js'

let userData: string
let parentDir: string
let manager: VaultManager

const SAMPLE_ENC: VaultEncryption = {
  algorithm: 'argon2id-aes256-gcm',
  argon2: { m: 65536, t: 3, p: 4 },
  slots: {
    password: { salt: 'aa'.repeat(32), iv: 'bb'.repeat(12), ct: 'cc'.repeat(48) },
    recovery: { salt: 'dd'.repeat(32), iv: 'ee'.repeat(12), ct: 'ff'.repeat(48) },
  },
}

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-enc-user-'))
  parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-enc-parent-'))
  manager = new VaultManager(userData)
})

afterEach(() => {
  fs.rmSync(userData, { recursive: true, force: true })
  fs.rmSync(parentDir, { recursive: true, force: true })
})

describe('getEncryption / setEncryption / removeEncryption', () => {
  it('returns null when no vault is selected', () => {
    expect(manager.getEncryption()).toBeNull()
  })

  it('returns null when the vault has no encryption block', () => {
    const v = manager.create('test', parentDir)
    manager.select(v.path)
    expect(manager.getEncryption()).toBeNull()
  })

  it('persists encryption to .corebooks and reads it back unchanged', () => {
    const v = manager.create('test', parentDir)
    manager.select(v.path)
    manager.setEncryption(SAMPLE_ENC)

    const raw = JSON.parse(fs.readFileSync(path.join(v.path, '.corebooks'), 'utf-8'))
    expect(raw.encryption).toEqual(SAMPLE_ENC)
    expect(manager.getEncryption()).toEqual(SAMPLE_ENC)
  })

  it('overwrites an existing encryption block on subsequent set calls', () => {
    const v = manager.create('test', parentDir)
    manager.select(v.path)
    manager.setEncryption(SAMPLE_ENC)

    const updated: VaultEncryption = {
      ...SAMPLE_ENC,
      slots: {
        ...SAMPLE_ENC.slots,
        password: { salt: '11'.repeat(32), iv: '22'.repeat(12), ct: '33'.repeat(48) },
      },
    }
    manager.setEncryption(updated)
    expect(manager.getEncryption()).toEqual(updated)
  })

  it('removes the encryption block but preserves the rest of metadata', () => {
    const v = manager.create('test', parentDir)
    manager.select(v.path)
    manager.setEncryption(SAMPLE_ENC)
    manager.removeEncryption()

    expect(manager.getEncryption()).toBeNull()
    const raw = JSON.parse(fs.readFileSync(path.join(v.path, '.corebooks'), 'utf-8'))
    expect(raw.encryption).toBeUndefined()
    expect(raw.name).toBe('test')
    expect(raw.version).toBe('1')
    expect(typeof raw.created).toBe('string')
  })

  it('throws when setEncryption is called with no current vault', () => {
    expect(() => manager.setEncryption(SAMPLE_ENC)).toThrow(/No vault selected/)
  })

  it('throws when removeEncryption is called with no current vault', () => {
    expect(() => manager.removeEncryption()).toThrow(/No vault selected/)
  })
})
