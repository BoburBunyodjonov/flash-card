# WordSwipe — swipe-based vocabulary learning

A vocabulary app for Uzbek-speaking English learners (IELTS prep, ages ~16–30). Words arrive as
full-screen cards: swipe right if you know it, left if you don't, up to bookmark. An SM-2 spaced
repetition engine decides when each word comes back. It runs in the browser and as a Telegram
Mini App, with an admin panel behind it.

## How the learning loop works

- **Cards** — word, pronunciation, definition, translation, example sentence.
- **Swipe = grade** — right (learned) / left (needs practice) / up (bookmark). No forms, no buttons.
- **Spaced repetition** — SM-2 schedules reviews at 1, 3, 7, 14 and 30 days, driven by a 0–100
  strength score per word.
- **Gamification** — daily streaks, XP (10 per learned word, multiplied by streak), global and
  friends leaderboards, achievements.
- **Freemium** — 20 cards/day on the free tier; premium unlocks unlimited cards, all categories,
  offline mode and analytics. Payments via Telegram Stars, Payme and Click (Uzbekistan), and Stripe.
- **Trilingual UI** — Uzbek, Russian, English.

## Architecture

A pnpm monorepo — four deployable apps over one shared domain layer.

```
apps/web       React 18 + Vite user app (browser + Telegram Mini App)
apps/admin     React + MUI admin panel (words, categories, users, subscriptions)
apps/bot       Telegram bot (webhook)
packages/api   Fastify + Prisma backend
packages/shared  Types, enums and Zod schemas shared everywhere
```

| Layer | Stack |
|---|---|
| Backend | Fastify + TypeScript, Prisma ORM, PostgreSQL, Redis, BullMQ job queues (notifications, background work) |
| Auth | Telegram `initData` verification + JWT access/refresh |
| Web | React 18, TypeScript, Vite, Zustand, Framer Motion, i18n (uz / ru / en) |
| Admin | React + MUI |
| Infra | Docker Compose (Postgres + Redis) in dev, Docker + Caddy reverse proxy in production |
| Tooling | pnpm workspaces, Node 20, Prisma Studio, seed scripts |

## Quick start

Requires Node 20, pnpm 9+ and Docker.

```bash
cp .env.example .env     # JWT secrets, admin login, TELEGRAM_BOT_TOKEN
pnpm setup               # install + start Postgres/Redis + prisma generate + db push
pnpm db:seed             # demo words and categories
```

Then, in separate terminals:

```bash
pnpm dev:api     # http://localhost:3000  (health check: /health)
pnpm dev:web     # http://localhost:5173
pnpm dev:admin   # http://localhost:5174
pnpm dev:bot     # Telegram bot
```

To test inside Telegram, tunnel port 5173 (`ngrok http 5173`) and give the HTTPS URL to
@BotFather as the Mini App URL. Full walkthrough in [`RUN.md`](./RUN.md); API reference in
[`docs/API.md`](./docs/API.md) and integrations in [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md).

## Docs

- [`TZ.md`](./TZ.md) — product and technical specification
- [`RUN.md`](./RUN.md) — local setup, Telegram Mini App testing, troubleshooting
- [`docs/API.md`](./docs/API.md) — REST API
- [`docs/INTEGRATIONS.md`](./docs/INTEGRATIONS.md) — Telegram, payments
