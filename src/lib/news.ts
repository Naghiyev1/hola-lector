import type { Article, ArticleBodyResult, NewsLoadResult } from './types'
import { loadCachedArticles, saveCachedArticles } from './storage'

const FALLBACK_ARTICLES: Article[] = [
  {
    id: 'sample-1',
    source: 'rtve',
    title: 'La vida cotidiana en España cambia con nuevos hábitos digitales',
    summary:
      'Cada vez más personas utilizan herramientas digitales para leer noticias, aprender idiomas y organizar su día. Este texto de muestra sirve para practicar vocabulario cuando las fuentes en directo no están disponibles.',
    url: 'https://www.rtve.es/noticias/',
    publishedAt: new Date().toISOString(),
    content:
      'Cada vez más personas utilizan herramientas digitales para leer noticias, aprender idiomas y organizar su día. Este texto de muestra sirve para practicar vocabulario cuando las fuentes en directo no están disponibles.',
  },
]

type StaticNewsPayload = {
  generatedAt?: string
  sourceCount?: number
  articleCount?: number
  articles?: Article[]
}

export async function fetchSpanishNews(): Promise<NewsLoadResult> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}news.json?ts=${Date.now()}`, {
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Static news file returned HTTP ${response.status}`)
    }

    const payload = (await response.json()) as StaticNewsPayload
    const articles = Array.isArray(payload.articles) ? payload.articles : []

    if (articles.length > 0) {
      saveCachedArticles(articles)

      return {
        articles,
        fromCache: false,
        warning: payload.generatedAt
          ? `News snapshot updated ${new Date(payload.generatedAt).toLocaleString()}.`
          : undefined,
      }
    }

    throw new Error('Static news file contains no articles.')
  } catch (error) {
    const cached = loadCachedArticles()

    if (cached.length > 0) {
      return {
        articles: cached,
        fromCache: true,
        warning: 'News snapshot could not be loaded. Showing cached articles from this browser.',
      }
    }

    return {
      articles: FALLBACK_ARTICLES,
      fromCache: false,
      warning:
        error instanceof Error
          ? `News snapshot could not be loaded. Showing sample reading material. ${error.message}`
          : 'News snapshot could not be loaded. Showing sample reading material.',
    }
  }
}

export async function getArticleBody(article: Article): Promise<ArticleBodyResult> {
  if (article.content && article.content.trim().length > 0) {
    return {
      text: article.content,
      status: article.content.length > 500 ? 'full' : 'summary',
    }
  }

  if (article.summary) {
    return {
      text: article.summary,
      status: 'summary',
    }
  }

  return {
    text: '',
    status: 'failed',
  }
}
