import { useState, useRef, useEffect } from 'react'
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Volume2, Share2, Check, X, ArrowUp, ArrowDown, ChevronUp, NotebookPen } from 'lucide-react'
import type { FeedWord } from '@wordswipe/shared'
import { useTelegram } from '../../hooks/useTelegram'
import { playWordAudio } from '../../lib/tts'

interface Props {
  word: FeedWord
  isTop: boolean
  onSwipe: (direction: 'left' | 'right' | 'up' | 'down') => void
}

const SWIPE_THRESHOLD = 80

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  A1: { label: 'A1', color: '#6BAF8D', bg: 'rgba(107,175,141,0.14)' },
  A2: { label: 'A2', color: '#2D9B6F', bg: 'rgba(92,158,120,0.14)' },
  B1: { label: 'B1', color: '#E5A03C', bg: 'rgba(212,160,84,0.14)' },
  B2: { label: 'B2', color: '#2D9B6F', bg: 'rgba(45,155,111,0.16)' },
  C1: { label: 'C1', color: '#E07060', bg: 'rgba(198,123,102,0.14)' },
  C2: { label: 'C2', color: '#8FA896', bg: 'rgba(143,168,150,0.16)' },
}

export function SwipeCard({ word, isTop, onSwipe }: Props) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [isFlipped, setIsFlipped] = useState(false)
  const controls = useAnimation()
  const isDragging = useRef(false)
  const diff = (word.difficulty && DIFFICULTY_CONFIG[word.difficulty]) ?? DIFFICULTY_CONFIG.A1
  const isPersonal = word.source === 'personal'

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation()
    haptic.impact('light')

    const lines: string[] = []
    lines.push(`📖 ${word.word}${word.pronunciation ? '  ' + word.pronunciation : ''}`)
    if (word.partOfSpeech) lines.push(`(${word.partOfSpeech})${word.difficulty ? '  •  ' + word.difficulty : ''}`)
    lines.push('─────────────────')
    if (word.translation?.translation) lines.push(`🇺🇿  ${word.translation.translation}`)
    if (word.translation?.definitionEn) lines.push(`\n📝  ${word.translation.definitionEn}`)
    if (word.translation?.exampleEn) lines.push(`\n💬  "${word.translation.exampleEn}"`)
    lines.push('\n─────────────────')
    lines.push("🔥  WordSwipe da o'rganing → @WordSwipeBot")

    const text = lines.join('\n')

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent('https://t.me/WordSwipeBot')}&text=${encodeURIComponent(text)}`
      )
    } else {
      navigator.clipboard?.writeText(text).catch(() => {})
    }
  }

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], [-22, 22])

  const rightOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1])
  const leftOpacity  = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0])
  // Save = drag DOWN (y positive); up-drag is "skip" and shows no stamp
  const saveOpacity  = useTransform(y, [0, SWIPE_THRESHOLD], [0, 1])

  // Entrance: start from background card position, spring to full
  useEffect(() => {
    if (isTop) {
      controls.start({
        scale: 1, y: 0, opacity: 1,
        transition: { type: 'spring', stiffness: 380, damping: 30, delay: 0.02 },
      })
    }
  }, [controls, isTop])

  if (!isTop) {
    return (
      <motion.div
        className="absolute inset-0 rounded-3xl"
        initial={{ scale: 0.93, y: 20 }}
        animate={{ scale: 0.93, y: 20 }}
        exit={{ scale: 1.04, y: 0, opacity: 0, transition: { duration: 0.15 } }}
        style={{
          zIndex: 0,
          background: 'var(--ws-card)',
          border: '1px solid var(--ws-border)',
          boxShadow: 'var(--ws-shadow-card)',
        }}
      />
    )
  }

  const handleDragStart = () => { isDragging.current = true }

  const handleDragEnd = async (_: never, info: PanInfo) => {
    isDragging.current = false
    const { offset, velocity } = info
    const absX = Math.abs(offset.x)
    const absY = Math.abs(offset.y)
    const speed = Math.sqrt(velocity.x ** 2 + velocity.y ** 2)
    const overThreshold = absX > SWIPE_THRESHOLD || absY > SWIPE_THRESHOLD || speed > 500

    if (!overThreshold) {
      await controls.start({ x: 0, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 520, damping: 32 } })
      return
    }

    // Vertical swipe: personal cards only support skip (up); global cards can save (down)
    if (!isFlipped && absY > absX) {
      if (offset.y > 0 && !isPersonal) {
        await controls.start({ y: 900, opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } })
        onSwipe('down')
      } else if (offset.y < 0) {
        await controls.start({ y: -900, opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } })
        onSwipe('up')
      } else {
        await controls.start({ x: 0, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 520, damping: 32 } })
      }
    } else {
      if (offset.x > 0) {
        await controls.start({ x: 900, rotate: 25, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } })
        onSwipe('right')
      } else {
        await controls.start({ x: -900, rotate: -25, opacity: 0, transition: { duration: 0.18, ease: 'easeIn' } })
        onSwipe('left')
      }
    }
  }

  const handleTap = () => { if (!isDragging.current) setIsFlipped(f => !f) }

  return (
    <motion.div
      animate={controls}
      // Start from background card visual state → spring to full size
      initial={{ scale: 0.93, y: 20, opacity: 0.7 }}
      style={{
        x, y, rotate,
        zIndex: 1,
        // When flipped: allow vertical scroll inside, horizontal drag still active
        touchAction: isFlipped ? 'pan-y' : 'none',
      }}
      // Free drag: card fully follows finger, no rubber-band
      drag={isFlipped ? 'x' : true}
      dragMomentum={false}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTap={handleTap}
      className="absolute inset-0 rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing select-none"
    >
      {/* ── BACKGROUND LAYERS ── */}
      <div className="absolute inset-0" style={{
        background: 'var(--ws-card)',
      }} />

      {/* Difficulty-colored ambient top glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `transparent`,
      }} />

      {/* Category bottom glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `transparent`,
      }} />

      {/* Subtle inner border */}
      <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
        border: '1px solid rgba(28,42,36,0.08)',
        boxShadow: '0 16px 40px rgba(28,42,36,0.08)',
      }} />

      {/* ── DRAG COLOR OVERLAYS ── */}
      <motion.div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{ opacity: rightOpacity, background: 'rgba(45,155,111,0.14)', zIndex: 5 }}
      />
      <motion.div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{ opacity: leftOpacity, background: 'rgba(224,112,96,0.14)', zIndex: 5 }}
      />
      {!isPersonal && (
        <motion.div
          className="absolute inset-0 rounded-3xl pointer-events-none"
          style={{ opacity: saveOpacity, background: 'rgba(240,160,75,0.16)', zIndex: 5 }}
        />
      )}

      {/* ── SWIPE STAMPS ── */}
      <motion.div style={{ opacity: rightOpacity }} className="absolute top-8 left-5 z-20 stamp text-success border-success rotate-[-20deg]">
        {t('feed.know')}
      </motion.div>
      <motion.div style={{ opacity: leftOpacity }} className="absolute top-8 right-5 z-20 stamp text-danger border-danger rotate-[20deg]">
        {t('feed.dontKnow')}
      </motion.div>
      {!isPersonal && (
        <motion.div style={{ opacity: saveOpacity }} className="absolute top-28 left-1/2 -translate-x-1/2 z-20 stamp text-warning border-warning">
          {t('feed.saved')}
        </motion.div>
      )}

      {/* ── CONTENT ── */}
      <div className="relative h-full flex flex-col z-10">

        {/* Top row: difficulty · category · audio */}
        <div className="flex items-center justify-between px-5 pt-5 shrink-0">
          {word.difficulty ? (
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full tracking-wider" style={{ color: diff.color, background: diff.bg, border: `1px solid ${diff.color}33` }}>
              {diff.label}
            </span>
          ) : (
            // Personal "My Words" entries have no CEFR level — show an own-word marker instead
            <span className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full tracking-wide" style={{ color: 'var(--ws-primary)', background: 'rgba(45,155,111,0.14)', border: '1px solid rgba(45,155,111,0.3)' }}>
              <NotebookPen size={12} strokeWidth={2.2} />
            </span>
          )}
          <span className="text-xs font-medium max-w-[130px] truncate" style={{ color: 'var(--ws-faint)' }}>{word.category?.name}</span>
          <div className="flex items-center gap-1.5">
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={(e) => { e.stopPropagation(); playWordAudio(word.word, word.audioUrl) }}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)' }}
            >
              <Volume2 size={16} strokeWidth={2} style={{ color: 'var(--ws-muted)' }} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={handleShare}
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'var(--ws-surface)', border: '1px solid var(--ws-border)' }}
            >
              <Share2 size={15} strokeWidth={2} style={{ color: 'var(--ws-muted)' }} />
            </motion.button>
          </div>
        </div>

        {/* Main area — front/back */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!isFlipped ? (
            // ── FRONT FACE ──
            <div className="flex-1 flex flex-col items-center justify-center px-7 text-center">
              <motion.div
                key="front"
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center gap-4"
              >
                {word.imageUrl && (
                  <img
                    src={word.imageUrl}
                    alt=""
                    draggable={false}
                    className="w-32 h-32 rounded-2xl object-cover pointer-events-none"
                    style={{ border: '1px solid var(--ws-border)', boxShadow: '0 8px 24px rgba(28,42,36,0.1)' }}
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                )}
                <h1
                  className="font-black leading-none tracking-tight"
                  style={{
                    fontSize: 'clamp(2.8rem, 13vw, 5rem)',
                    color: 'var(--ws-text)',
                  }}
                >
                  {word.word}
                </h1>

                {word.pronunciation && (
                  <p className="text-base font-mono tracking-widest" style={{ color: 'var(--ws-muted)' }}>{word.pronunciation}</p>
                )}

                {word.partOfSpeech && (
                  <span className="text-xs font-bold px-4 py-1.5 rounded-full"
                    style={{ background: 'rgba(45,155,111,0.12)', color: 'var(--ws-primary)', border: '1px solid rgba(45,155,111,0.2)' }}>
                    {word.partOfSpeech}
                  </span>
                )}

                <motion.div
                  animate={{ opacity: [0.35, 0.7, 0.35] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                  className="flex items-center gap-1.5 mt-1"
                >
                  <ChevronUp size={16} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />
                  <p className="text-sm" style={{ color: 'var(--ws-faint)' }}>{t('feed.tapToReveal')}</p>
                </motion.div>
              </motion.div>
            </div>
          ) : (
            // ── BACK FACE (scrollable) ──
            // touchAction: pan-y on parent card + overflow-y-auto here = native scroll within card
            <motion.div
              key="back"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="flex-1 overflow-y-auto no-scrollbar px-6 py-3 flex flex-col gap-3"
            >
              {word.translation?.translation && (
                <div className="text-center py-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--ws-faint)' }}>{t('feed.translation')}</p>
                  <h2
                    className="font-black leading-tight"
                    style={{
                      fontSize: 'clamp(2rem, 10vw, 3.5rem)',
                      color: diff.color,
                    }}
                  >
                    {word.translation.translation}
                  </h2>
                </div>
              )}

              {word.translation?.definitionEn && (
                <div className="rounded-2xl p-4"
                  style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
                  <p className="text-[10px] font-black uppercase tracking-[0.12em] mb-2" style={{ color: 'var(--ws-faint)' }}>{t('feed.definition')}</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ws-muted)' }}>{word.translation.definitionEn}</p>
                </div>
              )}

              {word.translation?.exampleEn && (
                <div className="rounded-2xl p-4"
                  style={{ background: 'rgba(45,155,111,0.07)', border: '1px solid rgba(45,155,111,0.18)' }}>
                  <p className="text-primary/50 text-[10px] font-black uppercase tracking-[0.12em] mb-2">{t('feed.example')}</p>
                  <p className="text-sm italic leading-relaxed" style={{ color: 'var(--ws-text)' }}>"{word.translation.exampleEn}"</p>
                  {word.translation.exampleTranslated && (
                    <p className="text-xs italic mt-1.5" style={{ color: 'var(--ws-muted)' }}>{word.translation.exampleTranslated}</p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Bottom action row */}
        <div className="px-5 pb-5 shrink-0 flex flex-col gap-3">

          {/* Vertical swipe hints */}
          <div className="flex items-center justify-center gap-5">
            <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--ws-faint)' }}>
              <ArrowUp size={13} strokeWidth={2.2} />
              {t('feed.skipLabel')}
            </span>
            {!isPersonal && (
              <span className="flex items-center gap-1 text-[11px] font-medium" style={{ color: 'var(--ws-faint)' }}>
                <ArrowDown size={13} strokeWidth={2.2} style={{ color: 'var(--ws-warning)' }} />
                {t('feed.saveLabel')}
              </span>
            )}
          </div>

          {/* Know / Don't know buttons */}
          <div className="flex items-center gap-3">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={(e) => { e.stopPropagation(); onSwipe('left') }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-btn font-bold text-sm"
              style={{ background: 'rgba(224,112,96,0.12)', border: '1px solid rgba(224,112,96,0.28)', color: 'var(--ws-danger)' }}
            >
              <X size={18} strokeWidth={2.4} />
              {t('feed.dontKnow')}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={(e) => { e.stopPropagation(); onSwipe('right') }}
              className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-btn font-bold text-sm"
              style={{ background: 'rgba(45,155,111,0.12)', border: '1px solid rgba(45,155,111,0.28)', color: 'var(--ws-success)' }}
            >
              <Check size={18} strokeWidth={2.4} />
              {t('feed.know')}
            </motion.button>
          </div>
        </div>

      </div>
    </motion.div>
  )
}
