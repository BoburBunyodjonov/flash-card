import { api } from './client'

export type StarsPlan = 'monthly' | 'yearly'

export interface PlanInfo {
  prices: {
    monthly: { uzs: number; usd: number }
    annual: { uzs: number; usd: number }
    lifetime: { uzs: number; usd: number }
    stars: { monthly: number; yearly: number }
    discountPercent: number
    trialDays: number
  }
  limits: Record<string, number | boolean>
}

export const paymentsApi = {
  /** Public plan info (prices incl. Telegram Stars, free limits). */
  getPlan: () => api.get('/api/settings/plan').then((r) => r.data.data as PlanInfo),

  /** Creates a Telegram Stars invoice link for the chosen plan. */
  createInvoice: (plan: StarsPlan) =>
    api.post('/api/payments/invoice', { plan }).then((r) => r.data.data as { link: string }),
}
