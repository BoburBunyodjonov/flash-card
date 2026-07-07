import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../middlewares/auth.middleware'
import * as myWordsService from '../services/my-words.service'
import { DuplicateUserWordError, UserWordNotFoundError } from '../services/my-words.service'
import * as studyService from '../services/my-words-study.service'
import { lookupWord } from '../services/dictionary.service'
import type { JwtPayload } from '@wordswipe/shared'

const lookupSchema = z.object({
  word: z.string().min(1).max(100),
})

// Optional fields use .nullish() (null OR undefined): the dictionary lookup
// returns null for absent data (e.g. a word with no example), and the client
// forwards those nulls verbatim — .optional() alone would reject them.
const createSchema = z.object({
  word: z.string().min(1).max(100),
  translation: z.string().min(1).max(200),
  pronunciation: z.string().max(200).nullish(),
  audioUrl: z.string().max(500).nullish(),
  partOfSpeech: z.string().max(100).nullish(),
  definitionEn: z.string().max(2000).nullish(),
  exampleEn: z.string().max(2000).nullish(),
  synonyms: z.array(z.string().max(100)).max(20).nullish(),
})

const updateSchema = z.object({
  translation: z.string().min(1).max(200).optional(),
  pronunciation: z.string().max(200).nullish(),
  audioUrl: z.string().max(500).nullish(),
  partOfSpeech: z.string().max(100).nullish(),
  definitionEn: z.string().max(2000).nullish(),
  exampleEn: z.string().max(2000).nullish(),
  synonyms: z.array(z.string().max(100)).max(20).nullish(),
})

const idParamSchema = z.object({ id: z.string().uuid() })

const reviewSchema = z.object({ direction: z.enum(['left', 'right']) })

const studyQuerySchema = z.object({
  mode: z
    .enum(['flashcard', 'mcq', 'reverse', 'typing', 'listening', 'scramble', 'cloze', 'matching', 'mixed'])
    .default('mixed'),
  count: z.coerce.number().min(1).max(20).default(10),
})
const studySubmitSchema = z.object({
  answers: z.array(z.object({ id: z.string().uuid(), correct: z.boolean() })).min(1).max(50),
})

export async function myWordsRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  // GET /lookup?word=
  fastify.get('/lookup', async (req, reply) => {
    const parsed = lookupSchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid query' })

    const result = await lookupWord(parsed.data.word)
    return reply.send({ success: true, data: result })
  })

  // GET / — list all words + due count
  fastify.get('/', async (req, reply) => {
    const user = req.user as JwtPayload
    const data = await myWordsService.listUserWords(user.userId)
    return reply.send({ success: true, data })
  })

  // POST / — create a word
  fastify.post('/', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    try {
      const word = await myWordsService.createUserWord(user.userId, parsed.data)
      return reply.send({ success: true, data: word })
    } catch (err) {
      if (err instanceof DuplicateUserWordError) {
        return reply.code(409).send({ success: false, error: 'Word already in your list' })
      }
      throw err
    }
  })

  // GET /study?limit=
  fastify.get('/study', async (req, reply) => {
    const user = req.user as JwtPayload
    const { limit } = req.query as { limit?: string }
    const parsedLimit = parseInt(limit ?? '') || 20
    const data = await myWordsService.getStudyBatch(user.userId, parsedLimit)
    return reply.send({ success: true, data })
  })

  // GET /study/questions?mode=&count= — multi-method "memorize" session
  fastify.get('/study/questions', async (req, reply) => {
    const parsed = studyQuerySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid query' })
    const user = req.user as JwtPayload
    const questions = await studyService.getStudyQuestions(user.userId, parsed.data.mode, parsed.data.count)
    return reply.send({ success: true, data: questions })
  })

  // POST /study/submit — grade a session (SM-2 + capped XP, no leagues)
  fastify.post('/study/submit', async (req, reply) => {
    const parsed = studySubmitSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ success: false, error: 'Invalid body' })
    const user = req.user as JwtPayload
    const data = await studyService.submitStudy(user.userId, parsed.data.answers)
    return reply.send({ success: true, data })
  })

  // POST /:id/review
  fastify.post('/:id/review', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })

    const body = reviewSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    try {
      const data = await myWordsService.reviewUserWord(user.userId, params.data.id, body.data.direction)
      return reply.send({ success: true, data })
    } catch (err) {
      if (err instanceof UserWordNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Word not found' })
      }
      throw err
    }
  })

  // POST /:id/master — mark a word as fully memorized (graduates it out)
  fastify.post('/:id/master', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })

    const user = req.user as JwtPayload
    try {
      const word = await myWordsService.masterUserWord(user.userId, params.data.id)
      return reply.send({ success: true, data: word })
    } catch (err) {
      if (err instanceof UserWordNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Word not found' })
      }
      throw err
    }
  })

  // POST /:id/relearn — bring a mastered word back into learning
  fastify.post('/:id/relearn', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })

    const user = req.user as JwtPayload
    try {
      const word = await myWordsService.relearnUserWord(user.userId, params.data.id)
      return reply.send({ success: true, data: word })
    } catch (err) {
      if (err instanceof UserWordNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Word not found' })
      }
      throw err
    }
  })

  // PUT /:id — update a word
  fastify.put('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })

    const body = updateSchema.safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: 'Invalid body' })

    const user = req.user as JwtPayload
    try {
      const word = await myWordsService.updateUserWord(user.userId, params.data.id, body.data)
      return reply.send({ success: true, data: word })
    } catch (err) {
      if (err instanceof UserWordNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Word not found' })
      }
      throw err
    }
  })

  // DELETE /:id
  fastify.delete('/:id', async (req, reply) => {
    const params = idParamSchema.safeParse(req.params)
    if (!params.success) return reply.code(400).send({ success: false, error: 'Invalid id' })

    const user = req.user as JwtPayload
    try {
      await myWordsService.deleteUserWord(user.userId, params.data.id)
      return reply.send({ success: true })
    } catch (err) {
      if (err instanceof UserWordNotFoundError) {
        return reply.code(404).send({ success: false, error: 'Word not found' })
      }
      throw err
    }
  })
}
