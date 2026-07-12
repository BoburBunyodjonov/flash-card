import { prisma } from '../lib/prisma'
import { config } from '../config'
import { notificationQueue } from '../jobs'
import { invalidateFeedCache } from './my-words.service'
import { WORD_SHARE_PREFIX } from '@wordswipe/shared'

const MAX_WORDS = 100
const MAX_RECIPIENTS = 20

function shareDeepLink(shareId: string): string | null {
  const param = `${WORD_SHARE_PREFIX}${shareId}`
  if (config.telegram.botUsername) return `https://t.me/${config.telegram.botUsername}?start=${param}`
  if (config.telegram.webAppUrl) return `${config.telegram.webAppUrl}?startapp=${param}`
  if (config.telegram.appUrl) return `${config.telegram.appUrl}/?sp=${encodeURIComponent(param)}`
  return null
}
export class WordShareError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message)
    this.name = 'WordShareError'
  }
}

export interface WordShareDTO {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  wordCount: number
  createdAt: Date
  respondedAt: Date | null
  fromUser: { id: string; firstName: string; lastName: string | null; username: string | null; avatarUrl: string | null }
  toUser: { id: string; firstName: string; lastName: string | null; username: string | null; avatarUrl: string | null }
  words: Array<{ word: string; translation: string }>
}

function userSelect() {
  return {
    id: true,
    firstName: true,
    lastName: true,
    username: true,
    avatarUrl: true,
  } as const
}

function toDTO(row: any): WordShareDTO {
  return {
    id: row.id,
    status: row.status,
    wordCount: row.items?.length ?? 0,
    createdAt: row.createdAt,
    respondedAt: row.respondedAt ?? null,
    fromUser: row.fromUser,
    toUser: row.toUser,
    words: (row.items ?? []).map((i: any) => ({ word: i.word, translation: i.translation })),
  }
}

async function notifyShare(fromUserId: string, toUserId: string, wordCount: number, shareId: string) {
  const [from, to] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromUserId }, select: { firstName: true } }),
    prisma.user.findUnique({
      where: { id: toUserId },
      select: { telegramId: true, language: true, notifyEnabled: true },
    }),
  ])
  if (!from || !to?.telegramId || !to.notifyEnabled) return

  const msgs: Record<string, string> = {
    uz: `📚 ${from.firstName} sizga ${wordCount} ta so'z ulashdi. WordSwipe da qabul qiling!`,
    en: `📚 ${from.firstName} shared ${wordCount} words with you. Open WordSwipe to accept!`,
    ru: `📚 ${from.firstName} поделился с вами ${wordCount} словами. Откройте WordSwipe, чтобы принять!`,
  }
  const text = msgs[to.language ?? 'en'] ?? msgs.en
  const deepLink = shareDeepLink(shareId)
  const message = deepLink ? `${text}\n${deepLink}` : text

  await notificationQueue.add(
    'bulk-message',
    { telegramIds: [to.telegramId.toString()], message },
    { removeOnComplete: true, removeOnFail: 50, attempts: 2 },
  )
}

/** People who follow me — valid share recipients. */
export async function listShareRecipients(userId: string) {
  const rows = await prisma.follow.findMany({
    where: { followingId: userId },
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: { follower: { select: userSelect() } },
  })
  return rows.map((r) => r.follower)
}

export async function createWordShares(
  fromUserId: string,
  opts: { wordIds?: string[]; all?: boolean; toUserIds: string[] },
): Promise<WordShareDTO[]> {
  const toUserIds = [...new Set(opts.toUserIds.filter((id) => id && id !== fromUserId))]
  if (!toUserIds.length) throw new WordShareError('Select at least one follower')
  if (toUserIds.length > MAX_RECIPIENTS) throw new WordShareError(`Max ${MAX_RECIPIENTS} recipients`)

  // Must be followers of the sender
  const followers = await prisma.follow.findMany({
    where: { followingId: fromUserId, followerId: { in: toUserIds } },
    select: { followerId: true },
  })
  const allowed = new Set(followers.map((f) => f.followerId))
  const invalid = toUserIds.filter((id) => !allowed.has(id))
  if (invalid.length) throw new WordShareError('You can only share with your followers')

  const words = await prisma.userWord.findMany({
    where: opts.all
      ? { userId: fromUserId }
      : { userId: fromUserId, id: { in: opts.wordIds ?? [] } },
    take: MAX_WORDS + 1,
  })
  if (!words.length) throw new WordShareError('No words to share')
  if (words.length > MAX_WORDS) throw new WordShareError(`Max ${MAX_WORDS} words per share`)

  const results: WordShareDTO[] = []

  for (const toUserId of toUserIds) {
    const share = await prisma.wordShare.create({
      data: {
        fromUserId,
        toUserId,
        items: {
          create: words.map((w) => ({
            word: w.word,
            translation: w.translation,
            pronunciation: w.pronunciation,
            audioUrl: w.audioUrl,
            partOfSpeech: w.partOfSpeech,
            definitionEn: w.definitionEn,
            exampleEn: w.exampleEn,
            synonyms: w.synonyms,
          })),
        },
      },
      include: {
        items: true,
        fromUser: { select: userSelect() },
        toUser: { select: userSelect() },
      },
    })
    results.push(toDTO(share))
    notifyShare(fromUserId, toUserId, words.length, share.id).catch(() => {})
  }

  return results
}

export async function listIncomingShares(userId: string): Promise<WordShareDTO[]> {
  const rows = await prisma.wordShare.findMany({
    where: { toUserId: userId, status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      items: { select: { word: true, translation: true } },
      fromUser: { select: userSelect() },
      toUser: { select: userSelect() },
    },
  })
  return rows.map(toDTO)
}

export async function getShareForUser(shareId: string, userId: string): Promise<WordShareDTO> {
  const row = await prisma.wordShare.findUnique({
    where: { id: shareId },
    include: {
      items: { select: { word: true, translation: true } },
      fromUser: { select: userSelect() },
      toUser: { select: userSelect() },
    },
  })
  if (!row) throw new WordShareError('Share not found', 404)
  if (row.toUserId !== userId && row.fromUserId !== userId) {
    throw new WordShareError('Share not found', 404)
  }
  return toDTO(row)
}

export async function acceptWordShare(userId: string, shareId: string): Promise<{ added: number; skipped: number }> {
  const share = await prisma.wordShare.findUnique({
    where: { id: shareId },
    include: {
      items: true,
      fromUser: { select: { id: true, firstName: true } },
    },
  })
  if (!share) throw new WordShareError('Share not found', 404)
  if (share.toUserId !== userId) throw new WordShareError('Not your share', 403)
  if (share.status !== 'pending') throw new WordShareError('Already responded')

  const fromName = share.fromUser.firstName
  let added = 0
  let skipped = 0

  for (const item of share.items) {
    try {
      await prisma.userWord.create({
        data: {
          userId,
          word: item.word,
          translation: item.translation,
          pronunciation: item.pronunciation,
          audioUrl: item.audioUrl,
          partOfSpeech: item.partOfSpeech,
          definitionEn: item.definitionEn,
          exampleEn: item.exampleEn,
          synonyms: item.synonyms,
          sharedFromUserId: share.fromUserId,
          sharedFromName: fromName,
          sourceShareId: share.id,
        },
      })
      added++
    } catch {
      skipped++
    }
  }

  await prisma.wordShare.update({
    where: { id: shareId },
    data: { status: 'accepted', respondedAt: new Date() },
  })

  await invalidateFeedCache(userId)
  return { added, skipped }
}

export async function declineWordShare(userId: string, shareId: string): Promise<void> {
  const share = await prisma.wordShare.findUnique({ where: { id: shareId } })
  if (!share) throw new WordShareError('Share not found', 404)
  if (share.toUserId !== userId) throw new WordShareError('Not your share', 403)
  if (share.status !== 'pending') throw new WordShareError('Already responded')

  await prisma.wordShare.update({
    where: { id: shareId },
    data: { status: 'declined', respondedAt: new Date() },
  })
}

export async function pendingIncomingCount(userId: string): Promise<number> {
  return prisma.wordShare.count({ where: { toUserId: userId, status: 'pending' } })
}
