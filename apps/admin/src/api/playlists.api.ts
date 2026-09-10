import { api } from './client'

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type MediaKind = 'cinema' | 'shadowing'
export type PlaylistType = 'cinema' | 'shadowing' | 'mixed'

export interface PlaylistItem {
  id: string
  kind: MediaKind
  clipId: string
  order: number
  title: string | null
  level: CEFRLevel | null
  durationSec: number | null
  completed: boolean
  available: boolean
}

export interface Playlist {
  id: string
  title: string
  description: string | null
  coverUrl: string | null
  type: PlaylistType
  level: CEFRLevel | null
  isPublished: boolean
  order: number
  itemCount: number
  items?: PlaylistItem[]
}

export interface PlaylistInput {
  title: string
  description?: string | null
  coverUrl?: string | null
  type?: PlaylistType
  level?: CEFRLevel | null
  isPublished?: boolean
  order?: number
}

export const playlistsApi = {
  list: () => api.get('/api/admin/playlists').then((r) => r.data.data as Playlist[]),
  get: (id: string) =>
    api.get(`/api/admin/playlists/${id}`).then((r) => r.data.data as Playlist),
  create: (data: PlaylistInput) =>
    api.post('/api/admin/playlists', data).then((r) => r.data.data as Playlist),
  update: (id: string, data: Partial<PlaylistInput>) =>
    api.patch(`/api/admin/playlists/${id}`, data).then((r) => r.data.data as Playlist),
  setItems: (id: string, items: Array<{ kind: MediaKind; clipId: string }>) =>
    api.put(`/api/admin/playlists/${id}/items`, { items }).then((r) => r.data.data as Playlist),
  delete: (id: string) => api.delete(`/api/admin/playlists/${id}`),
}
