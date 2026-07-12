/** WordSwipe Integration API — har qanday ERP bilan ulanish uchun standart shartnoma */

export const INTEGRATION_API_VERSION = 'v1' as const

export const ENROLLMENT_STATUSES = ['active', 'inactive'] as const
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number]

export const PARTNER_ACCESS_MODES = ['benefit_only', 'whitelist'] as const
export type PartnerAccessMode = (typeof PARTNER_ACCESS_MODES)[number]

export const SYNC_MODES = ['upsert', 'replace'] as const
export type SyncMode = (typeof SYNC_MODES)[number]

/** ERP dan keladigan o'quvchi yozuvi */
export interface IntegrationLearnerInput {
  external_id: string
  phone: string
  first_name?: string
  last_name?: string
  status?: EnrollmentStatus
  group?: {
    external_id?: string
    name?: string
  }
  metadata?: Record<string, unknown>
}

export interface IntegrationSyncResult {
  created: number
  updated: number
  deactivated: number
  unchanged: number
  errors: IntegrationSyncError[]
}

export interface IntegrationSyncError {
  external_id: string
  code: string
  message: string
}

export const INTEGRATION_ERROR_CODES = {
  INVALID_PHONE: 'INVALID_PHONE',
  DUPLICATE_EXTERNAL_ID: 'DUPLICATE_EXTERNAL_ID',
  DUPLICATE_PHONE: 'DUPLICATE_PHONE',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
} as const

/** Outbound webhook eventlari (WordSwipe → ERP) */
export const INTEGRATION_WEBHOOK_EVENTS = [
  'webhook.test',
  'learner.linked',
  'learner.deactivated',
  'learner.progress.snapshot',
  'staff.linked',
  'word_pack.published',
] as const
export type IntegrationWebhookEvent = (typeof INTEGRATION_WEBHOOK_EVENTS)[number]

export const STAFF_ROLES = ['teacher', 'admin'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export const CONNECTOR_TYPES = ['manual', 'generic_rest', 'edupage'] as const
export type ConnectorType = (typeof CONNECTOR_TYPES)[number]

export interface IntegrationStaffInput {
  external_id: string
  phone: string
  first_name?: string
  last_name?: string
  role?: StaffRole
  status?: EnrollmentStatus
  metadata?: Record<string, unknown>
}

export interface IntegrationGroupInput {
  external_id: string
  name: string
  teacher_external_id?: string
  status?: EnrollmentStatus
  metadata?: Record<string, unknown>
}

export interface IntegrationStaffSyncResult {
  created: number
  updated: number
  deactivated: number
  unchanged: number
  errors: IntegrationSyncError[]
}

export interface IntegrationGroupSyncResult extends IntegrationStaffSyncResult {}

/** CRM switch — GET/PATCH /settings */
export interface IntegrationPartnerSettings {
  partner_slug: string
  partner_name: string
  integration_enabled: boolean
  premium_included: boolean
  access_mode: PartnerAccessMode
}

export interface IntegrationGroupListItem {
  external_id: string
  name: string
  teacher_external_id: string | null
  teacher_name: string | null
  students_total: number
  students_linked: number
}

export interface IntegrationGroupSummary {
  group: {
    external_id: string
    name: string
    status: string
    teacher_external_id: string | null
    teacher_name: string | null
  }
  students_total: number
  students_linked: number
  students_unlinked: number
  active_last_7_days: number
  avg_xp: number
  avg_streak: number
  avg_words_count: number
  total_words_due: number
  link_rate: number
}

export interface IntegrationLearnerProgress {
  external_id: string
  first_name: string | null
  last_name: string | null
  phone: string
  linked: boolean
  user_id: string | null
  streak: number
  xp: number
  words_count: number
  words_due: number
  last_active: string | null
}
