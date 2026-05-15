import type { Article, ArticleBodyResult, NewsLoadResult } from './types'
import { loadCachedArticles, saveCachedArticles } from './storage'

type NewsSnapshot = {
  generatedAt: string
  sourceCount: number
  articleCount: number
  articles: Article[]
}

const fallbackArticles: Article[] = [
  {
    id: 'sample-1',
    source: 'rtve',
    title: 'La vida cotidiana en España cambia con nuevos hábitos digitales',
    summary:
      'Cada vez más personas utilizan herramientas digitales para leer noticias, aprender idiomas y organizar su día. Este texto de muestra sirve para practicar vocabulario cuando las fuentes en directo no están disponibles.',
    url: 'https://www.rtve.es/noticias/',
    publishedAt: new Date().toISOString(),
    content:
      'Cada vez más personas utilizan herramientas digitales para leer noticias, aprender idiomas y organizar su día. Este texto de muestra sirve para practicar vocabulario cuando las fuentes en directo no están disponibles.'
  }
]

export async function fetchSpanishNews(): Promise<NewsLoadResult> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}news.json?ts=${Date.now()}`)

    if (!response.ok) {
      throw new Error(`news.json failed with ${response.status}`)
    }

    const snapshot = (await response.json()) as NewsSnapshot
    const articles = Array.isArray(snapshot.articles) ? snapshot.articles : []

    if (articles.length > 0) {
      saveCachedArticles(articles)

      return {
        articles,
        fromCache: false,
        warning: snapshot.generatedAt
          ? `News snapshot updated ${new Date(snapshot.generatedAt).toLocaleString()}.`
          : undefined
      }
    }

    throw new Error('news.json contained no articles')
  } catch {
    const cached = loadCachedArticles()

    if (cached.length > 0) {
      return {
        articles: cached,
        fromCache: true,
        warning: 'News snapshot could not be loaded. Showing cached articles.'
      }
    }

    return {
      articles: fallbackArticles,
      fromCache: false,
      warning: 'News snapshot could not be loaded. Showing sample reading material.'
    }
  }
}

export async function getArticleBody(article: Article): Promise<ArticleBodyResult> {
  if (article.content && article.content.trim().length > 80) {
    return {
      text: article.content,
      status: article.content.length > 500 ? 'full' : 'summary'
    }
  }

  if (article.summary && article.summary.trim().length > 0) {
    return {
      text: article.summary,
      status: 'summary'
    }
  }

  return {
    text: '',
    status: 'failed'
  }
}
