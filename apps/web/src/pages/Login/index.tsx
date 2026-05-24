import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/auth.store'
import { useTelegram } from '../../hooks/useTelegram'

const FLOATING_CARDS = [
  { word: 'Serendipity', emoji: '✨', color: '#a78bfa', rotate: '-12deg', x: '8%', y: '18%', delay: 0 },
  { word: 'Resilient', emoji: '💪', color: '#34d399', rotate: '8deg', x: '68%', y: '12%', delay: 0.4 },
  { word: 'Eloquent', emoji: '🗣', color: '#60a5fa', rotate: '-5deg', x: '72%', y: '55%', delay: 0.8 },
  { word: 'Ambitious', emoji: '🚀', color: '#f472b6', rotate: '10deg', x: '5%', y: '62%', delay: 0.2 },
  { word: 'Profound', emoji: '🧠', color: '#fbbf24', rotate: '-8deg', x: '38%', y: '75%', delay: 0.6 },
]

const STATS = [
  { value: '10K+', label: 'Words' },
  { value: '50K+', label: 'Learners' },
  { value: '4.9★', label: 'Rating' },
]

export function LoginPage() {
  const { t } = useTranslation()
  const { loginWebApp, isLoading } = useAuthStore()
  const { isInsideTelegram, initData } = useTelegram()

  useEffect(() => {
    if (isInsideTelegram && initData) {
      window.Telegram?.WebApp?.ready()
      window.Telegram?.WebApp?.expand()
      loginWebApp(initData).catch(console.error)
    }
  }, [isInsideTelegram, initData])

  return (
    <div className="h-full relative overflow-hidden animated-gradient flex flex-col items-center justify-center px-6">

      {/* Floating word cards in background */}
      {FLOATING_CARDS.map((card, i) => (
        <motion.div
          key={card.word}
          className="absolute pointer-events-none"
          style={{ left: card.x, top: card.y }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 0.18, scale: 1 }}
          transition={{ delay: card.delay + 0.5, duration: 0.6 }}
        >
          <div
            className={`float-${(i % 3) + 1} glass rounded-2xl px-4 py-3 flex items-center gap-2 whitespace-nowrap`}
            style={{ transform: `rotate(${card.rotate})`, borderColor: `${card.color}30` }}
          >
            <span className="text-lg">{card.emoji}</span>
            <span className="font-bold text-sm" style={{ color: card.color }}>{card.word}</span>
          </div>
        </motion.div>
      ))}

      {/* Glow orb top */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)', filter: 'blur(40px)' }} />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-7 text-center max-w-sm w-full"
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="relative"
        >
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl glow-purple"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            ⚡
          </div>
        </motion.div>

        {/* Title */}
        <div>
          <h1 className="text-5xl font-black gradient-text mb-2">WordSwipe</h1>
          <p className="text-white/50 text-base">{t('login.subtitle')}</p>
        </div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-6 glass rounded-2xl px-6 py-3 w-full justify-center"
        >
          {STATS.map((s, i) => (
            <div key={s.label} className="flex flex-col items-center">
              <span className="text-white font-black text-lg">{s.value}</span>
              <span className="text-white/40 text-xs">{s.label}</span>
            </div>
          ))}
        </motion.div>

        {/* Features */}
        <div className="flex flex-wrap justify-center gap-2">
          {[
            { icon: '🔥', text: 'Streak system' },
            { icon: '🧠', text: 'Spaced repetition' },
            { icon: '🏆', text: 'Leaderboard' },
            { icon: '📶', text: 'Offline mode' },
          ].map((f) => (
            <span key={f.text}
              className="text-xs font-semibold glass px-3 py-1.5 rounded-full text-white/70 flex items-center gap-1.5">
              {f.icon} {f.text}
            </span>
          ))}
        </div>

        {/* CTA */}
        {isInsideTelegram ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="flex gap-2 items-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-white/50 text-sm">Connecting to Telegram...</span>
            </div>
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 font-bold text-lg px-8 py-4 rounded-2xl disabled:opacity-50 text-white"
            style={{ background: 'linear-gradient(135deg, #2AABEE, #229ED9)' }}
          >
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248l-2.012 9.478c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L6.48 14.425l-2.94-.917c-.64-.203-.653-.64.136-.948l11.491-4.43c.532-.194 1.001.13.395.948z" />
            </svg>
            {t('login.button')}
          </motion.button>
        )}
      </motion.div>
    </div>
  )
}
