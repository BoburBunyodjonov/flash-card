import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import * as quizService from '../services/quiz.service'
import { QUIZ_MODES, QUIZ_QUESTION_COUNT } from '@wordswipe/shared'
import type { JwtPayload, Language, QuizMode } from '@wordswipe/shared'

const submitSchema = z.object({
  answers: z
    .array(z.object({ wordId: z.string().uuid(), correct: z.boolean() }))
    .min(1)
    .max(50),
})

export async function quizRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/', async (req, reply) => {
    const user = req.user as JwtPayload & { language?: string }
    const { mode = 'mixed', count } = req.query as { mode?: string; count?: string }

    if (!QUIZ_MODES.includes(mode as QuizMode)) {
      return reply.code(400).send({ success: false, error: 'Invalid quiz mode' })
    }

    const parsedCount = Math.min(Math.max(parseInt(count ?? '') || QUIZ_QUESTION_COUNT, 1), 20)
    const questions = await quizService.getQuizQuestions(
      user.userId,
      mode as QuizMode,
      (user.language as Language) ?? 'uz',
      parsedCount,
    )
    return reply.send({ success: true, data: { questions } })
  })

  fastify.post('/submit', async (req, reply) => {
    const body = submitSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    const result = await quizService.submitQuiz(user.userId, body.data.answers)
    return reply.send({ success: true, data: result })
  })
}
