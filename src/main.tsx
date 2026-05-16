import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  BookOpen,
  RefreshCw,
  Search,
  Volume2,
  Star,
  Trash2,
  AlertCircle,
  ExternalLink,
  Newspaper,
  Library,
  CheckCircle2,
  X,
} from 'lucide-react'
import './styles.css'
import type { Article, SavedWord, TranslationResult } from './lib/types'
import { fetchSpanishNews, getArticleBody } from './lib/news'
import { translateWord } from './lib/translate'
import { loadSavedWords, saveSavedWords } from './lib/storage'
import { tokenizeSpanishText, normalizeWord } from './lib/text'

type View = 'news' | 'reader' | 'vocab'
type VocabFilter = 'all' | 'learning' | 'known'

const SOURCE_LABELS: Record<string, string> = {
  elpais: 'El País',
  elmundo: 'El Mundo',
  elconfidencial: 'El Confidencial',
  veinteminutos: '20 Minutos',
  rtve: 'RTVE',
}

function App() {
  const [articles, setArticles] = React.useState<Article[]>([])
  const [selectedArticle, setSelectedArticle] = React.useState<Article | null>(null)
  const [articleBody, setArticleBody] = React.useState('')
  const [articleStatus, setArticleStatus] = React.useState<'idle' | 'loading' | 'full' | 'summary' | 'failed'>('idle')
  const [view, setView] = React.useState<View>('news')
  const [isLoadingNews, setIsLoadingNews] = React.useState(true)
  const [newsError, setNewsError] = React.useState('')
  const [fromCache, setFromCache] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [savedWords, setSavedWords] = React.useState<SavedWord[]>(() => loadSavedWords())
  const [vocabFilter, setVocabFilter] = React.useState<VocabFilter>('all')
  const [activeWord, setActiveWord] = React.useState('')
  const [translation, setTranslation] = React.useState<TranslationResult | null>(null)
  const [isTranslating, setIsTranslating] = React.useState(false)

  React.useEffect(() => {
    void loadNews()
  }, [])

  React.useEffect(() => {
    saveSavedWords(savedWords)
  }, [savedWords])

  async function loadNews() {
    setIsLoadingNews(true)
    setNewsError('')

    try {
      const result = await fetchSpanishNews()
      setArticles(result.articles)
      setFromCache(result.fromCache)
      if (result.warning) setNewsError(result.warning)
    } catch (error) {
      setNewsError(error instanceof Error ? error.message : 'Could not load news.')
    } finally {
      setIsLoadingNews(false)
    }
  }

  async function openArticle(article: Article) {
    setSelectedArticle(article)
    setView('reader')
    setArticleBody(article.summary || '')
    setArticleStatus('loading')
    closeWordHelper()

    const result = await getArticleBody(article)
    setArticleBody(result.text || article.summary || '')
    setArticleStatus(result.status)
  }

  async function selectWord(word: string) {
    const clean = normalizeWord(word)
    if (!clean) return

    setActiveWord(clean)
    setTranslation(null)
    setIsTranslating(true)

    try {
      const result = await translateWord(clean)
      setTranslation(result)
    } finally {
      setIsTranslating(false)
    }
  }

  function closeWordHelper() {
    setActiveWord('')
    setTranslation(null)
    setIsTranslating(false)
  }

  function isWordSaved(word: string) {
    return savedWords.some((item) => item.word.toLowerCase() === word.toLowerCase())
  }

  function getWordContext(word: string) {
    if (!word || !articleBody) return selectedArticle?.title || ''

    const cleanWord = normalizeWord(word).toLowerCase()
    const sentences = articleBody
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)

    const matchingSentence = sentences.find((sentence) =>
      sentence
        .split(/\s+/)
        .map((part) => normalizeWord(part).toLowerCase())
        .includes(cleanWord),
    )

    return matchingSentence || selectedArticle?.title || ''
  }

  function saveWord() {
    if (!activeWord) return

    const meaning = translation?.translatedText || ''
    const existing = isWordSaved(activeWord)

    if (!existing) {
      setSavedWords((previous) => [
        {
          id: `${activeWord}-${Date.now()}`,
          word: activeWord,
          meaning,
          example: getWordContext(activeWord),
          createdAt: new Date().toISOString(),
          reviewCount: 0,
          known: false,
        },
        ...previous,
      ])
    }
  }

  function speak(text: string) {
    if (!('speechSynthesis' in window)) return

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-ES'
    utterance.rate = 0.85

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  function removeWord(id: string) {
    setSavedWords((previous) => previous.filter((item) => item.id !== id))
  }

  function toggleKnown(id: string) {
    setSavedWords((previous) =>
      previous.map((item) =>
        item.id === id
          ? {
              ...item,
              known: !item.known,
              reviewCount: item.reviewCount + 1,
              lastReviewedAt: new Date().toISOString(),
            }
          : item,
      ),
    )
  }

  function splitIntoReadingParagraphs(text: string) {
    const cleaned = text
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    if (!cleaned) return []

    const existingParagraphs = cleaned
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)

    if (existingParagraphs.length > 1) {
      return existingParagraphs
    }

    const sentences = cleaned
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ¿¡])/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)

    if (sentences.length <= 2) return [cleaned]

    const paragraphs: string[] = []

    for (let index = 0; index < sentences.length; index += 3) {
      paragraphs.push(sentences.slice(index, index + 3).join(' '))
    }

    return paragraphs
  }

  const filteredSavedWords = savedWords.filter((item) => {
    if (vocabFilter === 'known') return item.known
    if (vocabFilter === 'learning') return !item.known
    return true
  })

  const filteredArticles = articles.filter((article) => {
    const value = `${article.title} ${article.summary} ${article.source}`.toLowerCase()
    return value.includes(query.toLowerCase())
  })

  const readingText = articleBody || selectedArticle?.summary || ''
  const readingParagraphs = splitIntoReadingParagraphs(readingText)

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Spanish reading trainer</p>
          <h1>Hola Lector</h1>
          <p className="hero-copy">
            Read Spanish news, tap words you do not know, translate them, and save vocabulary for review.
          </p>
        </div>

        <div className="hero-actions">
          <button className={view === 'news' ? 'tab active' : 'tab'} onClick={() => setView('news')}>
            <Newspaper size={18} />
            News
          </button>
          <button className={view === 'vocab' ? 'tab active' : 'tab'} onClick={() => setView('vocab')}>
            <Library size={18} />
            Vocabulary
            <span className="badge">{savedWords.length}</span>
          </button>
        </div>
      </header>

      <main className="layout">
        {view === 'news' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Latest Spanish news</h2>
                <p>RSS summaries are used as the reliable fallback. Full articles load when possible.</p>
              </div>

              <button className="secondary" onClick={loadNews} disabled={isLoadingNews}>
                <RefreshCw size={17} className={isLoadingNews ? 'spin' : ''} />
                Refresh
              </button>
            </div>

            <div className="search-row">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search news..." />
            </div>

            {newsError && (
              <div className="notice">
                <AlertCircle size={18} />
                {newsError}
              </div>
            )}

            {fromCache && (
              <div className="notice success">
                <CheckCircle2 size={18} />
                Showing cached articles from the last successful load.
              </div>
            )}

            {isLoadingNews ? (
              <div className="cards">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div className="card skeleton" key={index} />
                ))}
              </div>
            ) : (
              <div className="cards">
                {filteredArticles.map((article) => (
                  <article className="card" key={article.id}>
                    <div className="source-row">
                      <span>{SOURCE_LABELS[article.source] || article.source}</span>
                      <span>{article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'Latest'}</span>
                    </div>

                    <h3>{article.title}</h3>
                    <p>{article.summary || 'Summary unavailable. Open the article to try loading readable text.'}</p>

                    <button className="primary" onClick={() => openArticle(article)}>
                      <BookOpen size={17} />
                      Read and learn
                    </button>
                  </article>
                ))}
              </div>
            )}

            {!isLoadingNews && filteredArticles.length === 0 && (
              <div className="empty">No articles found. Try clearing the search.</div>
            )}
          </section>
        )}

        {view === 'reader' && selectedArticle && (
          <section className="reader-grid">
            <article className="panel reader">
              <button className="link-button" onClick={() => setView('news')}>
                ← Back to news
              </button>

              <div className="source-row">
                <span>{SOURCE_LABELS[selectedArticle.source] || selectedArticle.source}</span>
                <a href={selectedArticle.url} target="_blank" rel="noreferrer">
                  Original <ExternalLink size={14} />
                </a>
              </div>

              <h2>{selectedArticle.title}</h2>

              {articleStatus === 'loading' && <div className="notice">Loading readable article text...</div>}

              {articleStatus === 'summary' && (
                <div className="notice">
                  Full article could not be extracted reliably. Showing RSS summary instead.
                </div>
              )}

              {articleStatus === 'failed' && (
                <div className="notice">
                  Could not extract article text. You can still use the available summary and open the original source.
                </div>
              )}

              <div className="reading-text">
                {readingParagraphs.map((paragraph, paragraphIndex) => {
                  const paragraphTokens = tokenizeSpanishText(paragraph)

                  return (
                    <p className="reading-paragraph" key={`paragraph-${paragraphIndex}`}>
                      {paragraphTokens.map((token, tokenIndex) =>
                        token.type === 'word' ? (
                          <button
                            key={`${token.value}-${paragraphIndex}-${tokenIndex}`}
                            className="word"
                            onClick={() => selectWord(token.value)}
                          >
                            {token.value}
                          </button>
                        ) : (
                          <span key={`${token.value}-${paragraphIndex}-${tokenIndex}`}>{token.value}</span>
                        ),
                      )}
                    </p>
                  )
                })}
              </div>
            </article>

            <aside className={activeWord ? 'panel word-panel has-word' : 'panel word-panel is-empty'}>
              <div className="word-panel-head">
                <h3>Word helper</h3>

                {activeWord && (
                  <button className="icon-button word-panel-close" onClick={closeWordHelper} title="Close translation">
                    <X size={18} />
                  </button>
                )}
              </div>

              {!activeWord ? (
                <p className="muted">Tap any Spanish word in the article to translate it, hear it, and save it for review.</p>
              ) : (
                <>
                  <div className="selected-word">
                    <div>
                      <span className="eyebrow">Selected word</span>
                      <strong>{activeWord}</strong>
                    </div>

                    <button className="icon-button" onClick={() => speak(activeWord)} title="Pronounce">
                      <Volume2 size={18} />
                    </button>
                  </div>

                  <div className="helper-section">
                    <span className="helper-label">Translation</span>

                    {isTranslating && <p className="muted">Translating...</p>}

                    {translation ? (
                      <div className="translation">
                        <p>{translation.translatedText || 'No translation found.'}</p>
                        {translation.warning && <small>{translation.warning}</small>}
                      </div>
                    ) : (
                      !isTranslating && <p className="muted">Translation will appear here.</p>
                    )}
                  </div>

                  <div className="helper-section">
                    <span className="helper-label">Context</span>
                    <p className="context-snippet">{getWordContext(activeWord)}</p>
                  </div>

                  <button className="primary full" onClick={saveWord} disabled={isWordSaved(activeWord)}>
                    {isWordSaved(activeWord) ? <CheckCircle2 size={17} /> : <Star size={17} />}
                    {isWordSaved(activeWord) ? 'Saved' : 'Save word'}
                  </button>
                </>
              )}
            </aside>
          </section>
        )}

        {view === 'vocab' && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Saved vocabulary</h2>
                <p>Words are stored locally in this browser.</p>
              </div>

              <div className="filter-tabs" aria-label="Vocabulary filters">
                <button className={vocabFilter === 'all' ? 'filter-tab active' : 'filter-tab'} onClick={() => setVocabFilter('all')}>
                  All
                  <span>{savedWords.length}</span>
                </button>

                <button
                  className={vocabFilter === 'learning' ? 'filter-tab active' : 'filter-tab'}
                  onClick={() => setVocabFilter('learning')}
                >
                  Learning
                  <span>{savedWords.filter((item) => !item.known).length}</span>
                </button>

                <button className={vocabFilter === 'known' ? 'filter-tab active' : 'filter-tab'} onClick={() => setVocabFilter('known')}>
                  Known
                  <span>{savedWords.filter((item) => item.known).length}</span>
                </button>
              </div>
            </div>

            {savedWords.length === 0 ? (
              <div className="empty">No saved words yet. Open an article and tap words to save them.</div>
            ) : filteredSavedWords.length === 0 ? (
              <div className="empty">No words in this filter yet.</div>
            ) : (
              <div className="vocab-list">
                {filteredSavedWords.map((item) => (
                  <div className={item.known ? 'vocab-item known' : 'vocab-item'} key={item.id}>
                    <div>
                      <strong>{item.word}</strong>
                      <p>{item.meaning || 'Translation unavailable'}</p>
                      {item.example && <small>From: {item.example}</small>}
                    </div>

                    <div className="vocab-actions">
                      <button className="secondary" onClick={() => speak(item.word)}>
                        <Volume2 size={16} />
                      </button>

                      <button className="secondary" onClick={() => toggleKnown(item.id)}>
                        {item.known ? 'Known' : 'Mark known'}
                      </button>

                      <button className="danger" onClick={() => removeWord(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)