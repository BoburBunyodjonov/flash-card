import { prisma } from '../lib/prisma'
import { getBot } from '../lib/bot'
import { getAllSettings } from './plan-settings.service'
import { PLAN_SETTING_KEYS, STARS_PLAN_DAYS, type StarsPlan } from '@wordswipe/shared'

// Web sends 'monthly' | 'yearly'; the payments table uses the PlanType enum.
const PLAN_TO_DB: Record<StarsPlan, 'monthly' | 'annual'> = {
  monthly: 'monthly',
  yearly: 'annual',
}

const INVOICE_TITLES: Record<StarsPlan, string> = {
  monthly: 'WordSwipe Premium — 1 oy',
  yearly: 'WordSwipe Premium — 1 yil',
}

interface InvoicePayload {
  paymentId: string
  userId: string
  plan: StarsPlan
}

export async function getStarsPrices(): Promise<Record<StarsPlan, number>> {
  const settings = await getAllSettings()
  return {
    monthly: Number(settings[PLAN_SETTING_KEYS.PREMIUM_MONTHLY_STARS]),
    yearly: Number(settings[PLAN_SETTING_KEYS.PREMIUM_ANNUAL_STARS]),
  }
}

/**
 * Creates a Telegram Stars (XTR) invoice link for the given plan.
 * Records a pending Payment row first so the successful_payment update can be
 * matched back idempotently via the invoice payload.
 */
export async function createStarsInvoice(userId: string, plan: StarsPlan): Promise<string> {
  const bot = await getBot()
  if (!bot) throw new Error('PAYMENTS_UNAVAILABLE')

  const stars = (await getStarsPrices())[plan]
  if (!Number.isInteger(stars) || stars <= 0) throw new Error('PRICE_NOT_CONFIGURED')

  const payment = await prisma.payment.create({
    data: {
      userId,
      amount: stars,
      currency: 'XTR',
      provider: 'telegram_stars',
      planType: PLAN_TO_DB[plan],
      status: 'pending',
      meta: { plan },
    },
  })

  const payload: InvoicePayload = { paymentId: payment.id, userId, plan }
  const title = INVOICE_TITLES[plan]

  // Telegram Stars: currency XTR, empty provider_token, amount in whole stars.
  const link = await bot.telegram.createInvoiceLink({
    title,
    description: "Cheksiz swipe, reklamasiz, offline rejim va barcha premium imkoniyatlar.",
    payload: JSON.stringify(payload),
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: title, amount: stars }],
  })

  return link
}

const confirmationMessages: Record<string, (until: Date) => string> = {
  uz: (d) => `⭐ Premium faollashtirildi! Amal qilish muddati: ${d.toLocaleDateString('uz-UZ')} gacha. Yaxshi o'rganishlar!`,
  en: (d) => `⭐ Premium activated! Valid until ${d.toLocaleDateString('en-GB')}. Happy learning!`,
  ru: (d) => `⭐ Премиум активирован! Действует до ${d.toLocaleDateString('ru-RU')}. Приятного обучения!`,
}

/**
 * Finalizes a Telegram Stars purchase from a successful_payment update.
 *
 * Idempotent: the Payment row is transitioned pending → success with an atomic
 * updateMany guard, so a redelivered update (same telegram charge id) is a
 * no-op — premium days are never granted twice.
 */
export async function handleSuccessfulPayment(
  sp: {
    invoice_payload: string
    telegram_payment_charge_id: string
    provider_payment_charge_id?: string
    total_amount: number
    currency: string
  },
  chatId: number | string,
): Promise<void> {
  let payload: Partial<InvoicePayload>
  try {
    payload = JSON.parse(sp.invoice_payload)
  } catch {
    console.error('[Payments] Unparseable invoice payload:', sp.invoice_payload)
    return
  }
  const { paymentId, userId, plan } = payload
  if (!paymentId || !userId || !plan || !(plan in STARS_PLAN_DAYS)) {
    console.error('[Payments] Invalid invoice payload:', sp.invoice_payload)
    return
  }

  // Atomic idempotency gate: only ever succeeds once per payment row.
  const updated = await prisma.payment.updateMany({
    where: { id: paymentId, userId, status: 'pending' },
    data: {
      status: 'success',
      meta: {
        plan,
        telegramChargeId: sp.telegram_payment_charge_id,
        providerChargeId: sp.provider_payment_charge_id ?? null,
        totalAmount: sp.total_amount,
        currency: sp.currency,
      },
    },
  })
  if (updated.count === 0) {
    console.log(`[Payments] Payment ${paymentId} already processed or unknown — skipping`)
    return
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { premiumUntil: true, language: true },
  })
  if (!user) return

  // Extend from the current expiry when premium is still active, else from now.
  const now = new Date()
  const base = user.premiumUntil && user.premiumUntil > now ? user.premiumUntil : now
  const premiumUntil = new Date(base.getTime() + STARS_PLAN_DAYS[plan] * 24 * 60 * 60 * 1000)

  await prisma.user.update({
    where: { id: userId },
    data: { isPremium: true, premiumUntil },
  })

  console.log(`[Payments] Premium ${plan} activated for user ${userId} until ${premiumUntil.toISOString()}`)

  const bot = await getBot()
  if (bot) {
    const message = (confirmationMessages[user.language] ?? confirmationMessages.en)(premiumUntil)
    try {
      await bot.telegram.sendMessage(chatId, message)
    } catch {
      // User may have closed the chat — premium is already granted, ignore.
    }
  }
}
