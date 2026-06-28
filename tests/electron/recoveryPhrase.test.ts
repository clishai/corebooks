import { describe, it, expect } from 'vitest'
import {
  generateRecoveryPhrase,
  recoveryPhraseToEntropy,
  isValidPhrase,
  isValidWord,
} from '../../src/electron/recoveryPhrase.js'

describe('generateRecoveryPhrase', () => {
  it('returns exactly 12 words', () => {
    expect(generateRecoveryPhrase()).toHaveLength(12)
  })

  it('returns words that are all valid BIP-39 entries', () => {
    const words = generateRecoveryPhrase()
    for (const word of words) {
      expect(isValidWord(word)).toBe(true)
    }
  })

  it('produces different phrases on consecutive calls', () => {
    const a = generateRecoveryPhrase().join(' ')
    const b = generateRecoveryPhrase().join(' ')
    expect(a).not.toBe(b)
  })

  it('produces a phrase that validates as a complete BIP-39 mnemonic', () => {
    expect(isValidPhrase(generateRecoveryPhrase())).toBe(true)
  })
})

describe('recoveryPhraseToEntropy', () => {
  it('returns exactly 16 bytes (128 bits of entropy)', () => {
    expect(recoveryPhraseToEntropy(generateRecoveryPhrase()).length).toBe(16)
  })

  it('is deterministic for the same phrase', () => {
    const phrase = generateRecoveryPhrase()
    const a = recoveryPhraseToEntropy(phrase)
    const b = recoveryPhraseToEntropy(phrase)
    expect(a.equals(b)).toBe(true)
  })

  it('throws on a phrase with an invalid word', () => {
    const phrase = generateRecoveryPhrase()
    phrase[0] = 'notarealbip39word'
    expect(() => recoveryPhraseToEntropy(phrase)).toThrow(/Invalid BIP-39 phrase/)
  })

  it('throws on a phrase with the wrong word count', () => {
    expect(() => recoveryPhraseToEntropy(['abandon', 'ability', 'able']))
      .toThrow(/Invalid BIP-39 phrase/)
  })

  it('throws on a phrase with a bad checksum', () => {
    // Corrupt an interior word — the checksum (encoded in the last word) will
    // no longer match the entropy, so validateMnemonic must reject it.
    const phrase = generateRecoveryPhrase()
    // Replace position 0 with 'zoo' (valid BIP-39 word, but changes entropy so checksum breaks)
    phrase[0] = phrase[0] === 'zoo' ? 'zone' : 'zoo'
    expect(() => recoveryPhraseToEntropy(phrase)).toThrow(/Invalid BIP-39 phrase/)
  })
})

describe('isValidPhrase', () => {
  it('returns true for a freshly generated phrase', () => {
    expect(isValidPhrase(generateRecoveryPhrase())).toBe(true)
  })

  it('returns false for a phrase with the wrong length', () => {
    expect(isValidPhrase(['abandon', 'ability'])).toBe(false)
  })

  it('returns false for a phrase with an unknown word', () => {
    const phrase = generateRecoveryPhrase()
    phrase[5] = 'zzzzz'
    expect(isValidPhrase(phrase)).toBe(false)
  })
})

describe('isValidWord', () => {
  it('returns true for known BIP-39 words', () => {
    expect(isValidWord('abandon')).toBe(true)
    expect(isValidWord('zone')).toBe(true)
  })

  it('returns false for unknown words', () => {
    expect(isValidWord('notarealword')).toBe(false)
    expect(isValidWord('')).toBe(false)
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(isValidWord('  ABANDON  ')).toBe(true)
  })
})
