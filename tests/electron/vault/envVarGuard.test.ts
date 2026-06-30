import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'release'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (/\.(ts|tsx|js)$/.test(entry.name)) acc.push(full)
  }
  return acc
}

describe('env var guard (spec T14)', () => {
  it('COREBOOKS_DB_KEY appears nowhere in non-test source', () => {
    const files = walk(path.join(ROOT, 'src'))
    const offenders = files.filter(f =>
      fs.readFileSync(f, 'utf-8').includes('COREBOOKS_DB_KEY')
    )
    expect(offenders).toEqual([])
  })

  it('no source file reads process.env.*KEY*', () => {
    const files = walk(path.join(ROOT, 'src'))
    const offenders = files.filter(f =>
      /process\.env\[?['"][^'"]*KEY[^'"]*['"]\]?/.test(fs.readFileSync(f, 'utf-8'))
    )
    expect(offenders).toEqual([])
  })
})
