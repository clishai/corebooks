import fs from 'node:fs'
import path from 'node:path'

const LOCK_FILE = path.join('.corebooks', 'process.lock')

interface LockData {
  pid: number
  openedAt: string
}

export type AcquireResult =
  | { status: 'acquired' }
  | { status: 'reclaimed'; previousPid: number }
  | { status: 'busy'; lockedByPid: number }

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = "test for existence", no actual signal sent
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EPERM') return true // exists but owned by another user
    return false
  }
}

function writeLock(file: string): void {
  fs.writeFileSync(
    file,
    JSON.stringify({ pid: process.pid, openedAt: new Date().toISOString() }),
    { mode: 0o600 },
  )
}

export function acquireLock(vaultPath: string): AcquireResult {
  const file = path.join(vaultPath, LOCK_FILE)
  if (!fs.existsSync(file)) {
    writeLock(file)
    return { status: 'acquired' }
  }
  let existing: LockData
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    // malformed lock file — treat as stale
    writeLock(file)
    return { status: 'reclaimed', previousPid: -1 }
  }
  if (isPidAlive(existing.pid)) {
    return { status: 'busy', lockedByPid: existing.pid }
  }
  writeLock(file)
  return { status: 'reclaimed', previousPid: existing.pid }
}

export function releaseLock(vaultPath: string): void {
  const file = path.join(vaultPath, LOCK_FILE)
  if (!fs.existsSync(file)) return
  let existing: LockData
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return
  }
  if (existing.pid !== process.pid) return
  fs.unlinkSync(file)
}
