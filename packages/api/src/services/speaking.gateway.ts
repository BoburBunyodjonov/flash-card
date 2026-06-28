import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { redis } from '../lib/redis'
import { getBot } from '../lib/bot'
import { config } from '../config'
import { addLeagueXp } from './league.service'
import {
  DIFFICULTIES,
  XP_PER_SPEAKING_MINUTE,
  SPEAKING_DAILY_XP_CAP,
} from '@wordswipe/shared'
import type { Difficulty } from '@wordswipe/shared'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from '@fastify/websocket'

// ---------------------------------------------------------------------------
// In-memory matchmaking state (prod runs a single API instance)
// ---------------------------------------------------------------------------

interface Profile {
  userId: string
  firstName: string
  avatarUrl: string | null
  cefrLevel: Difficulty | null
  gender: 'male' | 'female' | null
  xp: number
}

interface Filters {
  /** Already normalized: only true when the user has a gender set */
  sameGender: boolean
  anyLevel: boolean
}

interface QueueEntry {
  profile: Profile
  filters: Filters
  enqueuedAt: number
}

interface Call {
  sessionId: string
  userAId: string
  userBId: string
  startedAt: number
  ended: boolean
}

/** Current live socket per user (a user has at most one). */
const sockets = new Map<string, WebSocket>()
/** Users waiting for a partner. */
const queue = new Map<string, QueueEntry>()
/** userId -> active call (both participants point to the same object). */
const calls = new Map<string, Call>()

// ---------------------------------------------------------------------------
// Message schemas
// ---------------------------------------------------------------------------

const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('find'),
    filters: z
      .object({
        sameGender: z.boolean().optional(),
        anyLevel: z.boolean().optional(),
      })
      .optional(),
  }),
  z.object({ type: z.literal('cancel') }),
  z.object({ type: z.literal('signal'), payload: z.unknown() }),
  z.object({ type: z.literal('end') }),
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WS_OPEN = 1

function send(userId: string, message: Record<string, unknown>) {
  const socket = sockets.get(userId)
  if (socket && socket.readyState === WS_OPEN) {
    try {
      socket.send(JSON.stringify(message))
    } catch {
      // socket died between the check and the send — disconnect handler cleans up
    }
  }
}

function sendError(userId: string, message: string) {
  send(userId, { type: 'error', message })
}

function levelIndex(level: Difficulty | null): number | null {
  if (!level) return null
  const idx = DIFFICULTIES.indexOf(level)
  return idx === -1 ? null : idx
}

/** One side's level constraint: anyLevel disables it; null levels match anyone. */
function levelOk(constraint: Filters, own: Profile, other: Profile): boolean {
  if (constraint.anyLevel) return true
  const a = levelIndex(own.cefrLevel)
  const b = levelIndex(other.cefrLevel)
  if (a === null || b === null) return true
  return Math.abs(a - b) <= 1
}

/** One side's gender constraint (filters.sameGender is pre-normalized). */
function genderOk(constraint: Filters, own: Profile, other: Profile): boolean {
  if (!constraint.sameGender) return true
  return other.gender === own.gender
}

/** Mutual filter satisfaction. */
function compatible(a: QueueEntry, b: QueueEntry): boolean {
  return (
    levelOk(a.filters, a.profile, b.profile) &&
    levelOk(b.filters, b.profile, a.profile) &&
    genderOk(a.filters, a.profile, b.profile) &&
    genderOk(b.filters, b.profile, a.profile)
  )
}

function publicProfile(p: Profile) {
  return {
    firstName: p.firstName,
    avatarUrl: p.avatarUrl,
    cefrLevel: p.cefrLevel,
    gender: p.gender,
    xp: p.xp,
  }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, avatarUrl: true, cefrLevel: true, gender: true, xp: true },
  })
  if (!user) return null
  return {
    userId: user.id,
    firstName: user.firstName,
    avatarUrl: user.avatarUrl,
    cefrLevel: (user.cefrLevel as Difficulty | null) ?? null,
    gender: (user.gender as 'male' | 'female' | null) ?? null,
    xp: user.xp,
  }
}

/**
 * Awards XP for the call: 2 XP per full minute, capped at 30 XP/day per user.
 * The daily counter lives in Redis (`speaking:xp:{userId}:{YYYY-MM-DD}`, TTL 48h).
 */
async function awardSpeakingXp(userId: string, durationSec: number): Promise<number> {
  const earned = Math.floor(durationSec / 60) * XP_PER_SPEAKING_MINUTE
  if (earned <= 0) return 0

  const day = new Date().toISOString().slice(0, 10)
  const key = `speaking:xp:${userId}:${day}`
  const used = parseInt((await redis.get(key)) ?? '0', 10) || 0
  const grant = Math.min(earned, Math.max(0, SPEAKING_DAILY_XP_CAP - used))
  if (grant <= 0) return 0

  await redis.incrby(key, grant)
  await redis.expire(key, 48 * 3600)

  await prisma.user.update({ where: { id: userId }, data: { xp: { increment: grant } } })
  await addLeagueXp(userId, grant)
  return grant
}

/** Ends the call exactly once: persists the session, awards XP, notifies both sides. */
async function endCall(fastify: FastifyInstance, call: Call) {
  if (call.ended) return
  call.ended = true
  calls.delete(call.userAId)
  calls.delete(call.userBId)

  const durationSec = Math.max(0, Math.floor((Date.now() - call.startedAt) / 1000))

  try {
    // updateMany + status guard: a no-op if the session was already finalized
    await prisma.speakingSession.updateMany({
      where: { id: call.sessionId, status: 'active' },
      data: { status: 'ended', endedAt: new Date(), durationSec },
    })
  } catch (err) {
    fastify.log.error({ msg: 'speaking: failed to finalize session', sessionId: call.sessionId, err })
  }

  for (const userId of [call.userAId, call.userBId]) {
    let xpEarned = 0
    try {
      xpEarned = await awardSpeakingXp(userId, durationSec)
    } catch (err) {
      fastify.log.error({ msg: 'speaking: failed to award XP', userId, err })
    }
    send(userId, { type: 'ended', durationSec, xpEarned })
  }
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// "Someone wants to speak" broadcast — pings other users (dating-app style) so
// the searcher doesn't wait alone. Throttled + quiet-hours + opt-out aware.
// ---------------------------------------------------------------------------

const TASHKENT_OFFSET_H = 5
const BROADCAST_COOLDOWN_SEC = 300 // at most one ping every 5 min globally

function levelLabel(level: string | null): string {
  if (level === 'A1' || level === 'A2') return 'Beginner'
  if (level === 'C1' || level === 'C2') return 'Advanced'
  if (level === 'B1' || level === 'B2') return 'Intermediate'
  return 'Learner'
}

/** Fires a one-off broadcast inviting other users to join the searcher. */
async function maybeBroadcastSearch(fastify: FastifyInstance, userId: string): Promise<void> {
  // Quiet hours (Asia/Tashkent 22:00–08:00) — never ping people at night
  const hour = (new Date().getUTCHours() + TASHKENT_OFFSET_H) % 24
  if (hour < 8 || hour >= 22) return

  // Global cooldown so users are never spammed (SET NX EX)
  const ok = await redis.set('speaking:bcast', '1', 'EX', BROADCAST_COOLDOWN_SEC, 'NX')
  if (ok !== 'OK') return

  const bot = await getBot()
  if (!bot) return

  const searcher = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, gender: true, cefrLevel: true, xp: true },
  })
  if (!searcher) return

  const fullName = `${searcher.firstName}${searcher.lastName ? ' ' + searcher.lastName : ''}`
  const obj = searcher.gender === 'female' ? 'her' : searcher.gender === 'male' ? 'him' : 'them'
  const subj = searcher.gender === 'female' ? "she's" : searcher.gender === 'male' ? "he's" : "they're"
  const speaker = (searcher.xp ?? 0) >= 300 ? 'Top Speaker' : 'Speaker'
  const level = levelLabel(searcher.cefrLevel as string | null)
  const openUrl = `${config.telegram.appUrl}/?sp=speaking`

  // Eligible: opted-in users with a Telegram chat, excluding the searcher and
  // anyone already in a call or the queue.
  const recipients = await prisma.user.findMany({
    where: { notifyEnabled: true, id: { not: userId }, telegramId: { not: null } },
    select: { id: true, telegramId: true, firstName: true },
    take: 1000,
  })

  let sent = 0
  for (const r of recipients) {
    if (calls.has(r.id) || queue.has(r.id)) continue // already busy — skip the ping
    if (!r.telegramId) continue // phone-only users have no Telegram chat
    const rid = r.telegramId.toString()
    const text =
      `${r.firstName}, <b>${fullName}</b> won't be online much longer\n\n` +
      `Catch ${obj} while ${subj} here\n\n` +
      `${speaker} • ${level}\n\n` +
      `<i>Ready to chat?</i>`
    try {
      await bot.telegram.sendMessage(rid, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: '🎙️ Start Practice', web_app: { url: openUrl } }]] },
      })
      sent++
      if (sent % 20 === 0) await new Promise((res) => setTimeout(res, 1000)) // rate-limit
    } catch {
      // User blocked the bot / never started it — skip silently
    }
  }
  fastify.log.info({ msg: 'speaking: broadcast sent', searcher: userId, recipients: sent })
}

async function handleFind(
  fastify: FastifyInstance,
  userId: string,
  rawFilters: { sameGender?: boolean; anyLevel?: boolean } | undefined,
) {
  if (calls.has(userId)) {
    sendError(userId, 'Already in a call')
    return
  }

  const profile = await loadProfile(userId)
  if (!profile) {
    sendError(userId, 'User not found')
    return
  }

  const filters: Filters = {
    // sameGender is only honored when the user has set their own gender
    sameGender: Boolean(rawFilters?.sameGender) && profile.gender !== null,
    anyLevel: Boolean(rawFilters?.anyLevel),
  }
  const me: QueueEntry = { profile, filters, enqueuedAt: Date.now() }

  // Re-finding replaces any previous queue entry (fresh filters/profile)
  queue.delete(userId)

  // Scan for the longest-waiting compatible candidate (Map preserves insertion order)
  let match: QueueEntry | null = null
  for (const [candidateId, candidate] of queue) {
    const candidateSocket = sockets.get(candidateId)
    if (!candidateSocket || candidateSocket.readyState !== WS_OPEN) {
      queue.delete(candidateId) // stale entry
      continue
    }
    if (candidate.profile.userId !== userId && compatible(me, candidate)) {
      match = candidate
      break
    }
  }

  if (!match) {
    queue.set(userId, me)
    send(userId, { type: 'searching' })
    // After a short wait, if still searching, ping other users to come join.
    setTimeout(() => {
      if (queue.has(userId) && sockets.get(userId)?.readyState === WS_OPEN) {
        maybeBroadcastSearch(fastify, userId).catch((err) =>
          fastify.log.error({ msg: 'speaking: broadcast failed', userId, err }),
        )
      }
    }, 8000)
    return
  }

  queue.delete(match.profile.userId)

  const session = await prisma.speakingSession.create({
    data: { userAId: match.profile.userId, userBId: userId },
  })

  const call: Call = {
    sessionId: session.id,
    userAId: match.profile.userId,
    userBId: userId,
    startedAt: Date.now(),
    ended: false,
  }
  calls.set(call.userAId, call)
  calls.set(call.userBId, call)

  // Deterministic initiator: the user who just searched creates the WebRTC offer
  send(userId, {
    type: 'matched',
    sessionId: session.id,
    initiator: true,
    partner: publicProfile(match.profile),
  })
  send(match.profile.userId, {
    type: 'matched',
    sessionId: session.id,
    initiator: false,
    partner: publicProfile(profile),
  })

  fastify.log.info({ msg: 'speaking: matched', sessionId: session.id, a: call.userAId, b: call.userBId })
}

function handleSignal(userId: string, payload: unknown) {
  const call = calls.get(userId)
  if (!call || call.ended) {
    sendError(userId, 'No active call')
    return
  }
  const partnerId = call.userAId === userId ? call.userBId : call.userAId
  send(partnerId, { type: 'signal', payload })
}

async function handleEnd(fastify: FastifyInstance, userId: string) {
  const call = calls.get(userId)
  if (!call) return // already ended / never started — nothing to do
  const partnerId = call.userAId === userId ? call.userBId : call.userAId
  send(partnerId, { type: 'partner-left' })
  await endCall(fastify, call)
}

async function handleDisconnect(fastify: FastifyInstance, userId: string, socket: WebSocket) {
  // A reconnect replaced this socket — the new connection owns the state now
  if (sockets.get(userId) !== socket) return

  sockets.delete(userId)
  queue.delete(userId)

  const call = calls.get(userId)
  if (call && !call.ended) {
    const partnerId = call.userAId === userId ? call.userBId : call.userAId
    send(partnerId, { type: 'partner-left' })
    await endCall(fastify, call)
  }
}

// ---------------------------------------------------------------------------
// Connection entrypoint
// ---------------------------------------------------------------------------

export function handleSpeakingSocket(
  fastify: FastifyInstance,
  socket: WebSocket,
  req: FastifyRequest,
) {
  // Browser WebSocket can't set headers — authenticate via ?token=<accessToken>
  let userId: string
  try {
    const token = (req.query as { token?: string }).token
    if (!token) throw new Error('Missing token')
    const payload = fastify.jwt.verify<{ userId: string }>(token)
    userId = payload.userId
  } catch {
    socket.close(4401, 'Unauthorized')
    return
  }

  // Same user reconnecting: replace the old socket
  const old = sockets.get(userId)
  if (old && old !== socket) {
    sockets.set(userId, socket) // set first so the old socket's close handler is a no-op
    try {
      old.close(4000, 'Replaced by a new connection')
    } catch {
      // ignore
    }
  } else {
    sockets.set(userId, socket)
  }

  socket.on('message', (raw: Buffer | string) => {
    // The gateway must never crash the server on malformed input
    try {
      const parsed = clientMessageSchema.safeParse(JSON.parse(raw.toString()))
      if (!parsed.success) {
        sendError(userId, 'Invalid message')
        return
      }
      const msg = parsed.data
      switch (msg.type) {
        case 'find':
          handleFind(fastify, userId, msg.filters).catch((err) => {
            fastify.log.error({ msg: 'speaking: find failed', userId, err })
            sendError(userId, 'Matchmaking failed, try again')
          })
          break
        case 'cancel':
          queue.delete(userId)
          break
        case 'signal':
          handleSignal(userId, msg.payload)
          break
        case 'end':
          handleEnd(fastify, userId).catch((err) =>
            fastify.log.error({ msg: 'speaking: end failed', userId, err }),
          )
          break
      }
    } catch {
      sendError(userId, 'Invalid message')
    }
  })

  socket.on('close', () => {
    handleDisconnect(fastify, userId, socket).catch((err) =>
      fastify.log.error({ msg: 'speaking: disconnect cleanup failed', userId, err }),
    )
  })

  socket.on('error', (err: Error) => {
    fastify.log.warn({ msg: 'speaking: socket error', userId, error: err.message })
  })
}
