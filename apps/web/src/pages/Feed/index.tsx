import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useFeedStore } from '../../store/feed.store'
import { useAuthStore } from '../../store/auth.store'
import { SwipeCard } from '../../components/SwipeCard'
import { useTelegram } from '../../hooks/useTelegram'

function useCountdownToMidnight() {
  const [hoursLeft, setHoursLeft] = useState(0)
  const [minutesLeft, setMinutesLeft] = useState(0)

  useEffect(() => {
    const update = () => {
      const now = new Date()
      const midnight = new Date()
      midnight.setHours(24, 0, 0, 0)
      const diff = midnight.getTime() - now.getTime()
      setHoursLeft(Math.floor(diff / (1000 * 60 * 60)))
      setMinutesLeft(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)))
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [])

  return { hoursLeft, minutesLeft }
}

export function FeedPage() {
  const { t } = useTranslation()
  const { words, currentIndex, stats, isLoading, isLimitReached, isEmpty, loadFeed, swipe, nextCard } = useFeedStore()
  const { user } = useAuthStore()
  const { haptic } = useTelegram()
  const { hoursLeft, minutesLeft } = useCountdownToMidnight()
  const [shared, setShared] = useState(false)

  useEffect(() => { loadFeed() }, [])

  const currentWord = words[currentIndex]
  const nextWord = words[currentIndex + 1]

  const handleSwipe = async (direction: 'left' | 'right' | 'up' | 'down') => {
    if (!currentWord) return
    if (direction === 'down') { haptic.impact('light'); nextCard(); return }
    if (direction === 'right') haptic.success()
    else if (direction === 'left') haptic.impact('medium')
    else if (direction === 'up') haptic.impact('light')
    await swipe(currentWord.id, direction as 'left' | 'right' | 'up')
    nextCard()
  }

  const handleShare = () => {
    const streak = user?.streak ?? 0
    const learned = stats?.learnedToday ?? 0
    const msg = `🔥 Bugun WordSwipe da ${learned} ta yangi so'z o'rgandim!\n⚡ ${streak} kunlik streak\n\nSen ham sinab ko'r 👇\nt.me/WordSwipeBot`
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=t.me/WordSwipeBot&text=${encodeURIComponent(msg)}`)
    } else {
      navigator.clipboard?.writeText(msg)
    }
    setShared(true)
    haptic.success()
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center animated-gradient">
        <div className="flex flex-col items-center gap-5">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-primary/30" />
            <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <div className="absolute inset-3 rounded-full flex items-center justify-center text-2xl">⚡</div>
          </div>
          <p className="text-white/40 text-sm font-medium">Loading your feed...</p>
        </div>
      </div>
    )
  }

  const progressPct = stats ? Math.min(100, (stats.usedToday / stats.dailyLimit) * 100) : 0

  if (isEmpty) {
    return (
      <div className="h-full flex flex-col items-center justify-center animated-gradient px-6 text-center gap-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="text-7xl"
        >
          📚
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="text-2xl font-black text-white">So'zlar topilmadi</h2>
          <p className="text-white/40 text-sm mt-2">Hozircha o'rganadigan so'z yo'q</p>
        </motion.div>
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => loadFeed()}
          className="glass rounded-2xl px-6 py-3 text-white/70 font-semibold text-sm"
        >
          🔄 Qayta yuklash
        </motion.button>
      </div>
    )
  }

  if (isLimitReached) {
    return (
      <div className="h-full flex flex-col items-center justify-center animated-gradient px-6 text-center gap-5 overflow-y-auto no-scrollbar pb-24">

        {/* Celebration emoji */}
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="text-8xl"
        >
          🎉
        </motion.div>

        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2 className="text-3xl font-black gradient-text">{t('feed.limitReached')}</h2>
          <p className="text-white/40 text-sm mt-1">{t('feed.limitMsg')}</p>
        </motion.div>

        {/* Today's stats */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25 }}
            className="glass rounded-3xl px-8 py-5 flex gap-8 w-full max-w-xs justify-center"
          >
            <div className="text-center">
              <p className="text-3xl font-black text-primary">{stats.learnedToday}</p>
              <p className="text-xs text-white/30 mt-1 font-medium">bugun o'rgandim</p>
            </div>
            <div className="w-px bg-white/10" />
            <div className="text-center">
              <p className="text-3xl font-black text-warning">{user?.streak ?? 0}</p>
              <p className="text-xs text-white/30 mt-1 font-medium">{t('feed.streak')}</p>
            </div>
          </motion.div>
        )}

        {/* Countdown to tomorrow */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="rounded-2xl px-6 py-4 flex items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span className="text-2xl">⏰</span>
          <div>
            <p className="text-white/40 text-xs">Yangi so'zlar ochilishiga</p>
            <p className="font-black text-white text-lg">
              {hoursLeft} soat {minutesLeft} daqiqa qoldi
            </p>
          </div>
        </motion.div>

        {/* Share button */}
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleShare}
          className="w-full max-w-xs rounded-2xl py-3.5 font-bold text-base flex items-center justify-center gap-2"
          style={{ background: shared ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.06)', border: `1px solid ${shared ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.1)'}`, color: shared ? '#34d399' : 'rgba(255,255,255,0.7)' }}
        >
          {shared ? '✓ Ulashildi!' : '📤 Do\'stlarga ulash'}
        </motion.button>

        {/* Premium CTA */}
        {!user?.isPremium && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            whileTap={{ scale: 0.96 }}
            className="w-full max-w-xs font-bold text-lg px-8 py-4 rounded-2xl text-white glow-purple"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            ⚡ Cheksiz o'rganish — Premium
          </motion.button>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#0a0a14' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.div className="flex items-center gap-2 glass rounded-full px-3 py-1.5" whileTap={{ scale: 0.94 }}>
          <motion.span
            className="text-base"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
          >
            🔥
          </motion.span>
          <span className="text-white font-black text-sm">{user?.streak ?? 0}</span>
          <span className="text-white/30 text-xs">{t('feed.streak')}</span>
        </motion.div>

        {stats && (
          <div className="flex items-center gap-2.5">
            <div className="relative h-2 rounded-full overflow-hidden w-28"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: 'linear-gradient(90deg, #6366f1, #a78bfa)' }}
                animate={{ width: `${progressPct}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
            <span className="text-white/40 text-xs font-semibold tabular-nums">
              {stats.remaining} {t('feed.wordsLeft')}
            </span>
          </div>
        )}
      </div>

      {/* Card stack */}
      <div className="flex-1 relative mx-4 mb-24">
        <AnimatePresence>
          {nextWord && (
            <SwipeCard key={`bg-${currentIndex + 1}`} word={nextWord} isTop={false} onSwipe={() => {}} />
          )}
          {currentWord && (
            <SwipeCard key={`card-${currentIndex}`} word={currentWord} isTop={true} onSwipe={handleSwipe} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
