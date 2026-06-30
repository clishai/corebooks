import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readWorkspace, writeWorkspace } from '../../../src/electron/vault/workspace.js'
import { DEFAULT_VAULT_WORKSPACE } from '../../../src/electron/vault/defaults.js'
import { readAuditLog } from '../../../src/electron/vault/audit.js'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-ws-'))
  fs.mkdirSync(path.join(tmp, '.corebooks'))
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('workspace', () => {
  it('readWorkspace returns defaults when file absent', () => {
    const ws = readWorkspace(tmp)
    expect(ws).toEqual(DEFAULT_VAULT_WORKSPACE)
  })

  it('readWorkspace writes a workspace.reset-from-defaults audit event when file is absent', () => {
    readWorkspace(tmp)
    const log = readAuditLog(tmp)
    expect(log).toHaveLength(1)
    expect(log[0].event).toBe('workspace.reset-from-defaults')
    expect(log[0].actor).toBe('system')
    expect((log[0].data as { reason: string }).reason).toBe('corrupt-or-missing')
  })

  // Spec T21
  it('readWorkspace returns defaults and rewrites file when JSON is corrupt', () => {
    const file = path.join(tmp, '.corebooks', 'workspace.json')
    fs.writeFileSync(file, '{not json')
    const ws = readWorkspace(tmp)
    expect(ws).toEqual(DEFAULT_VAULT_WORKSPACE)
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual(DEFAULT_VAULT_WORKSPACE)
  })

  it('readWorkspace writes a workspace.reset-from-defaults audit event when JSON is corrupt', () => {
    const file = path.join(tmp, '.corebooks', 'workspace.json')
    fs.writeFileSync(file, '{not json')
    readWorkspace(tmp)
    const log = readAuditLog(tmp)
    expect(log).toHaveLength(1)
    expect(log[0].event).toBe('workspace.reset-from-defaults')
    expect(log[0].actor).toBe('system')
    expect((log[0].data as { reason: string }).reason).toBe('corrupt-or-missing')
  })

  it('writeWorkspace round-trips', () => {
    const ws = { ...DEFAULT_VAULT_WORKSPACE, lastTab: 'accounts' }
    writeWorkspace(tmp, ws)
    expect(readWorkspace(tmp)).toEqual(ws)
  })
})
