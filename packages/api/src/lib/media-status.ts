import { redis } from './redis'

/**
 * Coarse warm-up phase for a video clip so the web player can show
 * "downloading / preparing" instead of a blank spinner while the server pulls
 * the file from Telegram and transcodes it to a browser-playable MP4.
 */
export type MediaPhase = 'idle' | 'downloading' | 'transcoding' | 'ready' | 'error'

export type MediaKind = 'cinema' | 'shadowing'

const KEY = (kind: MediaKind, id: string) => `media:status:${kind}:${id}`
const TTL_SEC = 60 * 30

export async function setMediaPhase(
  kind: MediaKind,
  id: string,
  phase: MediaPhase,
): Promise<void> {
  try {
    if (phase === 'ready' || phase === 'idle') {
      await redis.del(KEY(kind, id))
    } else {
      await redis.set(KEY(kind, id), phase, 'EX', TTL_SEC)
    }
  } catch {
    /* status is best-effort */
  }
}

/** Returns the transient phase flag (empty when none is set). */
export async function getMediaPhase(kind: MediaKind, id: string): Promise<MediaPhase | null> {
  try {
    return (await redis.get(KEY(kind, id))) as MediaPhase | null
  } catch {
    return null
  }
}
