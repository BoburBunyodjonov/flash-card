import { promises as fs } from 'node:fs'
import path from 'node:path'
import { config } from '../config'

/**
 * Transient on-disk cache for Cinema videos (separate from Shadowing so the two
 * features don't thrash each other's LRU).
 */

const dir = config.cinema.cacheDir
const maxBytes = config.cinema.cacheMaxBytes
const inflight = new Map<string, Promise<string>>()

function filePath(clipId: string): string {
  return path.join(dir, `${clipId}.bin`)
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function evict(keep: string): Promise<void> {
  try {
    const names = await fs.readdir(dir)
    const stats = await Promise.all(
      names.map(async (name) => {
        const full = path.join(dir, name)
        try {
          const st = await fs.stat(full)
          return { full, size: st.size, mtime: st.mtimeMs }
        } catch {
          return null
        }
      }),
    )
    const files = stats.filter((s): s is NonNullable<typeof s> => s !== null)
    let total = files.reduce((sum, f) => sum + f.size, 0)
    if (total <= maxBytes) return
    files.sort((a, b) => a.mtime - b.mtime)
    for (const f of files) {
      if (total <= maxBytes) break
      if (f.full === keep) continue
      try {
        await fs.unlink(f.full)
        total -= f.size
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* best-effort */
  }
}

export async function getCachedCinemaClip(
  clipId: string,
  download: (destPath: string) => Promise<void>,
): Promise<string> {
  await ensureDir()
  const dest = filePath(clipId)

  if (await exists(dest)) {
    const now = new Date()
    fs.utimes(dest, now, now).catch(() => {})
    return dest
  }

  const existing = inflight.get(clipId)
  if (existing) return existing

  const task = (async () => {
    const tmp = `${dest}.${process.pid}.tmp`
    try {
      await download(tmp)
      await fs.rename(tmp, dest)
      await evict(dest)
      return dest
    } catch (err) {
      await fs.unlink(tmp).catch(() => {})
      throw err
    } finally {
      inflight.delete(clipId)
    }
  })()

  inflight.set(clipId, task)
  return task
}

export async function dropCachedCinemaClip(clipId: string): Promise<void> {
  await fs.unlink(filePath(clipId)).catch(() => {})
  await fs.unlink(`${filePath(clipId)}.playable.mp4`).catch(() => {})
  await fs.unlink(`${filePath(clipId)}.playable.hd.mp4`).catch(() => {})
}

/** True when the raw clip is already on disk (used for status reporting). */
export async function isCinemaClipCached(clipId: string): Promise<boolean> {
  return exists(filePath(clipId))
}
