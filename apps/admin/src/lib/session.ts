/** Zustand persist kaliti (auth.store) */
export const ADMIN_AUTH_STORAGE_KEY = 'admin-auth'

export function clearAdminSession(): void {
  localStorage.removeItem('admin_token')
  localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY)
}
