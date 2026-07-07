import bigInt from 'big-integer'
import { createWriteStream, statSync } from 'node:fs'
import { once } from 'node:events'
import { config } from '../config'

/**
 * Lazily-connected GramJS (MTProto) **user** client, used ONLY by the Shadowing
 * feature to read video files out of a private Telegram channel — which bypasses
 * the Bot API's 20 MB download cap (MTProto allows up to ~2 GB).
 *
 * If MTProto isn't configured (no api id/hash/session) every call returns null
 * and the rest of the API keeps working untouched — same philosophy as the bot.
 */

// GramJS types are heavy; we keep this module loosely typed on purpose.
type TgClient = any
type TgMessage = any

let clientPromise: Promise<TgClient | null> | null = null
let cachedChannel: any = null

export function isMtprotoConfigured(): boolean {
  return !!(config.telegram.apiId && config.telegram.apiHash && config.telegram.session)
}

async function createClient(): Promise<TgClient | null> {
  if (!isMtprotoConfigured()) return null
  const { TelegramClient } = await import('telegram')
  const { StringSession } = await import('telegram/sessions')
  const session = new StringSession(config.telegram.session)
  const client = new TelegramClient(session, config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 5,
    autoReconnect: true,
  })
  try {
    ;(client as any).setLogLevel?.('error')
  } catch {
    /* older GramJS lacks setLogLevel */
  }
  await client.connect()
  return client
}

/** Returns the shared connected client, or null when MTProto isn't set up. */
export async function getTgClient(): Promise<TgClient | null> {
  if (!clientPromise) {
    clientPromise = createClient().catch((err) => {
      // Reset so a later request can retry the connection.
      clientPromise = null
      console.error('[mtproto] connect failed:', err?.message ?? err)
      return null
    })
  }
  return clientPromise
}

function channelRef(): string | ReturnType<typeof bigInt> {
  const raw = config.shadowing.channel
  // Numeric channel id (e.g. -1001234567890) → bigInt; else @username / t.me link.
  if (/^-?\d+$/.test(raw)) return bigInt(raw)
  return raw
}

/**
 * Resolves the configured shadowing channel to a GramJS entity, warming the
 * dialog cache once if a private-channel id can't be resolved directly.
 */
export async function getShadowingChannel(client: TgClient): Promise<any> {
  if (cachedChannel) return cachedChannel
  const ref = channelRef()
  try {
    cachedChannel = await client.getEntity(ref)
  } catch {
    // Private channels by numeric id may not be in the entity cache yet.
    await client.getDialogs({ limit: 500 })
    cachedChannel = await client.getEntity(ref)
  }
  return cachedChannel
}

export interface VideoMeta {
  messageId: number
  caption: string
  date: number // unix seconds
  durationSec: number | null
  width: number | null
  height: number | null
  fileName: string | null
  mimeType: string | null
  size: number // bytes
}

/** Pulls the video document + its attributes off a channel message. */
export function extractVideoMeta(msg: TgMessage): VideoMeta | null {
  const doc = msg?.media?.document
  if (!doc) return null
  const attrs: any[] = doc.attributes ?? []
  const video = attrs.find((a) => a.className === 'DocumentAttributeVideo')
  const file = attrs.find((a) => a.className === 'DocumentAttributeFilename')
  const mime: string = doc.mimeType ?? ''
  // Only treat actual videos as shadowing candidates.
  if (!video && !mime.startsWith('video/')) return null
  return {
    messageId: msg.id,
    caption: msg.message ?? '',
    date: typeof msg.date === 'number' ? msg.date : Number(msg.date ?? 0),
    durationSec: video ? Math.round(video.duration) : null,
    width: video?.w ?? null,
    height: video?.h ?? null,
    fileName: file?.fileName ?? null,
    mimeType: mime || 'video/mp4',
    size: doc.size ? bigInt(doc.size).toJSNumber() : 0,
  }
}

/** Recent video messages from the channel (for the admin picker). */
export async function listChannelVideos(client: TgClient, limit = 30): Promise<VideoMeta[]> {
  const { Api } = await import('telegram')
  const channel = await getShadowingChannel(client)
  const messages: TgMessage[] = await client.getMessages(channel, {
    limit,
    filter: new Api.InputMessagesFilterVideo(),
  })
  return messages
    .map((m) => extractVideoMeta(m))
    .filter((m): m is VideoMeta => m !== null)
}

/** Fetches a single channel message by id (throws if missing). */
export async function getChannelMessage(client: TgClient, messageId: number): Promise<TgMessage> {
  const channel = await getShadowingChannel(client)
  const messages: TgMessage[] = await client.getMessages(channel, { ids: [messageId] })
  const msg = messages?.[0]
  if (!msg || !msg.media) throw new Error(`Message ${messageId} not found or has no media`)
  return msg
}

/** Downloads the smallest thumbnail of a video message as a data URI (or null). */
export async function getVideoThumbDataUri(client: TgClient, msg: TgMessage): Promise<string | null> {
  try {
    const buf: Buffer | undefined = await client.downloadMedia(msg, { thumb: 0 })
    if (!buf || !buf.length) return null
    return `data:image/jpeg;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * A GramJS "writer" backed by a real fs stream. Two reasons we don't just pass a
 * string path to downloadMedia:
 *  1. Backpressure — GramJS awaits `write()`, so awaiting `drain` here bounds
 *     memory instead of buffering the whole file.
 *  2. Flush guarantee — GramJS resolves without waiting for the fd to flush, so
 *     we expose `whenDone()` (the stream's `finish`) to await a complete file
 *     before we stat/serve it. Without this a fast reader could see a truncated
 *     video.
 */
class FileWriter {
  private stream: ReturnType<typeof createWriteStream>
  private ended = false
  private finished: Promise<void>
  constructor(path: string) {
    this.stream = createWriteStream(path)
    this.finished = new Promise<void>((resolve, reject) => {
      this.stream.once('finish', () => resolve())
      this.stream.once('error', reject)
    })
  }
  async write(chunk: Buffer): Promise<void> {
    if (!this.stream.write(chunk)) await once(this.stream, 'drain')
  }
  // GramJS calls this in its `finally`; guarded so our extra call is a no-op.
  close(): void {
    if (this.ended) return
    this.ended = true
    this.stream.end()
  }
  whenDone(): Promise<void> {
    return this.finished
  }
}

/**
 * Streams a message's video to a local file (never fully in memory) and waits
 * for it to be completely flushed to disk. Returns the byte size written.
 */
export async function downloadMessageToFile(
  client: TgClient,
  msg: TgMessage,
  destPath: string,
): Promise<number> {
  const writer = new FileWriter(destPath)
  await client.downloadMedia(msg, { outputFile: writer as any })
  writer.close() // insurance in case GramJS didn't
  await writer.whenDone()
  return statSync(destPath).size
}
