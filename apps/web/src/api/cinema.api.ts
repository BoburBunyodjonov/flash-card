import { api } from './client'

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type CinemaVisibility = 'private' | 'global'

export interface CinemaWordAnno {
  text: string
  translation?: string
  difficulty?: CefrLevel
  hard?: boolean
}

export interface CinemaSegment {
  start: number
  end: number
  text: string
  translation?: string
  words?: CinemaWordAnno[]
}

export interface CinemaClipDTO {
  id: string
  title: string
  durationSec: number | null
  transcript: string
  translationUz: string
  segments: CinemaSegment[] | null
  level: CefrLevel
  categoryId: string | null
  visibility: CinemaVisibility
  hasEmbeddedSubtitles: boolean
  isMine: boolean
  completed: boolean
  completedCount: number
  vocabularyCount?: number
}

export interface CinemaVocabWord {
  word: string
  level: CefrLevel
  translationUz: string
  count: number
  /** Line from the video used to pick the sense. */
  example?: string
}

export interface CinemaClipDetail extends CinemaClipDTO {
  streamPath: string
  /** Whether this viewer's stream is served in HD (premium / admin-enabled). */
  hd?: boolean
}

export interface CinemaCompleteResult {
  xpEarned: number
  completedCount: number
}

export type MediaPhase = 'idle' | 'downloading' | 'transcoding' | 'ready' | 'error'

const API_BASE = import.meta.env.VITE_API_URL || ''

export function buildCinemaStreamUrl(streamPath: string): string {
  if (/^https?:\/\//i.test(streamPath)) return streamPath
  const base = API_BASE || window.location.origin
  return new URL(streamPath, base).toString()
}

export const cinemaApi = {
  status: () =>
    api.get('/api/cinema/status').then((r) => r.data.data as { ready: boolean; transcribeReady: boolean }),

  list: (opts?: { level?: CefrLevel; mineOnly?: boolean }): Promise<CinemaClipDTO[]> =>
    api
      .get('/api/cinema', {
        params: {
          ...(opts?.level ? { level: opts.level } : {}),
          ...(opts?.mineOnly ? { mineOnly: '1' } : {}),
        },
      })
      .then((r) => r.data.data as CinemaClipDTO[]),

  get: (id: string): Promise<CinemaClipDetail> =>
    api.get(`/api/cinema/${id}`).then((r) => r.data.data as CinemaClipDetail),

  clipStatus: (id: string): Promise<MediaPhase> =>
    api.get(`/api/cinema/${id}/status`).then((r) => (r.data.data?.phase ?? 'idle') as MediaPhase),

  complete: (id: string): Promise<CinemaCompleteResult> =>
    api.post(`/api/cinema/${id}/complete`).then((r) => r.data.data as CinemaCompleteResult),

  words: (id: string, level?: CefrLevel): Promise<CinemaVocabWord[]> =>
    api
      .get(`/api/cinema/${id}/words`, { params: level ? { level } : {} })
      .then((r) => r.data.data as CinemaVocabWord[]),

  saveWord: (
    id: string,
    word: string,
  ): Promise<{ saved: boolean; alreadyHad: boolean; word: string; translation: string }> =>
    api
      .post(`/api/cinema/${id}/words/save`, { word })
      .then(
        (r) =>
          r.data.data as {
            saved: boolean
            alreadyHad: boolean
            word: string
            translation: string
          },
      ),

  share: (id: string): Promise<{ link: string | null; startParam: string }> =>
    api.get(`/api/cinema/${id}/share`).then((r) => r.data.data),

  delete: (id: string) => api.delete(`/api/cinema/${id}`),

  upload: (form: FormData): Promise<CinemaClipDTO> =>
    api
      .post('/api/cinema/upload', form, {
        timeout: 10 * 60 * 1000,
        transformRequest: [
          (data, headers) => {
            // Default client sets application/json — strip it so the browser
            // adds multipart/form-data with the correct boundary.
            if (headers && typeof headers === 'object') {
              delete (headers as Record<string, unknown>)['Content-Type']
            }
            return data
          },
        ],
      })
      .then((r) => r.data.data as CinemaClipDTO),
}
