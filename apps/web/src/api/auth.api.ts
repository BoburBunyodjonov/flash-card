import { api } from './client'

export const authApi = {
  getPublicConfig: () =>
    api.get('/api/auth/public-config').then(
      (r) => r.data.data as { telegram_bot_username: string | null; app_url: string },
    ),

  loginWebApp: (initData: string) =>
    api.post('/api/auth/webapp', { initData }).then((r) => r.data.data),

  loginWidget: (data: Record<string, string>) =>
    api.post('/api/auth/telegram', data).then((r) => r.data.data),

  loginPhone: (data: { phone: string; password: string }) =>
    api.post('/api/auth/login', data).then((r) => r.data.data),

  registerPhone: (data: { phone: string; password: string; firstName: string }) =>
    api.post('/api/auth/register', data).then((r) => r.data.data),
}
