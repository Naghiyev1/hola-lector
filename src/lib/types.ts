export type NewsSource = 'elpais' | 'elmundo' | 'elconfidencial' | 'veinteminutos' | 'rtve'

export type Article = {
  id: string
  source: NewsSource
  title: string
  summary: string
  url: string
  publishedAt?: string
  content?: string
}

export type NewsLoadResult = {
  articles: Article[]
  fromCache: boolean
  warning?: string
}

export type ArticleBodyResult = {
  text: string
  status: 'full' | 'summary' | 'failed'
}

export type TranslationResult = {
  word: string
  translatedText: string
  warning?: string
}

export type SavedWord = {
  id: string
  word: string
  meaning: string
  example?: string
  createdAt: string
  lastReviewedAt?: string
  reviewCount: number
  known: boolean
}

export type Token =
  | { type: 'word'; value: string }
  | { type: 'space' | 'punctuation'; value: string }
