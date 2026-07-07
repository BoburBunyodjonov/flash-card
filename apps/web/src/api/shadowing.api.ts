import { api } from './client'

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

/** One timed line of the transcript (for per-segment shadowing repeat). */
export interface ShadowingSegment {
  start: number
  end: number
  text: string
  translation?: string
}

/** A shadowing clip as returned by the list/detail endpoints. */
export interface ShadowingClipDTO {
  id: string
  title: string
  durationSec: number | null
  transcript: string
  translationUz: string
  segments: ShadowingSegment[] | null
  level: CefrLevel
  categoryId: string | null
  completed: boolean
  completedCount: number
}

/** Detail view adds the tokenised stream path for the <video> element. */
export interface ShadowingClipDetail extends ShadowingClipDTO {
  streamPath: string
}

export interface ShadowingCompleteResult {
  xpEarned: number
  completedCount: number
}

// Empty = same-origin (dev goes through the Vite /api proxy → localhost:3000)
const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Builds an absolute video URL from the server's `streamPath`.
 * The JWT is already embedded in the path's `?token=` query — a <video>
 * element can't send an Authorization header, which is why the token lives
 * in the URL. Do NOT add auth headers to the video request.
 */
export function buildStreamUrl(streamPath: string): string {
  if (/^https?:\/\//i.test(streamPath)) return streamPath
  const base = API_BASE || window.location.origin
  return new URL(streamPath, base).toString()
}

export const shadowingApi = {
  list: (level?: CefrLevel): Promise<ShadowingClipDTO[]> =>
    api
      .get('/api/shadowing', { params: level ? { level } : {} })
      .then((r) => r.data.data as ShadowingClipDTO[]),

  get: (id: string): Promise<ShadowingClipDetail> =>
    api.get(`/api/shadowing/${id}`).then((r) => r.data.data as ShadowingClipDetail),

  complete: (id: string): Promise<ShadowingCompleteResult> =>
    api.post(`/api/shadowing/${id}/complete`).then((r) => r.data.data as ShadowingCompleteResult),
}
