import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import * as progressService from '../services/progress.service'
import { syncAchievements } from '../services/achievements.service'
import { notificationQueue } from '../jobs'
import { prisma } from '../lib/prisma'
import type { JwtPayload } from '@wordswipe/shared'

// Localized congratulation for newly unlocked achievements.
const achievementUnlockMessages: Record<string, (n: number, xp: number) => string> = {
  uz: (n, xp) => `🏆 Tabriklaymiz! Siz ${n} ta yangi yutuqqa erishdingiz va +${xp} XP oldingiz!`,
  en: (n, xp) => `🏆 Congrats! You unlocked ${n} new achievement${n === 1 ? '' : 's'} and earned +${xp} XP!`,
  ru: (n, xp) => `🏆 Поздравляем! Вы получили ${n} ${n === 1 ? 'новое достижение' : 'новых достижения'} и +${xp} XP!`,
}

export async function progressRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/', async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await progressService.getOverallProgress(user.userId)
    return reply.send({ success: true, data })
  })

  fastify.get('/streak', async (req, reply) => {
    const user = req.user as JwtPayload
    const u = await fastify.prisma.user.findUnique({
      where: { id: user.userId },
      select: { streak: true, lastActive: true, xp: true },
    })
    return reply.send({ success: true, data: u })
  })

  // Unlocks any newly earned badges (awards XP once each, pings the user) and
  // returns the full badge list with unlock state for the Progress screen.
  fastify.get('/achievements', async (req, reply) => {
    const user = req.user as JwtPayload
    const result = await syncAchievements(user.userId)

    if (result.newlyUnlocked.length > 0) {
      prisma.user
        .findUnique({ where: { id: user.userId }, select: { telegramId: true, language: true, notifyEnabled: true } })
        .then((u) => {
          if (!u?.telegramId || !u.notifyEnabled) return
          const msg = (achievementUnlockMessages[u.language] ?? achievementUnlockMessages.en)(
            result.newlyUnlocked.length,
            result.awardedXp,
          )
          return notificationQueue.add(
            'bulk-message',
            { telegramIds: [u.telegramId.toString()], message: msg },
            { removeOnComplete: true, removeOnFail: 50, attempts: 2 },
          )
        })
        .catch((err) => fastify.log.error({ msg: 'achievements: notify failed', userId: user.userId, err }))
    }

    return reply.send({ success: true, data: result })
  })

  fastify.get('/weak-words', async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await progressService.getWeakWords(user.userId)
    return reply.send({ success: true, data })
  })

  fastify.get('/history', async (req, reply) => {
    const query = z.object({ period: z.enum(['week', 'month', '3months']).default('week') }).parse(req.query)
    const user = req.user as JwtPayload
    const data = await progressService.getHistory(user.userId, query.period)
    return reply.send({ success: true, data })
  })
}
