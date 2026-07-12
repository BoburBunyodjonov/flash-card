import { create } from 'zustand'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'ws_theme'

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* ignore */ }
  return 'system'
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? systemTheme() : mode
}

export function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode)
  document.documentElement.setAttribute('data-theme', resolved)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#101614' : '#F3F6F4')
  }
  // Telegram WebApp chrome if available
  try {
    const tg = window.Telegram?.WebApp as
      | { setHeaderColor?: (c: string) => void; setBackgroundColor?: (c: string) => void }
      | undefined
    tg?.setHeaderColor?.(resolved === 'dark' ? '#101614' : '#F3F6F4')
    tg?.setBackgroundColor?.(resolved === 'dark' ? '#101614' : '#F3F6F4')
  } catch { /* ignore */ }
  return resolved
}

interface ThemeState {
  mode: ThemeMode
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
  init: () => () => void
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'system',
  resolved: 'light',

  setMode: (mode) => {
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* ignore */ }
    const resolved = applyTheme(mode)
    set({ mode, resolved })
  },

  init: () => {
    const mode = readStoredMode()
    const resolved = applyTheme(mode)
    set({ mode, resolved })

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (get().mode === 'system') {
        set({ resolved: applyTheme('system') })
      }
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  },
}))
