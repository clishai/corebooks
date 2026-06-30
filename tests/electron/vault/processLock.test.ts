import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { acquireLock, releaseLock } from '../../../src/electron/vault/processLock.js'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cb-lock-'))
  fs.mkdirSync(path.join(tmp, '.corebooks'))
})
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

describe('processLock', () => {
  it('acquireLock writes process.lock with current PID', () => {
    const result = acquireLock(tmp)
    expect(result).toEqual({ status: 'acquired' })
    const lock = JSON.parse(fs.readFileSync(path.join(tmp, '.corebooks', 'process.lock'), 'utf-8'))
    expect(lock.pid).toBe(process.pid)
    expect(typeof lock.openedAt).toBe('string')
  })

  // Spec T17
  it('returns busy when a lock exists for a live PID', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'process.lock'),
      JSON.stringify({ pid: process.pid, openedAt: new Date().toISOString() }),
    )
    expect(acquireLock(tmp)).toEqual({ status: 'busy', lockedByPid: process.pid })
  })

  // Spec T18
  it('reclaims a stale lock from a dead PID', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'process.lock'),
      JSON.stringify({ pid: 99999999, openedAt: new Date().toISOString() }),
    )
    const result = acquireLock(tmp)
    expect(result).toEqual({ status: 'reclaimed', previousPid: 99999999 })
    const lock = JSON.parse(fs.readFileSync(path.join(tmp, '.corebooks', 'process.lock'), 'utf-8'))
    expect(lock.pid).toBe(process.pid)
  })

  it('releaseLock removes the file only when PID matches', () => {
    acquireLock(tmp)
    releaseLock(tmp)
    expect(fs.existsSync(path.join(tmp, '.corebooks', 'process.lock'))).toBe(false)
  })

  it('releaseLock leaves the file alone if PID does not match', () => {
    fs.writeFileSync(
      path.join(tmp, '.corebooks', 'process.lock'),
      JSON.stringify({ pid: 99999999, openedAt: new Date().toISOString() }),
    )
    releaseLock(tmp)
    expect(fs.existsSync(path.join(tmp, '.corebooks', 'process.lock'))).toBe(true)
  })
})
