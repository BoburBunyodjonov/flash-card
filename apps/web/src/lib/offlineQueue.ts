// Generic offline action queue.
//
// Any mutating action that is safe to replay later (i.e. it only references
// IDs that already exist on the server) can be queued here when the request
// fails due to lack of network, then replayed in order once the connection
// returns. Feed swipes keep their own dedicated queue in feed.store.ts; this
// queue covers quiz results and deck word add/remove.

export interface QueuedAction {
  id: string
  type: string
  payload: unknown
  ts: number
}

type Replayer = (payload: any) => Promise<void>

const STORAGE_KEY = 'ws_offline_actions'
const registry: Record<string, Replayer> = {}

function read(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as QueuedAction[]) : []
  } catch {
    return []
  }
}

function write(actions: QueuedAction[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actions))
  } catch {
    // storage full / unavailable — best-effort only
  }
}

/** Registers how a given action type is replayed against the API. */
export function registerReplayer(type: string, fn: Replayer) {
  registry[type] = fn
}

/** Appends an action to the offline queue. */
export function enqueueAction(type: string, payload: unknown) {
  const actions = read()
  // A small random suffix avoids collisions when several actions queue in the
  // same millisecond (Date.now() alone is not unique enough here).
  actions.push({ id: `${type}-${Date.now()}-${actions.length}`, type, payload, ts: Date.now() })
  write(actions)
}

export function pendingActionCount(): number {
  return read().length
}

/**
 * True when a request error is a network failure (no HTTP response) rather than
 * a server-side rejection. Network failures are retried; 4xx/5xx are dropped.
 */
export function isNetworkError(err: any): boolean {
  return Boolean(err) && !err.response
}

/**
 * Replays queued actions in FIFO order. Drops actions the server rejects (4xx/5xx
 * — replaying them again would never succeed) and stops at the first network
 * error so the rest are retried on the next flush. Safe to call repeatedly.
 */
export async function flushOfflineQueue() {
  let actions = read()
  while (actions.length > 0) {
    const [next, ...rest] = actions
    const replay = registry[next.type]
    // Replayer not registered yet (its api module hasn't loaded) — stop and keep
    // the action so it isn't silently dropped; the next flush will pick it up.
    if (!replay) break
    try {
      await replay(next.payload)
    } catch (err: any) {
      if (isNetworkError(err)) break // still offline — keep it, retry later
      // else: server rejected it (e.g. deck/word deleted) — drop and continue
    }
    actions = rest
    write(actions)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineQueue()
  })
}
