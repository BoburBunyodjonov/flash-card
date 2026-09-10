import { api } from './client'

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type MediaKind = 'cinema' | 'shadowing'
export type PlaylistType = 'cinema' | 'shadowing' | 'mixed'

export interface PlaylistItem {
  id: string
  kind: MediaKind
  clipId: string
  order: number
  title: string | null
  level: CefrLevel | null
  durationSec: number | null
  completed: boolean
  available: boolean
}

export interface PlaylistDTO {
  id: string
  title: string
  description: string | null
  coverUrl: string | null
  type: PlaylistType
  level: CefrLevel | null
  isPublished: boolean
  order: number
  itemCount: number
  /** True when a teacher assigned this series to one of the learner's groups. */
  assigned?: boolean
  items?: PlaylistItem[]
}

export const playlistApi = {
  list: (): Promise<PlaylistDTO[]> =>
    api.get('/api/playlists').then((r) => r.data.data as PlaylistDTO[]),
  get: (id: string): Promise<PlaylistDTO> =>
    api.get(`/api/playlists/${id}`).then((r) => r.data.data as PlaylistDTO),
}
