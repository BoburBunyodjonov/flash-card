# WordSwipe — lokal ishga tushirish

Bu qo'llanma loyihani kompyuteringizda to'liq ishga tushirish uchun (brauzer + **Telegram Web App**).

**Qo'llanma qamrovi:**

- [x] Node 20, pnpm, Docker
- [x] Birinchi marta `pnpm setup`
- [x] Har kuni API + Web (+ admin)
- [x] Telegram Mini App (ngrok + BotFather URL)
- [x] Muammolar va yechimlar

## Talablar

| Dastur | Versiya | Tekshirish |
|--------|---------|------------|
| **Node.js** | **20.x** (25 emas!) | `node -v` |
| **pnpm** | 9+ | `pnpm -v` |
| **Docker Desktop** | so'nggi | Docker ochiq bo'lishi kerak |

### Node 20 o'rnatish (Mac + Homebrew)

```bash
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node -v   # v20.x.x
```

Loyiha papkasida `.nvmrc` bor — **nvm** yoki **fnm** ishlatsangiz:

```bash
cd ~/Desktop/flash-card
nvm install && nvm use    # nvm
# yoki
fnm use                   # fnm
```

---

## Portlar

| Xizmat | Port | URL |
|--------|------|-----|
| API (backend) | 3000 | http://localhost:3000 |
| Web ilova | 5173 | http://localhost:5173 |
| Admin panel | 5174 | http://localhost:5174 |
| PostgreSQL | 5432 | Docker |
| Redis | 6379 | Docker |

---

## 1. Birinchi marta sozlash

### 1.1 Loyihaga kirish

```bash
cd ~/Desktop/flash-card
```

### 1.2 Node 20 ni yoqish

```bash
nvm use
# yoki Homebrew:
# export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
```

### 1.3 Muhit o'zgaruvchilari (`.env`)

```bash
cp .env.example .env
```

`.env` faylida kamida bularni to'ldiring:

| O'zgaruvchi | Ma'nosi |
|-------------|---------|
| `JWT_SECRET` | Ixtiyoriy uzun maxfiy matn |
| `JWT_REFRESH_SECRET` | Yana bir maxfiy matn |
| `ADMIN_USERNAME` | Admin panel login |
| `ADMIN_PASSWORD` | Admin panel parol |
| `TELEGRAM_BOT_TOKEN` | Web ilova (Telegram) uchun — [@BotFather](https://t.me/BotFather) |

`DATABASE_URL` va `REDIS_URL` odatda `.env.example` dagidek qoladi (Docker bilan mos).

**Web ilova** (`apps/web/.env`) — lokal + Telegram tunnel uchun odatda shunday qoladi:

```env
# Bo'sh = web bilan bir xil manzil; /api vite orqali localhost:3000 ga proxy
VITE_API_URL=
```

### 1.4 Avtomatik setup

```bash
pnpm setup
```

Bu buyruq ketma-ket bajaradi:

- Node 20 tekshiruvi
- `pnpm install`
- `docker compose up -d` (PostgreSQL + Redis)
- Prisma client generatsiya
- `prisma db push` (jadvalar)

### 1.5 (Ixtiyoriy) Boshlang'ich ma'lumotlar

```bash
pnpm db:seed
```

---

## 2. Har kuni ishga tushirish

Har safar **3 ta terminal** oching (admin kerak bo'lsa — 4 ta).

### Terminal 1 — Docker (baza)

```bash
cd ~/Desktop/flash-card
nvm use
docker compose up -d
```

Holatni tekshirish:

```bash
docker compose ps
```

### Terminal 2 — API (backend)

```bash
cd ~/Desktop/flash-card
nvm use
pnpm dev:api
```

Muvaffaqiyat xabarlari (birinchi marta 1–2 daqiqa kutish mumkin):

```
[Redis] Connected
[Queue] Workers started
🚀 API running at http://0.0.0.0:3000
```

API tekshiruvi (boshqa terminalda):

```bash
curl http://localhost:3000/health
```

### Terminal 3 — Web ilova

```bash
cd ~/Desktop/flash-card
pnpm dev:web
```

Brauzerda oching: **http://localhost:5173**

### Terminal 4 — Admin panel (ixtiyoriy)

```bash
cd ~/Desktop/flash-card
pnpm dev:admin
```

Brauzer: **http://localhost:5174**  
Login: `.env` dagi `ADMIN_USERNAME` / `ADMIN_PASSWORD`

---

## 3. Telegram Web App (telefonda test)

Telegram **HTTPS** talab qiladi — `localhost` ni BotFather ga **berib bo'lmaydi**.

### Qaysi URL beriladi?

| Nima | URL | BotFather ga? |
|------|-----|----------------|
| **Web ilova (Mini App)** | `https://....ngrok-free.app` yoki production domen | **Ha — shu** |
| API (`localhost:3000`) | Faqat kompyuterda | Yo'q (Vite proxy qiladi) |
| Admin (`localhost:5174`) | Admin panel | Yo'q |
| `TELEGRAM_WEBHOOK_URL` | Bot webhook (server) | Web App URL emas |

### Lokal test (ngrok)

**1.** API + Web ishlayotgan bo'lsin (2–3-terminal, yuqoridagi bo'lim 2).

**2.** Yangi terminal — tunnel faqat **5173** portiga:

```bash
ngrok http 5173
```

Yoki Cloudflare:

```bash
cloudflared tunnel --url http://localhost:5173
```

**3.** Chiqgan **HTTPS** manzilni nusxalang, masalan:

```
https://a1b2c3d4.ngrok-free.app
```

**4.** [@BotFather](https://t.me/BotFather):

1. `/mybots` → botingiz → **Bot Settings**
2. **Menu Button** yoki **Web App** → URL: `https://a1b2c3d4.ngrok-free.app`
3. `.env` dagi `TELEGRAM_BOT_TOKEN` **shu bot** tokeni bo'lishi kerak

**5.** Telegram’da botni oching → Menu / Start → ilova ochiladi.

> Bepul ngrok URL har safar o'zgarishi mumkin — yangi tunnel ochganda BotFather URL ni yangilang.

### Production

Web deploy qilingan manzil, masalan `https://app.example.com` — BotFather ga shu URL.

API boshqa domen bo'lsa, `apps/web/.env`:

```env
VITE_API_URL=https://api.example.com
```

### Tekshirish ro'yxati (Telegram)

- [ ] `pnpm dev:api` va `pnpm dev:web` ishlayapti
- [ ] `curl http://localhost:3000/health` → `{"status":"ok",...}`
- [ ] `ngrok http 5173` → HTTPS URL olindi
- [ ] BotFather URL = ngrok HTTPS (5173)
- [ ] `.env` → `TELEGRAM_BOT_TOKEN` shu bot uchun
- [ ] `apps/web/.env` → `VITE_API_URL` bo'sh (lokal tunnel uchun)

---

## 4. Qisqa cheat sheet

```bash
# Birinchi marta
cd ~/Desktop/flash-card && nvm use && cp .env.example .env
# .env ni tahrirlang, keyin:
pnpm setup && pnpm db:seed

# Har kuni
docker compose up -d          # terminal 1
pnpm dev:api                  # terminal 2 (nvm use bilan)
pnpm dev:web                  # terminal 3

# Telegram test
ngrok http 5173               # terminal 4 → HTTPS URL ni BotFather ga
```

---

## 5. Foydali buyruqlar

| Buyruq | Vazifa |
|--------|--------|
| `pnpm check:node` | Node 20 ekanini tekshirish |
| `pnpm setup` | Bir martalik to'liq sozlash |
| `pnpm dev:api` | API (watch, kod o'zgarsa qayta ishga tushadi) |
| `pnpm dev:web` | Web ilova |
| `pnpm dev:admin` | Admin panel |
| `pnpm dev:bot` | Telegram bot |
| `pnpm db:push` | Baza sxemasini yangilash |
| `pnpm db:seed` | Seed ma'lumotlar |
| `pnpm db:studio` | Prisma Studio (baza GUI) |

API ni watch **siz** ishlatmasdan ishga tushirish:

```bash
cd packages/api
pnpm dev:once
```

---

## 6. To'xtatish

```bash
# API / Web / Admin terminallarida: Ctrl + C

# Docker konteynerlarini to'xtatish
cd ~/Desktop/flash-card
docker compose down
```

---

## 7. Muammolar va yechimlar

### `Node 25.x qo'llab-quvvatlanmaydi`

Loyiha faqat Node **20** da ishlaydi.

```bash
nvm use
# yoki
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
node -v
```

### `Cannot connect to the Docker daemon`

Docker Desktop ni oching, keyin:

```bash
docker compose up -d
```

### API javob bermaydi / terminal jim

1. Node 20 ishlatayotganingizni tekshiring: `pnpm check:node`
2. Redis va Postgres ishlayaptimi: `docker compose ps`
3. Birinchi ishga tushirishda 1–2 daqiqa kuting
4. Barqaror variant: `cd packages/api && pnpm dev:once`

### Web ochiladi, lekin login ishlamaydi

- `.env` da `TELEGRAM_BOT_TOKEN` to'g'ri yozilganmi (BotFather boti bilan bir xil)
- Telegram ichida test qiling — oddiy brauzerda `initData` bo'lmaydi
- ngrok ishlatayotgan bo'lsangiz: BotFather URL aynan **HTTPS ngrok** (5173) bo'lsin

### `error:1E08010C:DECODER routines::unsupported` (login ekranida)

OpenSSL xatosi — odatda API dagi Telegram `initData` tekshiruvida yuz beradi. Tuzatilgan; API ni qayta ishga tushiring:

```bash
# API terminalida Ctrl+C, keyin:
pnpm dev:api
```

Hali chiqsa: `.env` dagi `TELEGRAM_BOT_TOKEN` BotFather dagi **shu bot** tokeni ekanini tekshiring.

### Telegram Web App ochilmaydi / bo'sh sahifa

- `pnpm dev:web` ishlayaptimi
- ngrok **5173** ga ulanganmi (3000 emas)
- BotFather URL yangilanganmi (ngrok har safar o'zgarishi mumkin)
- ngrok warning sahifasida "Visit Site" bosish kerak bo'lishi mumkin

### Port band (`EADDRINUSE`)

```bash
lsof -i :3000    # API
lsof -i :5173    # Web
# kerak bo'lsa jarayonni to'xtating: kill <PID>
```

### Baza jadvallari yo'q

```bash
pnpm db:push
```

---

## 8. Loyiha tuzilishi (qisqa)

```
flash-card/
├── apps/web      → React (foydalanuvchi ilovasi)
├── apps/admin    → React + MUI (admin panel)
├── apps/bot      → Telegram bot
├── packages/api  → Fastify + Prisma (backend)
├── docker-compose.yml
├── .env          → siz yaratasiz (.env.example dan)
└── RUN.md        → shu fayl
```
