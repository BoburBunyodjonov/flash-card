// Explicit offline caching for Cinema / Shadowing video streams.
//
// The <video> element streams via Range requests (206), which Workbox can't
// populate a cache from at runtime. So "Save offline" fetches the FULL file
// (a plain GET → 200) and stores it in the same cache the runtime route reads,
// letting the RangeRequestsPlugin serve partials back while offline.
//
// Stream URLs carry a short-lived `?token=`, so the exact URL that was cached
// is remembered per clip and reused when playing back offline (cache key must
// match). Tokens are valid for 12h, so offline playback works within that window.

const CACHE_NAME = 'media-video-cache'
const INDEX_KEY = 'ws_offline_media'

type OfflineIndex = Record<string, { url: string; savedAt: number }>

function readIndex(): OfflineIndex {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) || '{}') as OfflineIndex
  } catch {
    return {}
  }
}

function writeIndex(idx: OfflineIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx))
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function key(kind: string, id: string): string {
  return `${kind}:${id}`
}

export function offlineSupported(): boolean {
  return typeof caches !== 'undefined' && typeof fetch !== 'undefined'
}

/** The cached stream URL for a clip, if it was saved offline. */
export function offlineUrlFor(kind: string, id: string): string | null {
  return readIndex()[key(kind, id)]?.url ?? null
}

export function isSavedOffline(kind: string, id: string): boolean {
  return !!offlineUrlFor(kind, id)
}

/** Fetches the full stream file and stores it for offline playback. */
export async function saveMediaOffline(kind: string, id: string, streamUrl: string): Promise<void> {
  if (!offlineSupported()) throw new Error('offline-unsupported')
  // No Range header → the server returns the full file as 200, which is the
  // only response the Cache API can store (206 partials can't be cached).
  const full = await fetch(streamUrl)
  if (!full.ok || full.status !== 200) throw new Error(`offline-fetch-${full.status}`)
  const cache = await caches.open(CACHE_NAME)
  await cache.put(streamUrl, full.clone())
  const idx = readIndex()
  idx[key(kind, id)] = { url: streamUrl, savedAt: Date.now() }
  writeIndex(idx)
}

export async function removeMediaOffline(kind: string, id: string): Promise<void> {
  const idx = readIndex()
  const entry = idx[key(kind, id)]
  if (entry && offlineSupported()) {
    const cache = await caches.open(CACHE_NAME)
    await cache.delete(entry.url).catch(() => {})
  }
  delete idx[key(kind, id)]
  writeIndex(idx)
}
