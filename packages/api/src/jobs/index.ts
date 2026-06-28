import { Queue, Worker } from 'bullmq'
import { redis } from '../lib/redis'
import { config } from '../config'
import { prisma } from '../lib/prisma'
import { getBot } from '../lib/bot'
import { finalizeLastWeek } from '../services/league.service'
import { REVIEW_REMINDER_THRESHOLD } from '@wordswipe/shared'

const connection = { host: new URL(config.redis.url).hostname, port: parseInt(new URL(config.redis.url).port || '6379') }

export const notificationQueue = new Queue('notifications', { connection })

const DISPATCH_JOB = 'daily-reminder-dispatch'
// Runs every 15 minutes; each run handles users whose notifyAt falls in the elapsed window.
const DISPATCH_PATTERN = '*/15 * * * *'
const WINDOW_MINUTES = 15

// SM-2 aware reminder: fires when enough words have come due for review.
const DUE_DISPATCH_JOB = 'due-reminder-dispatch'
const DUE_DISPATCH_PATTERN = '0 * * * *' // hourly
const DUE_QUIET_START = 22 // no due-reminders between 22:00 and 08:00
const DUE_QUIET_END = 8

const LEAGUE_FINALIZE_JOB = 'league-finalize'
const LEAGUE_FINALIZE_PATTERN = '5 0 * * 1' // Monday 00:05

// Same UTC date key used by feed.service for the daily swipe counter.
function todayKey() {
  return new Date().toISOString().split('T')[0]
}
const DAILY_COUNT_KEY = (userId: string) => `feed:daily:${userId}:${todayKey()}`
const REMINDER_SENT_KEY = (userId: string) => `reminder:sent:${userId}:${todayKey()}`
const DUE_REMINDER_SENT_KEY = (userId: string) => `reminder:due:${userId}:${todayKey()}`

const reminderMessages: Record<string, (streak: number) => string> = {
  uz: (s) => `📚 Bugun so'z yodladingizmi? Streak: ${s} kun 🔥`,
  en: (s) => `📚 Did you learn words today? Streak: ${s} days 🔥`,
  ru: (s) => `📚 Вы учили слова сегодня? Серия: ${s} дней 🔥`,
}
// Variant used when the user has words due for spaced-repetition review.
const dueReminderMessages: Record<string, (due: number, streak: number) => string> = {
  uz: (d, s) => `🔔 ${d} ta so'z takrorlash vaqti keldi! Unutishdan oldin mustahkamlang. Streak: ${s} kun 🔥`,
  en: (d, s) => `🔔 ${d} words are due for review! Reinforce them before you forget. Streak: ${s} days 🔥`,
  ru: (d, s) => `🔔 ${d} слов пора повторить! Закрепите их, пока не забыли. Серия: ${s} дней 🔥`,
}
const openButtonText: Record<string, string> = {
  uz: '📖 Hozir o\'rganish',
  en: '📖 Learn now',
  ru: '📖 Учить сейчас',
}

async function sendReminder(telegramId: string, language: string, streak: number, dueCount = 0) {
  const bot = await getBot()
  if (!bot) return
  const text =
    dueCount > 0
      ? (dueReminderMessages[language] ?? dueReminderMessages.en)(dueCount, streak)
      : (reminderMessages[language] ?? reminderMessages.en)(streak)
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
    where: { notifyAt: { in: slots }, notifyEnabled: true, telegramId: { not: null } },
    select: { id: true, telegramId: true, language: true, streak: true },
  })

  for (const user of users) {
    if (!user.telegramId) continue
    // Dedup gate: at most one reminder decision per user per day (survives restarts).
    const acquired = await redis.set(REMINDER_SENT_KEY(user.id), '1', 'EX', 90000, 'NX')
    if (acquired !== 'OK') continue

    // Don't nag users who already studied today.
    const studied = parseInt((await redis.get(DAILY_COUNT_KEY(user.id))) ?? '0')
    if (studied > 0) continue

    // Personalize: tell the user how many words are waiting for review.
    const dueCount = await prisma.userWordProgress.count({
      where: { userId: user.id, nextReview: { lte: new Date() }, status: { not: 'mastered' } },
    })

    await notificationQueue.add(
      'daily-reminder',
      { telegramId: user.telegramId.toString(), language: user.language, streak: user.streak, dueCount },
      { removeOnComplete: true, removeOnFail: 50, attempts: 2 },
    )
  }
}

/**
 * SM-2 aware dispatcher: notifies users once enough words pile up for review,
 * regardless of their fixed notifyAt time. At most once per day per user,
 * skipped during night hours and for users who already studied today.
 */
async function dispatchDueReminders() {
  const hour = new Date().getHours()
  if (hour >= DUE_QUIET_START || hour < DUE_QUIET_END) return

  const due = await prisma.userWordProgress.groupBy({
    by: ['userId'],
    where: { nextReview: { lte: new Date() }, status: { not: 'mastered' } },
    _count: { _all: true },
    having: { userId: { _count: { gte: REVIEW_REMINDER_THRESHOLD } } },
  })
  if (due.length === 0) return

  const users = await prisma.user.findMany({
    where: { id: { in: due.map((d) => d.userId) }, notifyEnabled: true, telegramId: { not: null } },
    select: { id: true, telegramId: true, language: true, streak: true },
  })
  const countByUser = new Map(due.map((d) => [d.userId, d._count._all]))

  for (const user of users) {
    if (!user.telegramId) continue
    const acquired = await redis.set(DUE_REMINDER_SENT_KEY(user.id), '1', 'EX', 90000, 'NX')
    if (acquired !== 'OK') continue

    const studied = parseInt((await redis.get(DAILY_COUNT_KEY(user.id))) ?? '0')
    if (studied > 0) continue

    await notificationQueue.add(
      'daily-reminder',
      {
        telegramId: user.telegramId.toString(),
        language: user.language,
        streak: user.streak,
        dueCount: countByUser.get(user.id) ?? 0,
      },
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

      if (job.name === DUE_DISPATCH_JOB) {
        await dispatchDueReminders()
      }

      if (job.name === LEAGUE_FINALIZE_JOB) {
        await finalizeLastWeek()
      }

      if (job.name === 'daily-reminder') {
        const { telegramId, language, streak, dueCount } = job.data
        await sendReminder(telegramId, language ?? 'en', streak ?? 0, dueCount ?? 0)
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
  await notificationQueue.upsertJobScheduler(
    DUE_DISPATCH_JOB,
    { pattern: DUE_DISPATCH_PATTERN },
    { name: DUE_DISPATCH_JOB, data: {}, opts: { removeOnComplete: true, removeOnFail: 50 } },
  )
  await notificationQueue.upsertJobScheduler(
    LEAGUE_FINALIZE_JOB,
    { pattern: LEAGUE_FINALIZE_PATTERN },
    { name: LEAGUE_FINALIZE_JOB, data: {}, opts: { removeOnComplete: true, removeOnFail: 50 } },
  )
  console.log('[Queue] Schedulers ready: daily reminders, due-word reminders, league finalize')
}
