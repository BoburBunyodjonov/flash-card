# WordsVibe API Reference

REST + WebSocket API for the WordsVibe (WordSwipe) vocabulary‑learning backend.
This document is the contract for building native mobile / third‑party clients.

- **Base URL (production):** `https://bunyodjonov.uz`
- All HTTP paths below are absolute (already include the `/api` prefix).
- **Content type:** `application/json` for all request/response bodies.

---

## 1. Response envelope

Every endpoint returns the same envelope:

```json
{ "success": true,  "data": { /* ... */ } }
{ "success": false, "error": "Human-readable message" }
```

- On success, `data` holds the payload (shape documented per endpoint). A few endpoints return `{ "success": true }` with no `data`.
- On failure, `error` is a short message and the HTTP status code carries the meaning.

## 2. Authentication

Token‑based (JWT). A user can sign in **two ways**:

**A) Phone + password** (native app, no Telegram needed):
1. `POST /api/auth/register` (phone, password, firstName) → creates the account.
2. `POST /api/auth/login` (phone, password) → returns tokens.

**B) Telegram** (Mini App or Telegram Login):
- Inside the Telegram Mini App: `POST /api/auth/webapp` with raw `initData`.
- Telegram Login Widget (browser/native): `POST /api/auth/telegram` with the widget fields.

**Then, for both:**
3. You receive `{ user, accessToken, refreshToken }`.
4. Send `Authorization: Bearer <accessToken>` on every authenticated request.
5. The access token is short‑lived (~15 min). On a `401`, refresh with `POST /api/auth/refresh` (using `refreshToken`) and retry. The refresh token is long‑lived (~30 days).

> **Notes for phone‑only users:** there is currently **no SMS/OTP verification** (the phone is trusted at registration) and **no password reset** flow yet. Phone‑only accounts have `telegramId: null`, so they do **not** receive Telegram‑bot features (reminders, duel/speaking bot pings) and cannot pay with Telegram Stars — premium for them needs a local payment method (Payme/Click), not yet implemented. All core features work.

**Auth states per endpoint** are marked as:
- **Auth: required** → must send `Authorization: Bearer <accessToken>`. Missing/expired → `401 { "success": false, "error": "Unauthorized" }`.
- **Auth: none** → public.

## 3. Conventions

- **IDs** are UUID strings unless noted. `telegramId` is a BigInt — always treat it as a **string** client‑side.
- **Dates** are ISO‑8601 strings (e.g. `2026-06-28T10:00:00.000Z`), except history buckets keyed by `YYYY-MM-DD`.
- **CEFR levels:** `A1 A2 B1 B2 C1 C2`.
- **Languages:** `uz` (default), `en`, `ru`.
- **Pagination** (where present): `page` (1‑based) + `limit`, response includes `total` / `totalPages`.
- **Common status codes:** `400` invalid input · `401` unauthenticated · `402` premium required · `404` not found · `409` conflict · `503` feature unavailable · `500` server error.

## 4. Deep links (Telegram)

- **Duel invite:** `https://t.me/<botUsername>?start=duel_<duelId>` → bot replies with an "Open" button → app opens with `?sp=duel_<id>`.
- **Speaking invite (bot broadcast):** opens the app with `?sp=speaking` → app should auto‑start matchmaking.
- **Referral:** `start=ref_<userId>` (attributed at first login via Telegram `initData`).
- A native app should parse a `sp` / `start` parameter on launch and route accordingly.

---

## Auth & Account

### `POST /api/auth/telegram`
**Auth:** none — Description: Log in via the Telegram Login Widget (validates HMAC, upserts the user).
**Request body:**
```json
{
  "id": "string — Telegram user ID, required",
  "first_name": "string — required",
  "last_name": "string — optional",
  "username": "string — optional",
  "photo_url": "string — optional",
  "auth_date": "string — unix seconds, required (rejected if older than 5 min)",
  "hash": "string — Telegram HMAC, required"
}
```
**Response 200:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "string (uuid)",
      "firstName": "string",
      "lastName": "string | null",
      "username": "string | null",
      "avatarUrl": "string | null",
      "phone": "string | null (e.g. +998901234567)",
      "language": "uz | en | ru",
      "isPremium": "boolean",
      "premiumUntil": "ISO datetime | null",
      "isAdmin": "boolean",
      "streak": "number",
      "xp": "number",
      "cefrLevel": "A1..C2 | null",
      "gender": "male | female | null",
      "notifyAt": "HH:MM",
      "notifyEnabled": "boolean",
      "telegramId": "string (numeric) | null (null for phone-only accounts)"
    },
    "accessToken": "string (JWT, ~15m)",
    "refreshToken": "string (JWT, ~30d)",
    "referralBonus": "null | { \"xp\": number, \"bonusWords\": number }"
  }
}
```
**Errors:** `400` invalid/missing fields; invalid HMAC or expired `auth_date` → `500`.

### `POST /api/auth/webapp`
**Auth:** none — Description: Log in from inside the Telegram Mini App using `initData`; applies any referral start param.
**Request body:** `{ "initData": "string — raw Telegram WebApp initData, required" }`
**Response 200:** identical shape to `POST /api/auth/telegram`. `referralBonus` is non‑null only on a referred user's first login.
**Errors:** `400` missing `initData`; `401` invalid init data; `500` other failures.

### `POST /api/auth/refresh`
**Auth:** none (refresh token in body) — Description: Exchange a refresh token for a new 15‑minute access token.
**Request body:** `{ "refreshToken": "string — required" }`
**Response 200:** `{ "success": true, "data": { "accessToken": "string (JWT, 15m)" } }`
**Errors:** `400` invalid body; `401` invalid/expired refresh token.

### `POST /api/auth/register`
**Auth:** none — Description: Create an account with phone + password (native app). No SMS verification.
**Request body:**
```json
{
  "phone": "string — required (Uzbek: '901234567', '+998901234567' or '998901234567'; normalized to +998XXXXXXXXX)",
  "password": "string — required, 6–100 chars",
  "firstName": "string — required, 1–60 chars"
}
```
**Response 200:** identical shape to `POST /api/auth/telegram` (`{ user, accessToken, refreshToken, referralBonus }`). For phone users `user.telegramId` is `null` and `user.phone` is set; `referralBonus` is `null`.
**Errors:** `400` invalid body (bad phone format / short password); `409` "Phone already registered".

### `POST /api/auth/login`
**Auth:** none — Description: Log in with phone + password.
**Request body:**
```json
{ "phone": "string — required (any accepted format above)", "password": "string — required" }
```
**Response 200:** identical shape to `POST /api/auth/telegram`.
**Errors:** `400` invalid body; `401` "Invalid phone or password".

### `POST /api/auth/set-password`
**Auth:** required — Description: Set/update a phone + password on the **current** account. Used by existing Telegram users (in the Mini App) so they can also log into the native app with phone+password against their SAME account (all data preserved).
**Request body:** `{ "phone": "string (any accepted format)", "password": "string 6–100" }`
**Response 200:** `{ "success": true, "data": { "phone": "+998XXXXXXXXX" } }`
**Errors:** `400` invalid body / phone; `401` unauthorized; `409` "Phone already in use" (another account owns it).
> The profile endpoint `GET /api/` returns `phone: string|null` and `hasPassword: boolean` so the client can show whether credentials are set.
> Inside the Telegram Mini App, the phone can also be obtained automatically (Telegram‑verified) via `WebApp.requestContact()` — the bot receives the shared contact and saves it to the account; the client then re‑fetches the profile to read `phone`.

### `POST /api/auth/admin-login`
**Auth:** none — Admin panel only (username/password env). Returns `{ accessToken, refreshToken, user: { id:"admin", firstName:"Admin", isAdmin:true } }`. Not used by the mobile app.
**Errors:** `400` invalid body; `401` invalid credentials.

### `GET /api/settings/plan`
**Auth:** none — Description: Premium pricing + free‑tier limits (Redis‑cached 60s).
**Response 200:**
```json
{
  "success": true,
  "data": {
    "prices": {
      "monthly": { "uzs": "number", "usd": "number" },
      "annual":  { "uzs": "number", "usd": "number" },
      "lifetime":{ "uzs": "number", "usd": "number" },
      "stars":   { "monthly": "number", "yearly": "number" },
      "discountPercent": "number",
      "trialDays": "number"
    },
    "limits": {
      "dailySwipeLimit": "number",
      "maxDecks": "number",
      "maxWordsPerDeck": "number",
      "adFrequency": "number",
      "audioEnabled": "boolean",
      "offlineEnabled": "boolean",
      "friendsLeaderboard": "boolean"
    }
  }
}
```

### `GET /api/`
**Auth:** required — Description: Current user's profile with follower/following counts.
**Response 200:** `data` = the user object (as in login) **plus** `leagueTier: string | null`, `streakFreezes: number`, `createdAt: ISO`, and `_count: { followers: number, following: number }`. `data` is `null` if the user record is missing (still `200`).
**Errors:** `401`.

### `PUT /api/`
**Auth:** required — Description: Update name fields. Body: `{ "firstName?": "string (min 1)", "lastName?": "string" }`. Response: `{ success, data: <full user row> }`. **Errors:** `400`, `401`.

### `PUT /api/level`
**Auth:** required — Body: `{ "level": "A1..C2" }` → `{ "success": true }`. **Errors:** `400`, `401`.

### `PUT /api/gender`
**Auth:** required — Body: `{ "gender": "male | female | null" }` → `{ "success": true }`. **Errors:** `400`, `401`.

### `PUT /api/language`
**Auth:** required — Body: `{ "language": "uz | en | ru" }` → `{ "success": true }`. **Errors:** `400`, `401`.

### `PUT /api/notifications`
**Auth:** required — Description: Update reminder time and/or enabled flag (at least one field required).
Body: `{ "notifyAt?": "HH:MM (^\\d{2}:\\d{2}$)", "enabled?": "boolean" }` → `{ "success": true }`. **Errors:** `400`, `401`.

### `PUT /api/push-token`
**Auth:** required — Description: Register or refresh the current device's FCM push token (idempotent upsert). A user may have several tokens (one per device); a token is globally unique and is reassigned to the caller if it was previously registered to another account.
Body: `{ "token": "string (FCM token, 10–4096 chars)", "platform?": "android | ios | web" }`. The field `fcmToken` is also accepted as an alias for `token`.
→ `{ "success": true }`. **Errors:** `400` (no token), `401`.

### `DELETE /api/push-token`
**Auth:** required — Description: Unregister a push token (e.g. on logout). Only removes the caller's own token; an unknown/missing token is a silent success.
Body: `{ "token": "string" }` (alias `fcmToken` accepted).
→ `{ "success": true }`. **Errors:** `401`.

**Push payload shape** (sent by the reminder jobs via FCM): `{ "notification": { "title": "string", "body": "string" }, "data": { "type": "reminder", "kind": "daily | due", "route": "/feed | /quiz", "dueCount?": "string" } }`. The app navigates via `data.route` (daily → `/feed`, due → `/quiz`); `kind` is kept for backward compatibility. Reminders (daily + SM-2 due-word) are delivered over **both** Telegram and push in parallel; push is additive and never replaces Telegram.

### `GET /api/referral`
**Auth:** required — Description: Referral start param, link, count, recent referred users.
**Response 200:**
```json
{
  "success": true,
  "data": {
    "startParam": "ref_<userId>",
    "link": "string | null",
    "count": "number",
    "referrals": [ { "firstName": "string", "avatarUrl": "string | null", "createdAt": "ISO" } ]
  }
}
```

### `GET /api/onboarding/level-test`
**Auth:** required — Description: Randomized placement test (~2 questions/level, 4 choices each).
**Response 200:** `data.questions[]` = `{ wordId, word, pronunciation: string|null, difficulty: "A1..C1", choices: string[4], correctIndex: number }`. Note: `correctIndex` is exposed; count is variable.

### `POST /api/onboarding/complete`
**Auth:** required — Body: `{ "level": "A1..C2" }` → `{ "success": true }`. **Errors:** `400`, `401`.

### `GET /api/categories`
**Auth:** none — Description: All categories ordered by `order` asc.
**Response 200:** `data[]` = `{ id, nameUz, nameEn, icon: string|null, color: "#hex", isPremium }` (note: `nameRu`/`order`/`createdAt` not returned here).

### `GET /api/words`
**Auth:** required — Description: Paginated, relevance‑ranked word search. Matches both the English headword **and** the translation in the caller's language (so e.g. `q=kitob` finds `book`). Ranking: exact word > word prefix > translation match > word substring. Translations in the response are filtered to the user language.
**Query:** `q` (string, default `""`), `page` (default `1`), `limit` (default `20`, max `50`).
**Response 200:**
```json
{
  "success": true,
  "data": {
    "words": [ {
      "id": "uuid", "word": "string", "pronunciation": "string|null", "audioUrl": "string|null",
      "imageUrl": "string|null", "videoUrl": "string|null", "partOfSpeech": "string|null",
      "difficulty": "A1..C2", "categoryId": "uuid", "createdById": "uuid|null", "createdAt": "ISO",
      "translations": [ { "id":"uuid","wordId":"uuid","language":"uz|en|ru","translation":"string|null","definitionEn":"string|null","exampleEn":"string|null","exampleTranslated":"string|null" } ],
      "category": { "id":"uuid","nameUz":"string","nameEn":"string","nameRu":"string","icon":"string|null","color":"#hex","isPremium":"boolean","order":"number","createdAt":"ISO" }
    } ],
    "total": "number", "page": "number", "limit": "number", "totalPages": "number"
  }
}
```
`translations` holds only the user‑language entry (may be `[]`).

### `GET /api/words/:id`
**Auth:** required — Single word with category + language translation(s). **Errors:** `401`, `404`.

### `GET /api/words/:id/dictionary`
**Auth:** required — External dictionary lookup (dictionaryapi.dev).
**Response 200:** `data` = `{ phonetic, audioUrl, partOfSpeech, definition, example, synonyms: string[] }` or `null` on miss/timeout (still `200`). **Errors:** `401`, `404`.

### `POST /api/words/:id/bookmark`
**Auth:** required — Toggle word in the default "Saved Words" deck.
**Response 200:** `{ "success": true, "data": { "bookmarked": "boolean" } }`. **Errors:** `401`.

---

## Learning

All Learning endpoints require `Authorization: Bearer <accessToken>`.

### `GET /api/feed`
**Auth:** required — Description: Today's swipe queue (60% new / 40% due), respecting the daily limit.
**Query:** `categoryId` (optional). Reserved value `personal` → returns ONLY the user's added words (My Words, excludes `mastered`, never cached).
**Response 200:**
```json
{
  "success": true,
  "data": {
    "words": [ {
      "id": "uuid", "word": "string", "pronunciation": "string|null", "audioUrl": "string|null",
      "imageUrl": "string|null", "partOfSpeech": "string|null",
      "difficulty": "A1..C2 | null (null for personal words)",
      "category": { "id": "uuid | 'personal'", "name": "string (localized)", "isPremium": "boolean" },
      "translation": { "translation":"string","definitionEn":"string|null","exampleEn":"string|null","exampleTranslated":"string|null" },
      "progress": { "status":"new|learning|learned|mastered","strength":"number","reviewCount":"number" },
      "source": "global | personal"
    } ],
    "remaining": "number", "dailyLimit": "number (999999 for premium)", "usedToday": "number"
  }
}
```
`translation` may be `null` (global words without a user‑language translation); `progress` is `null` for never‑seen words. Limit exhausted → `words: []`, `remaining: 0`.

### `POST /api/feed/swipe`
**Auth:** required — Description: Record a swipe (applies SM‑2, awards XP).
**Body:** `{ "wordId": "uuid", "direction": "left | right | up" }` — `right` = know, `left` = don't know, `up` = bookmark.
**Response 200:** `{ "success": true, "data": { "xpEarned": "number", "status?": "string" } }` (bookmark/`up` → `{ xpEarned: 0 }`). For personal words, `right` marks `mastered`; personal XP is daily‑capped and not added to leagues. **Errors:** `400`, `401`.

### `GET /api/feed/stats`
**Auth:** required — `{ "success": true, "data": { "usedToday", "dailyLimit", "remaining", "learnedToday" } }` (all numbers).

### My Words — `/api/my-words`

**UserWordDTO** (returned by list/study/create/update/master/relearn):
```json
{
  "id":"uuid","word":"string","translation":"string","pronunciation":"string|null","audioUrl":"string|null",
  "partOfSpeech":"string|null","definitionEn":"string|null","exampleEn":"string|null","synonyms":"string[]",
  "strength":"number","status":"new|learning|learned|mastered","nextReview":"ISO|null","reviewCount":"number","lastReviewed":"ISO|null","createdAt":"ISO"
}
```

- **`GET /api/my-words/lookup`** — Query `word` (1–100). → `data` = `{ found:boolean, word, pronunciation, audioUrl, partOfSpeech, definitionEn, exampleEn, synonyms:string[] }` (never errors on miss). Errors: `400`, `401`.
- **`GET /api/my-words`** — → `{ data: { words: UserWordDTO[], dueCount: number } }`.
- **`POST /api/my-words`** — Body `{ word(1–100), translation(1–200), pronunciation?, audioUrl?, partOfSpeech?, definitionEn?, exampleEn?, synonyms?: string[] }` (optionals accept null). → `{ data: UserWordDTO }`. Errors: `400`; `409` "Word already in your list".
- **`GET /api/my-words/study`** — Query `limit` (default 20, 1–100). → `{ data: { words: UserWordDTO[] } }` (excludes mastered, due first).
- **`POST /api/my-words/:id/review`** — Body `{ direction: "left | right" }`. → `{ data: { xpEarned, status, nextReview, strength } }` (`right` → mastered). Errors: `400`, `404`.
- **`POST /api/my-words/:id/master`** — Mark mastered. → `{ data: UserWordDTO }`.
- **`POST /api/my-words/:id/relearn`** — Reset to `new`. → `{ data: UserWordDTO }`.
- **`PUT /api/my-words/:id`** — Body: any of `{ translation(1–200)?, pronunciation?, audioUrl?, partOfSpeech?, definitionEn?, exampleEn?, synonyms? }`. → `{ data: UserWordDTO }`.
- **`DELETE /api/my-words/:id`** — → `{ "success": true }`. Errors: `404`.

### Decks — `/api/decks`

**Deck object:** `{ id, userId, name, description: string|null, isDefault: boolean, createdAt: ISO, _count?: { words: number } }`.

- **`GET /api/decks`** — list (default deck first), each with `_count.words`.
- **`POST /api/decks`** — Body `{ name(min 1), description? }`. → `201 { data: Deck }`. Free plan: limited to `maxDecks`; exceeding → `500`.
- **`PUT /api/decks/:id`** — Body `{ name?, description? }`. → `{ data: Deck (no _count) }`. Cannot edit default deck (→ `500`).
- **`DELETE /api/decks/:id`** — → `{ "success": true }`. Cannot delete default (→ `500`).
- **`POST /api/decks/:id/words`** — Body `{ wordId: uuid }`. → `201 { "success": true }`. Free plan limited to `maxWordsPerDeck`.
- **`DELETE /api/decks/:id/words/:wordId`** — → `{ "success": true }`.
- **`GET /api/decks/:id/words`** — → `{ data: { deck: Deck, words: [ { id, word, pronunciation, partOfSpeech, difficulty, addedAt, category: { name, isPremium }|null, translation: <wordTranslation>|null } ] } }`.

### `GET /api/quiz`
**Auth:** required — Query `mode` (`mcq|reverse|typing|listening|cloze|mixed`, default `mixed`), `count` (default config, 1–20).
**Response 200:** `data.questions[]` where fields depend on `mode`:
```json
{ "wordId":"uuid","mode":"mcq|reverse|typing|listening|cloze","prompt":"string","pronunciation":"string|null","audioUrl":"string|null","ttsWord":"string (listening only)","choices":"string[] (mcq/reverse/listening/cloze)","correctIndex":"number (with choices)","answer":"string (typing only)","word":"string","translation":"string" }
```
Errors: `400` "Invalid quiz mode".

### `POST /api/quiz/submit`
**Auth:** required — Body `{ answers: [ { wordId: uuid, correct: boolean } ] }` (1–50). → `{ data: { xpEarned, correct, total } }`. Errors: `400`.

### `GET /api/challenge/today`
**Auth:** required — → `{ data: { questions: [ { wordId, word, pronunciation, choices: string[4], correctIndex } ], date: "YYYY-MM-DD" } }` (≤5, may be fewer).

### Progress — `/api/progress`
- **`GET /api/progress`** — `{ data: { totalWordsEncountered, new, learning, learned, mastered, streak, streakFreezes, xp, savedWords } }` (all numbers). `streakFreezes` = remaining streak-freeze count (auto-protects the streak across a single missed day).
- **`GET /api/progress/streak`** — `{ data: { streak, lastActive: ISO|null, xp } }`.
- **`GET /api/progress/achievements`** — Syncs server-side badges: unlocks any newly earned ones (awards their XP once, pings the user via the bot) and returns the full list. → `{ data: { list: [ { code, xp, unlocked: boolean, unlockedAt: ISO|null } ], newlyUnlocked: string[], awardedXp: number } }`. Codes: `first_word, streak_3, streak_7, streak_30, words_10, words_50, words_100, xp_100, xp_1000, master_10, saved_5, b1_reached`.
- **`GET /api/progress/weak-words`** — `{ data: [ <user_word_progress row with embedded word incl. translations + category> ] }` (≤20, weakest first).
- **`GET /api/progress/history`** — Query `period` (`week|month|3months`, default `week`). → `{ data: { "YYYY-MM-DD": { learned, reviewed } } }` (only active days). Invalid `period` → `500`.

### Shadowing — `/api/shadowing`

Repeat-after-native-speaker video practice. Clips are admin-curated; the video file itself lives in a private Telegram channel and is proxied on demand (nothing is stored permanently server-side). First completion of a clip awards `XP_PER_SHADOWING` (daily-capped, feeds leagues); repeats award 0.

**ShadowingClipDTO:**
```json
{
  "id":"uuid","title":"string","durationSec":"number|null","transcript":"string (English)","translationUz":"string",
  "segments":"[{ start:number, end:number, text:string, translation?:string }] | null",
  "level":"A1|A2|B1|B2|C1|C2","categoryId":"uuid|null","completed":"boolean","completedCount":"number"
}
```

- **`GET /api/shadowing`** — Query `level?` (`A1..C2`), `categoryId?` (uuid). → `{ data: ShadowingClipDTO[] }` (published only, per-user `completed` flags). Errors: `400`, `401`.
- **`GET /api/shadowing/:id`** — → `{ data: ShadowingClipDTO & { streamPath: string } }`. `streamPath` = `/api/shadowing/<id>/stream?token=<jwt>`; prefix with the API base and set as a `<video>` `src`. Errors: `404`.
- **`POST /api/shadowing/:id/complete`** — Record a shadowing session. → `{ data: { xpEarned:number, completedCount:number } }` (`xpEarned` is 0 on repeats / after the daily cap). Errors: `404`.
- **`GET /api/shadowing/:id/stream?token=`** — Range-capable (`206`) video proxy. Auth is via the signed `token` query param (a `<video>` can't send an `Authorization` header), NOT the Bearer header. `Content-Type: video/mp4`. Errors: `401` (missing/invalid token), `403` (token/clip mismatch), `404`, `503` (Telegram source not configured).

---

## Social, Speaking & Payments

Embedded user objects use: `{ id, firstName, lastName: string|null, username: string|null, avatarUrl: string|null }`.

### Duel — `/api/duel`

1‑v‑1 quiz over a shared set of 5 MCQ questions. XP: winner +50, loser +15, draw +25 (tie → faster time). Pending duels expire after 48h (lazily).

**Duel object** (per requesting user):
```json
{
  "id":"string","status":"pending|active|completed|expired","isChallenger":"boolean",
  "challenger":"<user>","opponent":"<user> | null",
  "questions":[ { "wordId":"string","word":"string","pronunciation":"string|null","choices":["string×4"],"correctIndex":"number" } ],
  "myScore":"number|null","theirScore":"number|null","challengerScore":"number|null","opponentScore":"number|null",
  "winnerId":"string|null","createdAt":"ISO","completedAt":"ISO|null"
}
```
`correctIndex` is exposed; scoring is client‑reported.

- **`POST /api/duel`** — Create pending duel. → duel object **plus** `link: string|null` (`https://t.me/<bot>?start=duel_<id>`) and `startParam: "duel_<id>"`. Errors: `400` "Not enough words to create a duel".
- **`GET /api/duel`** — Caller's duels (≤20, newest first), without `link`/`startParam`.
- **`GET /api/duel/:id`** — Single duel. Errors: `404`.
- **`POST /api/duel/:id/join`** — Join pending duel (→ active, makes both mutual followers). Errors: `400` ("Cannot join your own duel", "Duel already has an opponent", "Duel is no longer active", "Duel not found").
- **`POST /api/duel/:id/submit`** — Body `{ score: int 0–50, timeMs: int ≥0 }`. Finalizes when both submitted. Errors: `400` ("Invalid body", "Not a participant of this duel", "Already submitted", "Duel not found").

> Stale duels are also swept proactively by an hourly cron: unaccepted `pending` and abandoned `active` duels past 48h flip to `expired`, and the challenger of an unaccepted duel gets a Telegram nudge to re-challenge.

### Group Challenge — `/api/group-challenge`

Multiplayer quiz race: the creator generates a shared set of 7 MCQ questions, shares a deep link, and any number of friends play the **same** questions. Each player has one scored entry; the leaderboard ranks by score then time. Reward on submit: `+10 XP` participation, `+20 XP` bonus for a perfect run (counts toward leagues). Challenges expire 72h after creation. Deep link: `https://t.me/<bot>?start=gc_<id>` (param `gc_<id>`).

A challenge object = `{ id, creator: <user>, questions: [ { wordId, word, pronunciation, choices, correctIndex } ], questionCount, expiresAt: ISO, createdAt: ISO, expired: boolean, joined: boolean, submitted: boolean, myScore: int|null, playerCount: int, leaderboard: [ { rank, user, score, timeMs, completed: boolean, isMe: boolean } ] }`. Create/get also include `link: string|null` and `startParam`.

- **`POST /api/group-challenge`** — Create (creator auto-joined). → challenge object + `link`/`startParam`. Errors: `400` "Not enough words to create a challenge".
- **`GET /api/group-challenge`** — Caller's challenges (≤20, newest first).
- **`GET /api/group-challenge/:id`** — Single challenge. Errors: `404`.
- **`POST /api/group-challenge/:id/join`** — Join (idempotent; mutual-follows the creator). Errors: `400` ("Challenge has expired", "Challenge not found").
- **`POST /api/group-challenge/:id/submit`** — Body `{ score: int 0–50, timeMs: int ≥0 }`. Records the caller's run + awards XP. → challenge object **plus** `xpEarned: number`. Errors: `400` ("Invalid body", "Already submitted", "Challenge has expired", "Challenge not found").

### Speaking — `/api/speaking`

1‑to‑1 WebRTC voice practice; matchmaking + signaling over WebSocket.

- **`GET /api/speaking/ice`** — → `{ data: { iceServers: [...] } }`. Always includes Google STUN; adds a TURN entry with time‑limited credentials when configured (`urls` is a udp+tcp array, `username` is a unix‑expiry string, `credential` is base64 HMAC). Pass directly to `RTCPeerConnection({ iceServers })`.
- **`GET /api/speaking/topics`** — → `{ data: { topics: string[] (≤5, markdown **bold** target words), words: string[] (≤8 weakest) } }`.
- **`POST /api/speaking/rate`** — Body `{ sessionId: uuid, liked: boolean }`. → `{ "success": true }`. Errors: `400`, `404`.
- **`POST /api/speaking/report`** — Body `{ sessionId: uuid, reason: string(1–500) }`. → `{ data: { id } }`. Errors: `400`, `404`.

#### WebSocket: `/api/speaking/ws`

- **Connect:** `wss://<host>/api/speaking/ws?token=<accessToken>` (token via query — browsers can't set WS headers).
- **Auth failure:** server closes with code **`4401`**. **Reconnect from same user:** old socket closed with **`4000`**.
- One active call per user. Malformed input → `{ type:"error", message:"Invalid message" }` (never crashes).

**Client → Server** (JSON, `type` discriminator):

| type | payload | effect |
|------|---------|--------|
| `find` | `filters?: { sameGender?: boolean, anyLevel?: boolean }` | Enter queue. Matches immediately if a compatible peer waits. `sameGender` honored only if caller has gender set; `anyLevel` disables CEFR‑proximity matching. |
| `cancel` | — | Leave queue (no reply). |
| `signal` | `payload: any` | Relay opaque SDP/ICE blob to the call partner. |
| `end` | — | End the call (partner notified, session finalized). |

**Server → Client:**

| type | payload | meaning |
|------|---------|---------|
| `searching` | — | Enqueued, no partner yet. |
| `matched` | `sessionId, initiator: boolean, partner: { firstName, avatarUrl, cefrLevel, gender, xp }` | Matched. The peer with `initiator:true` creates the WebRTC offer. |
| `signal` | `payload: any` | Relayed signaling blob from the partner. |
| `partner-left` | — | Partner left/disconnected; an `ended` follows. |
| `ended` | `durationSec, xpEarned` | Call ended (both sides). 2 XP/min, capped 30/day. |
| `error` | `message` | Recoverable error (`Already in a call`, `No active call`, etc.). |

**Flow:** connect → `find` → `searching` → `matched` → exchange `signal` (initiator offers first) → media P2P → `end` → both get `ended`. Socket close mid‑call = `end`.

### Leaderboard — `/api/leaderboard`
- **`GET /api/leaderboard/global`** — Top 100 by XP. → `data[]` = `{ id, firstName, lastName, username, avatarUrl, xp, streak, isFollowing }`.
- **`GET /api/leaderboard/friends`** — Caller + followed users by XP. → `data[]` = `{ id, firstName, lastName, username, avatarUrl, xp, streak }` (no `isFollowing`). Errors: `402` "Premium required for friends leaderboard".
- **`GET /api/leaderboard/followers`** — Users who follow the caller (≤100, newest first). → `data[]` = `{ id, firstName, lastName, username, avatarUrl, xp, streak, followedAt: ISO, isFollowing }` (`isFollowing` = whether the caller already follows them back).
- **`POST /api/leaderboard/users/:id/follow`** — Follow (idempotent). On a **new** follow the followed user gets a Telegram notification. Errors: `400` "Cannot follow yourself".
- **`DELETE /api/leaderboard/users/:id/follow`** — Unfollow (no‑op if not following).

### League — `/api/league`

Weekly groups of ≤30. Tiers: `0 Bronze, 1 Silver, 2 Gold, 3 Sapphire, 4 Diamond`. Top 10 promote, bottom 5 demote.

- **`GET /api/league/me`** — →
```json
{ "success": true, "data": {
  "tier":"0..4","tierName":"string","maxTier":4,
  "weekStart":"ISO (Mon 00:00 UTC)","weekEnd":"ISO",
  "promoteCount":10,"demoteCount":5,"myRank":"number",
  "members":[ { "rank":"number","userId":"string","firstName":"string","lastName":"string|null","username":"string|null","avatarUrl":"string|null","streak":"number","weeklyXp":"number","isMe":"boolean" } ]
} }
```
`members` sorted by `weeklyXp` desc; exactly one has `isMe: true`.

### Payments — `/api/payments`

Telegram Stars (XTR). Finalization is **out‑of‑band**: after the user pays the invoice in Telegram, the bot processes `successful_payment` and extends `premiumUntil`. The app creates the invoice, opens it in Telegram, then **polls `GET /api/` (profile)** to observe `isPremium`.

- **`POST /api/payments/invoice`** — Body `{ plan: "monthly" | "yearly" }`. → `{ data: { link: "https://t.me/$<invoice-link>" } }` (open via Telegram `openInvoice`). Errors: `400` invalid plan; `503` "Payments are not available right now"; `500` "Failed to create invoice".

---

## Admin API

`/api/admin/*` endpoints (words, categories, users, settings, analytics, notifications, speaking moderation, shadowing clips) require an **admin** JWT (`POST /api/auth/admin-login`) and are used only by the web admin panel — not the mobile app. Not documented here.

---

*Generated from the live route + service code. If an endpoint changes, regenerate this file.*
