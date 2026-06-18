export type PostingChannel = 'human' | 'import' | 'recurring' | 'closing' | 'reversal'

export interface PostingAuthority {
  readonly channel: PostingChannel
}
