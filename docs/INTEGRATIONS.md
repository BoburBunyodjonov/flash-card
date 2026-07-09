# WordSwipe Integration API

Har qanday o'quv markaz ERP tizimi WordSwipe bilan **standart REST API** orqali ulanishi mumkin.
Alohida connector yozish shart emas — HTTP so'rov yuborish kifoya.

**Base URL:** `https://bunyodjonov.uz/api/integrations/v1`

## Autentifikatsiya

Har bir markaz uchun admin paneldan API kalit beriladi (`ws_live_…`).

```http
Authorization: Bearer ws_live_xxxxxxxx
```

yoki

```http
X-API-Key: ws_live_xxxxxxxx
```

## Tezkor boshlash

### 1. Ulanishni tekshirish

```http
GET /api/integrations/v1/ping
```

### 2. O'quvchilarni sinxronlash (asosiy)

```http
POST /api/integrations/v1/learners/sync
Content-Type: application/json
Idempotency-Key: sync-2026-07-09-001

{
  "mode": "upsert",
  "learners": [
    {
      "external_id": "STU-10042",
      "phone": "901234567",
      "first_name": "Ali",
      "last_name": "Valiyev",
      "status": "active",
      "group": {
        "external_id": "GRP-IELTS-3",
        "name": "IELTS Group 3"
      },
      "metadata": {
        "course": "IELTS",
        "teacher": "Sardor"
      }
    }
  ]
}
```

**`external_id`** — ERP dagi o'quvchi ID (asosiy kalit). Telefon o'zgarsa ham shu ID yangilanadi.

**`mode`:**
- `upsert` — ro'yxatdagi o'quvchilarni qo'shish/yangilash (tavsiya)
- `replace` — `upsert` + ro'yxatda yo'q aktiv o'quvchilarni `inactive` qilish

**Javob:**

```json
{
  "success": true,
  "data": {
    "created": 1,
    "updated": 0,
    "deactivated": 0,
    "unchanged": 0,
    "errors": []
  }
}
```

### 3. Bitta o'quvchi

```http
PUT /api/integrations/v1/learners/STU-10042
```

### 4. O'quvchini o'chirish (deactivate)

```http
DELETE /api/integrations/v1/learners/STU-10042
```

### 5. Progress (ERP dashboard uchun)

```http
GET /api/integrations/v1/learners/STU-10042/progress
```

## O'quvchi tomonda qanday ishlaydi

1. Markaz ERP o'quvchi telefonini WordSwipe ga yuboradi
2. O'quvchi ilovaga **o'sha telefon** bilan kiradi (Telegram yoki telefon+parol)
3. Birinchi kirishda akkaunt avtomatik bog'lanadi
4. Markaz shartnomasi bo'yicha **premium** avtomatik ochiladi (`premiumIncluded`)

Oddiy foydalanuvchilar (ERP ro'yxatida yo'q) ham ilovadan foydalanishda davom etadi.

## O'qituvchilar va guruhlar (ERP → Teacher panel)

### 1. Xodimlar (o'qituvchilar)

```http
POST /api/integrations/v1/staff/sync

{
  "mode": "upsert",
  "staff": [
    {
      "external_id": "EMP-55",
      "phone": "909876543",
      "first_name": "Sardor",
      "last_name": "Karimov",
      "role": "teacher",
      "status": "active"
    }
  ]
}
```

`role`: `teacher` | `admin` (admin barcha guruhlarga so'z yubora oladi)

### 2. Guruhlar

```http
POST /api/integrations/v1/groups/sync

{
  "mode": "upsert",
  "groups": [
    {
      "external_id": "GRP-IELTS-3",
      "name": "IELTS Group 3",
      "teacher_external_id": "EMP-55",
      "status": "active"
    }
  ]
}
```

**Tartib:** avval `staff/sync`, keyin `groups/sync`, keyin `learners/sync` (learner `group.external_id` guruhga mos bo'lsin).

### 3. O'qituvchi ilovada

- ERP dagi telefon bilan kiradi → **O'qituvchi paneli** ochiladi
- So'z to'plami yaratadi → guruhni tanlaydi → **Guruhga yuborish**
- Guruhdagi barcha o'quvchilarning **Mening so'zlarim** ro'yxatiga avtomatik tushadi (mavjud so'zlar o'zgarmaydi)

## Admin: yangi markaz yaratish

```http
POST /api/admin/partners
Authorization: Bearer <admin-jwt>

{
  "name": "IELTS Academy",
  "accessMode": "benefit_only",
  "premiumIncluded": true
}
```

Javobda `apiKey` bir marta ko'rsatiladi — saqlang.

## Integratsiya usullari (ERP qaysi darajada bo'lishidan qat'i nazar)

| ERP imkoniyati | Usul |
|----------------|------|
| REST API bor | To'g'ridan-to'g'ri sync endpointlar |
| Faqat cron/scheduler | Kechki batch sync |
| Webhook yubora oladi | Har o'zgarishda `PUT` |
| Faqat Excel/CSV | CSV → skript → API |
| Zapier / Make.com | HTTP moduli |
| O'z ERP yo'q | Google Sheets + Apps Script |

## Xavfsizlik

- API kalit faqat serverdan yuborilsin (brauzerda emas)
- `Idempotency-Key` — tarmoq xatolarida qayta yuborish xavfsiz
- Telefonlar `+998XXXXXXXXX` formatida saqlanadi

## Rejimlar

| `accessMode` | Ma'nosi |
|--------------|---------|
| `benefit_only` | Ro'yxatdagilar premium oladi; boshqalar oddiy user |
| `whitelist` | Faqat bitta markaz bo'lganda: faqat ro'yxatdagi telefonlar kira oladi |

## Outbound webhooklar (WordSwipe → ERP)

Admin panelda **Webhook URL** + **secret** sozlang. Har event POST qilinadi:

| Event | Qachon |
|-------|--------|
| `webhook.test` | Admin “Test webhook” bosganda |
| `learner.linked` | O'quvchi birinchi marta ilovaga kirdi |
| `learner.deactivated` | O'quvchi ro'yxatdan chiqarildi |
| `staff.linked` | O'qituvchi birinchi marta kirdi |
| `word_pack.published` | O'qituvchi guruhga so'z to'plami yubordi |

**Imzo:** `X-WordSwipe-Signature: sha256=<hmac>` (secret bo'lsa)  
**Admin:** `/admin/partners` → webhook tarixi

## ERP Connectors (pull sync)

Admin → **ERP Partners** → connector tanlang → **Sync** tugmasi yoki `POST /api/admin/partners/:id/sync`

| Connector | Qanday ishlaydi |
|-----------|-----------------|
| `manual` | ERP o'zi `POST /integrations/v1/*` qiladi (default) |
| `generic_rest` | Sizning ERP URL dan JSON tortadi (`staff`, `groups`, `learners`) |
| `edupage` | EduPage login → sinflar, o'qituvchilar, o'quvchilar (telefon kerak) |

## Qo'llab-quvvatlash

Integratsiya uchun: `GET /api/integrations/v1/schema` — maydonlar tavsifi.
