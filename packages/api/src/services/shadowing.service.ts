import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { addLeagueXp } from './league.service'
import {
  XP_PER_SHADOWING,
  SHADOWING_DAILY_XP_CAP,
  SHADOWING_SPEAK_PASS_SCORE,
  XP_PER_SHADOWING_SPEAK,
  SHADOWING_SPEAK_DAILY_XP_CAP,
  SHADOW_SHARE_PREFIX,
} from '@wordswipe/shared'
import type { Difficulty } from '@wordswipe/shared'
import { buildDeepLink } from '../lib/deep-link'
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
import { getCachedClip, dropCachedClip, isClipCached } from '../lib/shadowing-cache'
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
  TranscribeUnavailableError,
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
  type WordAnno,
} from './video-vocabulary.service'
import { promises as fsp } from 'node:fs'
import path from 'node:path'

export type ShadowingVocabWord = VideoVocabWord

export interface ShadowingSegment {
  start: number
  end: number
  text: string
  translation?: string
  words?: WordAnno[]
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
  vocabularyCount: number
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

function toDTO(
  clip: any,
  completion?: { count: number } | null,
  segmentsOverride?: ShadowingSegment[] | null,
): ShadowingClipDTO {
  const vocab = parseStoredVocabulary(clip.vocabulary)
  return {
    id: clip.id,
    title: clip.title,
    durationSec: clip.durationSec ?? null,
    transcript: clip.transcript,
    translationUz: clip.translationUz,
    segments:
      segmentsOverride ?? ((clip.segments as ShadowingSegment[] | null) ?? null),
    level: clip.level as Difficulty,
    categoryId: clip.categoryId ?? null,
    completed: !!completion,
    completedCount: completion?.count ?? 0,
    vocabularyCount: vocab?.length ?? 0,
  }
}

async function ensureVocabulary(clip: {
  id: string
  segments: unknown
  transcript: string
  vocabulary?: unknown
}): Promise<ShadowingVocabWord[]> {
  if (!needsVocabRebuild(clip.vocabulary)) {
    return parseStoredVocabulary(clip.vocabulary) ?? []
  }

  const segs = (clip.segments as ShadowingSegment[] | null) ?? null
  if (!segs?.length && !clip.transcript?.trim()) return []

  try {
    const vocabulary = await buildVocabularyFromText(segs, clip.transcript)
    await prisma.shadowingClip.update({
      where: { id: clip.id },
      data: { vocabulary: packVocabulary(vocabulary) as any },
    })
    return vocabulary
  } catch (err) {
    console.warn('[shadowing] buildVocabulary failed:', (err as Error)?.message ?? err)
    return parseStoredVocabulary(clip.vocabulary) ?? []
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

export async function getClip(
  userId: string,
  id: string,
  isPremium = false,
): Promise<ShadowingClipDTO> {
  const clip = await prisma.shadowingClip.findFirst({ where: { id, isPublished: true } })
  if (!clip) throw new ShadowingNotFoundError()

  await assertCanOpenVideo(userId, isPremium, id)

  const [completion, user] = await Promise.all([
    prisma.shadowingCompletion.findUnique({
      where: { userId_clipId: { userId, clipId: id } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { cefrLevel: true } }),
  ])
  const vocabulary = await ensureVocabulary(clip)
  ;(clip as any).vocabulary = vocabulary

  const userLevel = (user?.cefrLevel as Difficulty | null) ?? null
  const rawSegs = (clip.segments as unknown as ShadowingSegment[] | null) ?? null
  const segments = await enrichSegmentsForUser<ShadowingSegment>(rawSegs, userLevel, vocabulary)
  return toDTO(clip, completion, segments)
}

export async function listClipVocabulary(
  userId: string,
  clipId: string,
  level?: Difficulty,
  isPremium = false,
): Promise<ShadowingVocabWord[]> {
  const clip = await prisma.shadowingClip.findFirst({ where: { id: clipId, isPublished: true } })
  if (!clip) throw new ShadowingNotFoundError()
  let list = await ensureVocabulary(clip)
  if (!(await canUseAiGloss(isPremium))) {
    list = list.map(({ example, ...rest }) => rest)
  }
  if (!level) return list
  return list.filter((w) => w.level === level)
}

/** Telegram deep link for a published shadowing clip. */
export async function getShareLink(
  _userId: string,
  id: string,
): Promise<{ link: string | null; startParam: string }> {
  const clip = await prisma.shadowingClip.findFirst({ where: { id, isPublished: true } })
  if (!clip) throw new ShadowingNotFoundError()
  const startParam = `${SHADOW_SHARE_PREFIX}${clip.id}`
  return { link: buildDeepLink(startParam), startParam }
}

export async function saveClipWordToMyWords(
  userId: string,
  clipId: string,
  word: string,
  isPremium = false,
): Promise<{ saved: boolean; alreadyHad: boolean; word: string; translation: string }> {
  const clip = await prisma.shadowingClip.findFirst({ where: { id: clipId, isPublished: true } })
  if (!clip) throw new ShadowingNotFoundError()

  await assertCanSaveWord(userId, isPremium)

  const vocabulary = await ensureVocabulary(clip)
  const entry = vocabulary.find((v) => v.word.toLowerCase() === word.trim().toLowerCase())
  if (!entry) throw new ShadowingNotFoundError()

  const result = await saveVocabWordToMyWords(userId, entry)
  if (result.saved) await recordWordSave(userId, isPremium)
  return result
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

// ---------------------------------------------------------------------------
// Speak-along: score a learner's recording of a segment against its transcript
// ---------------------------------------------------------------------------

const SPEAK_XP_KEY = (userId: string) => `shadowing:speakxp:${userId}:${todayKey()}`
const SPEAK_PASS_KEY = (userId: string, clipId: string) => `shadowing:speak:${userId}:${clipId}`
const SPEAK_DONE_KEY = (userId: string, clipId: string) => `shadowing:speakdone:${userId}:${clipId}`

function normalizeWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z']+/g) ?? []).filter(Boolean)
}

/** Order-insensitive multiset word overlap of hypothesis vs reference (0–100). */
export function speakSimilarity(reference: string, hypothesis: string): number {
  const ref = normalizeWords(reference)
  if (ref.length === 0) return 0
  const hyp = normalizeWords(hypothesis)
  const pool = new Map<string, number>()
  for (const w of hyp) pool.set(w, (pool.get(w) ?? 0) + 1)
  let matched = 0
  for (const w of ref) {
    const c = pool.get(w) ?? 0
    if (c > 0) {
      matched++
      pool.set(w, c - 1)
    }
  }
  return Math.round((matched / ref.length) * 100)
}

async function awardSpeakXp(userId: string, amount: number): Promise<number> {
  let usedToday = 0
  try {
    usedToday = parseInt((await redis.get(SPEAK_XP_KEY(userId))) ?? '0') || 0
  } catch {
    /* Redis down */
  }
  const remaining = SHADOWING_SPEAK_DAILY_XP_CAP - usedToday
  if (remaining <= 0) return 0
  const grant = Math.min(amount, remaining)
  await prisma.user.update({ where: { id: userId }, data: { xp: { increment: grant } } })
  try {
    await redis.incrby(SPEAK_XP_KEY(userId), grant)
    await redis.expire(SPEAK_XP_KEY(userId), 60 * 60 * 48)
  } catch {
    /* non-fatal */
  }
  await addLeagueXp(userId, grant)
  return grant
}

export interface SpeakResult {
  score: number
  passed: boolean
  heard: string
  passedCount: number
  totalSegments: number
  allDone: boolean
  xpEarned: number
}

/**
 * Transcribes the learner's recording of segment `segmentIndex` and scores it
 * against the segment's reference text. On a pass, the segment is marked; once
 * every segment of the clip has been passed, a one-time (daily-capped) XP bonus
 * is granted.
 */
export async function scoreSpeakSegment(
  userId: string,
  clipId: string,
  segmentIndex: number,
  audioPath: string,
): Promise<SpeakResult> {
  if (!isTranscribeConfigured()) throw new TranscribeUnavailableError()

  const clip = await prisma.shadowingClip.findFirst({ where: { id: clipId, isPublished: true } })
  if (!clip) throw new ShadowingNotFoundError()

  const segments = (clip.segments as unknown as ShadowingSegment[] | null) ?? []
  const segment = segments[segmentIndex]
  if (!segment) throw new ShadowingNotFoundError()

  const { transcript } = await transcribeFile(audioPath, 'clip.mp3')
  const score = speakSimilarity(segment.text, transcript)
  const passed = score >= SHADOWING_SPEAK_PASS_SCORE

  const totalSegments = segments.length
  let passedCount = 0
  let allDone = false
  let xpEarned = 0

  const passKey = SPEAK_PASS_KEY(userId, clipId)
  try {
    if (passed) {
      await redis.sadd(passKey, String(segmentIndex))
      await redis.expire(passKey, 60 * 60 * 24 * 7)
    }
    passedCount = await redis.scard(passKey)

    if (totalSegments > 0 && passedCount >= totalSegments) {
      allDone = true
      const already = await redis.get(SPEAK_DONE_KEY(userId, clipId))
      if (!already) {
        xpEarned = await awardSpeakXp(userId, XP_PER_SHADOWING_SPEAK)
        await redis.set(SPEAK_DONE_KEY(userId, clipId), '1', 'EX', 60 * 60 * 24 * 30)
      }
    }
  } catch {
    /* Redis down — scoring still returned, just no persistence/XP */
  }

  return {
    score,
    passed,
    heard: transcript,
    passedCount,
    totalSegments,
    allDone,
    xpEarned,
  }
}

/**
 * Returns a local file path to the clip's video, downloading it from Telegram
 * on a cache miss. Telegram is touched ONLY on a cold cache — repeat views and
 * range/seek requests are served straight from the cached file.
 */
export async function resolveClipPath(id: string, hd = false): Promise<string> {
  const clip = await prisma.shadowingClip.findUnique({ where: { id } })
  if (!clip) throw new ShadowingNotFoundError()

  const alreadyCached = await isClipCached(id)
  try {
    if (!alreadyCached) await setMediaPhase('shadowing', id, 'downloading')
    const raw = await getCachedClip(id, async (dest) => {
      if (!isMtprotoConfigured()) throw new ShadowingUnavailableError()
      const client = await getTgClient()
      if (!client) throw new ShadowingUnavailableError()
      const msg = await getChannelMessage(client, clip.tgMessageId)
      await downloadMessageToFile(client, msg, dest)
    })
    try {
      await setMediaPhase('shadowing', id, 'transcoding')
      const playable = await ensureBrowserPlayable(raw, { hd })
      await setMediaPhase('shadowing', id, 'ready')
      return playable
    } catch (err) {
      console.warn('[shadowing] ensureBrowserPlayable failed:', (err as Error)?.message ?? err)
      await setMediaPhase('shadowing', id, 'ready')
      return raw
    }
  } catch (err) {
    await setMediaPhase('shadowing', id, 'error')
    throw err
  }
}

/** Warm-up phase for the player's loading UI. */
export async function getClipStatus(id: string): Promise<MediaPhase> {
  const clip = await prisma.shadowingClip.findFirst({ where: { id, isPublished: true } })
  if (!clip) throw new ShadowingNotFoundError()
  if (await isClipCached(id)) {
    const phase = await getMediaPhase('shadowing', id)
    return phase === 'transcoding' ? 'transcoding' : 'ready'
  }
  return (await getMediaPhase('shadowing', id)) ?? 'idle'
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

  const transcript = input.transcript.trim()
  const segments = input.segments ?? null
  let vocabulary: ShadowingVocabWord[] = []
  try {
    vocabulary = await buildVocabularyFromText(segments, transcript)
  } catch (err) {
    console.warn('[shadowing] vocab on create failed:', (err as Error)?.message ?? err)
  }

  return prisma.shadowingClip.create({
    data: {
      title: input.title.trim(),
      tgChannelId: config.shadowing.channel,
      tgMessageId: input.tgMessageId,
      durationSec: input.durationSec ?? meta.durationSec ?? null,
      transcript,
      translationUz: input.translationUz.trim(),
      segments: (segments as any) ?? undefined,
      vocabulary: vocabulary.length ? (packVocabulary(vocabulary) as any) : undefined,
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

  if (input.segments !== undefined || input.transcript !== undefined) {
    const segs =
      input.segments !== undefined
        ? input.segments
        : ((existing.segments as ShadowingSegment[] | null) ?? null)
    const transcript =
      input.transcript !== undefined ? input.transcript.trim() : existing.transcript
    try {
      const vocabulary = await buildVocabularyFromText(segs, transcript)
      data.vocabulary = packVocabulary(vocabulary) as any
    } catch (err) {
      console.warn('[shadowing] vocab on update failed:', (err as Error)?.message ?? err)
    }
  }

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
  let audioPath: string | null = null
  try {
    await downloadMessageToFile(client, msg, tmp)
    // Extract a tiny audio track so large videos (>25 MB) transcribe fine; fall
    // back to sending the video directly if ffmpeg is unavailable.
    audioPath = await extractAudio(tmp)
    const { transcript, segments } = audioPath
      ? await transcribeFile(audioPath, 'clip.mp3')
      : await transcribeFile(tmp, 'clip.mp4')
    let translationUz: string | null = null
    if (translate && transcript) {
      // Translation is best-effort — never let it fail the transcription.
      translationUz = await translateToUzbek(transcript).catch(() => null)
    }
    return { transcript, segments, translationUz }
  } finally {
    await fsp.unlink(tmp).catch(() => {})
    if (audioPath) await fsp.unlink(audioPath).catch(() => {})
  }
}

export async function adminListClips() {
  return prisma.shadowingClip.findMany({
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    include: { category: true, _count: { select: { completions: true } } },
  })
}
