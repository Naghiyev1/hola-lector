import fetch from 'node-fetch'
import { writeFile, mkdir } from 'node:fs/promises';

const FEEDS = [
  { source: 'elpais', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada' },
  { source: 'elmundo', url: 'https://e00-elmundo.uecdn.es/elmundo/rss/portada.xml' },
  { source: 'elconfidencial', url: 'https://rss.elconfidencial.com/espana/' },
  { source: 'veinteminutos', url: 'https://www.20minutos.es/rss/' },
  { source: 'rtve', url: 'https://www.rtve.es/rss/noticias.xml' },
];

const FALLBACK_ARTICLES = [
  {
    id: 'sample-1',
    source: 'rtve',
    title: 'La vida cotidiana en España cambia con nuevos hábitos digitales',
    summary: 'Cada vez más personas utilizan herramientas digitales para leer noticias, aprender idiomas y organizar su día. Este texto de muestra sirve para practicar vocabulario cuando las fuentes en directo no están disponibles.',
    url: 'https://www.rtve.es/noticias/',
    publishedAt: new Date().toISOString(),
    content: 'Cada vez más personas utilizan herramientas digitales para leer noticias, aprender idiomas y organizar su día. Este texto de muestra sirve para practicar vocabulario cuando las fuentes en directo no están disponibles.',
  },
];

async function main() {
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const articles = settled
    .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    .filter((article) => article.title && article.url)
    .sort((a, b) => (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0))
    .slice(0, 60);

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceCount: FEEDS.length,
    articleCount: articles.length,
    articles: articles.length > 0 ? articles : FALLBACK_ARTICLES,
  };

  await mkdir('public', { recursive: true });
  await writeFile('public/news.json', `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`Wrote public/news.json with ${payload.articles.length} article(s).`);
  const failures = settled.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`${failures.length} feed(s) failed. Other feeds were still used.`);
    failures.forEach((failure) => console.warn(failure.reason));
  }
}

async function fetchFeed(feed) {
  const response = await fetch(feed.url, {
    headers: {
      'user-agent': 'HolaLector/1.0 (+https://naghiyev1.github.io/hola-lector/)',
      accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });

  if (!response.ok) throw new Error(`${feed.source} failed with HTTP ${response.status}`);

  const xml = await response.text();
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 18);

  return items.map((match, index) => {
    const item = match[0];
    const title = cleanText(getTag(item, 'title') || 'Untitled article');
    const url = cleanText(getTag(item, 'link'));
    const description = cleanText(stripHtml(getTag(item, 'description')));
    const contentEncoded = cleanText(stripHtml(getTag(item, 'content:encoded') || getTag(item, 'encoded')));
    const publishedRaw = cleanText(getTag(item, 'pubDate'));
    const publishedAt = publishedRaw ? safeDate(publishedRaw) : undefined;
    const summary = description || contentEncoded || 'Summary unavailable.';

    return {
      id: `${feed.source}-${index}-${hash(title + url)}`,
      source: feed.source,
      title,
      summary,
      url,
      publishedAt,
      content: contentEncoded || summary,
    };
  });
}

function getTag(xml, tagName) {
  const escapedTag = tagName.replace(':', '\\:');
  const pattern = new RegExp(`<${escapedTag}\\b[^>]*>([\\s\\S]*?)<\\/${escapedTag}>`, 'i');
  const match = xml.match(pattern);
  return decodeEntities(stripCdata(match?.[1] || ''));
}

function stripCdata(value) {
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '');
}

function stripHtml(value) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanText(value) {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

function safeDate(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

function hash(value) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result << 5) - result + value.charCodeAt(index);
    result |= 0;
  }
  return Math.abs(result).toString(36);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
