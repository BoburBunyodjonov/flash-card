import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../../lib/prisma'

/**
 * Admin moderation for the Speaking (voice) feature.
 * Lets admins review user-submitted abuse reports, mark them resolved, and
 * ban an abuser from Speaking for a number of days.
 */
export async function adminSpeakingRoutes(fastify: FastifyInstance) {
  // List reports (open by default), newest first, with both participants.
  fastify.get('/reports', async (req, reply) => {
    const query = z
      .object({
        status: z.enum(['open', 'resolved', 'all']).default('open'),
        page: z.coerce.number().min(1).default(1),
        limit: z.coerce.number().min(1).max(100).default(20),
      })
      .parse(req.query)

    const where: any = {}
    if (query.status === 'open') where.resolvedAt = null
    if (query.status === 'resolved') where.resolvedAt = { not: null }

    const skip = (query.page - 1) * query.limit
    const userSel = {
      select: { id: true, firstName: true, lastName: true, username: true, speakingBannedUntil: true },
    }

    const [reports, total, openCount] = await Promise.all([
      prisma.speakingReport.findMany({
        where,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: userSel,
          session: { include: { userA: userSel, userB: userSel } },
        },
      }),
      prisma.speakingReport.count({ where }),
      prisma.speakingReport.count({ where: { resolvedAt: null } }),
    ])

    // For each report, the "accused" is the session participant who is NOT the reporter.
    const data = reports.map((r) => {
      const accused =
        r.session.userAId === r.reporterId ? r.session.userB : r.session.userA
      return {
        id: r.id,
        reason: r.reason,
        createdAt: r.createdAt,
        resolvedAt: r.resolvedAt,
        resolution: r.resolution,
        sessionId: r.sessionId,
        reporter: r.reporter,
        accused,
      }
    })

    return reply.send({
      success: true,
      data: { reports: data, total, openCount, page: query.page, limit: query.limit },
    })
  })

  // Mark a report reviewed (with an optional note).
  fastify.post('/reports/:id/resolve', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({ resolution: z.string().max(200).optional() }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    const updated = await prisma.speakingReport.updateMany({
      where: { id, resolvedAt: null },
      data: { resolvedAt: new Date(), resolution: body.data.resolution ?? 'reviewed' },
    })
    if (updated.count === 0) {
      return reply.code(404).send({ success: false, error: 'Report not found or already resolved' })
    }
    return reply.send({ success: true })
  })

  // Ban / unban a user from the Speaking feature.
  fastify.post('/users/:id/ban', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({ days: z.number().int().min(0).max(3650) }).safeParse(req.body)
    if (!body.success) return reply.code(400).send({ success: false, error: body.error.message })

    // days === 0 lifts the ban
    const until =
      body.data.days === 0 ? null : new Date(Date.now() + body.data.days * 86400_000)

    const user = await prisma.user.update({
      where: { id },
      data: { speakingBannedUntil: until },
      select: { id: true, speakingBannedUntil: true },
    })
    return reply.send({ success: true, data: user })
  })
}
