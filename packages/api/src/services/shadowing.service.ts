import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { addLeagueXp } from './league.service'
import { XP_PER_SHADOWING, SHADOWING_DAILY_XP_CAP } from '@wordswipe/shared'
import type { Difficulty } from '@wordswipe/shared'
import { config } from '../config'
import {
  getTgClient,
  isMtprotoConfigured,
  listChannelVideos,
  getChannelMessage,
  getVideoThumbDataUri,
  downloadMessageToFile,
  extractVideoMeta,
  type VideoMeta,
} from '../lib/telegram-client'
import { getCachedClip, dropCachedClip } from '../lib/shadowing-cache'
import {
  transcribeFile,
  translateToUzbek,
  isTranscribeConfigured,
  type TranscriptionResult,
} from './transcription.service'
import { promises as fsp } from 'node:fs'
import path from 'node:path'

export interface ShadowingSegment {
  start: number
  end: number
  text: string
  translation?: string
}

export interface ShadowingClipDTO {
  id: string
  title: string
  durationSec: number | null
  transcript: string
  translationUz: string
  segments: ShadowingSegment[] | null
  level: Difficulty
  categoryId: string | null
  completed: boolean
  completedCount: number
}

export class ShadowingNotFoundError extends Error {
  constructor() {
    super('Clip not found')
    this.name = 'ShadowingNotFoundError'
  }
}

/** MTProto (GramJS) isn't configured/connected — the video source is unavailable. */
export class ShadowingUnavailableError extends Error {
  constructor() {
    super('Shadowing video source is not configured')
    this.name = 'ShadowingUnavailableError'
  }
}

function todayKey() {
  return new Date().toISOString().split('T')[0]
}
const XP_KEY = (userId: string) => `shadowing:xp:${userId}:${todayKey()}`

function toDTO(clip: any, completion?: { count: number } | null): ShadowingClipDTO {
  return {
    id: clip.id,
    title: clip.title,
    durationSec: clip.durationSec ?? null,
    transcript: clip.transcript,
    translationUz: clip.translationUz,
    segments: (clip.segments as ShadowingSegment[] | null) ?? null,
    level: clip.level as Difficulty,
    categoryId: clip.categoryId ?? null,
    completed: !!completion,
    completedCount: completion?.count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Learner-facing
// ---------------------------------------------------------------------------

export async function listClips(
  userId: string,
  filters: { level?: Difficulty; categoryId?: string } = {},
): Promise<ShadowingClipDTO[]> {
  const where: any = { isPublished: true }
  if (filters.level) where.level = filters.level
  if (filters.categoryId) where.categoryId = filters.categoryId

  const clips = await prisma.shadowingClip.findMany({
    where,
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  })
  if (clips.length === 0) return []

  const completions = await prisma.shadowingCompletion.findMany({
    where: { userId, clipId: { in: clips.map((c) => c.id) } },
  })
  const byClip = new Map(completions.map((c) => [c.clipId, c]))
  return clips.map((c) => toDTO(c, byClip.get(c.id)))
}

export async function getClip(userId: string, id: string): Promise<ShadowingClipDTO> {
  const clip = await prisma.shadowingClip.findFirst({ where: { id, isPublished: true } })
  if (!clip) throw new ShadowingNotFoundError()
  const completion = await prisma.shadowingCompletion.findUnique({
    where: { userId_clipId: { userId, clipId: id } },
  })
  return toDTO(clip, completion)
}

/**
 * Records that the learner shadowed a clip. XP is granted only on the FIRST
 * completion (idempotent via the unique row) and is daily-capped; repeats bump
 * the count but grant nothing, to prevent farming.
 */
export async function completeClip(
  userId: string,
  id: string,
): Promise<{ xpEarned: number; completedCount: number }> {
  const clip = await prisma.shadowingClip.findFirst({ where: { id, isPublished: true } })
  if (!clip) throw new ShadowingNotFoundError()

  const existing = await prisma.shadowingCompletion.findUnique({
    where: { userId_clipId: { userId, clipId: id } },
  })

  if (!existing) {
    await prisma.shadowingCompletion.create({ data: { userId, clipId: id, count: 1 } })
    const xpEarned = await awardXp(userId, XP_PER_SHADOWING)
    return { xpEarned, completedCount: 1 }
  }

  const updated = await prisma.shadowingCompletion.update({
    where: { id: existing.id },
    data: { count: { increment: 1 } },
  })
  return { xpEarned: 0, completedCount: updated.count }
}

async function awardXp(userId: string, amount: number): Promise<number> {
  let usedToday = 0
  try {
    usedToday = parseInt((await redis.get(XP_KEY(userId))) ?? '0') || 0
  } catch {
    /* Redis down — grant without hard cap */
  }
  const remaining = SHADOWING_DAILY_XP_CAP - usedToday
  if (remaining <= 0) return 0
  const grant = Math.min(amount, remaining)

  await prisma.user.update({ where: { id: userId }, data: { xp: { increment: grant } } })
  try {
    await redis.incrby(XP_KEY(userId), grant)
    await redis.expire(XP_KEY(userId), 60 * 60 * 48)
  } catch {
    /* non-fatal */
  }
  await addLeagueXp(userId, grant)
  return grant
}

/**
 * Returns a local file path to the clip's video, downloading it from Telegram
 * on a cache miss. Telegram is touched ONLY on a cold cache — repeat views and
 * range/seek requests are served straight from the cached file.
 */
export async function resolveClipPath(id: string): Promise<string> {
  const clip = await prisma.shadowingClip.findUnique({ where: { id } })
  if (!clip) throw new ShadowingNotFoundError()

  return getCachedClip(id, async (dest) => {
    if (!isMtprotoConfigured()) throw new ShadowingUnavailableError()
    const client = await getTgClient()
    if (!client) throw new ShadowingUnavailableError()
    const msg = await getChannelMessage(client, clip.tgMessageId)
    await downloadMessageToFile(client, msg, dest)
  })
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface ChannelVideoDTO extends VideoMeta {
  thumb: string | null
  importedClipId: string | null
}

export function mtprotoReady(): boolean {
  return isMtprotoConfigured() && !!config.shadowing.channel
}

/** Lists recent channel videos for the admin picker, flagging already-imported ones. */
export async function adminListChannelVideos(withThumbs = true): Promise<ChannelVideoDTO[]> {
  if (!mtprotoReady()) throw new ShadowingUnavailableError()
  const client = await getTgClient()
  if (!client) throw new ShadowingUnavailableError()

  const videos = await listChannelVideos(client, 30)

  const imported = await prisma.shadowingClip.findMany({
    where: { tgChannelId: config.shadowing.channel, tgMessageId: { in: videos.map((v) => v.messageId) } },
    select: { id: true, tgMessageId: true },
  })
  const importedByMsg = new Map(imported.map((c) => [c.tgMessageId, c.id]))

  const out: ChannelVideoDTO[] = []
  for (const v of videos) {
    let thumb: string | null = null
    if (withThumbs) {
      const msg = await getChannelMessage(client, v.messageId).catch(() => null)
      if (msg) thumb = await getVideoThumbDataUri(client, msg)
    }
    out.push({ ...v, thumb, importedClipId: importedByMsg.get(v.messageId) ?? null })
  }
  return out
}

export interface CreateClipInput {
  tgMessageId: number
  title: string
  transcript: string
  translationUz: string
  level: Difficulty
  categoryId?: string | null
  durationSec?: number | null
  segments?: ShadowingSegment[] | null
  order?: number
  isPublished?: boolean
}

export async function adminCreateClip(input: CreateClipInput) {
  if (!mtprotoReady()) throw new ShadowingUnavailableError()
  const client = await getTgClient()
  if (!client) throw new ShadowingUnavailableError()

  // Verify the message exists and is a video; auto-fill duration if not given.
  const msg = await getChannelMessage(client, input.tgMessageId)
  const meta = extractVideoMeta(msg)
  if (!meta) throw new ShadowingNotFoundError()

  return prisma.shadowingClip.create({
    data: {
      title: input.title.trim(),
      tgChannelId: config.shadowing.channel,
      tgMessageId: input.tgMessageId,
      durationSec: input.durationSec ?? meta.durationSec ?? null,
      transcript: input.transcript.trim(),
      translationUz: input.translationUz.trim(),
      segments: (input.segments as any) ?? undefined,
      level: input.level,
      categoryId: input.categoryId ?? null,
      order: input.order ?? 0,
      isPublished: input.isPublished ?? true,
    },
  })
}

export interface UpdateClipInput {
  title?: string
  transcript?: string
  translationUz?: string
  level?: Difficulty
  categoryId?: string | null
  durationSec?: number | null
  segments?: ShadowingSegment[] | null
  order?: number
  isPublished?: boolean
}

export async function adminUpdateClip(id: string, input: UpdateClipInput) {
  const existing = await prisma.shadowingClip.findUnique({ where: { id } })
  if (!existing) throw new ShadowingNotFoundError()

  const data: Record<string, unknown> = {}
  if (input.title !== undefined) data.title = input.title.trim()
  if (input.transcript !== undefined) data.transcript = input.transcript.trim()
  if (input.translationUz !== undefined) data.translationUz = input.translationUz.trim()
  if (input.level !== undefined) data.level = input.level
  if (input.categoryId !== undefined) data.categoryId = input.categoryId
  if (input.durationSec !== undefined) data.durationSec = input.durationSec
  if (input.segments !== undefined) data.segments = (input.segments as any) ?? null
  if (input.order !== undefined) data.order = input.order
  if (input.isPublished !== undefined) data.isPublished = input.isPublished

  return prisma.shadowingClip.update({ where: { id }, data })
}

export async function adminDeleteClip(id: string): Promise<void> {
  const existing = await prisma.shadowingClip.findUnique({ where: { id } })
  if (!existing) throw new ShadowingNotFoundError()
  await prisma.shadowingClip.delete({ where: { id } })
  await dropCachedClip(id)
}

export function transcribeReady(): boolean {
  return isTranscribeConfigured()
}

/**
 * Downloads a channel video and auto-generates its transcript (+ segment
 * timestamps, + optional Uzbek translation) for the admin import form. The
 * temp download is discarded — the clip's own cache fills on first playback.
 */
export async function transcribeMessage(tgMessageId: number, translate: boolean): Promise<TranscriptionResult> {
  if (!mtprotoReady()) throw new ShadowingUnavailableError()
  const client = await getTgClient()
  if (!client) throw new ShadowingUnavailableError()

  const msg = await getChannelMessage(client, tgMessageId)
  const meta = extractVideoMeta(msg)
  if (!meta) throw new ShadowingNotFoundError()

  await fsp.mkdir(config.shadowing.cacheDir, { recursive: true })
  const tmp = path.join(config.shadowing.cacheDir, `transcribe-${tgMessageId}.tmp`)
  try {
    await downloadMessageToFile(client, msg, tmp)
    const { transcript, segments } = await transcribeFile(tmp)
    let translationUz: string | null = null
    if (translate && transcript) {
      // Translation is best-effort — never let it fail the transcription.
      translationUz = await translateToUzbek(transcript).catch(() => null)
    }
    return { transcript, segments, translationUz }
  } finally {
    await fsp.unlink(tmp).catch(() => {})
  }
}

export async function adminListClips() {
  return prisma.shadowingClip.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    include: { category: true, _count: { select: { completions: true } } },
  })
}
