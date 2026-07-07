import { promises as fs } from 'node:fs'
import path from 'node:path'
import { config } from '../config'

/**
 * Transient on-disk cache for shadowing videos. The clip library lives in
 * Telegram; this only holds recently-watched files so we don't re-download from
 * Telegram on every view/seek. It is bounded (LRU-evicted) by
 * `config.shadowing.cacheMaxBytes` — it is NOT permanent storage.
 */

const dir = config.shadowing.cacheDir
const maxBytes = config.shadowing.cacheMaxBytes

// One download per clip at a time — concurrent viewers of a cold clip share it.
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

/** Deletes least-recently-used files until the cache is under its size cap. */
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
    // Oldest first.
    files.sort((a, b) => a.mtime - b.mtime)
    for (const f of files) {
      if (total <= maxBytes) break
      if (f.full === keep) continue
      try {
        await fs.unlink(f.full)
        total -= f.size
      } catch {
        /* someone else may be reading/deleting it */
      }
    }
  } catch {
    /* eviction is best-effort */
  }
}

/**
 * Returns a local path to the fully-downloaded clip, fetching it from Telegram
 * (via `download`) on a cache miss. `download` must write the whole file to the
 * temp path it is given.
 */
export async function getCachedClip(
  clipId: string,
  download: (destPath: string) => Promise<void>,
): Promise<string> {
  await ensureDir()
  const dest = filePath(clipId)

  if (await exists(dest)) {
    // Touch so LRU treats it as recently used.
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

/** Removes a clip's cached file (e.g. after admin deletes/replaces it). */
export async function dropCachedClip(clipId: string): Promise<void> {
  await fs.unlink(filePath(clipId)).catch(() => {})
}
