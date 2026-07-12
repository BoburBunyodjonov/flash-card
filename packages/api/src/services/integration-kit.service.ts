import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { config } from '../config'

export interface IntegrationKitPartner {
  name: string
  slug: string
  accessMode: string
  premiumIncluded: boolean
  apiKeyPrefix: string
  webhookUrl?: string | null
}

export interface IntegrationKitFiles {
  filename: string
  files: Record<string, string>
}

async function loadFullDocs(): Promise<string> {
  const candidates = [
    path.join(process.cwd(), 'docs/INTEGRATIONS.md'),
    path.join(process.cwd(), '../../docs/INTEGRATIONS.md'),
    path.resolve(__dirname, '../../../docs/INTEGRATIONS.md'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) {
      return readFile(p, 'utf-8')
    }
  }
  return '# WordSwipe Integration API\n\nTo\'liq hujjat: https://bunyodjonov.uz — docs/INTEGRATIONS.md\n'
}

function integrationBaseUrl(): string {
  const app = config.telegram.appUrl.replace(/\/$/, '')
  return `${app}/api/integrations/v1`
}

function apiKeyLine(apiKey?: string, prefix?: string): string {
  if (apiKey) return apiKey
  return `(admin paneldan rotate qiling — prefix: ${prefix ?? 'ws_live_…'})`
}

function buildReadme(partner: IntegrationKitPartner, apiKey?: string): string {
  const base = integrationBaseUrl()
  const key = apiKeyLine(apiKey, partner.apiKeyPrefix)
  const date = new Date().toISOString().slice(0, 10)

  return `# WordSwipe Integratsiya Paketi

**Markaz:** ${partner.name}  
**Slug:** \`${partner.slug}\`  
**Sana:** ${date}

> Ushbu paket faqat sizning o'quv markazingiz uchun. API kalitni maxfiy saqlang — faqat serverdan ishlating.

---

## Ulanish ma'lumotlari

| Parametr | Qiymat |
|----------|--------|
| API Base URL | \`${base}\` |
| API kalit | \`${key}\` |
| Partner slug | \`${partner.slug}\` |
| Premium (ro'yxatdagilar) | ${partner.premiumIncluded ? 'Ha' : 'Yo\'q'} |
| Access mode | \`${partner.accessMode}\` |

**Autentifikatsiya:**
\`\`\`http
Authorization: Bearer ${apiKey ? apiKey : 'ws_live_SIZNING_KALIT'}
\`\`\`
yoki
\`\`\`http
X-API-Key: ${apiKey ? apiKey : 'ws_live_SIZNING_KALIT'}
\`\`\`

---

## Tezkor boshlash (3 qadam)

### 1. Ulanishni tekshiring
\`\`\`bash
curl -s "${base}/ping" \\
  -H "Authorization: Bearer ${apiKey ?? 'SIZNING_API_KALIT'}"
\`\`\`

### 2. Ma'lumotlarni yuboring (tartib muhim!)
1. \`POST ${base}/staff/sync\` — o'qituvchilar
2. \`POST ${base}/groups/sync\` — guruhlar
3. \`POST ${base}/learners/sync\` — o'quvchilar (telefon + guruh)

### 3. CRM switch (premium / integratsiya)
\`\`\`bash
curl -s -X PATCH "${base}/settings" \\
  -H "Authorization: Bearer ${apiKey ?? 'SIZNING_API_KALIT'}" \\
  -H "Content-Type: application/json" \\
  -d '{"integration_enabled":true,"premium_included":true}'
\`\`\`

---

## Analitika (CRM dashboard)

| Maqsad | Endpoint |
|--------|----------|
| Guruhlar ro'yxati | \`GET /groups\` |
| Guruh statistikasi | \`GET /groups/{id}/summary\` |
| Guruh o'quvchilari | \`GET /groups/{id}/learners/progress\` |
| Bitta o'quvchi | \`GET /learners/{id}/progress\` |

---

## O'quvchi tomonda

1. ERP telefonni sync qiladi
2. O'quvchi WordSwipe ga **o'sha telefon** bilan kiradi (Telegram yoki telefon+parol)
3. Birinchi kirishda akkaunt bog'lanadi → premium ochiladi (agar yoqilgan bo'lsa)

---

## Paket tarkibi

| Fayl | Ma'nosi |
|------|---------|
| \`README.md\` | Ushbu qisqa yo'riqnoma |
| \`credentials.env\` | Muhit o'zgaruvchilari |
| \`credentials.json\` | JSON format (skriptlar uchun) |
| \`curl-test.sh\` | Tayyor test buyruqlari |
| \`INTEGRATIONS.md\` | To'liq API hujjati |

**Qo'llab-quvvatlash:** \`GET ${base}/schema\` — maydonlar tavsifi.
`
}

function buildCredentialsEnv(partner: IntegrationKitPartner, apiKey?: string): string {
  const base = integrationBaseUrl()
  return `# WordSwipe — ${partner.name}
# Serveringizda saqlang, git ga commit qilmang!

WORDSWIPE_API_BASE_URL=${base}
WORDSWIPE_API_KEY=${apiKey ?? ''}
WORDSWIPE_PARTNER_SLUG=${partner.slug}
WORDSWIPE_PARTNER_NAME=${partner.name}
WORDSWIPE_PREMIUM_INCLUDED=${partner.premiumIncluded}
WORDSWIPE_ACCESS_MODE=${partner.accessMode}
`
}

function buildCredentialsJson(partner: IntegrationKitPartner, apiKey?: string): string {
  return JSON.stringify(
    {
      api_base_url: integrationBaseUrl(),
      api_key: apiKey ?? null,
      api_key_prefix: partner.apiKeyPrefix,
      partner_slug: partner.slug,
      partner_name: partner.name,
      premium_included: partner.premiumIncluded,
      access_mode: partner.accessMode,
      webhook_url: partner.webhookUrl ?? null,
      note: apiKey
        ? 'API kalit faqat serverdan ishlatilsin.'
        : 'API kalit ko\'rsatilmagan — WordSwipe admin bilan bog\'laning yoki kalitni rotate qiling.',
    },
    null,
    2,
  )
}

function buildCurlTest(partner: IntegrationKitPartner, apiKey?: string): string {
  const base = integrationBaseUrl()
  const key = apiKey ?? 'ws_live_SIZNING_KALIT_BU_YERGA'

  return `#!/usr/bin/env bash
# WordSwipe integratsiya testi — ${partner.name}
# Ishlatish: chmod +x curl-test.sh && ./curl-test.sh

set -euo pipefail
API_KEY="${key}"
BASE="${base}"
AUTH="Authorization: Bearer $API_KEY"

echo "=== 1. Ping ==="
curl -s "$BASE/ping" -H "$AUTH" | jq .

echo ""
echo "=== 2. Settings ==="
curl -s "$BASE/settings" -H "$AUTH" | jq .

echo ""
echo "=== 3. Schema ==="
curl -s "$BASE/schema" -H "$AUTH" | jq '.data.api_version, .data.analytics'

echo ""
echo "=== 4. Namuna: staff sync (o'zgartiring) ==="
# curl -s -X POST "$BASE/staff/sync" -H "$AUTH" -H "Content-Type: application/json" -d '{
#   "mode": "upsert",
#   "staff": [{"external_id": "EMP-1", "phone": "901234567", "role": "teacher", "status": "active"}]
# }' | jq .

echo "Tayyor."
`
}

export async function buildIntegrationKit(
  partner: IntegrationKitPartner,
  apiKey?: string,
): Promise<IntegrationKitFiles> {
  const fullDocs = await loadFullDocs()
  const slug = partner.slug.replace(/[^a-z0-9-]/gi, '-')

  return {
    filename: `WordSwipe-Integratsiya-${slug}`,
    files: {
      'README.md': buildReadme(partner, apiKey),
      'credentials.env': buildCredentialsEnv(partner, apiKey),
      'credentials.json': buildCredentialsJson(partner, apiKey),
      'curl-test.sh': buildCurlTest(partner, apiKey),
      'INTEGRATIONS.md': fullDocs,
    },
  }
}
