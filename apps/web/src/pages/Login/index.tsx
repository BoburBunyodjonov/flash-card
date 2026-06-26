import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Flame, Brain, Trophy, WifiOff, Zap } from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'
import { useTelegram } from '../../hooks/useTelegram'

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

export function LoginPage() {
  const { t } = useTranslation()
  const { loginWebApp, isLoading, loginError } = useAuthStore()
  const { isInsideTelegram, initData } = useTelegram()

  useEffect(() => {
    if (isInsideTelegram && initData) {
      window.Telegram?.WebApp?.ready()
      window.Telegram?.WebApp?.expand()
      loginWebApp(initData).catch(console.error)
    }
  }, [isInsideTelegram, initData])

  return (
    <div className="h-full relative overflow-hidden flex flex-col items-center justify-center px-6" style={{ background: 'var(--ws-bg)' }}>

      {/* Floating word cards in background */}
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

      {/* Soft glow orbs */}
      <div className="absolute top-[-8%] left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)', filter: 'blur(50px)' }} />
      <div className="absolute bottom-[-12%] right-[-10%] w-80 h-80 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', filter: 'blur(50px)' }} />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-8 text-center max-w-sm w-full"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0, rotate: -18 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 16 }}
          className="relative"
        >
          <div
            className="w-[5.5rem] h-[5.5rem] rounded-[1.6rem] flex items-center justify-center ws-glow-primary ws-gradient-bg"
          >
            <Zap size={42} strokeWidth={2.2} className="text-white" fill="currentColor" />
          </div>
        </motion.div>

        {/* Title */}
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-[2.75rem] font-black tracking-tight ws-gradient-text leading-none">{t('login.title')}</h1>
          <p className="text-base max-w-[16rem]" style={{ color: 'var(--ws-muted)' }}>{t('login.subtitle')}</p>
        </div>

        {/* Stats row */}
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

        {/* Features */}
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

        {/* CTA */}
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
            <motion.button
              whileTap={{ scale: 0.97 }}
              whileHover={{ scale: 1.015 }}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 font-bold text-base px-8 py-4 rounded-btn disabled:opacity-50 text-white ws-gradient-bg ws-glow-primary"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.012 9.478c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.48 14.425l-2.94-.917c-.64-.203-.653-.64.136-.948l11.491-4.43c.532-.194 1.001.13.395.948z" />
              </svg>
              {t('login.button')}
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  )
}
