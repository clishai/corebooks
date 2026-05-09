import { describe, it, expect } from 'vitest'
import path from 'path'
import { classifyFile } from '../../src/electron/vaultWatcher.js'

const vault = '/home/user/MyBusiness'

describe('classifyFile', () => {
  it('classifies files in imports/ as import', () => {
    const result = classifyFile(vault, path.join(vault, 'imports', 'bank.csv'))
    expect(result.hint).toBe('import')
    expect(result.folder).toBe('imports')
  })

  it('classifies csv in statements/ as misplaced', () => {
    const result = classifyFile(vault, path.join(vault, 'statements', 'bank.csv'))
    expect(result.hint).toBe('misplaced')
    expect(result.folder).toBe('statements')
  })

  it('classifies iif in receipts/ as misplaced', () => {
    const result = classifyFile(vault, path.join(vault, 'receipts', 'data.iif'))
    expect(result.hint).toBe('misplaced')
  })

  it('classifies json in exports/ as misplaced', () => {
    const result = classifyFile(vault, path.join(vault, 'exports', 'backup.json'))
    expect(result.hint).toBe('misplaced')
  })

  it('classifies pdf in statements/ as filed', () => {
    const result = classifyFile(vault, path.join(vault, 'statements', 'statement.pdf'))
    expect(result.hint).toBe('filed')
  })

  it('classifies image in receipts/ as filed', () => {
    const result = classifyFile(vault, path.join(vault, 'receipts', 'receipt.png'))
    expect(result.hint).toBe('filed')
  })

  it('classifies files in vault root as misplaced', () => {
    const result = classifyFile(vault, path.join(vault, 'bank.csv'))
    expect(result.hint).toBe('misplaced')
    expect(result.folder).toBe('')
  })

  it('classifies files in unknown subfolder as misplaced', () => {
    const result = classifyFile(vault, path.join(vault, 'random', 'file.csv'))
    expect(result.hint).toBe('misplaced')
  })
})
