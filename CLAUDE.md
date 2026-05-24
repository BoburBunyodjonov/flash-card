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
DATABASE_URL=postgresql://postgres:password@localhost:5432/wordswipe
REDIS_URL=redis://localhost:6379
JWT_SECRET=any-secret
JWT_REFRESH_SECRET=another-secret
TELEGRAM_BOT_TOKEN=from-botfather  # web app uchun
ADMIN_USERNAME=admin               # admin panel login
ADMIN_PASSWORD=yourpassword
```

## Database

- Prisma schema: `packages/api/prisma/schema.prisma`
- 12 tables: users, words, word_translations, categories, user_word_progress, user_decks, deck_words, follows, plan_settings, payments, language_pairs
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

- `TELEGRAM_BOT_TOKEN` is NOT required for admin panel — only for web app Telegram auth
- Admin panel has no Telegram dependency — purely browser-based with username/password
- `packages/api/tsconfig.json` excludes `prisma/seed.ts` from main build (seed runs separately)
- All monetary amounts stored as integers (smallest currency unit)
