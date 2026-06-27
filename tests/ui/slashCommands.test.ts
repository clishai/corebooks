import { describe, it, expect } from 'vitest'
import { matchSlashCommands, SLASH_COMMANDS } from '../../src/ui/lib/slashCommands'

describe('matchSlashCommands', () => {
  it('returns empty array for a non-slash query', () => {
    expect(matchSlashCommands('go home')).toEqual([])
    expect(matchSlashCommands('')).toEqual([])
    expect(matchSlashCommands('accounts')).toEqual([])
  })

  it('returns all commands when query is just "/"', () => {
    const results = matchSlashCommands('/')
    expect(results.length).toBe(SLASH_COMMANDS.length)
  })

  it('filters to /go namespace when query is "/go"', () => {
    const results = matchSlashCommands('/go')
    expect(results.length).toBeGreaterThan(0)
    results.forEach((cmd) => expect(cmd.trigger).toMatch(/^\/go /))
  })

  it('returns only the home command for "/go home"', () => {
    const results = matchSlashCommands('/go home')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('go-home')
  })

  it('returns the new-entry command for "/new entry"', () => {
    const results = matchSlashCommands('/new entry')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('new-entry')
    expect(results[0].action.type).toBe('event')
  })

  it('returns both ar-ap commands for "/set ar-ap"', () => {
    const results = matchSlashCommands('/set ar-ap')
    expect(results).toHaveLength(2)
    const ids = results.map((r) => r.id)
    expect(ids).toContain('set-ar-ap-on')
    expect(ids).toContain('set-ar-ap-off')
  })

  it('returns only the on-command for "/set ar-ap on"', () => {
    const results = matchSlashCommands('/set ar-ap on')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('set-ar-ap-on')
    if (results[0].action.type === 'setFlag') {
      expect(results[0].action.key).toBe('ar_ap')
      expect(results[0].action.value).toBe(true)
    }
  })

  it('returns empty array for an unknown command', () => {
    expect(matchSlashCommands('/xyz')).toEqual([])
    expect(matchSlashCommands('/go nowhere')).toEqual([])
  })

  it('is case-insensitive', () => {
    const lower = matchSlashCommands('/go home')
    const upper = matchSlashCommands('/GO HOME')
    expect(upper.map((c) => c.id)).toEqual(lower.map((c) => c.id))
  })

  it('every command has a unique id', () => {
    const ids = SLASH_COMMANDS.map((c) => c.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })

  it('every navigate action has a non-empty path', () => {
    SLASH_COMMANDS
      .filter((c) => c.action.type === 'navigate')
      .forEach((c) => {
        if (c.action.type === 'navigate') {
          expect(c.action.path.startsWith('/')).toBe(true)
        }
      })
  })
})
