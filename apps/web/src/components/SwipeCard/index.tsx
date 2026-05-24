import { useState, useRef } from 'react'
import { motion, useMotionValue, useTransform, useAnimation, type PanInfo } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import type { FeedWord } from '@wordswipe/shared'

interface Props {
  word: FeedWord
  isTop: boolean
  onSwipe: (direction: 'left' | 'right' | 'up' | 'down') => void
}

const SWIPE_THRESHOLD = 90

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  A1: { label: 'A1', color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  A2: { label: 'A2', color: '#6ee7b7', bg: 'rgba(110,231,183,0.15)' },
  B1: { label: 'B1', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  B2: { label: 'B2', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  C1: { label: 'C1', color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  C2: { label: 'C2', color: '#c084fc', bg: 'rgba(192,132,252,0.15)' },
}

export function SwipeCard({ word, isTop, onSwipe }: Props) {
  const { t } = useTranslation()
  const [isFlipped, setIsFlipped] = useState(false)
  const controls = useAnimation()
  const isDragging = useRef(false)
  const diff = DIFFICULTY_CONFIG[word.difficulty] ?? DIFFICULTY_CONFIG.A1

  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-220, 220], [-20, 20])

  const rightOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1])
  const leftOpacity  = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0])
  const upOpacity    = useTransform(y, [-SWIPE_THRESHOLD, 0], [1, 0])

  const cardGlow = useTransform(x, [-150, 0, 150], [
    'rgba(239,68,68,0.3)', 'rgba(0,0,0,0)', 'rgba(16,185,129,0.3)',
  ])

  if (!isTop) {
    return (
      <motion.div
        className="absolute inset-0 rounded-3xl"
        style={{
          scale: 0.93,
          y: 20,
          zIndex: 0,
          background: 'linear-gradient(145deg, #1a1a2e, #16213e)',
          border: '1px solid rgba(255,255,255,0.05)',
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
      await controls.start({ x: 0, y: 0, rotate: 0, transition: { type: 'spring', stiffness: 400, damping: 28 } })
      return
    }

    if (absY > absX) {
      if (offset.y > SWIPE_THRESHOLD) {
        await controls.start({ y: 700, opacity: 0, transition: { duration: 0.28 } })
        onSwipe('down')
      } else {
        await controls.start({ y: -700, opacity: 0, transition: { duration: 0.28 } })
        onSwipe('up')
      }
    } else {
      if (offset.x > SWIPE_THRESHOLD) {
        await controls.start({ x: 700, rotate: 22, opacity: 0, transition: { duration: 0.28 } })
        onSwipe('right')
      } else {
        await controls.start({ x: -700, rotate: -22, opacity: 0, transition: { duration: 0.28 } })
        onSwipe('left')
      }
    }
  }

  const handleTap = () => { if (!isDragging.current) setIsFlipped((f) => !f) }

  return (
    <motion.div
      animate={controls}
      style={{ x, y, rotate, zIndex: 1, touchAction: 'none', boxShadow: cardGlow as any }}
      drag
      dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
      dragElastic={0.6}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onTap={handleTap}
      className="absolute inset-0 rounded-3xl overflow-hidden cursor-grab active:cursor-grabbing select-none"
      initial={{ scale: 0.9, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
    >
      {/* Card background */}
      <div className="absolute inset-0" style={{
        background: `linear-gradient(160deg, #12121f 0%, #0d0d1a 50%, #10001a 100%)`,
      }} />

      {/* Category color glow orb */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: `radial-gradient(ellipse at 50% 30%, ${word.category?.isPremium ? 'rgba(251,191,36,0.08)' : 'rgba(99,102,241,0.08)'} 0%, transparent 65%)`,
      }} />

      {/* Border */}
      <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{
        border: '1px solid rgba(255,255,255,0.07)',
      }} />

      {/* KNOW indicator */}
      <motion.div
        style={{ opacity: rightOpacity }}
        className="absolute top-10 left-6 z-20 stamp text-success border-success rotate-[-18deg]"
      >
        ✓ {t('feed.know')}
      </motion.div>

      {/* DON'T KNOW indicator */}
      <motion.div
        style={{ opacity: leftOpacity }}
        className="absolute top-10 right-6 z-20 stamp text-danger border-danger rotate-[18deg]"
      >
        ✗ {t('feed.dontKnow')}
      </motion.div>

      {/* SAVE indicator */}
      <motion.div
        style={{ opacity: upOpacity }}
        className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 stamp text-warning border-warning"
      >
        ★ {t('feed.saved')}
      </motion.div>

      {/* Content */}
      <div className="relative h-full flex flex-col z-10">

        {/* Top row */}
        <div className="flex items-center justify-between px-6 pt-6">
          <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ color: diff.color, background: diff.bg }}>
            {diff.label}
          </span>
          <span className="text-xs font-semibold text-white/30 max-w-[150px] truncate">
            {word.category?.name}
          </span>
          {word.audioUrl ? (
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={(e) => { e.stopPropagation(); new Audio(word.audioUrl!).play() }}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              🔊
            </motion.button>
          ) : <div className="w-9" />}
        </div>

        {/* Main word area */}
        <div className="flex-1 flex flex-col items-center justify-center px-7 text-center gap-5">
          {!isFlipped ? (
            <motion.div
              key="front"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-4"
            >
              {/* Word */}
              <h1 className="font-black text-white leading-none tracking-tight"
                style={{ fontSize: 'clamp(2.5rem, 12vw, 4.5rem)', textShadow: '0 0 60px rgba(255,255,255,0.1)' }}>
                {word.word}
              </h1>

              {word.pronunciation && (
                <p className="text-white/40 text-lg font-mono tracking-wide">{word.pronunciation}</p>
              )}

              {word.partOfSpeech && (
                <span className="text-xs font-bold px-4 py-1.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.15)', color: '#a78bfa', border: '1px solid rgba(99,102,241,0.25)' }}>
                  {word.partOfSpeech}
                </span>
              )}

              {/* Tap hint */}
              <motion.div
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ repeat: Infinity, duration: 2.5 }}
                className="flex items-center gap-2 mt-2"
              >
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  👆
                </div>
                <p className="text-white/30 text-sm">{t('feed.tapToReveal')}</p>
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="back"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full flex flex-col gap-4"
            >
              {word.translation?.translation && (
                <div>
                  <p className="text-white/30 text-xs font-bold uppercase tracking-widest mb-2">Translation</p>
                  <h2 className="font-black text-4xl" style={{ color: diff.color }}>
                    {word.translation.translation}
                  </h2>
                </div>
              )}

              {word.translation?.definitionEn && (
                <div className="rounded-2xl p-4 text-left" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1.5">Definition</p>
                  <p className="text-white/75 text-sm leading-relaxed">{word.translation.definitionEn}</p>
                </div>
              )}

              {word.translation?.exampleEn && (
                <div className="rounded-2xl p-4 text-left" style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}>
                  <p className="text-primary/60 text-[10px] font-bold uppercase tracking-widest mb-1.5">Example</p>
                  <p className="text-white/65 text-sm italic leading-relaxed">"{word.translation.exampleEn}"</p>
                  {word.translation.exampleTranslated && (
                    <p className="text-white/35 text-xs italic mt-1">{word.translation.exampleTranslated}</p>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Bottom swipe hints */}
        <div className="flex items-center justify-between px-7 pb-7">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-danger/20">
              <span className="text-danger text-xs font-black">✗</span>
            </div>
            <span className="text-white/25 text-xs">{t('feed.dontKnow')}</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-white/20 text-xs">↑ save</span>
            <span className="text-white/20 text-xs">↓ skip</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-white/25 text-xs">{t('feed.know')}</span>
            <div className="w-6 h-6 rounded-full flex items-center justify-center bg-success/20">
              <span className="text-success text-xs font-black">✓</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
