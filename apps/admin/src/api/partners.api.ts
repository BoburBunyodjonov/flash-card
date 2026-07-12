import { api } from './client'

export type ConnectorType = 'manual' | 'generic_rest' | 'edupage'
export type PartnerAccessMode = 'benefit_only' | 'whitelist'

export interface Partner {
  id: string
  name: string
  slug: string
  status: 'active' | 'suspended'
  accessMode: PartnerAccessMode
  premiumIncluded: boolean
  apiKeyPrefix: string
  webhookUrl: string | null
  connector: ConnectorType
  enrollmentsCount: number
  staffCount?: number
  groupsCount?: number
  webhookDeliveriesCount?: number
  createdAt: string
}

export interface PartnerDetail extends Partner {
  hasWebhookSecret: boolean
  metadata: Record<string, unknown>
}

export interface WebhookDelivery {
  id: string
  event: string
  success: boolean
  statusCode: number | null
  error: string | null
  durationMs: number | null
  createdAt: string
}

export interface CreatePartnerInput {
  name: string
  slug?: string
  accessMode?: PartnerAccessMode
  premiumIncluded?: boolean
  webhookUrl?: string | null
  webhookSecret?: string | null
  metadata?: Record<string, unknown>
}

export const partnersApi = {
  list: () => api.get('/api/admin/partners').then((r) => r.data.data as Partner[]),
  get: (id: string) => api.get(`/api/admin/partners/${id}`).then((r) => r.data.data as PartnerDetail),
  create: (data: CreatePartnerInput) =>
    api.post('/api/admin/partners', data).then((r) => r.data as { data: Partner & { apiKey: string }; warning: string }),
  update: (id: string, data: Partial<CreatePartnerInput> & { status?: 'active' | 'suspended' }) =>
    api.patch(`/api/admin/partners/${id}`, data).then((r) => r.data.data),
  rotateKey: (id: string) =>
    api.post(`/api/admin/partners/${id}/rotate-key`).then((r) => r.data as { data: { apiKey: string }; warning: string }),
  testWebhook: (id: string) =>
    api.post(`/api/admin/partners/${id}/test-webhook`).then((r) => r.data.data as WebhookDelivery | null),
  sync: (id: string, mode: 'upsert' | 'replace' = 'upsert') =>
    api.post(`/api/admin/partners/${id}/sync`, { mode }).then((r) => r.data.data),
  webhooks: (id: string) =>
    api.get(`/api/admin/partners/${id}/webhooks`).then((r) => r.data.data as WebhookDelivery[]),
  integrationKit: (id: string, apiKey?: string) =>
    api
      .post(`/api/admin/partners/${id}/integration-kit`, apiKey ? { apiKey } : {})
      .then((r) => r.data.data as { filename: string; files: Record<string, string> }),
  analytics: (id: string) =>
    api.get(`/api/admin/partners/${id}/analytics`).then((r) => r.data.data as PartnerAnalytics),
  groupProgress: (id: string, groupExternalId: string) =>
    api
      .get(`/api/admin/partners/${id}/groups/${encodeURIComponent(groupExternalId)}/learners/progress`)
      .then((r) => r.data.data as GroupLearnersProgress),
}

export interface PartnerAnalyticsOverview {
  students_total: number
  students_active: number
  students_linked: number
  students_unlinked: number
  link_rate: number
  staff_count: number
  groups_count: number
  active_last_7_days: number
  avg_xp: number
  avg_streak: number
}

export interface PartnerGroupRow {
  external_id: string
  name: string
  teacher_external_id: string | null
  teacher_name: string | null
  students_total: number
  students_linked: number
}

export interface PartnerAnalytics {
  partner: { id: string; name: string; slug: string; status: string }
  overview: PartnerAnalyticsOverview
  groups: PartnerGroupRow[]
}

export interface LearnerProgressRow {
  external_id: string
  first_name: string | null
  last_name: string | null
  phone: string
  linked: boolean
  streak: number
  xp: number
  words_count: number
  words_due: number
  last_active: string | null
}

export interface GroupLearnersProgress {
  group_external_id: string
  group_name: string
  learners: LearnerProgressRow[]
}
