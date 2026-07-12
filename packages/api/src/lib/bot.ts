import type { Telegraf } from 'telegraf'
import { config } from '../config'

// Lazily-created shared bot instance (used by jobs for sending and by the
// payments update-consumer below). Never instantiated when the token is missing.
let botInstance: Telegraf | null = null

export async function getBot(): Promise<Telegraf | null> {
  if (!config.telegram.botToken) return null
  if (!botInstance) {
    const { Telegraf } = await import('telegraf')
    botInstance = new Telegraf(config.telegram.botToken)
  }
  return botInstance
}

// Guard so polling is launched exactly once per process, even if startBotUpdates
// is called again (e.g. from tests or a future second entrypoint).
let updatesStarted = false

/**
 * Starts consuming Telegram updates via long polling. Required for Telegram
 * Stars payments: pre_checkout_query must be answered and successful_payment
 * messages must be processed to activate premium.
 *
 * - Skips gracefully when TELEGRAM_BOT_TOKEN is not configured.
 * - Never throws / never crashes the API: launch errors are caught and logged.
 */
export async function startBotUpdates(): Promise<void> {
  if (updatesStarted) return
  const bot = await getBot()
  if (!bot) {
    console.log('[Bot] TELEGRAM_BOT_TOKEN not set — skipping update polling (Stars payments disabled)')
    return
  }
  updatesStarted = true

  const { message } = await import('telegraf/filters')
  const { handleSuccessfulPayment } = await import('../services/payments.service')

  // /start [payload] — greets the user and opens the Mini App. The payload
  // (e.g. "duel_<id>", "ref_<id>", "wshare_<id>") is passed through via ?sp=.
  bot.start(async (ctx) => {
    try {
      const payload = (ctx.startPayload ?? '').trim()
      const base = config.telegram.appUrl
      const openUrl = payload ? `${base}/?sp=${encodeURIComponent(payload)}` : base
      const isDuel = payload.startsWith('duel_')
      const isShare = payload.startsWith('wshare_')
      const text = isDuel
        ? "⚔️ Sizni WordsVibe'da duelga chaqirishdi!\nTugmani bosib qabul qiling va g'olib bo'ling 🏆"
        : isShare
          ? "📚 Sizga so'zlar ulashildi!\nTugmani bosib WordSwipe'da qabul qiling."
          : "WordsVibe'ga xush kelibsiz! 🚀\n\nInglizcha so'zlarni o'yin tarzida o'rganing:\n\n📚 Swipe bilan yangi so'zlar\n🎙️ Jonli ovozli suhbat — speaking mashq\n⚔️ Do'stlar bilan duel\n🧠 Quiz va kunlik challenge\n🔥 Streak va reyting\n\nBoshlash uchun tugmani bosing 👇"
      const btn = isDuel ? '⚔️ Duelni boshlash' : isShare ? "📚 So'zlarni qabul qilish" : '🚀 Ochish'
      await ctx.reply(text, {
        reply_markup: {
          inline_keyboard: [[{ text: btn, web_app: { url: openUrl } }]],
        },
      })
    } catch (err) {
      console.error('[Bot] /start handler failed:', err)
    }
  })

  // Telegram requires an answer within 10s, otherwise the payment is cancelled.
  bot.on('pre_checkout_query', async (ctx) => {
    try {
      await ctx.answerPreCheckoutQuery(true)
    } catch (err) {
      console.error('[Bot] answerPreCheckoutQuery failed:', err)
    }
  })

  bot.on(message('successful_payment'), async (ctx) => {
    try {
      await handleSuccessfulPayment(ctx.message.successful_payment, ctx.chat.id)
    } catch (err) {
      console.error('[Bot] successful_payment handling failed:', err)
    }
  })

  // User shared their phone via the Mini App's requestContact() — save the
  // Telegram-verified number onto their account (only their OWN contact).
  bot.on(message('contact'), async (ctx) => {
    try {
      const c = ctx.message.contact
      if (c.user_id && c.user_id === ctx.from.id && c.phone_number) {
        const { linkTelegramPhone } = await import('../services/auth.service')
        await linkTelegramPhone(BigInt(ctx.from.id), c.phone_number)
      }
    } catch (err) {
      console.error('[Bot] contact handling failed:', err)
    }
  })

  // launch() resolves only when polling stops, so we intentionally do NOT await
  // it — the onLaunch callback confirms startup, and the catch keeps a Telegram
  // outage from ever crashing the API process.
  bot
    .launch({ allowedUpdates: ['message', 'pre_checkout_query'] }, () => {
      console.log('[Bot] Update polling started (Telegram Stars payments active)')
    })
    .catch((err: unknown) => {
      updatesStarted = false
      console.error(
        '[Bot] Update polling stopped — API keeps running:',
        err instanceof Error ? err.message : err,
      )
    })

  const stop = (signal: string) => {
    try {
      bot.stop(signal)
    } catch {
      // Bot may not have launched — nothing to stop.
    }
  }
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))
}
