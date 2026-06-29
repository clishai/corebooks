import type { PostingAuthority, PostingChannel } from '../../types/posting.js'

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
  if (!ALLOWED_CHANNELS.has(authority.channel)) {
    throw new Error(`Posting channel "${authority.channel}" is not allowed.`)
  }
}
