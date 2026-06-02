import { Queue, Worker } from 'bullmq'
import type { Telegraf } from 'telegraf'
import { redis } from '../lib/redis'
import { config } from '../config'
import { prisma } from '../lib/prisma'

const connection = { host: new URL(config.redis.url).hostname, port: parseInt(new URL(config.redis.url).port || '6379') }

export const notificationQueue = new Queue('notifications', { connection })

const DISPATCH_JOB = 'daily-reminder-dispatch'
// Runs every 15 minutes; each run handles users whose notifyAt falls in the elapsed window.
const DISPATCH_PATTERN = '*/15 * * * *'
const WINDOW_MINUTES = 15

// Same UTC date key used by feed.service for the daily swipe counter.
function todayKey() {
  return new Date().toISOString().split('T')[0]
}
const DAILY_COUNT_KEY = (userId: string) => `feed:daily:${userId}:${todayKey()}`
const REMINDER_SENT_KEY = (userId: string) => `reminder:sent:${userId}:${todayKey()}`

// Lazily-created shared bot instance (avoids re-instantiating per job).
let botInstance: Telegraf | null = null
async function getBot(): Promise<Telegraf | null> {
  if (!config.telegram.botToken) return null
  if (!botInstance) {
    const { Telegraf } = await import('telegraf')
    botInstance = new Telegraf(config.telegram.botToken)
  }
  return botInstance
}

const reminderMessages: Record<string, (streak: number) => string> = {
  uz: (s) => `📚 Bugun so'z yodladingizmi? Streak: ${s} kun 🔥`,
  en: (s) => `📚 Did you learn words today? Streak: ${s} days 🔥`,
  ru: (s) => `📚 Вы учили слова сегодня? Серия: ${s} дней 🔥`,
}
const openButtonText: Record<string, string> = {
  uz: '📖 Hozir o\'rganish',
  en: '📖 Learn now',
  ru: '📖 Учить сейчас',
}

async function sendReminder(telegramId: string, language: string, streak: number) {
  const bot = await getBot()
  if (!bot) return
  const text = (reminderMessages[language] ?? reminderMessages.en)(streak)
  const extra = config.telegram.webAppUrl
    ? {
        reply_markup: {
          inline_keyboard: [[{ text: openButtonText[language] ?? openButtonText.en, url: config.telegram.webAppUrl }]],
        },
      }
    : undefined
  try {
    await bot.telegram.sendMessage(telegramId, text, extra)
  } catch {
    // User may have blocked the bot or the chat is unavailable — ignore.
  }
}

/**
 * Dispatcher: finds users due for a reminder in the current 15-min window,
 * skips anyone who already studied today, and dedupes via a Redis flag so
 * restarts or overlapping runs never double-send.
 */
async function dispatchDailyReminders() {
  const now = new Date()
  const windowStart = Math.floor((now.getHours() * 60 + now.getMinutes()) / WINDOW_MINUTES) * WINDOW_MINUTES
  const slots: string[] = []
  for (let i = 0; i < WINDOW_MINUTES; i++) {
    const m = windowStart + i
    const hh = String(Math.floor(m / 60) % 24).padStart(2, '0')
    const mm = String(m % 60).padStart(2, '0')
    slots.push(`${hh}:${mm}`)
  }

  const users = await prisma.user.findMany({
    where: { notifyAt: { in: slots } },
    select: { id: true, telegramId: true, language: true, streak: true },
  })

  for (const user of users) {
    // Dedup gate: at most one reminder decision per user per day (survives restarts).
    const acquired = await redis.set(REMINDER_SENT_KEY(user.id), '1', 'EX', 90000, 'NX')
    if (acquired !== 'OK') continue

    // Don't nag users who already studied today.
    const studied = parseInt((await redis.get(DAILY_COUNT_KEY(user.id))) ?? '0')
    if (studied > 0) continue

    await notificationQueue.add(
      'daily-reminder',
      { telegramId: user.telegramId.toString(), language: user.language, streak: user.streak },
      { removeOnComplete: true, removeOnFail: 50, attempts: 2 },
    )
  }
}

export function startWorkers() {
  const notificationWorker = new Worker(
    'notifications',
    async (job) => {
      if (job.name === 'bulk-message') {
        const { telegramIds, message } = job.data
        const bot = await getBot()
        if (!bot) return
        for (const id of telegramIds) {
          try {
            await bot.telegram.sendMessage(id, message)
          } catch {
            // User may have blocked the bot
          }
        }
      }

      if (job.name === DISPATCH_JOB) {
        await dispatchDailyReminders()
      }

      if (job.name === 'daily-reminder') {
        const { telegramId, language, streak } = job.data
        await sendReminder(telegramId, language ?? 'en', streak ?? 0)
      }
    },
    { connection },
  )

  notificationWorker.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err.message)
  })

  console.log('[Queue] Workers started')
}

/**
 * Registers the single repeatable dispatcher. Idempotent — calling on every
 * startup updates the existing scheduler instead of creating duplicates.
 */
export async function setupRecurringJobs() {
  await notificationQueue.upsertJobScheduler(
    DISPATCH_JOB,
    { pattern: DISPATCH_PATTERN },
    { name: DISPATCH_JOB, data: {}, opts: { removeOnComplete: true, removeOnFail: 50 } },
  )
  console.log('[Queue] Daily reminder dispatcher scheduled')
}
