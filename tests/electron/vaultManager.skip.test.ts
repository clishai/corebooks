import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { VaultManager } from '../../src/electron/vaultManager.js'

let tmpDir: string
let manager: VaultManager

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-skip-test-'))
  manager = new VaultManager(tmpDir)
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('getSkipPickerUntil', () => {
  it('returns null when no registry exists', () => {
    expect(manager.getSkipPickerUntil()).toBeNull()
  })

  it('returns null when registry has no skipPickerUntil', () => {
    fs.writeFileSync(path.join(tmpDir, 'vaults.json'), JSON.stringify({ vaults: [] }))
    expect(manager.getSkipPickerUntil()).toBeNull()
  })

  it('returns the stored date after setSkipPickerUntil', () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    manager.setSkipPickerUntil(future)
    expect(manager.getSkipPickerUntil()).toBe(future)
  })
})

describe('setSkipPickerUntil', () => {
  it('persists the skip date to the registry file', () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    manager.setSkipPickerUntil(future)
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'vaults.json'), 'utf-8'))
    expect(raw.skipPickerUntil).toBe(future)
  })

  it('removes skipPickerUntil from the file when passed null', () => {
    manager.setSkipPickerUntil(new Date(Date.now() + 1000).toISOString())
    manager.setSkipPickerUntil(null)
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'vaults.json'), 'utf-8'))
    expect(raw.skipPickerUntil).toBeUndefined()
    expect(manager.getSkipPickerUntil()).toBeNull()
  })

  it('preserves existing vaults array when setting skip', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'vaults.json'),
      JSON.stringify({ vaults: [{ path: '/some/vault', name: 'Test', lastOpened: '2024-01-01T00:00:00Z' }] }),
    )
    manager.setSkipPickerUntil(new Date(Date.now() + 1000).toISOString())
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, 'vaults.json'), 'utf-8'))
    expect(raw.vaults).toHaveLength(1)
    expect(raw.vaults[0].path).toBe('/some/vault')
  })

  it('round-trips correctly through get', () => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    manager.setSkipPickerUntil(date)
    expect(manager.getSkipPickerUntil()).toBe(date)
    manager.setSkipPickerUntil(null)
    expect(manager.getSkipPickerUntil()).toBeNull()
  })
})
