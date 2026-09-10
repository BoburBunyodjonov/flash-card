import { api } from './client'

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface ShadowingWordAnno {
  text: string
  translation?: string
  difficulty?: CefrLevel
  hard?: boolean
}

/** One timed line of the transcript (for per-segment shadowing repeat). */
export interface ShadowingSegment {
  start: number
  end: number
  text: string
  translation?: string
  words?: ShadowingWordAnno[]
}

export interface ShadowingVocabWord {
  word: string
  level: CefrLevel
  translationUz: string
  count: number
  /** Line from the video used to pick the sense. */
  example?: string
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
  vocabularyCount?: number
}

/** Detail view adds the tokenised stream path for the <video> element. */
export interface ShadowingClipDetail extends ShadowingClipDTO {
  streamPath: string
  hd?: boolean
}

export interface ShadowingCompleteResult {
  xpEarned: number
  completedCount: number
}

export type MediaPhase = 'idle' | 'downloading' | 'transcoding' | 'ready' | 'error'

export interface SpeakResult {
  score: number
  passed: boolean
  heard: string
  passedCount: number
  totalSegments: number
  allDone: boolean
  xpEarned: number
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

  clipStatus: (id: string): Promise<MediaPhase> =>
    api.get(`/api/shadowing/${id}/status`).then((r) => (r.data.data?.phase ?? 'idle') as MediaPhase),

  complete: (id: string): Promise<ShadowingCompleteResult> =>
    api.post(`/api/shadowing/${id}/complete`).then((r) => r.data.data as ShadowingCompleteResult),

  words: (id: string, level?: CefrLevel): Promise<ShadowingVocabWord[]> =>
    api
      .get(`/api/shadowing/${id}/words`, { params: level ? { level } : {} })
      .then((r) => r.data.data as ShadowingVocabWord[]),

  saveWord: (
    id: string,
    word: string,
  ): Promise<{ saved: boolean; alreadyHad: boolean; word: string; translation: string }> =>
    api
      .post(`/api/shadowing/${id}/words/save`, { word })
      .then((r) => r.data.data),

  share: (id: string): Promise<{ link: string | null; startParam: string }> =>
    api.get(`/api/shadowing/${id}/share`).then((r) => r.data.data),

  speak: (id: string, segmentIndex: number, audio: Blob): Promise<SpeakResult> => {
    const form = new FormData()
    form.append('segmentIndex', String(segmentIndex))
    form.append('audio', audio, 'speak.webm')
    return api
      .post(`/api/shadowing/${id}/speak`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data as SpeakResult)
  },
}
