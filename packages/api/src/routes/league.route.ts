import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middlewares/auth.middleware'
import * as leagueService from '../services/league.service'
import type { JwtPayload } from '@wordswipe/shared'

export async function leagueRoutes(fastify: FastifyInstance) {
  fastify.addHook('onRequest', requireAuth)

  fastify.get('/me', async (req, reply) => {
    const user = req.user as JwtPayload
    const league = await leagueService.getMyLeague(user.userId)
    return reply.send({ success: true, data: league })
  })
}
