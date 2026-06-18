import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../..')
const srcRoot = path.join(workspaceRoot, 'src')

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(fullPath)
    return entry.isFile() && fullPath.endsWith('.ts') ? [fullPath] : []
  })
}

function relative(filePath: string): string {
  return path.relative(workspaceRoot, filePath).replaceAll(path.sep, '/')
}

describe('AI posting boundary', () => {
  it('keeps posting primitives limited to the explicit posting facade', () => {
    const allowed = new Set([
      'src/db/repositories/entryRepository.ts',
      'src/api/services/postingService.ts',
    ])
    const offenders = listSourceFiles(srcRoot)
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, 'utf-8')
        return source.includes('postDraftEntry')
      })
      .map(relative)
      .filter((filePath) => !allowed.has(filePath))

    expect(offenders).toEqual([])
  })

  it('prevents AI/Ollama modules from importing posting authority', () => {
    const forbidden = [
      'postDraftEntry',
      'postDraftWithAuthority',
      'grantPostingAuthority',
      'reverseEntryWithAuthority',
      'entries.post',
    ]
    const offenders = listSourceFiles(srcRoot)
      .filter((filePath) => /(^|\/)(ai|ollama)/i.test(relative(filePath)))
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, 'utf-8')
        return forbidden.some((token) => source.includes(token))
      })
      .map(relative)

    expect(offenders).toEqual([])
  })
})
