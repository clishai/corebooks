import type { PostingAuthority, PostingChannel } from '../../types/posting.js'

const BLOCKED_CHANNELS = new Set(['ai', 'assistant', 'ollama', 'model'])
const ALLOWED_CHANNELS = new Set<PostingChannel>([
  'human',
  'import',
  'recurring',
  'closing',
  'reversal',
])

export function grantPostingAuthority(channel: PostingChannel): PostingAuthority {
  return Object.freeze({ channel })
}

export function assertPostingAllowed(authority: PostingAuthority): void {
  const channel = authority.channel as string
  if (BLOCKED_CHANNELS.has(channel) || !ALLOWED_CHANNELS.has(authority.channel)) {
    throw new Error(`Posting channel "${channel}" is not allowed.`)
  }
}
