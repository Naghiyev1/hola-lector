import type { Token } from './types'

const WORD_RE = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:['’][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)?/g

export function normalizeWord(word: string): string {
  return word
    .trim()
    .replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/g, '')
}

export function tokenizeSpanishText(text: string): Token[] {
  const tokens: Token[] = []
  let lastIndex = 0

  for (const match of text.matchAll(WORD_RE)) {
    const index = match.index ?? 0

    if (index > lastIndex) {
      tokens.push(...splitNonWords(text.slice(lastIndex, index)))
    }

    tokens.push({ type: 'word', value: match[0] })
    lastIndex = index + match[0].length
  }

  if (lastIndex < text.length) {
    tokens.push(...splitNonWords(text.slice(lastIndex)))
  }

  return tokens
}

function splitNonWords(value: string): Token[] {
  return value.split(/(\s+)/).filter(Boolean).map((part) => ({
    type: /^\s+$/.test(part) ? 'space' : 'punctuation',
    value: part,
  }))
}

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent?.replace(/\s+/g, ' ').trim() || ''
}
