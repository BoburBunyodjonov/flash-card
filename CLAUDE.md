# WordSwipe — Flash Card App

Vocabulary flashcard app with TikTok-style swipe mechanics. English → Uzbek word learning.

## Architecture

**Monorepo** (pnpm workspaces):
- `apps/web` — React + Tailwind + Framer Motion (Telegram Web App + browser PWA)
- `apps/admin` — React + MUI (browser-only admin panel, username/password auth)
- `apps/bot` — Telegram bot (notifications)
- `packages/api` — Fastify 4 backend (TypeScript, Prisma, PostgreSQL, Redis, BullMQ)
- `packages/shared` — shared types and constants

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Fastify 4, Prisma ORM, PostgreSQL 16, Redis 7, BullMQ, JWT |
| Web app | React 18, Vite, Tailwind CSS, Framer Motion, Zustand, i18next |
| Admin | React 18, Vite, MUI v6, MUI X DataGrid, Recharts, Zustand |
| Auth | Telegram WebApp (web), username+password env vars (admin) |
| Infra | Docker Compose (local), pnpm workspaces |

## Key Ports (dev)

- `3000` — API (Fastify)
- `5173` — Web app (Vite)
- `5174` — Admin panel (Vite)

## Environment Variables

Copy `.env.example` to `.env`. Minimum for local dev:
```
DATABASE_URL=postgresql://postgres:password@localhost:5434/wordswipe
REDIS_URL=redis://localhost:6380
JWT_SECRET=any-secret
JWT_REFRESH_SECRET=another-secret
TELEGRAM_BOT_TOKEN=from-botfather  # web app uchun
ADMIN_USERNAME=admin               # admin panel login
ADMIN_PASSWORD=yourpassword
```

## Database

- Prisma schema: `packages/api/prisma/schema.prisma`
- Tables: users, words, word_translations, categories, user_word_progress, user_decks, deck_words, follows, plan_settings, payments, language_pairs, duels, league_members
- Seed file: `packages/api/prisma/seed.ts` (run separately via `pnpm --filter api db:seed`)

## Key Domain Logic

**Spaced Repetition (SM-2):**
- `packages/api/src/utils/spaced-repetition.ts`
- Right swipe → strength +15, left → strength -20
- Intervals: [1, 3, 7, 14, 30, 60] days based on reviewCount

**Feed Algorithm:**
- `packages/api/src/services/feed.service.ts`
- 60% new words + 40% due-for-review words
- Redis queue cached per user per day (`feed:queue:{userId}:{date}`)

**Plan Settings:**
- `packages/api/src/services/plan-settings.service.ts`
- All limits stored in `plan_settings` DB table, cached in Redis 60s
- Admin can change any limit without code changes

**Quiz / Practice:**
- `packages/api/src/services/quiz.service.ts` + `apps/web/src/pages/Quiz`
- Modes: mcq, reverse, typing, listening, cloze, mixed — pulls due/weak words first
- Correct answers apply SM-2 + award XP (`XP_PER_QUIZ_CORRECT`)

**Friend Duels:**
- `packages/api/src/services/duel.service.ts` + `apps/web/src/pages/Duel`
- Shared question set stored in `duels.questions` JSON; deep link `?startapp=duel_<id>`
- Winner +50 XP, loser +15, draw +25 (tie broken by time)

**Weekly Leagues:**
- `packages/api/src/services/league.service.ts` — lazy group assignment (30/group per tier)
- Tiers: Bronze → Silver → Gold → Sapphire → Diamond; top 10 promote, bottom 5 demote
- Finalized by BullMQ cron Monday 00:05; all XP awards also call `addLeagueXp`

**Smart Reminders (BullMQ, `packages/api/src/jobs/index.ts`):**
- Daily reminder at user's `notifyAt` (includes due-word count)
- Hourly SM-2 dispatcher: notifies when ≥10 words are due (max 1×/day, quiet 22:00–08:00)

**CEFR Levels:**
- `users.cefr_level` set at onboarding / Settings; feed serves words up to level+1

**Audio & Offline:**
- Cards always show 🔊 — plays `audioUrl` or falls back to browser TTS (`apps/web/src/lib/tts.ts`)
- Offline PWA: feed cached + swipes queued in localStorage, replayed on reconnect (`feed.store.ts`)

**Auth:**
- Web app: Telegram WebApp `initData` → `validateWebAppInitData` (HMAC-SHA256 "WebAppData")
- Admin panel: `POST /api/auth/admin-login` → validates against `ADMIN_USERNAME`/`ADMIN_PASSWORD` env vars

## Custom Colors (Tailwind)

```
bg: #0a0a0a, card: #141420, surface: #1e1e30
primary: #6366f1 (indigo), success: #10b981, danger: #ef4444, warning: #f59e0b
```

## Run Commands

```bash
docker compose up -d              # PostgreSQL + Redis
pnpm --filter api db:push         # Create/update DB tables
pnpm --filter api db:seed         # Seed initial data
pnpm --filter api dev             # Start API
pnpm --filter web dev             # Start web app
pnpm --filter admin dev           # Start admin panel
```

## Important Notes

- Docker ports moved to **5434 (Postgres) / 6380 (Redis)** because another project occupies 5432/6379 on this machine
- `packages/api/.env` is a symlink to the root `.env` (dotenv loads from the package cwd)

- `TELEGRAM_BOT_TOKEN` is NOT required for admin panel — only for web app Telegram auth
- Admin panel has no Telegram dependency — purely browser-based with username/password
- `packages/api/tsconfig.json` excludes `prisma/seed.ts` from main build (seed runs separately)
- All monetary amounts stored as integers (smallest currency unit)
