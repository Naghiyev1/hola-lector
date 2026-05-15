import type { TranslationResult } from './types'

const FALLBACK_DICTIONARY: Record<string, string> = {
  // Common basics
  hola: 'hello',
  gracias: 'thank you',
  mundo: 'world',
  país: 'country',
  ciudad: 'city',
  gobierno: 'government',
  economía: 'economy',
  mercado: 'market',
  internacional: 'international',
  política: 'politics',
  deporte: 'sport',
  cultura: 'culture',

  // Very common function words
  como: 'as / like / how',
  para: 'for / in order to',
  por: 'for / because of / through',
  con: 'with',
  sin: 'without',
  sobre: 'about / on / over',
  entre: 'between / among',
  desde: 'from / since',
  hasta: 'until / up to',
  durante: 'during',
  aunque: 'although / even though',
  pero: 'but',
  mientras: 'while',
  cuando: 'when',
  donde: 'where',
  quien: 'who',
  quienes: 'who',
  porque: 'because',

  // News/common article words
  líderes: 'leaders',
  líder: 'leader',
  registraron: 'recorded / registered',
  registró: 'recorded / registered',
  registrar: 'to record / to register',
  dispone: 'has available / has at their disposal',
  disponer: 'to have available / to arrange',
  disponible: 'available',
  acuerdo: 'agreement',
  acuerdos: 'agreements',
  crisis: 'crisis',
  guerra: 'war',
  paz: 'peace',
  cumbre: 'summit',
  reunión: 'meeting',
  reuniones: 'meetings',
  jornada: 'day / working day',
  huelga: 'strike',
  manifestación: 'demonstration / protest',
  profesores: 'teachers',
  docente: 'teacher / educator',
  docentes: 'teachers / educators',
  policía: 'police',
  nacional: 'national',
  organización: 'organization',
  criminal: 'criminal',
  droga: 'drug',
  drogas: 'drugs',
  armas: 'weapons',
  operación: 'operation',
  provincia: 'province',
  frontera: 'border',
  fuente: 'source',
  fuentes: 'sources',
  periodista: 'journalist',
  periodistas: 'journalists',
  reveló: 'revealed',
  revelar: 'to reveal',
  aseguró: 'stated / assured',
  asegurar: 'to state / to assure / to secure',
  informó: 'reported / informed',
  informar: 'to report / to inform',
  permitió: 'allowed',
  permitir: 'to allow',
  pidió: 'asked for / requested',
  pedir: 'to ask for / to request',
  reclama: 'demands / calls for',
  reclamar: 'to demand / to claim',
  mantiene: 'maintains / keeps',
  mantener: 'to maintain / to keep',
  aumenta: 'increases',
  aumentar: 'to increase',
  reduce: 'reduces',
  reducir: 'to reduce',
}

const BAD_TRANSLATIONS: Record<string, string[]> = {
  dispone: ['declares', 'provides'],
  como: ['i eat', 'eat'],
  registraron: ['registered themselves'],
}

export async function translateWord(word: string): Promise<TranslationResult> {
  const cleanWord = word.trim()
  const lowerWord = cleanWord.toLowerCase()
  const fallback = FALLBACK_DICTIONARY[lowerWord]

  try {
    const url = new URL('https://api.mymemory.translated.net/get')
    url.searchParams.set('q', cleanWord)
    url.searchParams.set('langpair', 'es|en')

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 6000)

    const response = await fetch(url.toString(), { signal: controller.signal })
    window.clearTimeout(timeout)

    if (!response.ok) throw new Error('Translation service failed.')

    const data = await response.json()
    const translatedText = data?.responseData?.translatedText

    if (typeof translatedText === 'string' && translatedText.trim()) {
      const apiTranslation = translatedText.trim()
      const suspiciousTranslations = BAD_TRANSLATIONS[lowerWord] || []
      const isSuspicious = suspiciousTranslations.some(
        (bad) => bad.toLowerCase() === apiTranslation.toLowerCase(),
      )

      if (fallback && isSuspicious) {
        return {
          word: cleanWord,
          translatedText: fallback,
          warning: 'Used dictionary correction for a better learning translation.',
        }
      }

      if (fallback && shouldPreferDictionary(cleanWord, apiTranslation)) {
        return {
          word: cleanWord,
          translatedText: fallback,
          warning: 'Used dictionary match.',
        }
      }

      return {
        word: cleanWord,
        translatedText: apiTranslation,
      }
    }

    throw new Error('Translation unavailable.')
  } catch {
    return {
      word: cleanWord,
      translatedText: fallback || 'Translation unavailable',
      warning: fallback
        ? 'Used a small offline fallback dictionary.'
        : 'Translation service is temporarily unavailable.',
    }
  }
}

function shouldPreferDictionary(word: string, apiTranslation: string) {
  const lowerApi = apiTranslation.toLowerCase()
  const lowerWord = word.toLowerCase()

  if (lowerApi === lowerWord) return true
  if (lowerApi.includes('translated by')) return true
  if (lowerApi.length <= 2) return true

  return false
}