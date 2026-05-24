# WordSwipe — Full Technical Specification (TZ)

**Version:** 1.0  
**Date:** 2026-05-23  
**Platforms:** Web Browser + Telegram Web App

---

## 1. Project Overview

WordSwipe is a vocabulary learning application that uses vertical scroll and swipe mechanics inspired by Instagram Reels and TikTok. Users see each word as a full-screen card and evaluate their knowledge through swipe gestures.

### Target Audience
- Uzbek-speaking students
- IELTS / English language learners
- Ages 16–30

### Platforms
- Web Browser (Desktop + Mobile)
- Telegram Web App (Mini App)

---

## 2. Core Functionality

### 2.1 Swipe Mechanics
| Action | Result |
|---|---|
| Scroll down | Go to next word |
| Swipe right | "I know it" — word marked as learned |
| Swipe left | "I don't know it" — word added to practice queue |
| Swipe up | Save / bookmark the word |
| Tap card | Toggle translation visibility |

### 2.2 Card Content
- Word (large, bold)
- Pronunciation (IPA)
- Audio button (online mode only)
- English definition (via Free Dictionary API)
- Uzbek translation
- Example sentence
- Part of speech (noun, verb, adj…)
- Difficulty level (A1 → C2)
- Category badge

### 2.3 Spaced Repetition (SM-2 Algorithm)
- Words not learned automatically reappear
- Intervals: 1 day → 3 days → 7 days → 14 days → 30 days
- Each word has a "strength" score (0–100) that changes based on swipe result

---

## 3. Modules

### 3.1 Auth Module
- Telegram login only
- Inside Telegram Web App: automatic login via `initData`
- Browser version: Telegram Login Widget
- JWT tokens (access + refresh)

### 3.2 Word Feed Module (Main Screen)
- Vertical swipe feed
- Each session builds a word queue:
  - 60% new words
  - 40% words due for review (spaced repetition)
- Free user: 20 cards/day limit (configurable by admin)
- Premium user: unlimited

### 3.3 Dictionary Module
- English → Uzbek (words added by admin)
- English → English (Free Dictionary API)
- Search functionality
- Word detail page: full info, example sentences, synonyms

### 3.4 User Decks Module
- Users can create their own decks (private, for personal use only)
- Add words to deck (from search or manually)
- Saved/bookmarked words auto-deck
- Free: 1 deck, max 30 words (configurable by admin)
- Premium: unlimited decks and words

### 3.5 Progress Module
- Daily streak (consecutive days)
- Total words learned
- Progress by category
- Weekly / monthly charts
- Weak words list

### 3.6 Leaderboard Module
- Global leaderboard (top 100)
- Friends leaderboard
- Follow / unfollow system
- XP calculation: 10 XP per word learned, streak bonus = 2x
- Free: global only
- Premium: friends + global

### 3.7 Notification Module
- Daily reminder via Telegram Bot
- Time set by user (default: 20:00)
- Streak loss warning notification
- Weekly progress report

### 3.8 Offline Module (PWA)
- Service Worker caches word decks
- Progress stored in IndexedDB
- Auto-sync when back online
- Audio does not work offline (text only)

### 3.9 Multi-language Module (i18n)
- App interface in 3 languages: Uzbek, English, Russian
- Language changed in settings
- Word translations: English → Uzbek only (for now)
- Future: English → Russian, Russian → Uzbek

---

## 4. Admin Panel

### 4.1 Dashboard
- Total users count
- Active users today
- Premium users count
- Daily swipe statistics
- Revenue chart

### 4.2 Words Management
- Add / edit / delete words
- Bulk import (Excel / CSV)
- Auto-fetch data from Free Dictionary API
- Assign category to word
- Assign difficulty level
- Upload audio file (or auto-generate via TTS)

### 4.3 Categories Management
- Create / edit / delete categories
- Per category: Free or Premium toggle
- Category icon and color
- Word count per category

### 4.4 Plan Settings (Critical!)
**Free plan limits:**
- Daily swipe limit (default: 20)
- Max custom decks (default: 1)
- Max words per deck (default: 30)
- Ad frequency (default: every 10 cards)
- Which categories are free (toggle per category)
- Audio enabled for free (toggle)
- Offline mode enabled for free (toggle)
- Friends leaderboard enabled for free (toggle)

**Premium pricing:**
- Monthly price (UZS)
- Monthly price (USD)
- Annual price (UZS)
- Annual price (USD)
- Lifetime price (UZS)
- Lifetime price (USD)
- Discount percentage (%)
- Trial period (days)

### 4.5 Users Management
- Users list with filters
- View user profile and stats
- Grant / revoke premium (manual)
- Ban / unban user

### 4.6 Notifications Management
- Send push message to all users or specific segment
- Send Telegram bot message
- Schedule notifications

### 4.7 Analytics
- MAU / DAU chart
- Retention rate
- Most learned words
- Hardest words (most swiped left)
- Revenue analytics

---

## 5. Monetization System

### 5.1 Free Plan
- 20 swipes/day (admin configurable)
- 1 custom deck, max 30 words
- Free categories only
- Ads every 10 cards
- Global leaderboard only
- No offline mode

### 5.2 Premium Plan
- Unlimited swipes
- Unlimited decks and words
- All categories
- No ads
- Global + Friends leaderboard
- Offline mode
- Audio pronunciation
- Detailed analytics

### 5.3 Payment Methods
- Telegram Stars (primary — built into Telegram)
- Payme (Uzbekistan)
- Click (Uzbekistan)
- Stripe (international)

### 5.4 Ads (Free Users)
- Google AdSense (browser version)
- Banner shown every 10 cards

---

## 6. Database Schema

### users
```
id              UUID PRIMARY KEY
telegram_id     BIGINT UNIQUE
username        VARCHAR
first_name      VARCHAR
last_name       VARCHAR
avatar_url      VARCHAR
language        ENUM('uz', 'en', 'ru') DEFAULT 'uz'
is_premium      BOOLEAN DEFAULT false
premium_until   TIMESTAMP
streak          INTEGER DEFAULT 0
last_active     TIMESTAMP
xp              INTEGER DEFAULT 0
referred_by     UUID FK → users       -- future: referral program
league_id       UUID FK → leagues     -- future: leagues system
created_at      TIMESTAMP
```

### words
```
id              UUID PRIMARY KEY
word            VARCHAR UNIQUE
pronunciation   VARCHAR
audio_url       VARCHAR
image_url       VARCHAR               -- future: visual cards (Unsplash)
video_url       VARCHAR               -- future: native speaker video clips
part_of_speech  VARCHAR
difficulty      ENUM('A1','A2','B1','B2','C1','C2')
category_id     UUID FK → categories
created_by      UUID FK → users       -- null = admin
created_at      TIMESTAMP
```

### word_translations
```
id                  UUID PRIMARY KEY
word_id             UUID FK → words
language            ENUM('uz', 'ru')
translation         TEXT
definition_en       TEXT
example_en          TEXT
example_translated  TEXT
```

### categories
```
id              UUID PRIMARY KEY
name_uz         VARCHAR
name_en         VARCHAR
name_ru         VARCHAR
icon            VARCHAR
color           VARCHAR
is_premium      BOOLEAN DEFAULT false
order           INTEGER
created_at      TIMESTAMP
```

### user_word_progress
```
id              UUID PRIMARY KEY
user_id         UUID FK → users
word_id         UUID FK → words
status          ENUM('new','learning','learned','mastered')
strength        INTEGER DEFAULT 0     -- 0–100
next_review     TIMESTAMP
review_count    INTEGER DEFAULT 0
last_reviewed   TIMESTAMP
```

### user_decks
```
id              UUID PRIMARY KEY
user_id         UUID FK → users
name            VARCHAR
description     VARCHAR
is_default      BOOLEAN DEFAULT false  -- saved/bookmarked deck
is_public       BOOLEAN DEFAULT false  -- future: Public Deck Marketplace
created_at      TIMESTAMP
```

### deck_words
```
id              UUID PRIMARY KEY
deck_id         UUID FK → user_decks
word_id         UUID FK → words
added_at        TIMESTAMP
```

### follows
```
id              UUID PRIMARY KEY
follower_id     UUID FK → users
following_id    UUID FK → users
created_at      TIMESTAMP
```

### plan_settings
```
id              UUID PRIMARY KEY
key             VARCHAR UNIQUE
value           JSONB
updated_at      TIMESTAMP
updated_by      UUID FK → users
```

### payments
```
id              UUID PRIMARY KEY
user_id         UUID FK → users
amount          DECIMAL
currency        VARCHAR
provider        ENUM('telegram_stars','payme','click','stripe')
plan_type       ENUM('monthly','annual','lifetime')
status          ENUM('pending','success','failed')
created_at      TIMESTAMP
```

### language_pairs (future)
```
id              UUID PRIMARY KEY
from_lang       VARCHAR              -- en, ru
to_lang         VARCHAR              -- uz, en, ru
is_active       BOOLEAN DEFAULT false
created_at      TIMESTAMP
```

---

## 7. API Endpoints

### Auth
```
POST   /api/auth/telegram             Telegram login
POST   /api/auth/refresh              Refresh token
POST   /api/auth/logout               Logout
```

### Word Feed
```
GET    /api/feed                      Get daily queue
POST   /api/feed/swipe                Save swipe result
GET    /api/feed/stats                Today's progress
```

### Words
```
GET    /api/words                     Search / list words
GET    /api/words/:id                 Single word detail
GET    /api/words/:id/dictionary      Dictionary info (external API)
POST   /api/words/:id/bookmark        Bookmark word
DELETE /api/words/:id/bookmark        Remove bookmark
```

### Decks
```
GET    /api/decks                     User's decks
POST   /api/decks                     Create new deck
PUT    /api/decks/:id                 Edit deck
DELETE /api/decks/:id                 Delete deck
POST   /api/decks/:id/words           Add word to deck
DELETE /api/decks/:id/words/:wordId   Remove word from deck
```

### Progress
```
GET    /api/progress                  Overall progress
GET    /api/progress/streak           Streak info
GET    /api/progress/weak-words       Weak words list
GET    /api/progress/history          History (weekly/monthly)
```

### Leaderboard
```
GET    /api/leaderboard/global        Global top 100
GET    /api/leaderboard/friends       Friends leaderboard
POST   /api/users/:id/follow          Follow user
DELETE /api/users/:id/follow          Unfollow user
GET    /api/users/:id/followers       Followers list
GET    /api/users/:id/following       Following list
```

### Settings & Profile
```
GET    /api/settings/plan             Plan settings (public)
GET    /api/profile                   Get profile
PUT    /api/profile                   Update profile
PUT    /api/profile/language          Change language
PUT    /api/profile/notifications     Notification settings
```

### Payments
```
POST   /api/payments/telegram-stars   Telegram Stars payment
POST   /api/payments/payme            Payme payment
POST   /api/payments/click            Click payment
POST   /api/payments/stripe           Stripe payment
GET    /api/payments/history          Payment history
POST   /api/payments/webhook/:provider Webhook handler
```

### Admin
```
GET    /api/admin/dashboard           Statistics
GET    /api/admin/users               Users list
PUT    /api/admin/users/:id           Edit user
GET    /api/admin/words               Words list
POST   /api/admin/words               Add word
PUT    /api/admin/words/:id           Edit word
DELETE /api/admin/words/:id           Delete word
POST   /api/admin/words/import        Bulk import
GET    /api/admin/categories          Categories list
POST   /api/admin/categories          Add category
PUT    /api/admin/categories/:id      Edit category
DELETE /api/admin/categories/:id      Delete category
GET    /api/admin/settings            All plan settings
PUT    /api/admin/settings/:key       Update setting
POST   /api/admin/notifications/send  Send notification
GET    /api/admin/analytics           Analytics data
```

---

## 8. Tech Stack

### Frontend (Web App + Telegram Web App)
```
Framework:       React 18 + TypeScript
Build tool:      Vite
Styling:         Tailwind CSS
Animations:      Framer Motion (swipe cards)
State:           Zustand
API client:      TanStack Query (React Query)
i18n:            i18next
PWA:             vite-plugin-pwa
Telegram SDK:    @twa-dev/sdk
```

### Admin Panel
```
Framework:       React 18 + TypeScript
Build tool:      Vite
UI Library:      MUI (Material UI) v6
State:           Zustand
API client:      TanStack Query
Charts:          Recharts
Tables:          MUI DataGrid
```

### Backend
```
Runtime:         Node.js 20
Framework:       Fastify
Language:        TypeScript
ORM:             Prisma
Auth:            JWT (jsonwebtoken)
Validation:      Zod
Queue:           Bull (Redis)
Cache:           Redis
```

### Database & Infrastructure
```
Database:        PostgreSQL 16
Cache:           Redis
File Storage:    Cloudflare R2 (audio files, images)
Frontend:        Vercel
Backend:         Railway
DB Hosting:      Supabase (PostgreSQL)
```

### External APIs
```
Dictionary:      dictionaryapi.dev (free)
TTS Audio:       Google Cloud TTS
Payments:        Telegram Bot API, Payme, Click, Stripe
Telegram Bot:    Telegraf.js
```

---

## 9. Folder Structure

```
wordswipe/
├── apps/
│   ├── web/                    # React Web App (browser + Telegram)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── SwipeCard/
│   │   │   │   ├── CardStack/
│   │   │   │   ├── ProgressBar/
│   │   │   │   └── ...
│   │   │   ├── pages/
│   │   │   │   ├── Feed/
│   │   │   │   ├── Dictionary/
│   │   │   │   ├── Decks/
│   │   │   │   ├── Progress/
│   │   │   │   ├── Leaderboard/
│   │   │   │   └── Settings/
│   │   │   ├── stores/
│   │   │   ├── hooks/
│   │   │   ├── api/
│   │   │   ├── i18n/
│   │   │   │   ├── uz.json
│   │   │   │   ├── en.json
│   │   │   │   └── ru.json
│   │   │   └── utils/
│   │   └── public/
│   │
│   ├── admin/                  # React Admin Panel (MUI)
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard/
│   │   │   │   ├── Words/
│   │   │   │   ├── Categories/
│   │   │   │   ├── Users/
│   │   │   │   ├── PlanSettings/
│   │   │   │   ├── Analytics/
│   │   │   │   └── Notifications/
│   │   │   ├── components/
│   │   │   ├── api/
│   │   │   └── stores/
│   │
│   └── bot/                    # Telegram Bot (Telegraf.js)
│       ├── src/
│       │   ├── commands/
│       │   ├── middlewares/
│       │   └── notifications/
│
├── packages/
│   ├── api/                    # Fastify Backend
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middlewares/
│   │   │   ├── jobs/           # Bull queue jobs
│   │   │   └── utils/
│   │   └── prisma/
│   │       └── schema.prisma
│   │
│   └── shared/                 # Shared types and utils
│       ├── types/
│       └── constants/
│
├── package.json                # Monorepo (pnpm workspaces)
└── docker-compose.yml
```

---

## 10. Future Extensions (architecture will be ready)

All features below are excluded from the current build but the database schema and architecture are designed to support them without breaking changes.

### 10.1 Language Pairs
| Feature | Architecture Readiness |
|---|---|
| Russian → Uzbek | `language_pairs` table + `word_translations.language` enum |
| English → Russian | Same as above |
| Any new language pair | Add new enum value, insert rows — no schema rewrite |

### 10.2 Gamification
| Feature | Architecture Readiness |
|---|---|
| Leagues (Bronze → Diamond) | `xp` field in users ready; add `leagues` + `league_seasons` tables |
| Weekly competition | `league_seasons` table |
| 1v1 Word Battle | Add `battles` table + WebSocket support |
| Daily Challenge | Add `daily_challenges` table |
| Combo multiplier | Frontend logic + backend XP formula adjustment |
| Achievements / Badges | Add `achievements` + `user_achievements` tables |
| Streak Freeze shop | Add `user_items` table (purchasable with XP) |

### 10.3 Study Modes
| Feature | Architecture Readiness |
|---|---|
| Match game (pair words) | Existing words API is sufficient |
| Fill in the blank | `word_translations.example_en` field already exists |
| Listening mode | `words.audio_url` field already exists |
| Spelling mode | Frontend logic only |
| Visual cards (Unsplash) | `words.image_url` field already exists |

### 10.4 Social & Community
| Feature | Architecture Readiness |
|---|---|
| Class / Group (study centers) | Add `groups` + `group_members` tables |
| Public Deck Marketplace | `user_decks.is_public` field already exists |
| Native speaker video clips | `words.video_url` field already exists |
| Weekly progress report | Bull queue job infrastructure already in place |

### 10.5 Monetization Extensions
| Feature | Architecture Readiness |
|---|---|
| Referral program | `users.referred_by` field already exists; add `referrals` table |
| B2B (study center subscription) | Add `organizations` + `org_subscriptions` tables |
| Premium Deck Pack sales | Add `products` table; existing payments API handles it |
| Streak Freeze XP shop | Add `user_items` table |

### 10.6 Platform Extensions
| Feature | Architecture Readiness |
|---|---|
| iOS / Android (React Native) | Backend API is platform-agnostic, no changes needed |
| AI example sentences (Claude API) | Writes to existing `word_translations` table |
| Onboarding level quiz | Add `user_level_tests` table |

---

## 11. Development Roadmap

### Phase 1 — MVP (6–8 weeks)
- [ ] Backend: Auth, Words, Feed, Progress API
- [ ] Web App: Swipe feed, card UI, Telegram login
- [ ] Admin Panel: Word management, categories
- [ ] Telegram Web App integration

### Phase 2 — Monetization (3–4 weeks)
- [ ] Free / Premium plan enforcement
- [ ] Telegram Stars payment
- [ ] Payme / Click integration
- [ ] Admin: Plan settings panel

### Phase 3 — Social (2–3 weeks)
- [ ] Follow / unfollow system
- [ ] Leaderboard (global + friends)
- [ ] Telegram Bot daily notifications

### Phase 4 — Polish (2 weeks)
- [ ] Offline mode (PWA)
- [ ] i18n (3 languages)
- [ ] Analytics dashboard
- [ ] Performance optimization

---

**Total estimated time: 13–17 weeks**
