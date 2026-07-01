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

  turn: {
    url: process.env.TURN_URL ?? '',
    // Ephemeral-credential mode (coturn use-auth-secret): preferred, more secure
    secret: process.env.TURN_SECRET ?? '',
    // Static-credential fallback
    username: process.env.TURN_USERNAME ?? '',
    password: process.env.TURN_PASSWORD ?? '',
  },
}
