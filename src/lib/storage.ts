import type { Article, SavedWord } from './types'

const NEWS_CACHE_KEY = 'hola-lector.news-cache.v1'
const SAVED_WORDS_KEY = 'hola-lector.saved-words.v1'

export function loadCachedArticles(): Article[] {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.articles) ? parsed.articles : []
  } catch {
    return []
  }
}

export function saveCachedArticles(articles: Article[]) {
  localStorage.setItem(
    NEWS_CACHE_KEY,
    JSON.stringify({
      cachedAt: new Date().toISOString(),
      articles,
    }),
  )
}

export function loadSavedWords(): SavedWord[] {
  try {
    const raw = localStorage.getItem(SAVED_WORDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveSavedWords(words: SavedWord[]) {
  localStorage.setItem(SAVED_WORDS_KEY, JSON.stringify(words))
}
