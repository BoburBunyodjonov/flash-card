/** Zustand persist kaliti (auth.store) */
export const AUTH_STORAGE_KEY = 'auth'

export function clearAuthSession(): void {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem(AUTH_STORAGE_KEY)
}
