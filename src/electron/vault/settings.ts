import fs from 'node:fs'
import path from 'node:path'
import type { VaultSettings } from './types.js'

const SETTINGS_FILE = path.join('.corebooks', 'settings.json')

export const CURRENT_SETTINGS_VERSION = 1

type Migrator = (oldValue: unknown) => VaultSettings

const migrators = new Map<number, Migrator>()

export function registerSettingsMigrator(toVersion: number, fn: Migrator): void {
  migrators.set(toVersion, fn)
}

export function clearSettingsMigrators(): void {
  migrators.clear()
}

export interface ReadOptions {
  targetVersion?: number
}

export function readSettings(vaultPath: string, opts: ReadOptions = {}): VaultSettings {
  const file = path.join(vaultPath, SETTINGS_FILE)
  if (!fs.existsSync(file)) throw new Error('VaultSettingsMissing')
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    throw new Error('VaultSettingsInvalid: not valid JSON')
  }
  const target = opts.targetVersion ?? CURRENT_SETTINGS_VERSION
  const version = (parsed as { schemaVersion?: unknown })?.schemaVersion
  if (typeof version !== 'number') throw new Error('VaultSettingsInvalid: missing schemaVersion')
  if (version === target) {
    if (!isValidSettings(parsed, target)) throw new Error('VaultSettingsInvalid: shape mismatch')
    return parsed
  }
  if (version > target) {
    throw new Error(`VaultSettingsUnsupportedVersion: file is ${version}, app supports ${target}`)
  }
  // version < target: run chain of migrators
  let current: unknown = parsed
  for (let v = version + 1; v <= target; v++) {
    const m = migrators.get(v)
    if (!m) throw new Error(`VaultSettingsMigratorMissing: no migrator registered for version ${v}`)
    current = m(current)
  }
  return current as VaultSettings
}

export function writeSettings(vaultPath: string, settings: VaultSettings): void {
  const file = path.join(vaultPath, SETTINGS_FILE)
  fs.writeFileSync(file, JSON.stringify(settings, null, 2), { mode: 0o600 })
}

function isValidSettings(v: unknown, targetVersion: number): v is VaultSettings {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  const fy = o['fiscalYearStart']
  const ff = o['featureFlags']
  return (
    o['schemaVersion'] === targetVersion &&
    typeof o['companyName'] === 'string' &&
    typeof o['currency'] === 'string' &&
    Array.isArray(o['paymentMethods']) &&
    fy !== null && typeof fy === 'object' &&
    typeof (fy as Record<string, unknown>)['month'] === 'number' &&
    typeof (fy as Record<string, unknown>)['day'] === 'number' &&
    ff !== null && typeof ff === 'object' &&
    typeof (ff as Record<string, unknown>)['ar_ap'] === 'boolean' &&
    typeof (ff as Record<string, unknown>)['inventory'] === 'boolean'
  )
}
