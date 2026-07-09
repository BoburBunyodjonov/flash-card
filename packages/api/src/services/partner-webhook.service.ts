import { createHmac, randomUUID } from 'crypto'
import type { IntegrationWebhookEvent } from '@wordswipe/shared'
import { prisma } from '../lib/prisma'

const WEBHOOK_TIMEOUT_MS = 12_000

export async function dispatchPartnerWebhook(
  partnerId: string,
  event: IntegrationWebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, slug: true, webhookUrl: true, webhookSecret: true, status: true },
  })
  if (!partner?.webhookUrl || partner.status !== 'active') return

  const payload = {
    id: randomUUID(),
    event,
    partner_slug: partner.slug,
    created_at: new Date().toISOString(),
    data,
  }

  const body = JSON.stringify(payload)
  const started = Date.now()
  let statusCode: number | null = null
  let success = false
  let error: string | null = null

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'WordSwipe-Webhook/1.0',
      'X-WordSwipe-Event': event,
    }
    if (partner.webhookSecret) {
      const sig = createHmac('sha256', partner.webhookSecret).update(body).digest('hex')
      headers['X-WordSwipe-Signature'] = `sha256=${sig}`
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS)
    const res = await fetch(partner.webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)
    statusCode = res.status
    success = res.status >= 200 && res.status < 300
    if (!success) {
      error = `HTTP ${res.status}`
    }
  } catch (err) {
    error = (err as Error).message
  }

  await prisma.partnerWebhookDelivery.create({
    data: {
      partnerId,
      event,
      payload: payload as object,
      statusCode,
      success,
      error,
      durationMs: Date.now() - started,
    },
  })
}

export async function sendPartnerWebhookPing(partnerId: string) {
  await dispatchPartnerWebhook(partnerId, 'webhook.test', {
    message: 'WordSwipe webhook connectivity test',
  })
}

export async function listWebhookDeliveries(partnerId: string, limit = 30) {
  const rows = await prisma.partnerWebhookDelivery.findMany({
    where: { partnerId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    success: r.success,
    statusCode: r.statusCode,
    error: r.error,
    durationMs: r.durationMs,
    createdAt: r.createdAt.toISOString(),
  }))
}
