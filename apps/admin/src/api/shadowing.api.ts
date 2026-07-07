import { api } from './client'

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface ShadowingStatus {
  ready: boolean
  transcribeReady: boolean
}

export interface TranscriptionResult {
  transcript: string
  segments: ShadowingSegment[]
  translationUz: string | null
}

export interface ChannelVideoDTO {
  messageId: number
  caption: string
  date: number // unix seconds
  durationSec: number | null
  width: number | null
  height: number | null
  fileName: string | null
  mimeType: string | null
  size: number // bytes
  thumb: string | null // data:image/jpeg;base64 URI or null
  importedClipId: string | null
}

export interface ShadowingSegment {
  start: number
  end: number
  text: string
  translation?: string
}

export interface ClipCategory {
  id: string
  nameUz: string
  nameEn?: string
  nameRu?: string
  icon?: string | null
  color?: string
}

export interface Clip {
  id: string
  title: string
  tgMessageId: number
  durationSec: number | null
  transcript: string
  translationUz: string
  segments: ShadowingSegment[] | null
  level: CEFRLevel
  categoryId: string | null
  order: number
  isPublished: boolean
  createdAt: string
  category: ClipCategory | null
  _count: { completions: number }
}

export interface ClipInput {
  tgMessageId: number
  title: string
  transcript: string
  translationUz: string
  level: CEFRLevel
  categoryId?: string | null
  durationSec?: number | null
  segments?: ShadowingSegment[] | null
  order?: number
  isPublished?: boolean
}

export type ClipUpdate = Partial<Omit<ClipInput, 'tgMessageId'>>

export const shadowingApi = {
  status: () =>
    api.get('/api/admin/shadowing/status').then((r) => r.data.data as ShadowingStatus),
  channelVideos: () =>
    api.get('/api/admin/shadowing/channel-videos').then((r) => r.data.data as ChannelVideoDTO[]),
  clips: () =>
    api.get('/api/admin/shadowing/clips').then((r) => r.data.data as Clip[]),
  transcribe: (tgMessageId: number, translate = true) =>
    api
      .post('/api/admin/shadowing/transcribe', { tgMessageId, translate })
      .then((r) => r.data.data as TranscriptionResult),
  create: (data: ClipInput) =>
    api.post('/api/admin/shadowing/clips', data).then((r) => r.data.data as Clip),
  update: (id: string, data: ClipUpdate) =>
    api.put(`/api/admin/shadowing/clips/${id}`, data).then((r) => r.data.data as Clip),
  delete: (id: string) => api.delete(`/api/admin/shadowing/clips/${id}`),
}
