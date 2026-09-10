import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Clapperboard, ArrowLeft, Check, CheckCircle2, Languages, Repeat, RotateCcw,
  Sparkles, Frown, Inbox, Gauge, BookOpen, BookmarkPlus, X, Subtitles, Lock,
  Mic, Square, Loader2, Share2, DownloadCloud, Trash,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'
import {
  offlineSupported,
  isSavedOffline,
  saveMediaOffline,
  removeMediaOffline,
} from '../../lib/offlineMedia'
import {
  shadowingApi,
  buildStreamUrl,
  type CefrLevel,
  type ShadowingClipDTO,
  type ShadowingClipDetail,
  type ShadowingCompleteResult,
  type ShadowingSegment,
  type ShadowingVocabWord,
  type MediaPhase,
  type SpeakResult,
} from '../../api/shadowing.api'
import { useTelegram } from '../../hooks/useTelegram'

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const SPEEDS = [0.5, 0.75, 1] as const
const ACCENT = '#f472b6'

type SubMode = 'off' | 'en' | 'smart' | 'bilingual'
const SUB_MODES: SubMode[] = ['off', 'en', 'smart', 'bilingual']
const SUB_MODE_STORE = 'ws_shadowing_submode'

/** Subtitle overlay for the shadowing player, respecting the chosen mode. */
function SmartSubtitle({ seg, mode }: { seg: ShadowingSegment; mode: SubMode }) {
  if (mode === 'off') return null

  if (mode === 'smart' && seg.words?.length) {
    return (
      <p className="text-center text-[15px] font-semibold leading-snug px-3">
        {seg.words.map((w, i) =>
          w.hard && w.translation ? (
            <span key={i} className="inline">
              <span style={{ color: '#fff' }}>{w.text}</span>
              <span className="text-[11px] font-bold ml-0.5 mr-1 align-super" style={{ color: ACCENT }}>
                ({w.translation})
              </span>
            </span>
          ) : (
            <span key={i} style={{ color: 'rgba(255,255,255,0.92)' }}>{w.text}</span>
          ),
        )}
      </p>
    )
  }

  if (mode === 'bilingual') {
    return (
      <div className="px-3">
        <p className="text-center text-[15px] font-semibold leading-snug" style={{ color: '#fff' }}>{seg.text}</p>
        {seg.translation && (
          <p className="text-center text-[13px] font-semibold leading-snug mt-0.5" style={{ color: ACCENT }}>
            {seg.translation}
          </p>
        )}
      </div>
    )
  }

  return (
    <p className="text-center text-[15px] font-semibold leading-snug px-3" style={{ color: '#fff' }}>
      {seg.text}
    </p>
  )
}

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

function WordsSheet({
  clipId,
  onClose,
}: {
  clipId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [level, setLevel] = useState<CefrLevel | null>(null)
  const [words, setWords] = useState<ShadowingVocabWord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    shadowingApi
      .words(clipId, level ?? undefined)
      .then((d) => setWords(Array.isArray(d) ? d : []))
      .catch(() => setWords([]))
      .finally(() => setLoading(false))
  }, [clipId, level])

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2200)
  }

  const save = async (word: string) => {
    if (saving) return
    setSaving(word)
    try {
      const r = await shadowingApi.saveWord(clipId, word)
      setSaved((prev) => new Set(prev).add(word.toLowerCase()))
      if (r.alreadyHad) {
        haptic.impact('light')
        showToast(t('shadowing.wordAlreadyHad'))
      } else {
        haptic.success()
        showToast(t('shadowing.wordAddedToFeed'))
      }
    } catch (err: any) {
      haptic.error()
      if (err?.response?.status === 402) showToast(t('shadowing.wordSaveLimitReached'))
    } finally {
      setSaving(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 z-10"
            style={{ background: 'var(--ws-card)', border: `1px solid ${ACCENT}55`, color: 'var(--ws-text)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
          >
            <Sparkles size={15} style={{ color: ACCENT }} /> {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-t-3xl px-5 pt-4 pb-8 max-h-[80%] flex flex-col"
        style={{ background: 'var(--ws-card)', border: '1px solid var(--ws-border)' }}
      >
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-lg font-black" style={{ color: 'var(--ws-text)' }}>
            {t('shadowing.wordsTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--ws-card-2)' }}
          >
            <X size={16} style={{ color: 'var(--ws-muted)' }} />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 shrink-0">
          {[null, ...LEVELS].map((lv) => {
            const active = level === lv
            const tint = lv ? LEVEL_TINT[lv] : ACCENT
            return (
              <button
                key={lv ?? 'all'}
                type="button"
                onClick={() => setLevel(lv)}
                className="text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap"
                style={{
                  color: active ? tint : 'var(--ws-muted)',
                  background: active ? `${tint}1f` : 'var(--ws-card-2)',
                  border: `1px solid ${active ? `${tint}55` : 'var(--ws-border)'}`,
                }}
              >
                {lv ?? t('shadowing.allLevels')}
              </button>
            )
          })}
        </div>

        <div className="overflow-y-auto no-scrollbar flex-1 min-h-0">
          {loading && (
            <div className="flex justify-center py-10">
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: ACCENT, borderTopColor: 'transparent' }}
              />
            </div>
          )}
          {!loading && words.length === 0 && (
            <p className="text-sm text-center py-10" style={{ color: 'var(--ws-muted)' }}>
              {t('shadowing.wordsEmpty')}
            </p>
          )}
          {!loading && words.map((w) => {
            const done = saved.has(w.word.toLowerCase())
            return (
              <div
                key={w.word}
                className="flex items-center gap-3 py-3"
                style={{ borderBottom: '1px solid var(--ws-border)' }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-[15px]" style={{ color: 'var(--ws-text)' }}>{w.word}</p>
                    <LevelBadge level={w.level} />
                  </div>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--ws-muted)' }}>{w.translationUz}</p>
                  {w.example && (
                    <p className="text-[11px] mt-1 leading-snug line-clamp-2" style={{ color: 'var(--ws-faint)' }}>
                      “{w.example}”
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={done || saving === w.word}
                  onClick={() => save(w.word)}
                  className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                  style={{
                    color: done ? 'var(--ws-success)' : ACCENT,
                    background: done ? 'rgba(16,185,129,0.12)' : `${ACCENT}18`,
                    border: `1px solid ${done ? 'rgba(16,185,129,0.3)' : `${ACCENT}44`}`,
                  }}
                >
                  {done
                    ? <><Check size={14} /> {t('shadowing.saved')}</>
                    : <><BookmarkPlus size={14} /> {t('shadowing.saveWord')}</>}
                </button>
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
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
  onNext,
}: {
  result: ShadowingCompleteResult
  onContinue: () => void
  onNext?: () => void
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

      {onNext ? (
        <div className="w-full max-w-xs flex flex-col gap-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onNext}
            className="w-full py-4 rounded-btn font-black text-sm text-white ws-gradient-bg ws-glow-primary"
          >
            {t('series.next')}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onContinue}
            className="w-full py-3 rounded-btn font-bold text-sm ws-card-2"
            style={{ color: 'var(--ws-muted)' }}
          >
            {t('shadowing.backToList')}
          </motion.button>
        </div>
      ) : (
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onContinue}
          className="w-full max-w-xs py-4 rounded-btn font-black text-sm text-white ws-gradient-bg ws-glow-primary"
        >
          {t('shadowing.backToList')}
        </motion.button>
      )}
    </motion.div>
  )
}

// ── Player view ───────────────────────────────────────────────────────────────
export function ShadowingPlayerView({
  id,
  onBack,
  onCompleted,
  onNext,
}: {
  id: string
  onBack: () => void
  onCompleted: (id: string) => void
  onNext?: () => void
}) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const videoRef = useRef<HTMLVideoElement>(null)

  const [clip, setClip] = useState<ShadowingClipDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [limitReached, setLimitReached] = useState(false)

  const [showTranslation, setShowTranslation] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [loop, setLoop] = useState(false)

  const [completing, setCompleting] = useState(false)
  const [result, setResult] = useState<ShadowingCompleteResult | null>(null)
  const [showWords, setShowWords] = useState(false)

  const [videoReady, setVideoReady] = useState(false)
  const [phase, setPhase] = useState<MediaPhase>('idle')
  const [subMode, setSubMode] = useState<SubMode>(() => {
    const v = (typeof localStorage !== 'undefined' && localStorage.getItem(SUB_MODE_STORE)) as SubMode | null
    return v && SUB_MODES.includes(v) ? v : 'smart'
  })
  const [subSeg, setSubSeg] = useState<ShadowingSegment | null>(null)

  const cycleSubMode = () => {
    setSubMode((prev) => {
      const next = SUB_MODES[(SUB_MODES.indexOf(prev) + 1) % SUB_MODES.length]
      try { localStorage.setItem(SUB_MODE_STORE, next) } catch { /* ignore */ }
      haptic.impact('light')
      return next
    })
  }

  // Per-segment repeat: the currently looping/segmented line (ref for timeupdate)
  const [activeSeg, setActiveSeg] = useState<number | null>(null)
  const activeSegRef = useRef<number | null>(null)
  const loopRef = useRef(false)

  useEffect(() => { loopRef.current = loop }, [loop])

  // ── Speak-along (record → server STT → score) ──────────────────────────────
  const [recordingSeg, setRecordingSeg] = useState<number | null>(null)
  const [uploadingSeg, setUploadingSeg] = useState<number | null>(null)
  const [speakScores, setSpeakScores] = useState<Record<number, SpeakResult>>({})
  const [speakToast, setSpeakToast] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const showSpeakToast = (msg: string) => {
    setSpeakToast(msg)
    window.setTimeout(() => setSpeakToast((cur) => (cur === msg ? null : cur)), 2600)
  }

  const isPremium = useAuthStore((s) => !!s.user?.isPremium)
  const [savedOffline, setSavedOffline] = useState(() => isSavedOffline('shadowing', id))
  const [savingOffline, setSavingOffline] = useState(false)

  const handleShare = async () => {
    try {
      const { link } = await shadowingApi.share(id)
      if (!link) { showSpeakToast(t('shadowing.shareUnavailable')); return }
      const tg = window.Telegram?.WebApp
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(clip?.title ?? '')}`)
      } else if (navigator.share) {
        await navigator.share({ title: clip?.title ?? 'Shadowing', url: link })
      } else {
        await navigator.clipboard?.writeText(clip?.title ? `${clip.title}\n${link}` : link)
        showSpeakToast(t('shadowing.shareCopied'))
      }
      haptic.success()
    } catch {
      haptic.error()
      showSpeakToast(t('shadowing.shareUnavailable'))
    }
  }

  const handleOffline = async () => {
    if (savingOffline) return
    if (savedOffline) {
      await removeMediaOffline('shadowing', id).catch(() => {})
      setSavedOffline(false)
      showSpeakToast(t('shadowing.offlineRemoved'))
      return
    }
    if (!clip) return
    setSavingOffline(true)
    try {
      await saveMediaOffline('shadowing', id, buildStreamUrl(clip.streamPath))
      setSavedOffline(true)
      haptic.success()
      showSpeakToast(t('shadowing.offlineSaved'))
    } catch {
      haptic.error()
      showSpeakToast(t('shadowing.offlineError'))
    } finally {
      setSavingOffline(false)
    }
  }

  useEffect(() => () => {
    // Clean up an in-flight recorder + mic on unmount
    try { recorderRef.current?.stop() } catch { /* ignore */ }
    recorderRef.current?.stream?.getTracks().forEach((tr) => tr.stop())
  }, [])

  const stopRecording = () => {
    try { recorderRef.current?.stop() } catch { /* ignore */ }
  }

  const startRecording = async (i: number) => {
    if (recordingSeg !== null || uploadingSeg !== null) return
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      showSpeakToast(t('shadowing.micUnavailable'))
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      haptic.error()
      showSpeakToast(t('shadowing.micDenied'))
      return
    }

    chunksRef.current = []
    const rec = new MediaRecorder(stream)
    recorderRef.current = rec
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    rec.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop())
      setRecordingSeg(null)
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
      if (blob.size === 0 || !clip) return
      setUploadingSeg(i)
      try {
        const r = await shadowingApi.speak(clip.id, i, blob)
        setSpeakScores((prev) => ({ ...prev, [i]: r }))
        if (r.passed) {
          haptic.success()
          showSpeakToast(t('shadowing.speakPassed', { score: r.score }))
        } else {
          haptic.impact('light')
          showSpeakToast(t('shadowing.speakTryAgain', { score: r.score }))
        }
        if (r.xpEarned > 0) showSpeakToast(t('shadowing.speakAllDone', { xp: r.xpEarned }))
      } catch (err: any) {
        haptic.error()
        showSpeakToast(err?.response?.status === 503 ? t('shadowing.speakUnavailable') : t('shadowing.speakError'))
      } finally {
        setUploadingSeg(null)
      }
    }
    rec.start()
    setRecordingSeg(i)
    haptic.impact('medium')
  }

  useEffect(() => {
    setLoading(true)
    setError(false)
    setLimitReached(false)
    setVideoReady(false)
    setPhase('idle')
    shadowingApi
      .get(id)
      .then(setClip)
      .catch((err) => {
        if (err?.response?.status === 402) setLimitReached(true)
        else setError(true)
      })
      .finally(() => setLoading(false))
  }, [id])

  // Poll warm-up status until the video is playable.
  useEffect(() => {
    if (!clip || videoReady) return
    let alive = true
    const tick = () => {
      shadowingApi.clipStatus(id).then((p) => { if (alive) setPhase(p) }).catch(() => {})
    }
    tick()
    const iv = setInterval(tick, 2500)
    return () => { alive = false; clearInterval(iv) }
  }, [clip, id, videoReady])

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

  // Pause at the active segment's end (or loop within it when Loop is on),
  // and keep the subtitle overlay in sync with the current playback time.
  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return

    const segs = clip?.segments
    if (segs?.length) {
      const tt = v.currentTime
      setSubSeg(segs.find((s) => tt >= s.start && tt < s.end) ?? null)
    }

    const i = activeSegRef.current
    if (i === null) return
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

      {!loading && limitReached && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'rgba(244,114,182,0.12)', border: '1px solid rgba(244,114,182,0.25)' }}>
            <Lock size={34} strokeWidth={1.8} style={{ color: ACCENT }} />
          </div>
          <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('shadowing.videoLimitReached')}</p>
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

      {!loading && error && !limitReached && (
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

      {!loading && !error && !limitReached && clip && (
        <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-8 flex flex-col gap-4">
          {/* Video */}
          <div className="relative rounded-card overflow-hidden bg-black w-full aspect-video shrink-0"
            style={{ border: '1px solid var(--ws-border)' }}>
            <video
              ref={videoRef}
              src={buildStreamUrl(clip.streamPath)}
              controls
              playsInline
              preload="metadata"
              onLoadedMetadata={() => { if (videoRef.current) videoRef.current.playbackRate = speed; setVideoReady(true) }}
              onCanPlay={() => setVideoReady(true)}
              onTimeUpdate={handleTimeUpdate}
              className="w-full h-full object-contain bg-black"
            />
            {!videoReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
                style={{ background: 'rgba(0,0,0,0.6)' }}>
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
                <p className="text-sm font-semibold" style={{ color: '#fff' }}>
                  {phase === 'downloading'
                    ? t('shadowing.phaseDownloading')
                    : phase === 'transcoding'
                      ? t('shadowing.phaseTranscoding')
                      : t('shadowing.phaseLoading')}
                </p>
              </div>
            )}
            {/* Subtitle mode toggle */}
            <button
              onClick={cycleSubMode}
              className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
              style={{ background: 'rgba(0,0,0,0.6)', color: subMode === 'off' ? 'rgba(255,255,255,0.6)' : ACCENT, backdropFilter: 'blur(4px)' }}
            >
              <Subtitles size={14} strokeWidth={2.4} />
              {t(`shadowing.sub_${subMode}`)}
            </button>
            {/* Subtitle overlay */}
            <AnimatePresence>
              {subSeg && subMode !== 'off' && (
                <motion.div
                  key={`${subSeg.start}-${subSeg.end}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute left-2 right-2 bottom-10 pointer-events-none"
                >
                  <div className="mx-auto max-w-[95%] rounded-xl py-2 px-1"
                    style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}>
                    <SmartSubtitle seg={subSeg} mode={subMode} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
                    const score = speakScores[i]
                    const isRecording = recordingSeg === i
                    const isUploading = uploadingSeg === i
                    const micBusy = recordingSeg !== null || uploadingSeg !== null
                    return (
                      <div
                        key={i}
                        className="w-full rounded-xl px-3 py-2.5 flex items-start gap-2"
                        style={
                          active
                            ? { background: 'rgba(45,155,111,0.16)', border: '1px solid rgba(45,155,111,0.4)' }
                            : { background: 'rgba(28,42,36,0.04)', border: '1px solid transparent' }
                        }
                      >
                        <button
                          type="button"
                          onClick={() => playSegment(i)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className="font-semibold text-[15px] leading-snug" style={{ color: 'var(--ws-text)' }}>
                            {seg.text}
                          </p>
                          {showTranslation && seg.translation && (
                            <p className="text-sm mt-1 leading-snug" style={{ color: 'var(--ws-success)' }}>
                              {seg.translation}
                            </p>
                          )}
                          {score && (
                            <p className="text-[11px] mt-1 font-bold" style={{ color: score.passed ? 'var(--ws-success)' : 'var(--ws-faint)' }}>
                              {score.passed ? '✓ ' : ''}{score.score}% · “{score.heard}”
                            </p>
                          )}
                        </button>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.9 }}
                          onClick={() => (isRecording ? stopRecording() : startRecording(i))}
                          disabled={isUploading || (micBusy && !isRecording)}
                          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40"
                          style={
                            isRecording
                              ? { background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }
                              : score?.passed
                                ? { background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--ws-success)' }
                                : { background: `${ACCENT}18`, border: `1px solid ${ACCENT}40`, color: ACCENT }
                          }
                          aria-label={t('shadowing.speakLabel')}
                        >
                          {isUploading
                            ? <Loader2 size={16} strokeWidth={2.4} className="animate-spin" />
                            : isRecording
                              ? <Square size={14} strokeWidth={2.6} fill="currentColor" />
                              : score?.passed
                                ? <Check size={16} strokeWidth={2.6} />
                                : <Mic size={16} strokeWidth={2.4} />}
                        </motion.button>
                      </div>
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

          {/* Share + offline actions */}
          <div className="flex items-center gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleShare}
              className="flex-1 py-2.5 rounded-btn font-bold text-xs flex items-center justify-center gap-1.5 ws-card-2"
              style={{ color: 'var(--ws-text)' }}
            >
              <Share2 size={15} strokeWidth={2.2} /> {t('shadowing.share')}
            </motion.button>
            {isPremium && offlineSupported() && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleOffline}
                disabled={savingOffline}
                className="flex-1 py-2.5 rounded-btn font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60"
                style={
                  savedOffline
                    ? { color: 'var(--ws-success)', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)' }
                    : { color: 'var(--ws-text)', background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }
                }
              >
                {savingOffline
                  ? '…'
                  : savedOffline
                    ? <><Trash size={15} strokeWidth={2.2} /> {t('shadowing.offlineRemove')}</>
                    : <><DownloadCloud size={15} strokeWidth={2.2} /> {t('shadowing.offlineSave')}</>}
              </motion.button>
            )}
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowWords(true)}
            className="w-full py-3.5 rounded-btn font-bold text-sm flex items-center justify-center gap-2"
            style={{
              color: ACCENT,
              background: `${ACCENT}14`,
              border: `1px solid ${ACCENT}40`,
            }}
          >
            <BookOpen size={18} strokeWidth={2.2} />
            {t('shadowing.viewWords')}
            {(clip.vocabularyCount ?? 0) > 0 && (
              <span className="text-xs opacity-80">({clip.vocabularyCount})</span>
            )}
          </motion.button>

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
          <DoneOverlay result={result} onContinue={onBack} onNext={onNext} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {speakToast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 z-[60]"
            style={{ background: 'var(--ws-card)', border: `1px solid ${ACCENT}55`, color: 'var(--ws-text)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
          >
            <Mic size={15} style={{ color: ACCENT }} /> {speakToast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWords && <WordsSheet clipId={id} onClose={() => setShowWords(false)} />}
      </AnimatePresence>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function ShadowingPage({
  onBack,
  deepLinkClipId,
}: {
  onBack: () => void
  deepLinkClipId?: string | null
}) {
  const [clips, setClips] = useState<ShadowingClipDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [openId, setOpenId] = useState<string | null>(deepLinkClipId ?? null)

  useEffect(() => {
    if (deepLinkClipId) setOpenId(deepLinkClipId)
  }, [deepLinkClipId])

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
          <ShadowingPlayerView
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
