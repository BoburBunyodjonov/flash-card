import { api } from './client'

export const authApi = {
  loginWebApp: (initData: string) =>
    api.post('/api/auth/webapp', { initData }).then((r) => r.data.data),

  loginWidget: (data: Record<string, string>) =>
    api.post('/api/auth/telegram', data).then((r) => r.data.data),
}
