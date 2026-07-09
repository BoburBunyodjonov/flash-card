import { prisma } from '../lib/prisma'
import { normalizePhone } from './auth.service'
import { dispatchPartnerWebhook } from './partner-webhook.service'

/**
 * ERP ro'yxatidagi o'quvchini akkaunt bilan bog'laydi va markaz shartnomasi
 * bo'yicha premium / kirish huquqini yangilaydi.
 */
export async function applyPartnerBenefitsForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true, isPremium: true, premiumUntil: true },
  })
  if (!user?.phone) return

  const enrollments = await prisma.integrationEnrollment.findMany({
    where: { phone: user.phone },
    include: { partner: true },
  })

  const activeWithPremium = enrollments.filter(
    (e) => e.status === 'active' && e.partner.status === 'active' && e.partner.premiumIncluded,
  )

  const shouldBePremium = activeWithPremium.length > 0

  if (shouldBePremium && !user.isPremium) {
    await prisma.user.update({
      where: { id: userId },
      data: { isPremium: true, premiumUntil: null },
    })
  } else if (!shouldBePremium && user.isPremium && !user.premiumUntil) {
    // Faqat markaz orqali berilgan premiumni olib tashlaymiz (to'lovdan kelganini emas)
    const hasPaidPremium = await prisma.payment.count({
      where: { userId, status: 'success' },
    })
    if (!hasPaidPremium) {
      await prisma.user.update({
        where: { id: userId },
        data: { isPremium: false },
      })
    }
  }
}

export async function linkEnrollmentsToUser(userId: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone)
  if (!phone) return []

  const enrollments = await prisma.integrationEnrollment.findMany({
    where: { phone, status: 'active' },
    include: { partner: true },
  })

  const linked: string[] = []
  for (const e of enrollments) {
    if (!e.userId) {
      await prisma.integrationEnrollment.update({
        where: { id: e.id },
        data: { userId },
      })
      linked.push(e.partner.slug)
      dispatchPartnerWebhook(e.partnerId, 'learner.linked', {
        external_id: e.externalId,
        user_id: userId,
        phone: e.phone,
        group_external_id: e.groupExternalId,
      }).catch(() => {})
    }
  }

  await applyPartnerBenefitsForUser(userId)
  return linked
}

/** Whitelist: faqat bitta aktiv whitelist-markaz bo'lsa (dedicated deploy) kirish cheklanadi */
export async function assertPhoneAllowedForAuth(rawPhone: string): Promise<void> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return

  const whitelistPartners = await prisma.partner.findMany({
    where: { status: 'active', accessMode: 'whitelist' },
    select: { id: true, name: true },
  })
  if (whitelistPartners.length !== 1) return

  const partnerId = whitelistPartners[0]!.id
  const enrollment = await prisma.integrationEnrollment.findFirst({
    where: { partnerId, phone, status: 'active' },
  })

  if (!enrollment) {
    const err = new Error(
      `Phone not registered with ${whitelistPartners[0]!.name}. Contact your learning center.`,
    ) as Error & { statusCode?: number }
    err.statusCode = 403
    throw err
  }
}

export async function getPartnerSlugsForPhone(rawPhone: string): Promise<string[]> {
  const phone = normalizePhone(rawPhone)
  if (!phone) return []

  const rows = await prisma.integrationEnrollment.findMany({
    where: { phone, status: 'active' },
    include: { partner: { select: { slug: true, status: true } } },
  })
  return rows.filter((r) => r.partner.status === 'active').map((r) => r.partner.slug)
}
