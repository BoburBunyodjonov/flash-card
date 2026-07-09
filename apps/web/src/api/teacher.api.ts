import { api } from './client'

export interface TeacherGroup {
  external_id: string
  name: string
  students_count: number
}

export interface TeacherProfile {
  staff_id: string
  partner_id: string
  partner_name: string
  partner_slug: string
  role: string
  groups: TeacherGroup[]
}

export interface WordPackItem {
  id: string
  word: string
  translation: string
  pronunciation: string | null
  definitionEn: string | null
  exampleEn: string | null
}

export interface WordPack {
  id: string
  title: string
  groupExternalId: string
  status: 'draft' | 'published'
  publishedAt: string | null
  items: WordPackItem[]
  _count?: { items: number }
}

export const teacherApi = {
  context: () =>
    api.get('/api/teacher/context').then((r) => r.data.data as { profiles: TeacherProfile[] }),

  packs: (staffId: string) =>
    api.get('/api/teacher/packs', { params: { staff_id: staffId } }).then((r) => r.data.data as WordPack[]),

  createPack: (data: { staff_id: string; title: string; group_external_id: string }) =>
    api.post('/api/teacher/packs', data).then((r) => r.data.data as WordPack),

  addWords: (packId: string, words: { word: string; translation: string }[]) =>
    api.post(`/api/teacher/packs/${packId}/words`, { words }).then((r) => r.data.data as WordPack),

  publish: (packId: string) =>
    api.post(`/api/teacher/packs/${packId}/publish`).then((r) => r.data.data),
}
