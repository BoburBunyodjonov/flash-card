import type { FastifyInstance } from 'fastify'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { resolveLocalWordAudio } from '../services/audio-enrichment.service'

export async function mediaRoutes(fastify: FastifyInstance) {
  fastify.get('/word-audio/:file', async (req, reply) => {
    const { file } = req.params as { file: string }
    const m = file.match(/^([0-9a-f-]{36})\.mp3$/i)
    if (!m) return reply.code(400).send({ success: false, error: 'Invalid file' })

    const wordId = m[1]!
    const filePath = await resolveLocalWordAudio(wordId)
    if (!filePath) return reply.code(404).send({ success: false, error: 'Not found' })

    const info = await stat(filePath)
    reply.header('Content-Type', 'audio/mpeg')
    reply.header('Content-Length', info.size)
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.send(createReadStream(filePath))
  })
}
