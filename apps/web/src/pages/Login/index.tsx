import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Flame, Brain, Trophy, WifiOff, Zap } from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'
import { useTelegram } from '../../hooks/useTelegram'
import { authApi } from '../../api/auth.api'

const FLOATING_CARDS = [
  { word: 'Serendipity', rotate: '-12deg', x: '8%', y: '16%', delay: 0 },
  { word: 'Resilient', rotate: '8deg', x: '66%', y: '11%', delay: 0.4 },
  { word: 'Eloquent', rotate: '-5deg', x: '70%', y: '54%', delay: 0.8 },
  { word: 'Ambitious', rotate: '10deg', x: '4%', y: '60%', delay: 0.2 },
  { word: 'Profound', rotate: '-8deg', x: '36%', y: '74%', delay: 0.6 },
]

const STATS = [
  { value: '10K+', key: 'login.statsWords' },
  { value: '50K+', key: 'login.statsLearners' },
  { value: '4.9', key: 'login.statsRating' },
]

const FEATURES = [
  { Icon: Flame, key: 'login.featStreak' },
  { Icon: Brain, key: 'login.featSrs' },
  { Icon: Trophy, key: 'login.featLeaderboard' },
  { Icon: WifiOff, key: 'login.featOffline' },
]

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void
  }
}

export function LoginPage() {
  const { t } = useTranslation()
  const {
    loginWebApp,
    loginWidget,
    loginPhone,
    registerPhone,
    isLoading,
    loginError,
  } = useAuthStore()
  const { isInsideTelegram, initData } = useTelegram()

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [firstName, setFirstName] = useState('')
  const [botUsername, setBotUsername] = useState<string | null>(null)
  const widgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isInsideTelegram && initData) {
      window.Telegram?.WebApp?.ready()
      window.Telegram?.WebApp?.expand()
      loginWebApp(initData).catch(console.error)
    }
  }, [isInsideTelegram, initData])

  useEffect(() => {
    if (isInsideTelegram) return
    authApi.getPublicConfig().then((cfg) => {
      setBotUsername(cfg.telegram_bot_username)
    }).catch(() => setBotUsername(null))
  }, [isInsideTelegram])

  useEffect(() => {
    if (isInsideTelegram || !botUsername || !widgetRef.current) return

    window.onTelegramAuth = (user) => {
      const payload: Record<string, string> = {}
      for (const [k, v] of Object.entries(user)) payload[k] = String(v)
      loginWidget(payload).catch(console.error)
    }

    widgetRef.current.innerHTML = ''
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    widgetRef.current.appendChild(script)

    return () => {
      delete window.onTelegramAuth
    }
  }, [botUsername, isInsideTelegram, loginWidget])

  const submitPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (mode === 'register') {
        await registerPhone({ phone, password, firstName: firstName.trim() })
      } else {
        await loginPhone({ phone, password })
      }
    } catch {
      // loginError set in store
    }
  }

  return (
    <div className="h-full relative overflow-hidden flex flex-col items-center justify-center px-6" style={{ background: 'var(--ws-bg)' }}>
      {FLOATING_CARDS.map((card, i) => (
        <motion.div
          key={card.word}
          className={`absolute pointer-events-none float-${(i % 3) + 1}`}
          style={{ left: card.x, top: card.y }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.5, scale: 1 }}
          transition={{ delay: card.delay + 0.5, duration: 0.6 }}
        >
          <div
            className="ws-card-2 rounded-btn px-3.5 py-2.5 whitespace-nowrap"
            style={{ transform: `rotate(${card.rotate})` }}
          >
            <span className="font-bold text-sm" style={{ color: 'var(--ws-faint)' }}>{card.word}</span>
          </div>
        </motion.div>
      ))}

      <div className="absolute top-[-8%] left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'rgba(45,155,111,0.14)', filter: 'blur(50px)' }} />
      <div className="absolute bottom-[-10%] left-[-8%] w-72 h-72 rounded-full pointer-events-none"
        style={{ background: 'rgba(45,155,111,0.10)', filter: 'blur(48px)' }} />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-6 text-center max-w-sm w-full"
      >
        <motion.div
          initial={{ scale: 0, rotate: -18 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 16 }}
        >
          <div className="w-[5.5rem] h-[5.5rem] rounded-[1.6rem] flex items-center justify-center ws-glow-primary ws-gradient-bg">
            <Zap size={42} strokeWidth={2.2} className="text-white" fill="currentColor" />
          </div>
        </motion.div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="ws-display text-[2.85rem] font-semibold tracking-tight ws-gradient-text leading-none">{t('login.title')}</h1>
          <p className="text-base max-w-[17rem] leading-relaxed" style={{ color: 'var(--ws-muted)' }}>{t('login.subtitle')}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="ws-card flex items-stretch w-full"
        >
          {STATS.map((s, i) => (
            <div key={s.key} className="flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-3.5 relative">
              {i > 0 && <span className="absolute left-0 top-3 bottom-3 w-px" style={{ background: 'var(--ws-border)' }} />}
              <span className="font-black text-xl tabular-nums" style={{ color: 'var(--ws-text)' }}>{s.value}</span>
              <span className="text-[11px] font-medium" style={{ color: 'var(--ws-faint)' }}>{t(s.key)}</span>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="flex flex-wrap justify-center gap-2"
        >
          {FEATURES.map(({ Icon, key }) => (
            <span
              key={key}
              className="ws-card-2 text-xs font-semibold px-3 py-2 rounded-full flex items-center gap-1.5"
              style={{ color: 'var(--ws-muted)' }}
            >
              <Icon size={14} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
              {t(key)}
            </span>
          ))}
        </motion.div>

        <div className="w-full pt-1">
          {isInsideTelegram ? (
            <div className="flex flex-col items-center gap-3 w-full">
              {loginError ? (
                <>
                  <p className="text-sm text-center" style={{ color: 'var(--ws-danger)' }}>{loginError}</p>
                  <button
                    type="button"
                    onClick={() => loginWebApp(initData).catch(() => {})}
                    className="text-sm font-semibold"
                    style={{ color: 'var(--ws-primary-light)' }}
                  >
                    {t('login.retry')}
                  </button>
                </>
              ) : (
                <div className="flex gap-2.5 items-center justify-center py-2">
                  <div className="w-5 h-5 rounded-full animate-spin" style={{ border: '2px solid var(--ws-border-strong)', borderTopColor: 'var(--ws-primary-light)' }} />
                  <span className="text-sm" style={{ color: 'var(--ws-muted)' }}>{t('login.connecting')}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="w-full flex flex-col gap-4">
              {botUsername && (
                <div className="flex flex-col items-center gap-2">
                  <div ref={widgetRef} className="min-h-[44px] flex items-center justify-center" />
                  <p className="text-xs" style={{ color: 'var(--ws-faint)' }}>{t('login.orPhone')}</p>
                </div>
              )}

              <div className="flex rounded-btn overflow-hidden" style={{ border: '1px solid var(--ws-border)' }}>
                <button
                  type="button"
                  className="flex-1 py-2.5 text-sm font-semibold"
                  style={{
                    background: mode === 'login' ? 'var(--ws-primary)' : 'transparent',
                    color: mode === 'login' ? '#FFFFFF' : 'var(--ws-muted)',
                  }}
                  onClick={() => setMode('login')}
                >
                  {t('login.tabLogin')}
                </button>
                <button
                  type="button"
                  className="flex-1 py-2.5 text-sm font-semibold"
                  style={{
                    background: mode === 'register' ? 'var(--ws-primary)' : 'transparent',
                    color: mode === 'register' ? '#FFFFFF' : 'var(--ws-muted)',
                  }}
                  onClick={() => setMode('register')}
                >
                  {t('login.tabRegister')}
                </button>
              </div>

              <form onSubmit={submitPhone} className="flex flex-col gap-3 text-left">
                {mode === 'register' && (
                  <input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder={t('login.firstName')}
                    className="w-full rounded-btn px-4 py-3 text-sm outline-none ws-input"
                  />
                )}
                <input
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={t('login.phone')}
                  className="w-full rounded-btn px-4 py-3 text-sm outline-none ws-input"
                />
                <input
                  required
                  type="password"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.password')}
                  className="w-full rounded-btn px-4 py-3 text-sm outline-none ws-input"
                />

                {loginError && (
                  <p className="text-sm text-center" style={{ color: 'var(--ws-danger)' }}>{loginError}</p>
                )}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 font-bold text-base px-8 py-4 rounded-btn disabled:opacity-50 text-[#FFFFFF] ws-gradient-bg ws-glow-primary"
                >
                  {isLoading ? t('login.connecting') : mode === 'register' ? t('login.register') : t('login.login')}
                </motion.button>
              </form>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
