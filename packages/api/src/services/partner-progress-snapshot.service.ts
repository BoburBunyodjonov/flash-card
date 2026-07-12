import { prisma } from '../lib/prisma'
import { buildLearnerProgressSnapshot } from './integration-analytics.service'
import { dispatchPartnerWebhook } from './partner-webhook.service'

const BATCH_SIZE = 100

/**
 * Har bir aktiv partner (webhook URL bor) uchun bog'langan o'quvchilar
 * progressini `learner.progress.snapshot` event sifatida yuboradi.
 */
export async function dispatchAllPartnerProgressSnapshots(): Promise<{
  partners: number
  webhooks: number
  learners: number
}> {
  const partners = await prisma.partner.findMany({
    where: { status: 'active', webhookUrl: { not: null } },
    select: { id: true, slug: true },
  })

  let webhooks = 0
  let learners = 0

  for (const partner of partners) {
    const result = await dispatchPartnerProgressSnapshot(partner.id)
    webhooks += result.batches
    learners += result.learners
  }

  return { partners: partners.length, webhooks, learners }
}

export async function dispatchPartnerProgressSnapshot(partnerId: string): Promise<{
  batches: number
  learners: number
}> {
  const enrollments = await prisma.integrationEnrollment.findMany({
    where: { partnerId, status: 'active', userId: { not: null } },
    select: { externalId: true },
    orderBy: { externalId: 'asc' },
  })

  if (!enrollments.length) return { batches: 0, learners: 0 }

  const generatedAt = new Date().toISOString()
  let batches = 0

  for (let i = 0; i < enrollments.length; i += BATCH_SIZE) {
    const chunk = enrollments.slice(i, i + BATCH_SIZE)
    const learners = []
    for (const row of chunk) {
      const snap = await buildLearnerProgressSnapshot(partnerId, row.externalId)
      if (snap) learners.push(snap)
    }

    if (!learners.length) continue

    await dispatchPartnerWebhook(partnerId, 'learner.progress.snapshot', {
      generated_at: generatedAt,
      batch_index: batches,
      batch_total: Math.ceil(enrollments.length / BATCH_SIZE),
      learners,
    })
    batches++
  }

  return { batches, learners: enrollments.length }
}
