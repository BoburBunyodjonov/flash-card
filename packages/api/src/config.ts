import 'dotenv/config'

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required env var: ${key}`)
  return value
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000'),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isDev: process.env.NODE_ENV !== 'production',

  jwt: {
    secret: required('JWT_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
  },

  telegram: {
    botToken: (process.env.TELEGRAM_BOT_TOKEN ?? '').trim(),
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? '',
    // Mini App URL (e.g. https://t.me/YourBot/app) used for the "Open" button in reminders
    webAppUrl: process.env.WEB_APP_URL ?? '',
    // Bot username (without @) — parsed from WEB_APP_URL if not set explicitly
    botUsername:
      process.env.BOT_USERNAME ?? (process.env.WEB_APP_URL ?? '').match(/t\.me\/([^/?]+)/)?.[1] ?? '',
    // Public https URL of the web app (Mini App), for bot "Open" web_app buttons
    appUrl: process.env.APP_URL ?? 'https://bunyodjonov.uz',
    // MTProto (GramJS) — a USER session used to read videos from a Telegram
    // channel for the Shadowing feature (bypasses the Bot API 20MB download cap).
    // Get apiId/apiHash from https://my.telegram.org; generate the session once
    // with `pnpm --filter api tg:login`.
    apiId: parseInt(process.env.TELEGRAM_API_ID ?? '0'),
    apiHash: (process.env.TELEGRAM_API_HASH ?? '').trim(),
    session: (process.env.TELEGRAM_SESSION ?? '').trim(),
  },

  // Speech-to-text for auto-generating shadowing transcripts (+ optional uz
  // translation). OpenAI-compatible — defaults to Groq (free, fast). Swap the
  // base/model for OpenAI (https://api.openai.com/v1 + whisper-1) if preferred.
  transcribe: {
    apiKey: (process.env.TRANSCRIBE_API_KEY ?? '').trim(),
    apiBase: (process.env.TRANSCRIBE_API_BASE ?? 'https://api.groq.com/openai/v1').trim(),
    model: (process.env.TRANSCRIBE_MODEL ?? 'whisper-large-v3-turbo').trim(),
    // Chat model used to translate the transcript to Uzbek (same provider/key).
    translateModel: (process.env.TRANSCRIBE_TRANSLATE_MODEL ?? 'llama-3.3-70b-versatile').trim(),
  },

  shadowing: {
    // Channel that holds the shadowing videos: @username or numeric id (-100…).
    channel: (process.env.SHADOWING_CHANNEL_ID ?? '').trim(),
    // Transient on-disk cache of recently-watched clips (NOT the library — it is
    // LRU-evicted). Nothing is stored permanently; this just avoids re-downloading
    // the same clip from Telegram on every view.
    cacheDir: process.env.SHADOWING_CACHE_DIR ?? '/tmp/wordswipe-shadowing',
    cacheMaxBytes: parseInt(process.env.SHADOWING_CACHE_MAX_MB ?? '2048') * 1024 * 1024,
  },

  admin: {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'admin123',
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  payments: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY ?? '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    },
    payme: {
      merchantId: process.env.PAYME_MERCHANT_ID ?? '',
      secretKey: process.env.PAYME_SECRET_KEY ?? '',
    },
    click: {
      merchantId: process.env.CLICK_MERCHANT_ID ?? '',
      secretKey: process.env.CLICK_SECRET_KEY ?? '',
    },
  },

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID ?? 'wordswipe-2dc02',
    // Service account JSON as base64 (preferred — safe for a single-line .env)
    // or raw JSON. If empty, push notifications are silently disabled.
    credentialsJson: process.env.FCM_CREDENTIALS_JSON ?? '',
    // Alternative: absolute path to the service account JSON file.
    credentialsPath: process.env.FCM_CREDENTIALS_PATH ?? '',
  },

  turn: {
    url: process.env.TURN_URL ?? '',
    // Ephemeral-credential mode (coturn use-auth-secret): preferred, more secure
    secret: process.env.TURN_SECRET ?? '',
    // Static-credential fallback
    username: process.env.TURN_USERNAME ?? '',
    password: process.env.TURN_PASSWORD ?? '',
  },
}
