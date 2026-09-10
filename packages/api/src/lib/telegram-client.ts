import bigInt from 'big-integer'
import { createWriteStream, statSync } from 'node:fs'
import { once } from 'node:events'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { config } from '../config'

const execFileAsync = promisify(execFile)

/**
 * Lazily-connected GramJS (MTProto) **user** client, used by Shadowing / Cinema
 * to read (and upload) video files in private Telegram channels — bypasses the
 * Bot API's 20 MB download cap (MTProto allows up to ~2 GB).
 *
 * If MTProto isn't configured (no api id/hash/session) every call returns null
 * and the rest of the API keeps working untouched — same philosophy as the bot.
 */

// GramJS types are heavy; we keep this module loosely typed on purpose.
type TgClient = any
type TgMessage = any

let clientPromise: Promise<TgClient | null> | null = null
const channelCache = new Map<string, any>()

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
      clientPromise = null
      console.error('[mtproto] connect failed:', err?.message ?? err)
      return null
    })
  }
  return clientPromise
}

function channelRef(channelId: string): string | ReturnType<typeof bigInt> {
  const raw = channelId.trim()
  if (/^-?\d+$/.test(raw)) return bigInt(raw)
  return raw
}

/**
 * Resolves a channel (@username or numeric id) to a GramJS entity.
 * Cached per channel id string.
 */
export async function getChannel(client: TgClient, channelId: string): Promise<any> {
  const key = channelId.trim()
  if (!key) throw new Error('Channel id is empty')
  if (channelCache.has(key)) return channelCache.get(key)

  const ref = channelRef(key)
  let entity: any
  try {
    entity = await client.getEntity(ref)
  } catch {
    await client.getDialogs({ limit: 500 })
    entity = await client.getEntity(ref)
  }
  channelCache.set(key, entity)
  return entity
}

/** @deprecated Prefer getChannel(client, config.shadowing.channel) */
export async function getShadowingChannel(client: TgClient): Promise<any> {
  return getChannel(client, config.shadowing.channel)
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

function looksLikeVideoFile(fileName: string | null | undefined, mime: string): boolean {
  const name = (fileName ?? '').toLowerCase()
  const extOk = /\.(mp4|webm|mov|mkv|m4v|avi)$/i.test(name)
  return mime.startsWith('video/') || extOk
}

/** Pulls the video document + its attributes off a channel message. */
export function extractVideoMeta(msg: TgMessage): VideoMeta | null {
  const doc = msg?.media?.document
  if (!doc) return null
  const attrs: any[] = doc.attributes ?? []
  const video = attrs.find((a) => a.className === 'DocumentAttributeVideo')
  const file = attrs.find((a) => a.className === 'DocumentAttributeFilename')
  const mime: string = doc.mimeType ?? ''
  const fileName: string | null = file?.fileName ?? null
  // Accept native videos AND files uploaded as Telegram "documents" (.mp4 etc.).
  if (!video && !looksLikeVideoFile(fileName, mime)) return null
  return {
    messageId: msg.id,
    caption: msg.message ?? '',
    date: typeof msg.date === 'number' ? msg.date : Number(msg.date ?? 0),
    durationSec: video ? Math.round(video.duration) : null,
    width: video?.w ?? null,
    height: video?.h ?? null,
    fileName,
    mimeType: mime.startsWith('video/') ? mime : 'video/mp4',
    size: doc.size ? bigInt(doc.size).toJSNumber() : 0,
  }
}

async function probeVideo(filePath: string): Promise<{ duration: number; w: number; h: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height:format=duration',
        '-of', 'json',
        filePath,
      ],
      { timeout: 30_000 },
    )
    const data = JSON.parse(stdout)
    const stream = data?.streams?.[0] ?? {}
    const duration = Math.max(1, Math.round(Number(data?.format?.duration) || 1))
    const w = Math.max(1, Number(stream.width) || 720)
    const h = Math.max(1, Number(stream.height) || 1280)
    return { duration, w, h }
  } catch {
    return null
  }
}

/** Recent video messages from a channel (for admin / user pickers). */
export async function listChannelVideos(
  client: TgClient,
  limit = 30,
  channelId: string = config.shadowing.channel,
): Promise<VideoMeta[]> {
  const { Api } = await import('telegram')
  const channel = await getChannel(client, channelId)

  const byId = new Map<number, VideoMeta>()

  // Native Telegram "video" posts
  const videoMsgs: TgMessage[] = await client.getMessages(channel, {
    limit,
    filter: new Api.InputMessagesFilterVideo(),
  })
  for (const m of videoMsgs) {
    const meta = extractVideoMeta(m)
    if (meta) byId.set(meta.messageId, meta)
  }

  // Fallback: recent messages (videos often arrive as documents / files)
  if (byId.size === 0) {
    const recent: TgMessage[] = await client.getMessages(channel, { limit: Math.max(limit, 50) })
    for (const m of recent) {
      const meta = extractVideoMeta(m)
      if (meta) byId.set(meta.messageId, meta)
    }
  }

  return [...byId.values()].sort((a, b) => b.messageId - a.messageId).slice(0, limit)
}

/** Fetches a single channel message by id (throws if missing). */
export async function getChannelMessage(
  client: TgClient,
  messageId: number,
  channelId: string = config.shadowing.channel,
): Promise<TgMessage> {
  const channel = await getChannel(client, channelId)
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
 * Uploads a local video file to a Telegram channel and returns its VideoMeta.
 * Forces DocumentAttributeVideo so Telegram treats it as a streamable video
 * (otherwise GramJS often posts it as a generic document → extractVideoMeta fails).
 */
export async function uploadVideoToChannel(
  client: TgClient,
  channelId: string,
  filePath: string,
  caption = '',
): Promise<VideoMeta> {
  const { Api } = await import('telegram')
  const channel = await getChannel(client, channelId)
  const probe = await probeVideo(filePath)
  const base = path.basename(filePath)
  const fileName = /\.(mp4|webm|mov|mkv|m4v|avi)$/i.test(base) ? base : `${base}.mp4`

  const result: TgMessage = await client.sendFile(channel, {
    file: filePath,
    caption: caption.slice(0, 1024),
    supportsStreaming: true,
    forceDocument: false,
    attributes: [
      new Api.DocumentAttributeVideo({
        roundMessage: false,
        supportsStreaming: true,
        duration: probe?.duration ?? 1,
        w: probe?.w ?? 720,
        h: probe?.h ?? 1280,
      }),
      new Api.DocumentAttributeFilename({ fileName }),
    ],
  })

  let meta = extractVideoMeta(result)
  if (!meta && result?.id) {
    const again: TgMessage[] = await client.getMessages(channel, { ids: [result.id] })
    meta = extractVideoMeta(again?.[0])
  }
  // Last resort: we know we uploaded a video file — accept the document row.
  if (!meta && result?.id && result?.media?.document) {
    const doc = result.media.document
    meta = {
      messageId: result.id,
      caption: result.message ?? caption,
      date: typeof result.date === 'number' ? result.date : Number(result.date ?? 0),
      durationSec: probe?.duration ?? null,
      width: probe?.w ?? null,
      height: probe?.h ?? null,
      fileName,
      mimeType: 'video/mp4',
      size: doc.size ? bigInt(doc.size).toJSNumber() : 0,
    }
  }
  if (!meta) throw new Error('Uploaded file is not a video')
  return meta
}

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
  writer.close()
  await writer.whenDone()
  return statSync(destPath).size
}
