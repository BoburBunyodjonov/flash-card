import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import { prisma } from '../lib/prisma'
import { config } from '../config'
import { handleSpeakingSocket } from '../services/speaking.gateway'
import type { JwtPayload, Difficulty } from '@wordswipe/shared'

// ---------------------------------------------------------------------------
// Conversation topics (template-based, no LLM)
// ---------------------------------------------------------------------------

const GENERIC_TOPICS: Record<'beginner' | 'intermediate' | 'advanced', string[]> = {
  beginner: [
    'What is your favorite food? Describe it to your partner.',
    'Talk about your family. Who do you live with?',
    'What do you do every morning? Describe your daily routine.',
    'What is the weather like today? Do you like it?',
  ],
  intermediate: [
    'Describe a place you would like to travel to and explain why.',
    'What habit would you like to change about yourself? Discuss it.',
    'Tell your partner about a movie or book you enjoyed recently.',
    'What did you want to become when you were a child? Has it changed?',
  ],
  advanced: [
    'Discuss how technology is changing the way people learn languages.',
    'If you could change one thing about your country, what would it be and why?',
    'Do you think social media does more harm than good? Defend your view.',
    'What does success mean to you? Has your definition changed over time?',
  ],
}

function genericBand(level: Difficulty | null): 'beginner' | 'intermediate' | 'advanced' {
  if (level === 'A1' || level === 'A2') return 'beginner'
  if (level === 'C1' || level === 'C2') return 'advanced'
  return 'intermediate' // B1/B2 and users without a level
}

function buildWordTopics(words: string[]): string[] {
  const topics: string[] = []
  if (words[0]) topics.push(`Try to use the word **${words[0]}** in a sentence about your day.`)
  if (words[1] && words[2]) {
    topics.push(`Describe your weekend using **${words[1]}** and **${words[2]}**.`)
  } else if (words[1]) {
    topics.push(`Make up a short story that includes the word **${words[1]}**.`)
  }
  if (words[3]) topics.push(`Ask your partner a question that includes the word **${words[3]}**.`)
  if (words[4] && words[5]) {
    topics.push(`Use both **${words[4]}** and **${words[5]}** while talking about your plans.`)
  } else if (words[4]) {
    topics.push(`Describe your city or neighborhood using the word **${words[4]}**.`)
  }
  return topics
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function speakingRoutes(fastify: FastifyInstance) {
  // WebSocket signaling — auth happens inside the handler via ?token= because
  // browser WebSocket cannot set the Authorization header.
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    handleSpeakingSocket(fastify, socket, req)
  })

  // HTTP endpoints — normal JWT auth
  fastify.register(async (authed) => {
    authed.addHook('onRequest', requireAuth)

    authed.get('/ice', async (req, reply) => {
      const iceServers: Array<{ urls: string; username?: string; credential?: string }> = [
        { urls: 'stun:stun.l.google.com:19302' },
      ]
      if (config.turn.url && config.turn.username && config.turn.password) {
        iceServers.push({
          urls: config.turn.url,
          username: config.turn.username,
          credential: config.turn.password,
        })
      }
      return reply.send({ success: true, data: { iceServers } })
    })

    authed.get('/topics', async (req, reply) => {
      const user = req.user as JwtPayload

      const [progress, me] = await Promise.all([
        // The user's weakest words first — these need speaking practice the most
        prisma.userWordProgress.findMany({
          where: { userId: user.userId },
          orderBy: [{ strength: 'asc' }, { lastReviewed: 'desc' }],
          take: 8,
          include: { word: { select: { word: true } } },
        }),
        prisma.user.findUnique({ where: { id: user.userId }, select: { cefrLevel: true } }),
      ])

      const words = progress.map((p) => p.word.word)
      const generics = GENERIC_TOPICS[genericBand((me?.cefrLevel as Difficulty | null) ?? null)]

      const topics = [...buildWordTopics(words).slice(0, 3), ...generics].slice(0, 5)

      return reply.send({ success: true, data: { topics, words } })
    })

    authed.post('/rate', async (req, reply) => {
      const body = z
        .object({ sessionId: z.string().uuid(), liked: z.boolean() })
        .safeParse(req.body)
      if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

      const user = req.user as JwtPayload
      const session = await prisma.speakingSession.findUnique({
        where: { id: body.data.sessionId },
      })
      if (!session || (session.userAId !== user.userId && session.userBId !== user.userId)) {
        return reply.code(404).send({ success: false, error: 'Session not found' })
      }

      await prisma.speakingSession.update({
        where: { id: session.id },
        data:
          session.userAId === user.userId
            ? { ratingByA: body.data.liked }
            : { ratingByB: body.data.liked },
      })
      return reply.send({ success: true })
    })

    authed.post('/report', async (req, reply) => {
      const body = z
        .object({ sessionId: z.string().uuid(), reason: z.string().min(1).max(500) })
        .safeParse(req.body)
      if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

      const user = req.user as JwtPayload
      const session = await prisma.speakingSession.findUnique({
        where: { id: body.data.sessionId },
      })
      if (!session || (session.userAId !== user.userId && session.userBId !== user.userId)) {
        return reply.code(404).send({ success: false, error: 'Session not found' })
      }

      const report = await prisma.speakingReport.create({
        data: {
          sessionId: session.id,
          reporterId: user.userId,
          reason: body.data.reason,
        },
      })
      return reply.send({ success: true, data: { id: report.id } })
    })
  })
}
