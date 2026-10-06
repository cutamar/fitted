# Resume Builder

Local, open-source tool to tailor ATS-ready CVs to job descriptions, using your **ChatGPT Plus/Pro plan** via the official [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source) flow — no API key, no per-token billing.

Runs only on your machine. Your CVs live in a local SQLite database.

## Features

**Milestone 1 (done)**
- Sign in with ChatGPT (OAuth + PKCE, dynamic client registration), model picker, sign-out with token revocation
- Multiple master profiles (e.g. "Product Owner", "Sales"), each a standalone CV; duplicate to branch off
- Generic sections: work experience, education, skills, languages, certifications, projects, volunteering, awards, publications, and custom sections
- Import from PDF / DOCX → AI maps the text into sections → side-by-side review against the original text to fix mappings
- Profile language (English / German) — suggestions will always be written in the profile's language, even for job ads in another language

**Milestone 2 (next)**
- Paste a job description, pick a profile → score breakdown (keyword/requirement coverage + AI assessment)
- Suggestion cards with word-level diffs: accept / reject / edit / regenerate with instructions
- ATS-safe export (DOCX + PDF) with a re-parse check

## Run (Docker)

```sh
docker compose up -d --build
```

Open **http://127.0.0.1:8787** (use `127.0.0.1`, not `localhost` — the ChatGPT sign-in redirect is fixed to `http://127.0.0.1:<port>/callback`).

Data persists in the `resume-data` Docker volume (`/data` in the container): database, ChatGPT credentials (`0600`), and the installation's host id.

Different port: `PORT=9000 docker compose up -d` and open `http://127.0.0.1:9000`.

Reset everything: `docker compose down -v`.

### ChatGPT plan usage

- Requires ChatGPT **Plus or Pro**. On first sign-in ChatGPT asks you to name and authorize the app.
- Set a weekly usage cap for this app in ChatGPT → Settings → Usage. When it's reached, AI features pause; nothing gets billed elsewhere.
- Plan usage is a preview by OpenAI; supported request options are limited (no temperature, max tokens, hosted tools).

## Develop

Requires Node ≥ 24 and pnpm 10.

```sh
pnpm install
pnpm dev          # API on :8787 (tsx watch), web on http://127.0.0.1:5173 (Vite, proxies /api)
pnpm test         # vitest
pnpm typecheck
pnpm build        # web → apps/web/dist, server → apps/server/dist
```

In dev, the OAuth callback still hits the API on `127.0.0.1:8787` and then redirects you back to Vite.

## Layout

```
packages/shared   zod schemas (profile, sections), i18n labels, API types — used by both sides
apps/server       Hono API: ChatGPT OAuth + Responses client, SQLite (node:sqlite), CV import
apps/web          React + Vite + Tailwind + TanStack Query
```

Profiles are stored as one JSON document per profile; every section uses the same generic item shape (title, subtitle, dates, description, bullets, tags, url) so custom sections need no schema changes.
