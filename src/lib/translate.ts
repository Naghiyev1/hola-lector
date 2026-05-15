import type { TranslationResult } from './types'

const FALLBACK_DICTIONARY: Record<string, string> = {
  hola: 'hello',
  gracias: 'thank you',
  mundo: 'world',
  gobierno: 'government',
  economía: 'economy',
  mercado: 'market',
  ciudad: 'city',
  país: 'country',
  internacional: 'international',
  política: 'politics',
  deporte: 'sport',
  cultura: 'culture',
}

export async function translateWord(word: string): Promise<TranslationResult> {
  const fallback = FALLBACK_DICTIONARY[word.toLowerCase()]

  try {
    const url = new URL('https://api.mymemory.translated.net/get')
    url.searchParams.set('q', word)
    url.searchParams.set('langpair', 'es|en')

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)

    const response = await fetch(url.toString(), { signal: controller.signal })
    window.clearTimeout(timeout)

    if (!response.ok) throw new Error('Translation service failed.')

    const data = await response.json()
    const translatedText = data?.responseData?.translatedText

    if (typeof translatedText === 'string' && translatedText.trim()) {
      return {
        word,
        translatedText: translatedText.trim(),
      }
    }

    throw new Error('Translation unavailable.')
  } catch {
    return {
      word,
      translatedText: fallback || 'Translation unavailable',
      warning: fallback
        ? 'Used a small offline fallback dictionary.'
        : 'Translation service is temporarily unavailable.',
    }
  }
}
