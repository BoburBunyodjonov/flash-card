import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Clapperboard, ArrowLeft, Check, CheckCircle2, Languages, Repeat, RotateCcw,
  Sparkles, Frown, Inbox, Gauge,
} from 'lucide-react'
import {
  shadowingApi,
  buildStreamUrl,
  type CefrLevel,
  type ShadowingClipDTO,
  type ShadowingClipDetail,
  type ShadowingCompleteResult,
} from '../../api/shadowing.api'
import { useTelegram } from '../../hooks/useTelegram'

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const SPEEDS = [0.5, 0.75, 1] as const

// CEFR band → tint (beginner green → advanced purple)
const LEVEL_TINT: Record<CefrLevel, string> = {
  A1: '#10b981',
  A2: '#34d399',
  B1: '#2D9B6F',
  B2: '#4CB388',
  C1: '#4CB388',
  C2: '#F0A04B',
}

function fmtTime(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// ── Level badge ───────────────────────────────────────────────────────────────
function LevelBadge({ level }: { level: CefrLevel }) {
  const tint = LEVEL_TINT[level]
  return (
    <span
      className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wide shrink-0"
      style={{ color: tint, background: `${tint}1f` }}
    >
      {level}
    </span>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────
function ListView({
  clips,
  loading,
  error,
  onRetry,
  onOpen,
  onBack,
}: {
  clips: ShadowingClipDTO[]
  loading: boolean
  error: boolean
  onRetry: () => void
  onOpen: (id: string) => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<CefrLevel | null>(null)

  // Only offer chips for levels that actually have clips.
  const present = LEVELS.filter((lv) => clips.some((c) => c.level === lv))
  const visible = filter ? clips.filter((c) => c.level === filter) : clips

  return (
    <div className="h-full overflow-y-auto no-scrollbar" style={{ background: 'var(--ws-bg)' }}>
      <div className="px-5 pt-4 pb-28 max-w-lg mx-auto">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="font-semibold text-sm flex items-center gap-1 mb-3"
          style={{ color: 'var(--ws-primary-light)' }}
        >
          <ArrowLeft size={16} strokeWidth={2.2} /> {t('shadowing.back')}
        </motion.button>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--ws-text)' }}>
            <Clapperboard size={26} strokeWidth={2.2} style={{ color: '#f472b6' }} />
            {t('shadowing.title')}
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--ws-muted)' }}>{t('shadowing.subtitle')}</p>
        </motion.div>

        {/* Level filter chips */}
        {present.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 -mx-1 px-1">
            {[null, ...present].map((lv) => {
              const active = filter === lv
              const tint = lv ? LEVEL_TINT[lv] : '#2D9B6F'
              return (
                <motion.button
                  key={lv ?? 'all'}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setFilter(lv)}
                  className="text-xs font-bold px-3.5 py-1.5 rounded-full whitespace-nowrap shrink-0"
                  style={{
                    color: active ? tint : 'var(--ws-muted)',
                    background: active ? `${tint}1f` : 'var(--ws-card-2)',
                    border: `1px solid ${active ? `${tint}55` : 'var(--ws-border)'}`,
                  }}
                >
                  {lv ?? t('shadowing.allLevels')}
                </motion.button>
              )
            })}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-9 h-9 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-5 py-16 text-center">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
              <Frown size={36} strokeWidth={1.8} style={{ color: 'var(--ws-muted)' }} />
            </div>
            <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('shadowing.loadError')}</p>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onRetry}
              className="px-6 py-3 rounded-btn font-bold text-sm text-white flex items-center gap-2 ws-gradient-bg ws-glow-primary"
            >
              <RotateCcw size={16} strokeWidth={2.4} /> {t('shadowing.retry')}
            </motion.button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 py-16 text-center"
          >
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.25)' }}>
              <Inbox size={34} strokeWidth={1.8} style={{ color: '#f472b6' }} />
            </div>
            <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('shadowing.emptyTitle')}</p>
            <p className="text-sm max-w-xs" style={{ color: 'var(--ws-muted)' }}>{t('shadowing.emptyMsg')}</p>
          </motion.div>
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="flex flex-col gap-3">
            {visible.map((clip, i) => (
              <motion.button
                key={clip.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.06, 0.5) }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOpen(clip.id)}
                className="w-full flex items-center gap-4 p-4 ws-card text-left"
              >
                <div
                  className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{
                    background: clip.completed ? 'rgba(16,185,129,0.15)' : 'rgba(244,114,182,0.14)',
                    border: `1px solid ${clip.completed ? 'rgba(16,185,129,0.3)' : 'rgba(244,114,182,0.3)'}`,
                  }}
                >
                  {clip.completed
                    ? <CheckCircle2 size={22} strokeWidth={2} style={{ color: 'var(--ws-success)' }} />
                    : <Clapperboard size={22} strokeWidth={2} style={{ color: '#f472b6' }} />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[15px] truncate" style={{ color: 'var(--ws-text)' }}>{clip.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <LevelBadge level={clip.level} />
                    <span className="text-xs tabular-nums" style={{ color: 'var(--ws-muted)' }}>
                      {fmtTime(clip.durationSec)}
                    </span>
                    {clip.completed && (
                      <span className="text-xs font-bold flex items-center gap-1" style={{ color: 'var(--ws-success)' }}>
                        <Check size={12} strokeWidth={3} /> {t('shadowing.completed')}
                      </span>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Completion celebration overlay ────────────────────────────────────────────
function DoneOverlay({
  result,
  onContinue,
}: {
  result: ShadowingCompleteResult
  onContinue: () => void
}) {
  const { t } = useTranslation()
  const gotXp = result.xpEarned > 0
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 px-8 text-center"
      style={{ background: 'rgba(8,8,12,0.86)', backdropFilter: 'blur(6px)' }}
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.05 }}
        className="w-24 h-24 rounded-3xl flex items-center justify-center"
        style={{ background: 'rgba(16,185,129,0.16)', border: '1px solid rgba(16,185,129,0.35)' }}
      >
        <CheckCircle2 size={48} strokeWidth={1.8} style={{ color: 'var(--ws-success)' }} />
      </motion.div>

      <div>
        <p className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>{t('shadowing.doneTitle')}</p>
        <p className="text-sm mt-1.5" style={{ color: 'var(--ws-muted)' }}>{t('shadowing.doneMsg')}</p>
      </div>

      {gotXp ? (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 320, damping: 20 }}
          className="rounded-btn px-6 py-4 flex items-center gap-2"
          style={{ background: 'rgba(45,155,111,0.1)', border: '1px solid rgba(45,155,111,0.25)' }}
        >
          <Sparkles size={20} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
          <p className="font-black text-xl" style={{ color: 'var(--ws-primary-light)' }}>+{result.xpEarned} XP</p>
        </motion.div>
      ) : (
        <p className="text-sm max-w-xs" style={{ color: 'var(--ws-faint)' }}>{t('shadowing.noXpMsg')}</p>
      )}

      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={onContinue}
        className="w-full max-w-xs py-4 rounded-btn font-black text-sm text-white ws-gradient-bg ws-glow-primary"
      >
        {t('shadowing.backToList')}
      </motion.button>
    </motion.div>
  )
}

// ── Player view ───────────────────────────────────────────────────────────────
function PlayerView({
  id,
  onBack,
  onCompleted,
}: {
  id: string
  onBack: () => void
  onCompleted: (id: string) => void
}) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const videoRef = useRef<HTMLVideoElement>(null)

  const [clip, setClip] = useState<ShadowingClipDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [showTranslation, setShowTranslation] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [loop, setLoop] = useState(false)

  const [completing, setCompleting] = useState(false)
  const [result, setResult] = useState<ShadowingCompleteResult | null>(null)

  // Per-segment repeat: the currently looping/segmented line (ref for timeupdate)
  const [activeSeg, setActiveSeg] = useState<number | null>(null)
  const activeSegRef = useRef<number | null>(null)
  const loopRef = useRef(false)

  useEffect(() => { loopRef.current = loop }, [loop])

  useEffect(() => {
    setLoading(true)
    setError(false)
    shadowingApi
      .get(id)
      .then(setClip)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  // Keep the <video> in sync with the shadowing controls
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed, clip])
  useEffect(() => {
    if (videoRef.current) videoRef.current.loop = loop
  }, [loop, clip])

  const replay = () => {
    const v = videoRef.current
    if (!v) return
    setActiveSeg(null)
    activeSegRef.current = null
    v.currentTime = 0
    v.play().catch(() => {})
    haptic.impact('light')
  }

  const playSegment = (i: number) => {
    const v = videoRef.current
    const seg = clip?.segments?.[i]
    if (!v || !seg) return
    setActiveSeg(i)
    activeSegRef.current = i
    v.currentTime = seg.start
    v.playbackRate = speed
    v.play().catch(() => {})
    haptic.impact('light')
  }

  // Pause at the active segment's end (or loop within it when Loop is on)
  const handleTimeUpdate = () => {
    const v = videoRef.current
    const i = activeSegRef.current
    if (!v || i === null) return
    const seg = clip?.segments?.[i]
    if (seg && v.currentTime >= seg.end) {
      if (loopRef.current) {
        v.currentTime = seg.start
      } else {
        v.pause()
        setActiveSeg(null)
        activeSegRef.current = null
      }
    }
  }

  const finish = async () => {
    if (completing || !clip) return
    setCompleting(true)
    try {
      const r = await shadowingApi.complete(clip.id)
      if (r.xpEarned > 0) haptic.success()
      else haptic.impact('light')
      setResult(r)
      onCompleted(clip.id)
    } catch {
      // Surface a soft failure but never trap the learner — reset the button
      haptic.error()
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="h-full flex flex-col relative" style={{ background: 'var(--ws-bg)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}
        >
          <ArrowLeft size={18} strokeWidth={2.2} style={{ color: 'var(--ws-muted)' }} />
        </motion.button>
        <div className="flex items-center gap-2 min-w-0 px-3">
          <Clapperboard size={18} strokeWidth={2} style={{ color: '#f472b6' }} />
          <span className="font-black text-sm truncate" style={{ color: 'var(--ws-text)' }}>
            {clip?.title ?? t('shadowing.title')}
          </span>
        </div>
        <div className="w-9 shrink-0" />
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-9 h-9 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
            <Frown size={36} strokeWidth={1.8} style={{ color: 'var(--ws-muted)' }} />
          </div>
          <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('shadowing.loadError')}</p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onBack}
            className="px-6 py-3 rounded-btn font-bold text-sm ws-card-2 flex items-center gap-2"
            style={{ color: 'var(--ws-muted)' }}
          >
            <ArrowLeft size={16} strokeWidth={2.4} /> {t('shadowing.back')}
          </motion.button>
        </div>
      )}

      {!loading && !error && clip && (
        <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-8 flex flex-col gap-4">
          {/* Video */}
          <div className="rounded-card overflow-hidden bg-black w-full aspect-video shrink-0"
            style={{ border: '1px solid var(--ws-border)' }}>
            <video
              ref={videoRef}
              src={buildStreamUrl(clip.streamPath)}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = speed }}
              onTimeUpdate={handleTimeUpdate}
              className="w-full h-full object-contain bg-black"
            />
          </div>

          {/* Shadowing controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Speed */}
            <div className="flex items-center gap-1 rounded-btn p-1 ws-card-2">
              <Gauge size={15} strokeWidth={2.2} style={{ color: 'var(--ws-faint)' }} className="ml-1.5 mr-0.5" />
              {SPEEDS.map((s) => {
                const active = speed === s
                return (
                  <motion.button
                    key={s}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => { setSpeed(s); haptic.impact('light') }}
                    className="text-xs font-black px-2.5 py-1.5 rounded-lg tabular-nums"
                    style={{
                      color: active ? '#fff' : 'var(--ws-muted)',
                      background: active ? 'var(--ws-primary)' : 'transparent',
                    }}
                  >
                    {s}x
                  </motion.button>
                )
              })}
            </div>

            {/* Replay */}
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={replay}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-btn text-xs font-bold ws-card-2"
              style={{ color: 'var(--ws-text)' }}
            >
              <RotateCcw size={15} strokeWidth={2.4} /> {t('shadowing.replay')}
            </motion.button>

            {/* Loop */}
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => { setLoop((l) => !l); haptic.impact('light') }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-btn text-xs font-bold"
              style={
                loop
                  ? { color: 'var(--ws-primary-light)', background: 'rgba(45,155,111,0.14)', border: '1px solid rgba(45,155,111,0.3)' }
                  : { color: 'var(--ws-muted)', background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }
              }
            >
              <Repeat size={15} strokeWidth={2.4} /> {t('shadowing.loop')}
            </motion.button>
          </div>

          {/* Transcript */}
          <div className="rounded-card p-4"
            style={{ background: 'rgba(45,155,111,0.08)', border: '1px solid rgba(45,155,111,0.16)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--ws-faint)' }}>
                {t('shadowing.transcript')}
              </p>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => setShowTranslation((s) => !s)}
                className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full"
                style={
                  showTranslation
                    ? { color: 'var(--ws-success)', background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.3)' }
                    : { color: 'var(--ws-muted)', background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }
                }
              >
                <Languages size={13} strokeWidth={2.4} />
                {showTranslation ? t('shadowing.hideTranslation') : t('shadowing.showTranslation')}
              </motion.button>
            </div>

            {clip.segments && clip.segments.length > 0 ? (
              <>
                <p className="text-[11px] mb-2" style={{ color: 'var(--ws-faint)' }}>{t('shadowing.segmentHint')}</p>
                <div className="flex flex-col gap-1.5">
                  {clip.segments.map((seg, i) => {
                    const active = activeSeg === i
                    return (
                      <motion.button
                        key={i}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => playSegment(i)}
                        className="w-full text-left rounded-xl px-3 py-2.5"
                        style={
                          active
                            ? { background: 'rgba(45,155,111,0.16)', border: '1px solid rgba(45,155,111,0.4)' }
                            : { background: 'rgba(28,42,36,0.04)', border: '1px solid transparent' }
                        }
                      >
                        <p className="font-semibold text-[15px] leading-snug" style={{ color: 'var(--ws-text)' }}>
                          {seg.text}
                        </p>
                        {showTranslation && seg.translation && (
                          <p className="text-sm mt-1 leading-snug" style={{ color: 'var(--ws-success)' }}>
                            {seg.translation}
                          </p>
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              </>
            ) : (
              <p className="font-semibold text-[15px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--ws-text)' }}>
                {clip.transcript}
              </p>
            )}

            {/* Full Uzbek translation (shown for plain transcript, or as a whole-clip aid) */}
            <AnimatePresence>
              {showTranslation && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--ws-border)' }}>
                    <p className="text-[11px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--ws-faint)' }}>
                      {t('shadowing.uzbek')}
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--ws-success)' }}>
                      {clip.translationUz}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Finish — stays tappable when already completed so a returning
              learner can shadow it again (server may then award 0 XP). */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={finish}
            disabled={completing}
            className="w-full py-4 rounded-btn font-black text-base text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={
              clip.completed
                ? { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--ws-success)' }
                : { background: '#10b981', boxShadow: '0 8px 24px rgba(16,185,129,0.3)' }
            }
          >
            {completing
              ? '…'
              : clip.completed
                ? <><CheckCircle2 size={18} strokeWidth={2.4} /> {t('shadowing.completed')}</>
                : <><Check size={18} strokeWidth={2.6} /> {t('shadowing.finish')}</>}
          </motion.button>
        </div>
      )}

      {/* Celebration overlay */}
      <AnimatePresence>
        {result && (
          <DoneOverlay result={result} onContinue={onBack} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function ShadowingPage({ onBack }: { onBack: () => void }) {
  const [clips, setClips] = useState<ShadowingClipDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    shadowingApi
      .list()
      .then((d) => setClips(Array.isArray(d) ? d : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const markCompleted = (id: string) => {
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, completed: true, completedCount: c.completedCount + 1 } : c)),
    )
  }

  const transition = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { type: 'spring' as const, stiffness: 380, damping: 32 },
  }

  return (
    <AnimatePresence mode="wait">
      {openId ? (
        <motion.div key="player" {...transition} className="h-full">
          <PlayerView
            id={openId}
            onBack={() => setOpenId(null)}
            onCompleted={markCompleted}
          />
        </motion.div>
      ) : (
        <motion.div key="list" {...transition} className="h-full">
          <ListView
            clips={clips}
            loading={loading}
            error={error}
            onRetry={load}
            onOpen={setOpenId}
            onBack={onBack}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
