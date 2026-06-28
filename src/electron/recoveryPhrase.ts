import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

export function generateRecoveryPhrase(): string[] {
  return generateMnemonic(wordlist, 128).split(' ')
}

export function recoveryPhraseToEntropy(words: string[]): Buffer {
  const mnemonic = words.join(' ')
  if (!validateMnemonic(mnemonic, wordlist)) {
    throw new Error('Invalid BIP-39 phrase')
  }
  return Buffer.from(mnemonicToEntropy(mnemonic, wordlist))
}

export function isValidPhrase(words: string[]): boolean {
  if (words.length !== 12) return false
  return validateMnemonic(words.join(' '), wordlist)
}

export function isValidWord(word: string): boolean {
  return wordlist.includes(word.toLowerCase().trim())
}
