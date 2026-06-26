import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Flame, BarChart3, Layers, NotebookPen, BookOpen, RefreshCw, ArrowLeft,
  Plus, Clock, Share2, Check, Sparkles, Target, Zap,
} from 'lucide-react'
import { useFeedStore } from '../../store/feed.store'
import { useAuthStore } from '../../store/auth.store'
import { SwipeCard } from '../../components/SwipeCard'
import { useTelegram } from '../../hooks/useTelegram'
import { categoriesApi, type Category } from '../../api/categories.api'
import { profileApi } from '../../api/profile.api'
import { PremiumModal } from '../../components/PremiumModal'

function useCountdownToMidnight() {
  const [hoursLeft, setHoursLeft]     = useState(0)
  const [minutesLeft, setMinutesLeft] = useState(0)

  useEffect(() => {
    const update = () => {
      const now      = new Date()
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

export function FeedPage({ onChallenge, onMyWords, onProgress }: { onChallenge?: () => void; onMyWords?: () => void; onProgress?: () => void }) {
  const { t } = useTranslation()
  const { words, currentIndex, stats, isLoading, isLimitReached, isEmpty, loadFeed, swipe, nextCard, selectedCategoryId, setCategory } = useFeedStore()
  const { user } = useAuthStore()
  const { haptic } = useTelegram()
  const { hoursLeft, minutesLeft } = useCountdownToMidnight()
  const [shared, setShared] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [premiumOpen, setPremiumOpen] = useState(false)

  useEffect(() => {
    categoriesApi.getAll().then(setCategories).catch(() => {})
  }, [])

  useEffect(() => { loadFeed() }, [])

  const currentWord = words[currentIndex]
  const nextWord    = words[currentIndex + 1]
  const afterNext   = words[currentIndex + 2]

  const handleSwipe = async (direction: 'left' | 'right' | 'up' | 'down') => {
    if (!currentWord) return
    // Up = skip (just advance, nothing saved); Down = save (bookmark, backend 'up')
    if (direction === 'up') { haptic.impact('light'); nextCard(); return }
    if (direction === 'right') haptic.success()
    else if (direction === 'left') haptic.impact('medium')
    else if (direction === 'down') haptic.impact('light')
    const backendDir = direction === 'down' ? 'up' : direction
    await swipe(currentWord.id, backendDir as 'left' | 'right' | 'up')
    nextCard()
  }

  const handleShare = async () => {
    const streak  = user?.streak ?? 0
    const learned = stats?.learnedToday ?? 0
    // Personal referral link → both sides earn XP and bonus words from the share
    const referral = await profileApi.getReferral().catch(() => null)
    const link = referral?.link ?? `https://t.me/WordSwipeBot?start=${referral?.startParam ?? ''}`
    const msg = `🔥 Bugun WordSwipe da ${learned} ta yangi so'z o'rgandim!\n⚡ ${streak} kunlik streak\n\n🎁 Shu havola orqali qo'shilsang, ikkalamiz ham +10 bonus so'z olamiz 👇\n${link}`
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(msg)}`)
    } else {
      navigator.clipboard?.writeText(msg)
    }
    setShared(true)
    haptic.success()
  }

  // ── LOADING ──
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center animated-gradient">
        <div className="flex flex-col items-center gap-6">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(99,102,241,0.15)' }} />
            <div className="absolute inset-0 rounded-full animate-spin" style={{ border: '2px solid transparent', borderTopColor: '#6366f1' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Zap size={18} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
            </div>
          </div>
          <p className="text-sm font-medium tracking-wide" style={{ color: 'var(--ws-faint)' }}>{t('feed.loading')}</p>
        </div>
      </div>
    )
  }

  const progressPct = stats ? Math.min(100, (stats.usedToday / stats.dailyLimit) * 100) : 0

  // ── EMPTY ──
  if (isEmpty) {
    const isPersonal = selectedCategoryId === 'personal'
    return (
      <div className="h-full flex flex-col items-center justify-center px-8 text-center gap-5" style={{ background: 'var(--ws-bg)' }}>
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220 }}
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
        >
          {isPersonal
            ? <NotebookPen size={34} strokeWidth={1.8} style={{ color: 'var(--ws-primary-light)' }} />
            : <BookOpen size={34} strokeWidth={1.8} style={{ color: 'var(--ws-primary-light)' }} />}
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <h2 className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>
            {isPersonal ? t('feed.myWordsEmptyTitle') : t('feed.emptyTitle')}
          </h2>
          <p className="text-sm mt-2" style={{ color: 'var(--ws-muted)' }}>
            {isPersonal ? t('feed.myWordsEmptyDesc') : t('feed.emptyDesc')}
          </p>
        </motion.div>

        {/* Personal filter with no words → let the user add one right away */}
        {isPersonal && (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            whileTap={{ scale: 0.95 }}
            onClick={onMyWords}
            className="w-full max-w-xs py-4 rounded-btn font-bold text-base text-white flex items-center justify-center gap-2 ws-gradient-bg ws-glow-primary"
          >
            <Plus size={18} strokeWidth={2.4} /> {t('feed.addWord')}
          </motion.button>
        )}

        {/* Always offer a way out: back to the full feed if filtered, else reload */}
        {selectedCategoryId ? (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setCategory(null)}
            className="rounded-btn px-6 py-3 font-semibold text-sm flex items-center gap-2 ws-card-2"
            style={{ color: 'var(--ws-muted)' }}
          >
            <ArrowLeft size={16} strokeWidth={2.2} /> {t('feed.backToAll')}
          </motion.button>
        ) : (
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => loadFeed()}
            className="rounded-btn px-6 py-3 font-semibold text-sm flex items-center gap-2 ws-card-2"
            style={{ color: 'var(--ws-muted)' }}
          >
            <RefreshCw size={16} strokeWidth={2.2} /> {t('feed.reload')}
          </motion.button>
        )}
      </div>
    )
  }

  // ── LIMIT REACHED ──
  if (isLimitReached) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center gap-5 overflow-y-auto no-scrollbar pb-24" style={{ background: 'var(--ws-bg)' }}>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)' }}
        >
          <Check size={38} strokeWidth={2.2} style={{ color: 'var(--ws-success)' }} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <h2 className="text-3xl font-black ws-gradient-text">{t('feed.limitReached')}</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--ws-muted)' }}>{t('feed.limitMsg')}</p>
        </motion.div>

        {stats && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.22 }}
            className="ws-card px-8 py-5 flex gap-8 w-full max-w-xs justify-center"
          >
            <div className="text-center">
              <p className="text-3xl font-black" style={{ color: 'var(--ws-primary-light)' }}>{stats.learnedToday}</p>
              <p className="text-xs mt-1 font-medium" style={{ color: 'var(--ws-faint)' }}>{t('feed.learnedToday')}</p>
            </div>
            <div className="w-px" style={{ background: 'var(--ws-border)' }} />
            <div className="text-center">
              <p className="text-3xl font-black" style={{ color: 'var(--ws-warning)' }}>{user?.streak ?? 0}</p>
              <p className="text-xs mt-1 font-medium" style={{ color: 'var(--ws-faint)' }}>{t('feed.streak')}</p>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
          className="ws-card-2 px-5 py-4 flex items-center gap-3 w-full max-w-xs"
        >
          <Clock size={22} strokeWidth={2} style={{ color: 'var(--ws-muted)' }} />
          <div className="text-left">
            <p className="text-xs mb-0.5" style={{ color: 'var(--ws-faint)' }}>{t('feed.unlockIn')}</p>
            <p className="font-black text-base" style={{ color: 'var(--ws-text)' }}>
              {hoursLeft} {t('feed.hours')} {minutesLeft} {t('feed.minutes')}
            </p>
          </div>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          whileTap={{ scale: 0.96 }}
          onClick={onChallenge}
          className="w-full max-w-xs py-4 rounded-btn font-bold text-base flex items-center justify-center gap-2 text-white"
          style={{ background: 'linear-gradient(135deg, #F59E0B, #F97316)', boxShadow: '0 8px 28px rgba(245,158,11,0.3)' }}
        >
          <Target size={18} strokeWidth={2.4} /> {t('practice.challenge.title')}
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleShare}
          className="w-full max-w-xs rounded-btn py-3.5 font-bold text-sm flex items-center justify-center gap-2"
          style={{
            background: shared ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${shared ? 'rgba(16,185,129,0.28)' : 'var(--ws-border)'}`,
            color: shared ? 'var(--ws-success)' : 'var(--ws-muted)',
          }}
        >
          {shared
            ? <><Check size={16} strokeWidth={2.4} /> {t('feed.shared')}</>
            : <><Share2 size={16} strokeWidth={2} /> {t('feed.shareFriends')}</>}
        </motion.button>

        {!user?.isPremium && (
          <motion.button
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => { haptic.impact('medium'); setPremiumOpen(true) }}
            className="w-full max-w-xs font-bold text-base px-8 py-4 rounded-btn text-white flex items-center justify-center gap-2 ws-gradient-bg ws-glow-primary"
          >
            <Sparkles size={18} strokeWidth={2.2} /> {t('feed.unlimitedPremium')}
          </motion.button>
        )}

        <PremiumModal open={premiumOpen} onClose={() => setPremiumOpen(false)} />
      </div>
    )
  }

  // ── MAIN FEED ──
  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--ws-bg)' }}>

      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0">

        {/* Streak pill */}
        <motion.div
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full shrink-0"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
          whileTap={{ scale: 0.93 }}
        >
          <Flame size={15} strokeWidth={2.2} style={{ color: 'var(--ws-warning)' }} />
          <span className="font-black text-sm tabular-nums" style={{ color: 'var(--ws-warning)' }}>{user?.streak ?? 0}</span>
        </motion.div>

        {/* Progress — fills available space */}
        {stats && (
          <div className="flex-1 flex items-center gap-2.5 min-w-0">
            <div className="relative h-1.5 flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full ws-gradient-bg"
                animate={{ width: `${progressPct}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
            <span className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--ws-muted)' }}>
              {stats.remaining} {t('feed.wordsLeft')}
            </span>
          </div>
        )}

        {/* Stats / profile button → Progress page */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={onProgress}
          aria-label={t('nav.progress')}
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}
        >
          <BarChart3 size={18} strokeWidth={2} style={{ color: 'var(--ws-muted)' }} />
        </motion.button>
      </div>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar px-4 pb-2 shrink-0" style={{ touchAction: 'pan-x' }}>
          {/* "All" chip */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => !selectedCategoryId || setCategory(null)}
            className="shrink-0 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1.5"
            style={!selectedCategoryId
              ? { background: 'var(--ws-gradient)', color: '#fff', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }
              : { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)', color: 'var(--ws-muted)' }
            }
          >
            <Layers size={14} strokeWidth={2.2} />
            {t('feed.all')}
          </motion.button>
          {/* "My Words" chip — switches the feed to only the user's own added words */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={() => selectedCategoryId !== 'personal' && setCategory('personal')}
            className="shrink-0 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1.5"
            style={selectedCategoryId === 'personal'
              ? { background: 'var(--ws-gradient)', color: '#fff', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }
              : { background: 'var(--ws-card-2)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--ws-primary-light)' }
            }
          >
            <NotebookPen size={14} strokeWidth={2.2} />
            {t('feed.myWords')}
          </motion.button>
          {categories.map(cat => {
            const isActive = selectedCategoryId === cat.id
            return (
              <motion.button
                key={cat.id}
                whileTap={{ scale: 0.93 }}
                onClick={() => !isActive && setCategory(cat.id)}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-1.5"
                style={isActive
                  ? { background: 'var(--ws-gradient)', color: '#fff', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }
                  : { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)', color: 'var(--ws-muted)' }
                }
              >
                {cat.icon && <span className="text-[13px] leading-none">{cat.icon}</span>}
                {cat.nameUz}
              </motion.button>
            )
          })}
        </div>
      )}

      {/* Card stack */}
      <div className="flex-1 relative mx-4 mb-24">

        {/* Third depth card (static, non-interactive) */}
        {afterNext && (
          <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
            transform: 'scale(0.87) translateY(38px)',
            background: 'linear-gradient(145deg, #111120, #0d0d1c)',
            border: '1px solid rgba(255,255,255,0.03)',
            opacity: 0.5,
          }} />
        )}

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
