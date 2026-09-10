import { api } from './client'

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type CinemaVisibility = 'private' | 'global'

export interface CinemaStatus {
  ready: boolean
  transcribeReady: boolean
}

export interface CinemaSegment {
  start: number
  end: number
  text: string
  translation?: string
}

export interface TranscriptionResult {
  transcript: string
  segments: CinemaSegment[]
  translationUz: string | null
}

export interface ChannelVideoDTO {
  messageId: number
  caption: string
  date: number
  durationSec: number | null
  width: number | null
  height: number | null
  fileName: string | null
  mimeType: string | null
  size: number
  thumb: string | null
  importedClipId: string | null
}

export interface CinemaClip {
  id: string
  title: string
  tgMessageId: number
  durationSec: number | null
  transcript: string
  translationUz: string
  segments: CinemaSegment[] | null
  level: CEFRLevel
  categoryId: string | null
  order: number
  isPublished: boolean
  visibility: CinemaVisibility
  hasEmbeddedSubtitles: boolean
  uploadedByUserId: string | null
  createdAt: string
  category: { id: string; nameUz: string; nameEn?: string } | null
  uploadedBy: {
    id: string
    firstName: string
    lastName: string | null
    username: string | null
  } | null
  _count: { completions: number }
}

export interface CinemaClipInput {
  tgMessageId: number
  title: string
  transcript?: string
  translationUz?: string
  level?: CEFRLevel
  categoryId?: string | null
  durationSec?: number | null
  segments?: CinemaSegment[] | null
  order?: number
  isPublished?: boolean
  visibility?: CinemaVisibility
  hasEmbeddedSubtitles?: boolean
  autoTranscribe?: boolean
}

export type CinemaClipUpdate = Partial<Omit<CinemaClipInput, 'tgMessageId' | 'autoTranscribe'>>

export const cinemaApi = {
  status: () =>
    api.get('/api/admin/cinema/status').then((r) => r.data.data as CinemaStatus),
  channelVideos: () =>
    api.get('/api/admin/cinema/channel-videos').then((r) => r.data.data as ChannelVideoDTO[]),
  clips: () =>
    api.get('/api/admin/cinema/clips').then((r) => r.data.data as CinemaClip[]),
  transcribe: (tgMessageId: number, translate = true) =>
    api
      .post('/api/admin/cinema/transcribe', { tgMessageId, translate })
      .then((r) => r.data.data as TranscriptionResult),
  create: (data: CinemaClipInput) =>
    api.post('/api/admin/cinema/clips', data).then((r) => r.data.data as CinemaClip),
  update: (id: string, data: CinemaClipUpdate) =>
    api.put(`/api/admin/cinema/clips/${id}`, data).then((r) => r.data.data as CinemaClip),
  setVisibility: (id: string, visibility: CinemaVisibility) =>
    api
      .post(`/api/admin/cinema/clips/${id}/visibility`, { visibility })
      .then((r) => r.data.data as CinemaClip),
  delete: (id: string) => api.delete(`/api/admin/cinema/clips/${id}`),
}
