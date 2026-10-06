# Fitted

**Your CV, fitted to every job.** Local, open-source tool to tailor ATS-ready CVs to job descriptions, using your **ChatGPT Plus/Pro plan** via the official [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source) flow — no API key, no per-token billing.

Runs only on your machine. Your CVs live in a local SQLite database.

## Features

**Profiles**
- Multiple master profiles (e.g. "DevOps", "Product Owner"), each a standalone CV with its own language (English / German); duplicate to branch off
- Generic sections (experience, education, skills, languages, certifications, projects, volunteering, awards, publications, custom); entries hold an ordered mix of paragraphs and bullets
- Import from PDF / DOCX → ChatGPT maps it into sections → review side by side with the original text
- Live A4 preview in an ATS-friendly single-column layout

**Job matching**
- Paste a job ad, pick a profile → requirements and ATS keywords are extracted (translated into the profile's language; the ad's original terms still count as matches)
- Score = 40% keyword coverage + 40% requirement fit (ChatGPT, re-checkable) + 20% ATS format checks; keyword and format parts update live as you accept changes
- Suggestion cards with word-level diffs, score impact, and requirement links: accept / reject / edit / regenerate with your own instruction
- Truth guard: suggestions that add keywords, numbers, or tags missing from your master profile are flagged; "accept all safe" skips them
- Tailored CV preview with changes highlighted; master profile stays untouched

**Export**
- PDF (headless Chromium prints the same component as the live preview; real text, embedded static fonts) and Word (native headings and bullet lists)
- Export the master profile or a job's tailored CV (accepted suggestions only); file names like `Name_CV_Company.pdf`
- ATS readability check: re-extracts text from both files like a parser does and verifies every heading, job, date, bullet and skill made it, in order; shows "what an ATS sees"

**Applications**
- Status per job (draft → applied → interview → offer / rejected) with dated history and notes
- Marking as applied freezes the exact CV and cover letter sent; download them any time later
- Cover letters from the tailored CV and job ad, in the profile's language, facts from the CV only; edit, rewrite with instructions, export as PDF or Word

**Next**
- Learned style preferences

## Run (Docker)

```sh
docker compose up -d --build
```

Open **http://127.0.0.1:8787** (use `127.0.0.1`, not `localhost` — the ChatGPT sign-in redirect is fixed to `http://127.0.0.1:<port>/callback`).

Data persists in the `resume-data` Docker volume (`/data` in the container): database, ChatGPT credentials (`0600`), and the installation's host id.

Different port: `PORT=9000 docker compose up -d` and open `http://127.0.0.1:9000`.

Reset everything: `docker compose down -v`.

The image includes Chromium for PDF export (~1.4 GB in total). For local development without Docker, PDF export uses `/usr/bin/chromium` or `CHROMIUM_PATH`.

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
