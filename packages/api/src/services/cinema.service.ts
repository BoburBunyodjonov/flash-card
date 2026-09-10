import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { addLeagueXp } from './league.service'
import { XP_PER_CINEMA, CINEMA_DAILY_XP_CAP, CINEMA_SHARE_PREFIX } from '@wordswipe/shared'
import type { Difficulty } from '@wordswipe/shared'
import { config } from '../config'
import { buildDeepLink } from '../lib/deep-link'
import {
  getTgClient,
  isMtprotoConfigured,
  listChannelVideos,
  getChannelMessage,
  getVideoThumbDataUri,
  downloadMessageToFile,
  extractVideoMeta,
  uploadVideoToChannel,
  type VideoMeta,
} from '../lib/telegram-client'
import { getCachedCinemaClip, dropCachedCinemaClip, isCinemaClipCached } from '../lib/cinema-cache'
import { ensureBrowserPlayable } from '../lib/browser-video'
import { setMediaPhase, getMediaPhase, type MediaPhase } from '../lib/media-status'
import {
  assertCanOpenVideo,
  assertCanSaveWord,
  recordWordSave,
  canUseAiGloss,
} from './media-limits.service'
import {
  transcribeFile,
  extractAudio,
  translateToUzbek,
  isTranscribeConfigured,
  type TranscriptionResult,
} from './transcription.service'
import {
  buildVocabularyFromText,
  enrichSegmentsForUser,
  needsVocabRebuild,
  packVocabulary,
  parseStoredVocabulary,
  saveVocabWordToMyWords,
  type VideoVocabWord,
} from './video-vocabulary.service'
import { promises as fsp } from 'node:fs'
import path from 'node:path'

export type CinemaVisibility = 'private' | 'global'

export interface CinemaWordAnno {
  text: string
  /** Present when word is above the viewer's CEFR level and we know a translation. */
  translation?: string
  difficulty?: Difficulty
  hard?: boolean
}

export interface CinemaSegment {
  start: number
  end: number
  text: string
  translation?: string
  words?: CinemaWordAnno[]
}

export type CinemaVocabWord = VideoVocabWord

export interface CinemaClipDTO {
  id: string
  title: string
  durationSec: number | null
  transcript: string
  translationUz: string
  segments: CinemaSegment[] | null
  level: Difficulty
  categoryId: string | null
  visibility: CinemaVisibility
  hasEmbeddedSubtitles: boolean
  isMine: boolean
  completed: boolean
  completedCount: number
  vocabularyCount: number
}

export class CinemaNotFoundError extends Error {
  constructor() {
    super('Clip not found')
    this.name = 'CinemaNotFoundError'
  }
}

export class CinemaUnavailableError extends Error {
  constructor() {
    super('Cinema video source is not configured')
    this.name = 'CinemaUnavailableError'
  }
}

export class CinemaForbiddenError extends Error {
  constructor() {
    super('Forbidden')
    this.name = 'CinemaForbiddenError'
  }
}

function todayKey() {
  return new Date().toISOString().split('T')[0]
}
const XP_KEY = (userId: string) => `cinema:xp:${userId}:${todayKey()}`

function toDTO(
  clip: any,
  opts: {
    userId: string
    completion?: { count: number } | null
    segments?: CinemaSegment[] | null
  },
): CinemaClipDTO {
  const vocab = parseStoredVocabulary(clip.vocabulary)
  return {
    id: clip.id,
    title: clip.title,
    durationSec: clip.durationSec ?? null,
    transcript: clip.transcript ?? '',
    translationUz: clip.translationUz ?? '',
    segments: opts.segments ?? ((clip.segments as CinemaSegment[] | null) ?? null),
    level: clip.level as Difficulty,
    categoryId: clip.categoryId ?? null,
    visibility: clip.visibility as CinemaVisibility,
    hasEmbeddedSubtitles: !!clip.hasEmbeddedSubtitles,
    isMine: clip.uploadedByUserId === opts.userId,
    completed: !!opts.completion,
    completedCount: opts.completion?.count ?? 0,
    vocabularyCount: vocab?.length ?? 0,
  }
}

/** Build unique content-word vocabulary with CEFR + Uzbek. */
export async function buildVocabulary(
  segments: CinemaSegment[] | null,
  transcript?: string | null,
): Promise<CinemaVocabWord[]> {
  return buildVocabularyFromText(segments, transcript)
}

function canView(clip: { visibility: string; isPublished: boolean; uploadedByUserId: string | null }, userId: string) {
  if (clip.uploadedByUserId === userId) return true
  return clip.visibility === 'global' && clip.isPublished
}

export function mtprotoReady(): boolean {
  return isMtprotoConfigured() && !!config.cinema.channel
}

export function transcribeReady(): boolean {
  return isTranscribeConfigured()
}

// ---------------------------------------------------------------------------
// Learner-facing
// ---------------------------------------------------------------------------

export async function listClips(
  userId: string,
  filters: { level?: Difficulty; mineOnly?: boolean } = {},
): Promise<CinemaClipDTO[]> {
  const where: any = {
    OR: [
      { uploadedByUserId: userId },
      { visibility: 'global', isPublished: true },
    ],
  }
  if (filters.mineOnly) {
    where.OR = [{ uploadedByUserId: userId }]
  }
  if (filters.level) where.level = filters.level

  const clips = await prisma.cinemaClip.findMany({
    where,
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  })
  if (clips.length === 0) return []

  const completions = await prisma.cinemaCompletion.findMany({
    where: { userId, clipId: { in: clips.map((c) => c.id) } },
  })
  const byClip = new Map(completions.map((c) => [c.clipId, c]))
  return clips.map((c) => toDTO(c, { userId, completion: byClip.get(c.id) }))
}

export async function getClip(
  userId: string,
  id: string,
  isPremium = false,
): Promise<CinemaClipDTO> {
  const clip = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!clip || !canView(clip, userId)) throw new CinemaNotFoundError()

  // Free-tier daily distinct-video cap (admin-configurable).
  await assertCanOpenVideo(userId, isPremium, id)

  const [completion, user] = await Promise.all([
    prisma.cinemaCompletion.findUnique({ where: { userId_clipId: { userId, clipId: id } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { cefrLevel: true } }),
  ])

  const userLevel = (user?.cefrLevel as Difficulty | null) ?? null
  let vocabulary = parseStoredVocabulary(clip.vocabulary)
  let rawSegs = (clip.segments as unknown as CinemaSegment[] | null) ?? null

  // Backfill: clips uploaded with embedded (burned-in) subtitles skipped STT,
  // so they have no transcript/segments — the vocab list is empty and smart
  // subtitles have nothing to translate. Lazily run STT once to populate them.
  if (!rawSegs?.length && !clip.transcript && transcribeReady() && mtprotoReady()) {
    try {
      const r = await transcribeMessage(clip.tgMessageId, true)
      const segs = r.segments?.length ? capSegments(r.segments) : null
      const built = segs?.length || r.transcript ? await buildVocabulary(segs, r.transcript) : []
      await prisma.cinemaClip.update({
        where: { id: clip.id },
        data: {
          transcript: r.transcript,
          translationUz: clip.translationUz || r.translationUz || '',
          segments: (segs as any) ?? undefined,
          vocabulary: built.length ? (packVocabulary(built) as any) : undefined,
        },
      })
      ;(clip as any).transcript = r.transcript
      if (built.length) (clip as any).vocabulary = packVocabulary(built)
      rawSegs = segs
      vocabulary = built
    } catch (err) {
      console.warn('[cinema] lazy STT backfill failed:', (err as Error)?.message ?? err)
    }
  }

  // Lazy-build / rebuild when missing or built with older English filter
  if (needsVocabRebuild(clip.vocabulary) && (rawSegs?.length || clip.transcript)) {
    try {
      vocabulary = await buildVocabulary(rawSegs, clip.transcript)
      await prisma.cinemaClip.update({
        where: { id: clip.id },
        data: { vocabulary: packVocabulary(vocabulary) as any },
      })
      ;(clip as any).vocabulary = packVocabulary(vocabulary)
    } catch (err) {
      console.warn('[cinema] buildVocabulary failed:', (err as Error)?.message ?? err)
    }
  }

  const segments = await enrichSegmentsForUser<CinemaSegment>(rawSegs, userLevel, vocabulary)
  return toDTO(clip, { userId, completion, segments })
}

/**
 * Builds a shareable Telegram deep link for a clip. Only clips other users can
 * actually open (published global content) are shareable; sharing a private
 * upload would give recipients a dead link.
 */
export async function getShareLink(
  userId: string,
  id: string,
): Promise<{ link: string | null; startParam: string }> {
  const clip = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!clip || !canView(clip, userId)) throw new CinemaNotFoundError()
  if (!(clip.visibility === 'global' && clip.isPublished)) throw new CinemaForbiddenError()
  const startParam = `${CINEMA_SHARE_PREFIX}${clip.id}`
  return { link: buildDeepLink(startParam), startParam }
}

export async function listClipVocabulary(
  userId: string,
  clipId: string,
  level?: Difficulty,
  isPremium = false,
): Promise<CinemaVocabWord[]> {
  const clip = await prisma.cinemaClip.findUnique({ where: { id: clipId } })
  if (!clip || !canView(clip, userId)) throw new CinemaNotFoundError()

  let vocabulary = parseStoredVocabulary(clip.vocabulary)
  if (needsVocabRebuild(clip.vocabulary) && (clip.segments || clip.transcript)) {
    vocabulary = await buildVocabulary(
      clip.segments as unknown as CinemaSegment[],
      clip.transcript,
    )
    await prisma.cinemaClip.update({
      where: { id: clipId },
      data: { vocabulary: packVocabulary(vocabulary) as any },
    })
  }

  let list = vocabulary ?? []
  // AI gloss (context example) is a premium enrichment — strip for free users
  // when the admin has it disabled.
  if (!(await canUseAiGloss(isPremium))) {
    list = list.map(({ example, ...rest }) => rest)
  }
  if (!level) return list
  return list.filter((w) => w.level === level)
}

export async function saveClipWordToMyWords(
  userId: string,
  clipId: string,
  word: string,
  isPremium = false,
): Promise<{ saved: boolean; alreadyHad: boolean; word: string; translation: string }> {
  const clip = await prisma.cinemaClip.findUnique({ where: { id: clipId } })
  if (!clip || !canView(clip, userId)) throw new CinemaNotFoundError()

  await assertCanSaveWord(userId, isPremium)

  let vocabulary = parseStoredVocabulary(clip.vocabulary)
  if (needsVocabRebuild(clip.vocabulary) && (clip.segments || clip.transcript)) {
    vocabulary = await buildVocabulary(
      clip.segments as unknown as CinemaSegment[],
      clip.transcript,
    )
    await prisma.cinemaClip.update({
      where: { id: clipId },
      data: { vocabulary: packVocabulary(vocabulary) as any },
    })
  }

  const entry = (vocabulary ?? []).find((v) => v.word.toLowerCase() === word.trim().toLowerCase())
  if (!entry) throw new CinemaNotFoundError()

  const result = await saveVocabWordToMyWords(userId, entry)
  if (result.saved) await recordWordSave(userId, isPremium)
  return result
}

export async function completeClip(
  userId: string,
  id: string,
): Promise<{ xpEarned: number; completedCount: number }> {
  const clip = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!clip || !canView(clip, userId)) throw new CinemaNotFoundError()

  const existing = await prisma.cinemaCompletion.findUnique({
    where: { userId_clipId: { userId, clipId: id } },
  })

  if (!existing) {
    await prisma.cinemaCompletion.create({ data: { userId, clipId: id, count: 1 } })
    const xpEarned = await awardXp(userId, XP_PER_CINEMA)
    return { xpEarned, completedCount: 1 }
  }

  const updated = await prisma.cinemaCompletion.update({
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
    /* Redis down */
  }
  const remaining = CINEMA_DAILY_XP_CAP - usedToday
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

export async function resolveClipPath(id: string, hd = false): Promise<string> {
  const clip = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!clip) throw new CinemaNotFoundError()

  const alreadyCached = await isCinemaClipCached(id)
  try {
    if (!alreadyCached) await setMediaPhase('cinema', id, 'downloading')
    const raw = await getCachedCinemaClip(id, async (dest) => {
      if (!mtprotoReady()) throw new CinemaUnavailableError()
      const client = await getTgClient()
      if (!client) throw new CinemaUnavailableError()
      const msg = await getChannelMessage(client, clip.tgMessageId, clip.tgChannelId)
      await downloadMessageToFile(client, msg, dest)
    })
    // Telegram often stores HEVC/MKV — browsers need H.264 MP4.
    try {
      await setMediaPhase('cinema', id, 'transcoding')
      const playable = await ensureBrowserPlayable(raw, { hd })
      await setMediaPhase('cinema', id, 'ready')
      return playable
    } catch (err) {
      console.warn('[cinema] ensureBrowserPlayable failed:', (err as Error)?.message ?? err)
      await setMediaPhase('cinema', id, 'ready')
      return raw
    }
  } catch (err) {
    await setMediaPhase('cinema', id, 'error')
    throw err
  }
}

/** Warm-up phase for the player's loading UI. */
export async function getClipStatus(userId: string, id: string): Promise<MediaPhase> {
  const clip = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!clip || !canView(clip, userId)) throw new CinemaNotFoundError()
  if (await isCinemaClipCached(id)) {
    const phase = await getMediaPhase('cinema', id)
    // Cached + still transcoding → report transcoding; otherwise ready.
    return phase === 'transcoding' ? 'transcoding' : 'ready'
  }
  return (await getMediaPhase('cinema', id)) ?? 'idle'
}

// ---------------------------------------------------------------------------
// Create / upload (user + admin share helpers)
// ---------------------------------------------------------------------------

export interface CreateCinemaInput {
  tgMessageId: number
  title: string
  transcript?: string
  translationUz?: string
  level?: Difficulty
  categoryId?: string | null
  durationSec?: number | null
  segments?: CinemaSegment[] | null
  order?: number
  isPublished?: boolean
  visibility?: CinemaVisibility
  hasEmbeddedSubtitles?: boolean
  uploadedByUserId?: string | null
  /** When true, run STT if the transcript is empty (even for embedded subtitles). */
  autoTranscribe?: boolean
}

async function ensureVideoMeta(tgMessageId: number) {
  if (!mtprotoReady()) throw new CinemaUnavailableError()
  const client = await getTgClient()
  if (!client) throw new CinemaUnavailableError()
  const msg = await getChannelMessage(client, tgMessageId, config.cinema.channel)
  const meta = extractVideoMeta(msg)
  if (!meta) throw new CinemaNotFoundError()
  return { client, msg, meta }
}

const MAX_CINEMA_SEGMENTS = 5000

/** Merge adjacent segments until under the API/DB cap (long Whisper runs). */
function capSegments(segments: CinemaSegment[] | null | undefined): CinemaSegment[] | null {
  if (!segments?.length) return segments ?? null
  if (segments.length <= MAX_CINEMA_SEGMENTS) return segments
  let out = segments.slice()
  while (out.length > MAX_CINEMA_SEGMENTS) {
    const next: CinemaSegment[] = []
    for (let i = 0; i < out.length; i += 2) {
      const a = out[i]
      const b = out[i + 1]
      if (!b) {
        next.push(a)
        continue
      }
      next.push({
        start: a.start,
        end: b.end,
        text: `${a.text} ${b.text}`.trim(),
        translation:
          a.translation || b.translation
            ? `${a.translation ?? ''} ${b.translation ?? ''}`.trim() || undefined
            : undefined,
      })
    }
    out = next
  }
  return out
}

export async function createClipFromChannel(input: CreateCinemaInput) {
  const { meta } = await ensureVideoMeta(input.tgMessageId)

  let transcript = (input.transcript ?? '').trim()
  let translationUz = (input.translationUz ?? '').trim()
  let segments = capSegments(input.segments ?? null)

  const hasEmbedded = !!input.hasEmbeddedSubtitles
  // Run STT whenever we have no transcript — even for embedded (burned-in)
  // subtitle videos. Burned-in subs are pixels we can't read, so STT is the
  // only way to get the text needed for the vocabulary list + smart subtitles.
  if (!transcript && input.autoTranscribe) {
    try {
      const r = await transcribeMessage(input.tgMessageId, true)
      transcript = r.transcript
      translationUz = r.translationUz ?? translationUz
      segments = r.segments?.length ? capSegments(r.segments) : segments
    } catch (err) {
      // Don't block upload if STT is down / file too large — clip still saves.
      console.warn('[cinema] auto-transcribe failed:', (err as Error)?.message ?? err)
    }
  }

  // Embedded subs: translation-only is OK; generate Uz if missing.
  if (hasEmbedded && transcript && !translationUz) {
    translationUz = (await translateToUzbek(transcript).catch(() => '')) || ''
  }

  let vocabulary: CinemaVocabWord[] = []
  if (segments?.length || transcript) {
    try {
      vocabulary = await buildVocabulary(segments, transcript)
    } catch (err) {
      console.warn('[cinema] buildVocabulary on create failed:', (err as Error)?.message ?? err)
    }
  }

  const visibility: CinemaVisibility =
    input.visibility ?? (input.uploadedByUserId ? 'private' : 'global')

  return prisma.cinemaClip.create({
    data: {
      title: input.title.trim(),
      tgChannelId: config.cinema.channel,
      tgMessageId: input.tgMessageId,
      durationSec: input.durationSec ?? meta.durationSec ?? null,
      transcript,
      translationUz,
      segments: (segments as any) ?? undefined,
      vocabulary: vocabulary.length ? (packVocabulary(vocabulary) as any) : undefined,
      level: input.level ?? 'A1',
      categoryId: input.categoryId ?? null,
      order: input.order ?? 0,
      isPublished: input.isPublished ?? true,
      visibility,
      hasEmbeddedSubtitles: hasEmbedded,
      uploadedByUserId: input.uploadedByUserId ?? null,
    },
  })
}

/** User: upload a local file to the Cinema channel, then create a private clip. */
export async function userUploadClip(
  userId: string,
  filePath: string,
  opts: {
    title: string
    hasEmbeddedSubtitles: boolean
    level?: Difficulty
    transcript?: string
    translationUz?: string
    segments?: CinemaSegment[] | null
    autoTranscribe?: boolean
  },
) {
  if (!mtprotoReady()) throw new CinemaUnavailableError()
  const client = await getTgClient()
  if (!client) throw new CinemaUnavailableError()

  const meta = await uploadVideoToChannel(client, config.cinema.channel, filePath, opts.title)

  return createClipFromChannel({
    tgMessageId: meta.messageId,
    title: opts.title,
    hasEmbeddedSubtitles: opts.hasEmbeddedSubtitles,
    level: opts.level,
    transcript: opts.transcript,
    translationUz: opts.translationUz,
    segments: opts.segments,
    // Always transcribe when no transcript is supplied — embedded-subtitle
    // uploads still need STT to power the vocab list + smart subtitles.
    autoTranscribe: opts.autoTranscribe ?? true,
    visibility: 'private',
    uploadedByUserId: userId,
    isPublished: true,
    durationSec: meta.durationSec,
  })
}

export async function userDeleteClip(userId: string, id: string): Promise<void> {
  const clip = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!clip) throw new CinemaNotFoundError()
  if (clip.uploadedByUserId !== userId) throw new CinemaForbiddenError()
  await prisma.cinemaClip.delete({ where: { id } })
  await dropCachedCinemaClip(id)
}

export async function userUpdateClip(
  userId: string,
  id: string,
  input: {
    title?: string
    transcript?: string
    translationUz?: string
    level?: Difficulty
    segments?: CinemaSegment[] | null
    hasEmbeddedSubtitles?: boolean
  },
) {
  const clip = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!clip) throw new CinemaNotFoundError()
  if (clip.uploadedByUserId !== userId) throw new CinemaForbiddenError()

  const data: Record<string, unknown> = {}
  if (input.title !== undefined) data.title = input.title.trim()
  if (input.transcript !== undefined) data.transcript = input.transcript.trim()
  if (input.translationUz !== undefined) data.translationUz = input.translationUz.trim()
  if (input.level !== undefined) data.level = input.level
  if (input.segments !== undefined) data.segments = (input.segments as any) ?? null
  if (input.hasEmbeddedSubtitles !== undefined) data.hasEmbeddedSubtitles = input.hasEmbeddedSubtitles

  return prisma.cinemaClip.update({ where: { id }, data })
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export interface ChannelVideoDTO extends VideoMeta {
  thumb: string | null
  importedClipId: string | null
}

export async function adminListChannelVideos(withThumbs = true): Promise<ChannelVideoDTO[]> {
  if (!mtprotoReady()) throw new CinemaUnavailableError()
  const client = await getTgClient()
  if (!client) throw new CinemaUnavailableError()

  const videos = await listChannelVideos(client, 30, config.cinema.channel)
  const imported = await prisma.cinemaClip.findMany({
    where: {
      tgChannelId: config.cinema.channel,
      tgMessageId: { in: videos.map((v) => v.messageId) },
    },
    select: { id: true, tgMessageId: true },
  })
  const importedByMsg = new Map(imported.map((c) => [c.tgMessageId, c.id]))

  const out: ChannelVideoDTO[] = []
  for (const v of videos) {
    let thumb: string | null = null
    if (withThumbs) {
      const msg = await getChannelMessage(client, v.messageId, config.cinema.channel).catch(() => null)
      if (msg) thumb = await getVideoThumbDataUri(client, msg)
    }
    out.push({ ...v, thumb, importedClipId: importedByMsg.get(v.messageId) ?? null })
  }
  return out
}

export async function adminCreateClip(input: CreateCinemaInput) {
  return createClipFromChannel({
    ...input,
    visibility: input.visibility ?? 'global',
    uploadedByUserId: input.uploadedByUserId ?? null,
  })
}

export interface AdminUpdateCinemaInput {
  title?: string
  transcript?: string
  translationUz?: string
  level?: Difficulty
  categoryId?: string | null
  durationSec?: number | null
  segments?: CinemaSegment[] | null
  order?: number
  isPublished?: boolean
  visibility?: CinemaVisibility
  hasEmbeddedSubtitles?: boolean
}

export async function adminUpdateClip(id: string, input: AdminUpdateCinemaInput) {
  const existing = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!existing) throw new CinemaNotFoundError()

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
  if (input.visibility !== undefined) data.visibility = input.visibility
  if (input.hasEmbeddedSubtitles !== undefined) data.hasEmbeddedSubtitles = input.hasEmbeddedSubtitles

  return prisma.cinemaClip.update({ where: { id }, data })
}

export async function adminSetVisibility(id: string, visibility: CinemaVisibility) {
  const existing = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!existing) throw new CinemaNotFoundError()
  return prisma.cinemaClip.update({
    where: { id },
    data: {
      visibility,
      // Promoting to global also publishes by default.
      ...(visibility === 'global' ? { isPublished: true } : {}),
    },
  })
}

export async function adminDeleteClip(id: string): Promise<void> {
  const existing = await prisma.cinemaClip.findUnique({ where: { id } })
  if (!existing) throw new CinemaNotFoundError()
  await prisma.cinemaClip.delete({ where: { id } })
  await dropCachedCinemaClip(id)
}

export async function transcribeMessage(tgMessageId: number, translate: boolean): Promise<TranscriptionResult> {
  if (!mtprotoReady()) throw new CinemaUnavailableError()
  const client = await getTgClient()
  if (!client) throw new CinemaUnavailableError()

  const msg = await getChannelMessage(client, tgMessageId, config.cinema.channel)
  const meta = extractVideoMeta(msg)
  if (!meta) throw new CinemaNotFoundError()

  await fsp.mkdir(config.cinema.cacheDir, { recursive: true })
  const tmp = path.join(config.cinema.cacheDir, `transcribe-${tgMessageId}.tmp`)
  let audioPath: string | null = null
  try {
    await downloadMessageToFile(client, msg, tmp)
    audioPath = await extractAudio(tmp)
    const { transcript, segments } = audioPath
      ? await transcribeFile(audioPath, 'clip.mp3')
      : await transcribeFile(tmp, 'clip.mp4')
    let translationUz: string | null = null
    if (translate && transcript) {
      translationUz = await translateToUzbek(transcript).catch(() => null)
    }
    return { transcript, segments, translationUz }
  } finally {
    await fsp.unlink(tmp).catch(() => {})
    if (audioPath) await fsp.unlink(audioPath).catch(() => {})
  }
}

export async function adminListClips() {
  return prisma.cinemaClip.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    include: {
      category: true,
      uploadedBy: { select: { id: true, firstName: true, lastName: true, username: true } },
      _count: { select: { completions: true } },
    },
  })
}
