declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string
        initDataUnsafe: { user?: { id: number; first_name: string }; start_param?: string }
        ready: () => void
        expand: () => void
        close: () => void
        colorScheme: 'light' | 'dark'
        themeParams: Record<string, string>
        MainButton: { text: string; show: () => void; hide: () => void; onClick: (fn: () => void) => void }
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy') => void
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void
        }
        openTelegramLink: (url: string) => void
        openInvoice: (url: string, callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void) => void
        requestContact?: (callback?: (shared: boolean) => void) => void
      }
    }
  }
}

export function useTelegram() {
  const twa = window.Telegram?.WebApp
  const isInsideTelegram = !!twa?.initData

  return {
    twa,
    isInsideTelegram,
    initData: twa?.initData ?? '',
    haptic: {
      impact: (style: 'light' | 'medium' | 'heavy' = 'light') =>
        twa?.HapticFeedback?.impactOccurred(style),
      success: () => twa?.HapticFeedback?.notificationOccurred('success'),
      error: () => twa?.HapticFeedback?.notificationOccurred('error'),
    },
  }
}
