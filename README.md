# Hola Lector

Hola Lector is a Spanish news reader and vocabulary trainer.

It is designed for Spanish learners who want to read real news, tap unfamiliar words, translate them, save useful vocabulary, and review saved words later.

**Live app:**  
https://naghiyev1.github.io/hola-lector/

---

## What it does

- Loads Spanish news from RSS feeds
- Uses cached articles when live feeds fail
- Opens articles in a learner-friendly reading view
- Falls back to RSS summaries if full article extraction fails
- Lets users click/tap Spanish words
- Translates selected words into English
- Speaks selected Spanish words using browser text-to-speech
- Saves vocabulary locally in the browser
- Provides a review mode for saved words
- Runs fully on GitHub Pages
- Requires no backend, account, database, or paid hosting

---

## Important limitation

This app is intentionally frontend-only.

That keeps it free and easy to host, but it also means some news sources may occasionally fail because browsers block cross-origin RSS/article requests.

To reduce that problem, Hola Lector:

- Tries several RSS sources
- Uses proxy fallbacks
- Caches the last successful article list
- Shows clear fallback states
- Uses RSS summaries when full article text cannot be extracted

The app should never depend on perfect full-article extraction.

---

## Tech stack

- React
- TypeScript
- Vite
- GitHub Pages
- GitHub Actions
- Browser localStorage
- Browser speech synthesis

---

## Local development

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

---

## Deployment

The app deploys automatically to GitHub Pages when changes are pushed to the `main` branch.

Workflow:

```text
.github/workflows/deploy.yml
```

Production URL:

```text
https://naghiyev1.github.io/hola-lector/
```

---

## Privacy

The app does not require login.

Saved vocabulary is stored locally in the user's browser. Clearing browser data may remove saved words.
