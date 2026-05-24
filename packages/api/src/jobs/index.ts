import { Queue, Worker } from 'bullmq'
import { redis } from '../lib/redis'
import { config } from '../config'
import { prisma } from '../lib/prisma'

const connection = { host: new URL(config.redis.url).hostname, port: parseInt(new URL(config.redis.url).port || '6379') }

export const notificationQueue = new Queue('notifications', { connection })

export function startWorkers() {
  const notificationWorker = new Worker(
    'notifications',
    async (job) => {
      if (job.name === 'bulk-message') {
        const { telegramIds, message } = job.data
        const { Telegraf } = await import('telegraf')
        const bot = new Telegraf(config.telegram.botToken)
        for (const id of telegramIds) {
          try {
            await bot.telegram.sendMessage(id, message)
          } catch {
            // User may have blocked the bot
          }
        }
      }

      if (job.name === 'daily-reminder') {
        const { Telegraf } = await import('telegraf')
        const bot = new Telegraf(config.telegram.botToken)
        const { telegramId, message } = job.data
        await bot.telegram.sendMessage(telegramId, message)
      }
    },
    { connection },
  )

  notificationWorker.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err.message)
  })

  console.log('[Queue] Workers started')
}

export async function scheduleDailyReminders() {
  const users = await prisma.user.findMany({
    select: { telegramId: true, notifyAt: true, language: true, streak: true },
  })

  for (const user of users) {
    const [h, m] = user.notifyAt.split(':').map(Number)
    const now = new Date()
    let fireAt = new Date()
    fireAt.setHours(h, m, 0, 0)
    if (fireAt <= now) fireAt.setDate(fireAt.getDate() + 1)

    const delay = fireAt.getTime() - Date.now()

    const messages: Record<string, string> = {
      uz: `📚 Bugun so'z yodladingizmi? Streak: ${user.streak} kun 🔥`,
      en: `📚 Did you learn words today? Streak: ${user.streak} days 🔥`,
      ru: `📚 Вы учили слова сегодня? Серия: ${user.streak} дней 🔥`,
    }

    await notificationQueue.add(
      'daily-reminder',
      { telegramId: user.telegramId.toString(), message: messages[user.language] ?? messages.en },
      { delay, removeOnComplete: true },
    )
  }
}
