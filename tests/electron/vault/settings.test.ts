import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  readSettings,
  writeSettings,
  registerSettingsMigrator,
  clearSettingsMigrators,
  CURRENT_SETTINGS_VERSION,
} from '../../../src/electron/vault/settings.js'
import { DEFAULT_VAULT_SETTINGS } from '../../../src/electron/vault/defaults.js'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-set-'))
  fs.mkdirSync(path.join(tmp, '.corebooks'))
  clearSettingsMigrators()
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('settings', () => {
  it('writeSettings then readSettings round-trips', () => {
    const s = structuredClone(DEFAULT_VAULT_SETTINGS)
    s.companyName = 'Acme'
    writeSettings(tmp, s)
    expect(readSettings(tmp)).toEqual(s)
  })

  it('readSettings throws VaultSettingsMissing when file absent', () => {
    expect(() => readSettings(tmp)).toThrow(/VaultSettingsMissing/)
  })

  it('readSettings throws VaultSettingsInvalid when JSON is corrupt', () => {
    fs.writeFileSync(path.join(tmp, '.corebooks', 'settings.json'), '{not json}')
    expect(() => readSettings(tmp)).toThrow(/VaultSettingsInvalid/)
  })

  // Spec T22
  it('runs registered migrator when schemaVersion is older', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'settings.json'),
      JSON.stringify({ schemaVersion: 1, companyName: 'Old', oldField: 'X' }),
    )
    registerSettingsMigrator(2, (old: unknown) => ({
      ...DEFAULT_VAULT_SETTINGS,
      schemaVersion: 2 as unknown as 1,
      companyName: (old as { companyName: string }).companyName,
    }))
    // Pretend CURRENT_SETTINGS_VERSION is 2 for this test via override
    const migrated = readSettings(tmp, { targetVersion: 2 })
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.companyName).toBe('Old')
  })

  it('throws if schemaVersion is newer than current and no migrator registered', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'settings.json'),
      JSON.stringify({ schemaVersion: 99, companyName: 'X' }),
    )
    expect(() => readSettings(tmp)).toThrow(/VaultSettingsUnsupportedVersion/)
  })

  it('throws if a needed migrator is missing', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'settings.json'),
      JSON.stringify({ schemaVersion: 1, companyName: 'X' }),
    )
    expect(() => readSettings(tmp, { targetVersion: 2 })).toThrow(/VaultSettingsMigratorMissing/)
  })
})
