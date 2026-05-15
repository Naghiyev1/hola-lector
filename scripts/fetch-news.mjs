import fetch from 'node-fetch';
import { writeFile, mkdir } from 'node:fs/promises';
import { TextDecoder } from 'node:util';

const FEEDS = [
  { source: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada' },
  { source: 'El Mundo', url: 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml' },
  { source: 'El Confidencial', url: 'https://rss.elconfidencial.com/espana/' },
  { source: '20 Minutos', url: 'https://www.20minutos.es/rss/' },
];

const FALLBACK_ARTICLES = [
  {
    id: 'sample-1',
    source: 'Sample',
    title: 'La vida cotidiana en España cambia con nuevos hábitos digitales',
    summary:
      'Cada vez más personas utilizan herramientas digitales para leer noticias, aprender idiomas y organizar su día. Este texto de muestra sirve para practicar vocabulario cuando las fuentes en directo no están disponibles.',
    url: 'https://www.rtve.es/noticias/',
    publishedAt: new Date().toISOString(),
    content:
      'Cada vez más personas utilizan herramientas digitales para leer noticias, aprender idiomas y organizar su día. Este texto de muestra sirve para practicar vocabulario cuando las fuentes en directo no están disponibles.',
    contentStatus: 'fallback',
    wordCount: 33,
  },
];

const REQUEST_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (compatible; HolaLector/1.0; +https://naghiyev1.github.io/hola-lector/)',
  accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,text/xml;q=0.8,*/*;q=0.7',
};

const MIN_READING_WORDS = 120;
const MAX_ARTICLES_PER_FEED = 14;
const MAX_FINAL_ARTICLES = 60;

async function main() {
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));

  const rawArticles = settled
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((article) => article.title && article.url);

  const seen = new Set();
  const uniqueArticles = rawArticles.filter((article) => {
    const key = article.url || article.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const enrichedSettled = await Promise.allSettled(
    uniqueArticles.map((article) => enrichArticle(article))
  );

  const enrichedArticles = enrichedSettled
    .flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
    .sort((a, b) => {
      const aTime = Date.parse(a.publishedAt || '') || 0;
      const bTime = Date.parse(b.publishedAt || '') || 0;
      return bTime - aTime;
    });

  const fullReadingArticles = enrichedArticles.filter(
    (article) => article.wordCount >= MIN_READING_WORDS
  );

  const articles =
    fullReadingArticles.length >= 10
      ? fullReadingArticles.slice(0, MAX_FINAL_ARTICLES)
      : enrichedArticles.slice(0, MAX_FINAL_ARTICLES);

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceCount: FEEDS.length,
    articleCount: articles.length,
    minReadingWords: MIN_READING_WORDS,
    articles: articles.length > 0 ? articles : FALLBACK_ARTICLES,
  };

  await mkdir('public', { recursive: true });
  await writeFile('public/news.json', `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Wrote public/news.json with ${payload.articles.length} article(s).`);
  console.log(
    `Full reading articles: ${
      payload.articles.filter((article) => article.contentStatus === 'full').length
    }`
  );
  console.log(
    `Summary articles: ${
      payload.articles.filter((article) => article.contentStatus === 'summary').length
    }`
  );

  const feedFailures = settled.filter((result) => result.status === 'rejected');
  if (feedFailures.length > 0) {
    console.warn(`${feedFailures.length} feed(s) failed. Other feeds were still used.`);
    feedFailures.forEach((failure) => console.warn(failure.reason));
  }

  const articleFailures = enrichedSettled.filter((result) => result.status === 'rejected');
  if (articleFailures.length > 0) {
    console.warn(`${articleFailures.length} article page(s) could not be enriched.`);
  }
}

async function fetchFeed(feed) {
  const response = await fetch(feed.url, {
    headers: REQUEST_HEADERS,
  });

  if (!response.ok) {
    throw new Error(`${feed.source} feed failed with HTTP ${response.status}`);
  }

  const xml = await readResponseText(response);
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, MAX_ARTICLES_PER_FEED);

  return items.map((match, index) => {
    const item = match[0];

    const title = cleanText(getTag(item, 'title') || 'Untitled article');
    const url = cleanText(getTag(item, 'link'));
    const description = cleanText(stripHtml(getTag(item, 'description')));
    const contentEncoded = cleanText(
      stripHtml(getTag(item, 'content:encoded') || getTag(item, 'encoded'))
    );
    const publishedRaw = cleanText(getTag(item, 'pubDate'));
    const publishedAt = publishedRaw ? safeDate(publishedRaw) : undefined;
    const summary = description || contentEncoded || 'Summary unavailable.';

    return {
      id: `${slugify(feed.source)}-${index}-${hash(title + url)}`,
      source: feed.source,
      title,
      summary,
      url,
      publishedAt,
      content: contentEncoded || summary,
      contentStatus: 'summary',
      wordCount: countWords(contentEncoded || summary),
    };
  });
}

async function enrichArticle(article) {
  try {
    const response = await fetch(article.url, {
      headers: REQUEST_HEADERS,
      redirect: 'follow',
    });

    if (!response.ok) {
      return normaliseArticle(article, 'summary');
    }

    const html = await readResponseText(response);
    const extracted = extractArticleText(html);

    if (countWords(extracted) >= MIN_READING_WORDS) {
      return normaliseArticle(
        {
          ...article,
          content: extracted,
          summary: article.summary || firstSentences(extracted, 2),
        },
        'full'
      );
    }

    return normaliseArticle(article, 'summary');
  } catch {
    return normaliseArticle(article, 'summary');
  }
}

function normaliseArticle(article, status) {
  const content = cleanText(article.content || article.summary || '');
  const summary = cleanText(article.summary || firstSentences(content, 2));

  return {
    id: article.id,
    source: article.source,
    title: cleanText(article.title),
    summary,
    url: article.url,
    publishedAt: article.publishedAt,
    content,
    contentStatus: status,
    wordCount: countWords(content),
  };
}

function extractArticleText(html) {
  const withoutNoise = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<form\b[\s\S]*?<\/form>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ');

  const candidates = [
    getFirstMatch(withoutNoise, /<article\b[^>]*>([\s\S]*?)<\/article>/i),
    getFirstMatch(
      withoutNoise,
      /<div\b[^>]*(?:class|id)=["'][^"']*(?:article|story|content|cuerpo|texto|noticia)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    ),
    getMetaContent(withoutNoise, 'article:body'),
  ].filter(Boolean);

  const paragraphBlocks = candidates.length > 0 ? candidates : [withoutNoise];

  const paragraphTexts = paragraphBlocks
    .flatMap((block) => [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((match) => match[1]))
    .map((paragraph) => cleanText(stripHtml(paragraph)))
    .filter(isUsefulParagraph);

  const articleText = paragraphTexts.join('\n\n');

  if (countWords(articleText) >= MIN_READING_WORDS) {
    return articleText;
  }

  const metaDescription =
    getMetaContent(withoutNoise, 'description') ||
    getMetaProperty(withoutNoise, 'og:description') ||
    getMetaProperty(withoutNoise, 'twitter:description');

  return cleanText(stripHtml(metaDescription || articleText));
}

function isUsefulParagraph(text) {
  if (!text) return false;
  if (text.length < 45) return false;

  const lower = text.toLowerCase();

  const blockedFragments = [
    'suscríbete',
    'suscribete',
    'newsletter',
    'cookies',
    'publicidad',
    'aceptar',
    'iniciar sesión',
    'leer más',
    'seguir leyendo',
    'compartir',
    'whatsapp',
    'facebook',
    'twitter',
    'x.com',
    'instagram',
    'copyright',
    'todos los derechos',
  ];

  return !blockedFragments.some((fragment) => lower.includes(fragment));
}

function getFirstMatch(value, pattern) {
  const match = value.match(pattern);
  return match?.[1] || '';
}

function getTag(xml, tagName) {
  const escapedTag = tagName.replace(':', '\\:');
  const pattern = new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i');
  const match = xml.match(pattern);
  return decodeEntities(stripCdata(match?.[1] || ''));
}

function getMetaContent(html, name) {
  const pattern = new RegExp(
    `<meta\\b[^>]*name=["']${escapeRegExp(name)}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const reversedPattern = new RegExp(
    `<meta\\b[^>]*content=["']([^"']*)["'][^>]*name=["']${escapeRegExp(name)}["'][^>]*>`,
    'i'
  );

  return decodeEntities(html.match(pattern)?.[1] || html.match(reversedPattern)?.[1] || '');
}

function getMetaProperty(html, property) {
  const pattern = new RegExp(
    `<meta\\b[^>]*property=["']${escapeRegExp(
      property
    )}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const reversedPattern = new RegExp(
    `<meta\\b[^>]*content=["']([^"']*)["'][^>]*property=["']${escapeRegExp(
      property
    )}["'][^>]*>`,
    'i'
  );

  return decodeEntities(html.match(pattern)?.[1] || html.match(reversedPattern)?.[1] || '');
}

function stripCdata(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '');
}

function stripHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ');
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&aacute;/g, 'á')
    .replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú')
    .replace(/&Aacute;/g, 'Á')
    .replace(/&Eacute;/g, 'É')
    .replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó')
    .replace(/&Uacute;/g, 'Ú')
    .replace(/&ntilde;/g, 'ñ')
    .replace(/&Ntilde;/g, 'Ñ')
    .replace(/&uuml;/g, 'ü')
    .replace(/&Uuml;/g, 'Ü')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(value) {
  return decodeEntities(stripCdata(value || ''))
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\s+Leer$/i, '')
    .replace(/\s+Seguir leyendo$/i, '')
    .trim();
}

function safeDate(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function countWords(value) {
  return cleanText(value)
    .split(/\s+/)
    .filter(Boolean).length;
}

function firstSentences(value, count) {
  return cleanText(value)
    .split(/(?<=[.!?])\s+/)
    .slice(0, count)
    .join(' ');
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function hash(value) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return Math.abs(result).toString(36);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function readResponseText(response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || '';

  const charsetMatch = contentType.match(/charset=([^;]+)/i);
  const declaredCharset = charsetMatch?.[1]?.trim().toLowerCase();

  const likelyLatin1 =
    declaredCharset?.includes('iso-8859-1') ||
    declaredCharset?.includes('latin1') ||
    declaredCharset?.includes('latin-1') ||
    declaredCharset?.includes('windows-1252');

  if (likelyLatin1) {
    return new TextDecoder('windows-1252').decode(buffer);
  }

  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);

  const replacementCount = (utf8Text.match(/�/g) || []).length;

  if (replacementCount > 5) {
    return new TextDecoder('windows-1252').decode(buffer);
  }

  return utf8Text;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});