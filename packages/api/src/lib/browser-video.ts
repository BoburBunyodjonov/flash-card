import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** Codecs / containers that work in Telegram WebView + common mobile browsers. */
const OK_VIDEO = new Set(['h264', 'avc', 'avc1', 'vp8', 'vp9', 'av1'])
const OK_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac'])
const OK_FORMAT = new Set(['mp4', 'mov', 'm4v', 'webm'])

const inflight = new Map<string, Promise<string>>()

export interface VideoProbe {
  format: string
  videoCodec: string | null
  audioCodec: string | null
  durationSec: number | null
  playable: boolean
}

export async function probeBrowserVideo(filePath: string): Promise<VideoProbe | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=format_name,duration:stream=codec_type,codec_name',
        '-of', 'json',
        filePath,
      ],
      { timeout: 60_000 },
    )
    const data = JSON.parse(stdout)
    const formatRaw = String(data?.format?.format_name ?? '')
    const formats = formatRaw.split(',').map((s: string) => s.trim().toLowerCase())
    const streams = (data?.streams ?? []) as Array<{ codec_type?: string; codec_name?: string }>
    const videoCodec =
      streams.find((s) => s.codec_type === 'video')?.codec_name?.toLowerCase() ?? null
    const audioCodec =
      streams.find((s) => s.codec_type === 'audio')?.codec_name?.toLowerCase() ?? null
    const durationSec = Number(data?.format?.duration)
    const formatOk = formats.some((f) => OK_FORMAT.has(f))
    const videoOk = !!videoCodec && OK_VIDEO.has(videoCodec)
    const audioOk = !audioCodec || OK_AUDIO.has(audioCodec)
    return {
      format: formatRaw,
      videoCodec,
      audioCodec,
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
      playable: formatOk && videoOk && audioOk,
    }
  } catch {
    return null
  }
}

function playablePath(inputPath: string, hd = false): string {
  const suffix = hd ? '.playable.hd.mp4' : '.playable.mp4'
  if (inputPath.endsWith(suffix)) return inputPath
  // Strip an already-applied SD suffix before appending an HD one (and vice versa).
  const base = inputPath.replace(/\.playable(\.hd)?\.mp4$/, '')
  return `${base}${suffix}`
}

// SD caps the long edge at 1280 (lighter for free/limited connections); HD at
// 1920 with a lower CRF. Only used on a real transcode — H.264 sources are
// remuxed at their original resolution regardless of profile.
const PROFILES = {
  sd: { scale: 1280, crf: '23' },
  hd: { scale: 1920, crf: '20' },
} as const

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''
    ff.stderr?.on('data', (chunk: Buffer) => {
      err += chunk.toString()
      if (err.length > 4000) err = err.slice(-2000)
    })
    ff.on('error', reject)
    ff.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-500)}`))
    })
  })
}

/**
 * Ensures the file is browser-playable (H.264/AAC MP4 when needed).
 * Returns the path to serve. Original Telegram download is left in place.
 */
export async function ensureBrowserPlayable(
  inputPath: string,
  opts: { hd?: boolean } = {},
): Promise<string> {
  const probe = await probeBrowserVideo(inputPath)
  if (probe?.playable) return inputPath

  const hd = !!opts.hd
  const out = playablePath(inputPath, hd)
  if (await exists(out)) {
    const outProbe = await probeBrowserVideo(out)
    if (outProbe?.playable) return out
  }
  // If HD wasn't requested but an HD variant already exists, reuse it — no need
  // to spend CPU on a lower-quality copy of something we already have.
  if (!hd) {
    const hdOut = playablePath(inputPath, true)
    if (await exists(hdOut)) {
      const hdProbe = await probeBrowserVideo(hdOut)
      if (hdProbe?.playable) return hdOut
    }
  }

  const key = `${inputPath}::${hd ? 'hd' : 'sd'}`
  const existing = inflight.get(key)
  if (existing) return existing

  const profile = hd ? PROFILES.hd : PROFILES.sd
  const task = (async () => {
    const tmp = `${out}.${process.pid}.tmp.mp4`
    try {
      // Prefer fast remux when the video is already H.264 (wrong container only).
      if (probe?.videoCodec && OK_VIDEO.has(probe.videoCodec)) {
        try {
          await runFfmpeg([
            '-y', '-i', inputPath,
            '-map', '0:v:0', '-map', '0:a:0?',
            '-c', 'copy',
            '-movflags', '+faststart',
            tmp,
          ])
          const remuxed = await probeBrowserVideo(tmp)
          if (remuxed?.playable) {
            await fs.rename(tmp, out)
            return out
          }
        } catch {
          /* fall through to transcode */
        }
        await fs.unlink(tmp).catch(() => {})
      }

      // Full transcode → H.264 + AAC MP4 (Telegram WebView / Chrome safe).
      await runFfmpeg([
        '-y', '-i', inputPath,
        '-map', '0:v:0', '-map', '0:a:0?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', profile.crf,
        '-vf', `scale='min(${profile.scale},iw)':-2`,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-movflags', '+faststart',
        tmp,
      ])
      await fs.rename(tmp, out)
      return out
    } catch (err) {
      await fs.unlink(tmp).catch(() => {})
      throw err
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task)
  return task
}

export function contentTypeForVideo(filePath: string): string {
  if (filePath.endsWith('.webm')) return 'video/webm'
  if (filePath.endsWith('.mp4') || filePath.endsWith('.m4v') || filePath.endsWith('.mov')) {
    return 'video/mp4'
  }
  return 'video/mp4'
}
