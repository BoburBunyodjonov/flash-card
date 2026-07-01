import { api } from './client'

export interface ReportUser {
  id: string
  firstName: string
  lastName: string | null
  username: string | null
  speakingBannedUntil: string | null
}

export interface SpeakingReport {
  id: string
  reason: string
  createdAt: string
  resolvedAt: string | null
  resolution: string | null
  sessionId: string
  reporter: ReportUser
  accused: ReportUser
}

export interface ReportsResponse {
  reports: SpeakingReport[]
  total: number
  openCount: number
  page: number
  limit: number
}

export const speakingApi = {
  reports: (params?: Record<string, unknown>) =>
    api.get<{ data: ReportsResponse }>('/api/admin/speaking/reports', { params }).then((r) => r.data.data),
  resolve: (id: string, resolution?: string) =>
    api.post(`/api/admin/speaking/reports/${id}/resolve`, { resolution }).then((r) => r.data),
  banUser: (userId: string, days: number) =>
    api.post(`/api/admin/speaking/users/${userId}/ban`, { days }).then((r) => r.data),
}
