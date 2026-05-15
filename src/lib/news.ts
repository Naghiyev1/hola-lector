import type { Article, ArticleBodyResult, NewsLoadResult, NewsSource } from './types'
import { loadCachedArticles, saveCachedArticles } from './storage'
import { stripHtml } from './text'

type FeedConfig = {
  source: NewsSource
  url: string
}

const FEEDS: FeedConfig[] = [
  { source: 'elpais', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada' },
  { source: 'elmundo', url: 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml' },
  { source: 'elconfidencial', url: 'https://rss.elconfidencial.com/espana/' },
  { source: 'veinteminutos', url: 'https://www.20minutos.es/rss/' },
  { source: 'rtve', url: 'https://www.rtve.es/rss/noticias.xml' },
]

const PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
]

export async function fetchSpanishNews(): Promise<NewsLoadResult> {
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed))
  const articles = settled
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0))
    .slice(0, 40)

  if (articles.length > 0) {
    saveCachedArticles(articles)
    const failures = settled.filter((result) => result.status === 'rejected').length
    return {
      articles,
      fromCache: false,
      warning: failures ? `${failures} news source(s) failed, but other sources loaded.` : undefined,
    }
  }

  const cached = loadCachedArticles()
  if (cached.length > 0) {
    return {
      articles: cached,
      fromCache: true,
      warning: 'Live news could not be loaded. Showing cached articles.',
    }
  }

  return {
    articles: fallbackArticles,
    fromCache: false,
    warning: 'Live news could not be loaded. Showing sample reading material.',
  }
}

async function fetchFeed(feed: FeedConfig): Promise<Article[]> {
  const xml = await fetchTextWithFallback(feed.url)
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const items = Array.from(doc.querySelectorAll('item')).slice(0, 12)

  return items.map((item, index) => {
    const title = getNodeText(item, 'title') || 'Untitled article'
    const link = getNodeText(item, 'link')
    const description = getNodeText(item, 'description')
    const content = getNodeText(item, 'encoded') || description
    const publishedAt = getNodeText(item, 'pubDate')

    return {
      id: `${feed.source}-${index}-${hash(title + link)}`,
      source: feed.source,
      title: cleanText(title),
      summary: cleanText(stripHtml(description || content || '')),
      url: link,
      publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      content: cleanText(stripHtml(content || '')),
    }
  }).filter((article) => article.title && article.url)
}

export async function getArticleBody(article: Article): Promise<ArticleBodyResult> {
  if (article.content && article.content.length > 500) {
    return { text: article.content, status: 'full' }
  }

  try {
    const html = await fetchTextWithFallback(article.url)
    const text = extractReadableText(html)

    if (text.length > 700) {
      return { text, status: 'full' }
    }

    if (article.summary) {
      return { text: article.summary, status: 'summary' }
    }

    return { text: '', status: 'failed' }
  } catch {
    if (article.summary) {
      return { text: article.summary, status: 'summary' }
    }

    return { text: '', status: 'failed' }
  }
}

async function fetchTextWithFallback(url: string): Promise<string> {
  const errors: string[] = []

  for (const proxy of PROXIES) {
    try {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 9000)
      const response = await fetch(proxy(url), { signal: controller.signal })
      window.clearTimeout(timeout)

      if (!response.ok) {
        errors.push(`${response.status}`)
        continue
      }

      const text = await response.text()
      if (text.trim().length > 50) return text
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'fetch failed')
    }
  }

  throw new Error(`Could not fetch ${url}. ${errors.join(', ')}`)
}

function extractReadableText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  doc.querySelectorAll('script, style, nav, footer, header, aside, form, button, iframe, noscript').forEach((node) => node.remove())

  const jsonLd = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
    .map((node) => node.textContent || '')
    .join('\n')

  const jsonArticleBody = extractArticleBodyFromJsonLd(jsonLd)
  if (jsonArticleBody.length > 700) return cleanText(jsonArticleBody)

  const selectors = [
    'article',
    '[itemprop="articleBody"]',
    '.article-body',
    '.story-body',
    '.entry-content',
    '.news-content',
    'main',
  ]

  for (const selector of selectors) {
    const element = doc.querySelector(selector)
    if (!element) continue

    const paragraphs = Array.from(element.querySelectorAll('p'))
      .map((p) => p.textContent?.trim() || '')
      .filter((text) => text.length > 40)

    const text = paragraphs.join('\n\n')
    if (text.length > 700) return cleanText(text)
  }

  const paragraphs = Array.from(doc.querySelectorAll('p'))
    .map((p) => p.textContent?.trim() || '')
    .filter((text) => text.length > 40)
    .slice(0, 12)

  return cleanText(paragraphs.join('\n\n'))
}

function extractArticleBodyFromJsonLd(raw: string): string {
  if (!raw) return ''

  const matches = raw.match(/"articleBody"\s*:\s*"([^"]+)"/)
  return matches?.[1]?.replace(/\\n/g, '\n') || ''
}

function getNodeText(item: Element, selector: string): string {
  const node = item.querySelector(selector)
  return node?.textContent?.trim() || ''
}

function cleanText(value: string): string {
  return value
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function hash(value: string): string {
  let result = 0
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index)
    result |= 0
  }
  return Math.abs(result).toString(36)
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
  },
  {
    id: 'sample-2',
    source: 'veinteminutos',
    title: 'Aprender con noticias: una forma práctica de mejorar el español',
    summary:
      'Leer noticias reales ayuda a reconocer palabras frecuentes, entender expresiones comunes y construir vocabulario en contexto. La práctica diaria puede mejorar la comprensión de lectura.',
    url: 'https://www.20minutos.es/',
    publishedAt: new Date().toISOString(),
  },
]
