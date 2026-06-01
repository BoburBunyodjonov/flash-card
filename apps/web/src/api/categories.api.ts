import { api } from './client'

export interface Category {
  id: string
  nameUz: string
  nameEn: string
  icon: string | null
  color: string
  isPremium: boolean
}

export const categoriesApi = {
  getAll: (): Promise<Category[]> => api.get('/api/categories').then(r => r.data.data),
}
