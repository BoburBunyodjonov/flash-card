import { useState, useRef, useEffect } from 'react'
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from 'framer-motion'
import { useTranslation } from 'react-i18next'
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
  A1: { label: 'A1', color: '#34d399', bg: 'rgba(52,211,153,0.13)' },
  A2: { label: 'A2', color: '#6ee7b7', bg: 'rgba(110,231,183,0.13)' },
  B1: { label: 'B1', color: '#fbbf24', bg: 'rgba(251,191,36,0.13)' },
  B2: { label: 'B2', color: '#f97316', bg: 'rgba(249,115,22,0.13)' },
  C1: { label: 'C1', color: '#f87171', bg: 'rgba(248,113,113,0.13)' },
  C2: { label: 'C2', color: '#c084fc', bg: 'rgba(192,132,252,0.13)' },
}

export function SwipeCard({ word, isTop, onSwipe }: Props) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [isFlipped, setIsFlipped] = useState(false)
  const controls = useAnimation()
  const isDragging = useRef(false)
  const diff = DIFFICULTY_CONFIG[word.difficulty] ?? DIFFICULTY_CONFIG.A1

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation()
    haptic.impact('light')

    const lines: string[] = []
    lines.push(`📖 ${word.word}${word.pronunciation ? '  ' + word.pronunciation : ''}`)
    if (word.partOfSpeech) lines.push(`(${word.partOfSpeech})  •  ${word.difficulty}`)
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
  const upOpacity    = useTransform(y, [-SWIPE_THRESHOLD, 0], [1, 0])

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
          background: 'linear-gradient(145deg, #15152a, #10101f)',
          border: '1px solid rgba(255,255,255,0.05)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
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

    // Vertical swipe only when card is not flipped
    if (!isFlipped && absY > absX) {
      if (offset.y > 0) {
        await controls.start({ y: 900, opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } })
        onSwipe('down')
      } else {
        await controls.start({ y: -900, opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } })
        onSwipe('up')
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
        background: 'linear-gradient(160deg, #13132a 0%, #0c0c1c 55%, #0f0019 100%)',
      }} />

      {/* Difficulty-colored ambient top glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse at 50% -5%, ${diff.color}1a 0%, transparent 55%)`,
      }} />

      {/* Category bottom glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse at 50% 108%, ${word.category?.isPremium ? 'rgba(251,191,36,0.08)' : 'rgba(99,102,241,0.09)'} 0%, transparent 55%)`,
      }} />

      {/* Subtle inner border */}
      <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
      }} />

      {/* ── DRAG COLOR OVERLAYS ── */}
      <motion.div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{ opacity: rightOpacity, background: 'linear-gradient(125deg, rgba(16,185,129,0.22) 0%, transparent 55%)', zIndex: 5 }}
      />
      <motion.div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{ opacity: leftOpacity, background: 'linear-gradient(235deg, rgba(239,68,68,0.22) 0%, transparent 55%)', zIndex: 5 }}
      />
      <motion.div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{ opacity: upOpacity, background: 'linear-gradient(0deg, rgba(245,158,11,0.2) 0%, transparent 50%)', zIndex: 5 }}
      />

      {/* ── SWIPE STAMPS ── */}
      <motion.div style={{ opacity: rightOpacity }} className="absolute top-8 left-5 z-20 stamp text-success border-success rotate-[-20deg]">
        ✓ {t('feed.know')}
      </motion.div>
      <motion.div style={{ opacity: leftOpacity }} className="absolute top-8 right-5 z-20 stamp text-danger border-danger rotate-[20deg]">
        ✗ {t('feed.dontKnow')}
      </motion.div>
      <motion.div style={{ opacity: upOpacity }} className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 stamp text-warning border-warning">
        ★ {t('feed.saved')}
      </motion.div>

      {/* ── CONTENT ── */}
      <div className="relative h-full flex flex-col z-10">

        {/* Top row: difficulty · category · audio */}
        <div className="flex items-center justify-between px-5 pt-5 shrink-0">
          <span className="text-xs font-black px-3 py-1 rounded-full tracking-wider" style={{ color: diff.color, background: diff.bg }}>
            {diff.label}
          </span>
          <span className="text-xs font-medium text-white/30 max-w-[130px] truncate">{word.category?.name}</span>
          <div className="flex items-center gap-1.5">
            <motion.button
              whileTap={{ scale: 0.8 }}
              onClick={(e) => { e.stopPropagation(); playWordAudio(word.word, word.audioUrl) }}
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              🔊
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.8 }}
              onClick={handleShare}
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              📤
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
                    style={{ border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                )}
                <h1
                  className="font-black text-white leading-none tracking-tight"
                  style={{
                    fontSize: 'clamp(2.8rem, 13vw, 5rem)',
                    textShadow: '0 0 60px rgba(255,255,255,0.1), 0 4px 24px rgba(0,0,0,0.5)',
                  }}
                >
                  {word.word}
                </h1>

                {word.pronunciation && (
                  <p className="text-white/35 text-base font-mono tracking-widest">{word.pronunciation}</p>
                )}

                {word.partOfSpeech && (
                  <span className="text-xs font-bold px-4 py-1.5 rounded-full"
                    style={{ background: 'rgba(99,102,241,0.12)', color: '#a78bfa', border: '1px solid rgba(99,102,241,0.2)' }}>
                    {word.partOfSpeech}
                  </span>
                )}

                <motion.div
                  animate={{ opacity: [0.25, 0.55, 0.25] }}
                  transition={{ repeat: Infinity, duration: 3 }}
                  className="flex items-center gap-2 mt-1"
                >
                  <span className="text-xl">👆</span>
                  <p className="text-white/30 text-sm">{t('feed.tapToReveal')}</p>
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
                  <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.15em] mb-2">{t('feed.translation')}</p>
                  <h2
                    className="font-black leading-tight"
                    style={{
                      fontSize: 'clamp(2rem, 10vw, 3.5rem)',
                      color: diff.color,
                      textShadow: `0 0 30px ${diff.color}50`,
                    }}
                  >
                    {word.translation.translation}
                  </h2>
                </div>
              )}

              {word.translation?.definitionEn && (
                <div className="rounded-2xl p-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.12em] mb-2">{t('feed.definition')}</p>
                  <p className="text-white/70 text-sm leading-relaxed">{word.translation.definitionEn}</p>
                </div>
              )}

              {word.translation?.exampleEn && (
                <div className="rounded-2xl p-4"
                  style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)' }}>
                  <p className="text-primary/50 text-[10px] font-black uppercase tracking-[0.12em] mb-2">{t('feed.example')}</p>
                  <p className="text-white/65 text-sm italic leading-relaxed">"{word.translation.exampleEn}"</p>
                  {word.translation.exampleTranslated && (
                    <p className="text-white/30 text-xs italic mt-1.5">{word.translation.exampleTranslated}</p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Bottom swipe hints */}
        <div className="flex items-center justify-between px-6 pb-5 shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.18)' }}>
              <span className="text-danger text-xs font-black">✗</span>
            </div>
            <span className="text-white/20 text-xs font-medium">{t('feed.dontKnow')}</span>
          </div>

          <div className="flex flex-col items-center gap-0.5" style={{ opacity: 0.22 }}>
            <span className="text-white text-[11px]">{t('feed.saveHint')}</span>
            <span className="text-white text-[11px]">{t('feed.skipHint')}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-white/20 text-xs font-medium">{t('feed.know')}</span>
            <div className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.18)' }}>
              <span className="text-success text-xs font-black">✓</span>
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  )
}
