import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Film, ArrowLeft, Check, CheckCircle2, Plus, Lock, Globe, Upload,
  Sparkles, Frown, Inbox, RotateCcw, Trash2, X, BookOpen, BookmarkPlus,
  Subtitles, Share2, DownloadCloud, Trash,
} from 'lucide-react'
import {
  cinemaApi,
  buildCinemaStreamUrl,
  type CefrLevel,
  type CinemaClipDTO,
  type CinemaClipDetail,
  type CinemaCompleteResult,
  type CinemaSegment,
  type CinemaVocabWord,
  type MediaPhase,
} from '../../api/cinema.api'
import { useTelegram } from '../../hooks/useTelegram'
import { useAuthStore } from '../../store/auth.store'
import {
  offlineSupported,
  isSavedOffline,
  saveMediaOffline,
  removeMediaOffline,
} from '../../lib/offlineMedia'

const LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const LEVEL_TINT: Record<CefrLevel, string> = {
  A1: '#10b981', A2: '#34d399', B1: '#2D9B6F', B2: '#4CB388', C1: '#4CB388', C2: '#F0A04B',
}
const ACCENT = '#F59E0B'

function fmtTime(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function LevelBadge({ level }: { level: CefrLevel }) {
  const tint = LEVEL_TINT[level]
  return (
    <span className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wide shrink-0"
      style={{ color: tint, background: `${tint}1f` }}>
      {level}
    </span>
  )
}

export type SubMode = 'off' | 'en' | 'smart' | 'bilingual'
const SUB_MODES: SubMode[] = ['off', 'en', 'smart', 'bilingual']
const SUB_MODE_STORE = 'ws_cinema_submode'

/** Live subtitle rendered according to the chosen mode. */
function SmartSubtitle({
  seg,
  mode,
}: {
  seg: CinemaSegment
  mode: SubMode
}) {
  if (mode === 'off') return null

  if (mode === 'en') {
    return (
      <p className="text-center text-[15px] font-semibold leading-snug px-3" style={{ color: '#fff' }}>
        {seg.text}
      </p>
    )
  }

  if (mode === 'bilingual') {
    return (
      <div className="px-3">
        <p className="text-center text-[15px] font-semibold leading-snug" style={{ color: '#fff' }}>
          {seg.text}
        </p>
        {seg.translation && (
          <p className="text-center text-[13px] font-semibold leading-snug mt-0.5" style={{ color: ACCENT }}>
            {seg.translation}
          </p>
        )}
      </div>
    )
  }

  // smart
  if (seg.words?.length) {
    return (
      <p className="text-center text-[15px] font-semibold leading-snug px-3">
        {seg.words.map((w, i) =>
          w.hard && w.translation ? (
            <span key={i} className="inline">
              <span style={{ color: '#fff' }}>{w.text}</span>
              <span
                className="text-[11px] font-bold ml-0.5 mr-1 align-super"
                style={{ color: ACCENT }}
              >
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
  return (
    <p className="text-center text-[15px] font-semibold leading-snug px-3" style={{ color: '#fff' }}>
      {seg.text}
    </p>
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
  const [words, setWords] = useState<CinemaVocabWord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    cinemaApi
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
      const r = await cinemaApi.saveWord(clipId, word)
      setSaved((prev) => new Set(prev).add(word.toLowerCase()))
      if (r.alreadyHad) {
        haptic.impact('light')
        showToast(t('cinema.wordAlreadyHad'))
      } else {
        haptic.success()
        showToast(t('cinema.wordAddedToFeed'))
      }
    } catch (err: any) {
      haptic.error()
      if (err?.response?.status === 402) showToast(t('cinema.wordSaveLimitReached'))
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
            {t('cinema.wordsTitle')}
          </h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--ws-card-2)' }}>
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
                {lv ?? t('cinema.allLevels')}
              </button>
            )
          })}
        </div>

        <div className="overflow-y-auto no-scrollbar flex-1 min-h-0">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
            </div>
          )}
          {!loading && words.length === 0 && (
            <p className="text-sm text-center py-10" style={{ color: 'var(--ws-muted)' }}>
              {t('cinema.wordsEmpty')}
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
                    ? <><Check size={14} /> {t('cinema.saved')}</>
                    : <><BookmarkPlus size={14} /> {t('cinema.saveWord')}</>}
                </button>
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Upload sheet ──────────────────────────────────────────────────────────────
function UploadSheet({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState<CefrLevel>('A1')
  const [hasSubs, setHasSubs] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!file || !title.trim()) return
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('video', file)
      fd.append('title', title.trim())
      fd.append('level', level)
      fd.append('hasEmbeddedSubtitles', hasSubs ? 'true' : 'false')
      fd.append('autoTranscribe', hasSubs ? 'false' : 'true')
      await cinemaApi.upload(fd)
      haptic.success()
      onDone()
      onClose()
    } catch (e: any) {
      haptic.error()
      setError(e?.response?.data?.error ?? t('cinema.uploadError'))
    } finally {
      setUploading(false)
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
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-t-3xl px-5 pt-4 pb-8 max-h-[85%] overflow-y-auto"
        style={{ background: 'var(--ws-card)', border: '1px solid var(--ws-border)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black" style={{ color: 'var(--ws-text)' }}>{t('cinema.addVideo')}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--ws-card-2)' }}>
            <X size={16} style={{ color: 'var(--ws-muted)' }} />
          </button>
        </div>

        <p className="text-xs mb-4" style={{ color: 'var(--ws-muted)' }}>{t('cinema.addHint')}</p>

        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').slice(0, 80))
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-full py-8 rounded-2xl mb-4 flex flex-col items-center gap-2"
          style={{
            background: 'var(--ws-card-2)',
            border: `1.5px dashed ${file ? ACCENT : 'var(--ws-border)'}`,
          }}
        >
          <Upload size={28} style={{ color: file ? ACCENT : 'var(--ws-muted)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--ws-text)' }}>
            {file ? file.name : t('cinema.pickFile')}
          </span>
        </button>

        <label className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--ws-faint)' }}>
          {t('cinema.titleLabel')}
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-1 mb-3 px-3 py-2.5 rounded-xl text-sm font-semibold outline-none"
          style={{ background: 'var(--ws-card-2)', color: 'var(--ws-text)', border: '1px solid var(--ws-border)' }}
        />

        <label className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--ws-faint)' }}>
          {t('cinema.level')}
        </label>
        <div className="flex gap-2 mt-1 mb-4 flex-wrap">
          {LEVELS.map((lv) => (
            <button
              key={lv}
              type="button"
              onClick={() => setLevel(lv)}
              className="text-xs font-bold px-3 py-1.5 rounded-full"
              style={{
                color: level === lv ? LEVEL_TINT[lv] : 'var(--ws-muted)',
                background: level === lv ? `${LEVEL_TINT[lv]}1f` : 'var(--ws-card-2)',
                border: `1px solid ${level === lv ? `${LEVEL_TINT[lv]}55` : 'var(--ws-border)'}`,
              }}
            >
              {lv}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4 px-1">
          <div>
            <p className="text-sm font-bold" style={{ color: 'var(--ws-text)' }}>{t('cinema.hasSubs')}</p>
            <p className="text-[11px]" style={{ color: 'var(--ws-muted)' }}>{t('cinema.hasSubsHint')}</p>
          </div>
          <button
            type="button"
            onClick={() => setHasSubs((v) => !v)}
            className="w-12 h-7 rounded-full relative transition-colors"
            style={{ background: hasSubs ? ACCENT : 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
              style={{ left: hasSubs ? 22 : 4 }}
            />
          </button>
        </div>

        {error && (
          <p className="text-sm mb-3 font-semibold" style={{ color: 'var(--ws-danger)' }}>{error}</p>
        )}

        <button
          type="button"
          disabled={!file || !title.trim() || uploading}
          onClick={submit}
          className="w-full py-3.5 rounded-btn font-black text-sm text-white disabled:opacity-50"
          style={{ background: ACCENT }}
        >
          {uploading ? t('cinema.uploading') : t('cinema.upload')}
        </button>
      </motion.div>
    </motion.div>
  )
}

// ── Player ────────────────────────────────────────────────────────────────────
export function CinemaPlayerView({
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
  const [clip, setClip] = useState<CinemaClipDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const [activeSeg, setActiveSeg] = useState<CinemaSegment | null>(null)
  const [completing, setCompleting] = useState(false)
  const [result, setResult] = useState<CinemaCompleteResult | null>(null)
  const [showWords, setShowWords] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [phase, setPhase] = useState<MediaPhase>('idle')
  const [subMode, setSubMode] = useState<SubMode>(() => {
    const v = (typeof localStorage !== 'undefined' && localStorage.getItem(SUB_MODE_STORE)) as SubMode | null
    return v && SUB_MODES.includes(v) ? v : 'smart'
  })

  const isPremium = useAuthStore((s) => !!s.user?.isPremium)
  const [mediaToast, setMediaToast] = useState<string | null>(null)
  const [savedOffline, setSavedOffline] = useState(() => isSavedOffline('cinema', id))
  const [savingOffline, setSavingOffline] = useState(false)

  const showMediaToast = (msg: string) => {
    setMediaToast(msg)
    window.setTimeout(() => setMediaToast((cur) => (cur === msg ? null : cur)), 2600)
  }

  const cycleSubMode = () => {
    setSubMode((prev) => {
      const next = SUB_MODES[(SUB_MODES.indexOf(prev) + 1) % SUB_MODES.length]
      try { localStorage.setItem(SUB_MODE_STORE, next) } catch { /* ignore */ }
      haptic.impact('light')
      return next
    })
  }

  const handleShare = async () => {
    try {
      const { link } = await cinemaApi.share(id)
      if (!link) { showMediaToast(t('cinema.shareUnavailable')); return }
      const text = clip?.title ? `${clip.title}\n${link}` : link
      const tg = window.Telegram?.WebApp
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(clip?.title ?? '')}`)
      } else if (navigator.share) {
        await navigator.share({ title: clip?.title ?? 'Cinema', url: link })
      } else {
        await navigator.clipboard?.writeText(text)
        showMediaToast(t('cinema.shareCopied'))
      }
      haptic.success()
    } catch {
      haptic.error()
      showMediaToast(t('cinema.shareUnavailable'))
    }
  }

  const handleOffline = async () => {
    if (savingOffline) return
    if (savedOffline) {
      await removeMediaOffline('cinema', id).catch(() => {})
      setSavedOffline(false)
      showMediaToast(t('cinema.offlineRemoved'))
      return
    }
    if (!clip) return
    setSavingOffline(true)
    try {
      await saveMediaOffline('cinema', id, buildCinemaStreamUrl(clip.streamPath))
      setSavedOffline(true)
      haptic.success()
      showMediaToast(t('cinema.offlineSaved'))
    } catch {
      haptic.error()
      showMediaToast(t('cinema.offlineError'))
    } finally {
      setSavingOffline(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    setVideoError(false)
    setVideoReady(false)
    setPhase('idle')
    setLimitReached(false)
    cinemaApi
      .get(id)
      .then(setClip)
      .catch((err) => {
        if (err?.response?.status === 402) setLimitReached(true)
        else setError(true)
      })
      .finally(() => setLoading(false))
  }, [id])

  // While the server warms up the clip (download + transcode), poll status so
  // the loader can say "downloading / preparing" instead of a blank spinner.
  useEffect(() => {
    if (!clip || videoReady || videoError) return
    let alive = true
    const tick = () => {
      cinemaApi
        .clipStatus(id)
        .then((p) => { if (alive) setPhase(p) })
        .catch(() => {})
    }
    tick()
    const iv = setInterval(tick, 2500)
    return () => { alive = false; clearInterval(iv) }
  }, [clip, id, videoReady, videoError])

  const onTimeUpdate = () => {
    const v = videoRef.current
    const segs = clip?.segments
    if (!v || !segs?.length) {
      setActiveSeg(null)
      return
    }
    const t = v.currentTime
    const hit = segs.find((s) => t >= s.start && t < s.end) ?? null
    setActiveSeg(hit)
  }

  const finish = async () => {
    if (!clip || completing) return
    setCompleting(true)
    try {
      const r = await cinemaApi.complete(clip.id)
      if (r.xpEarned > 0) haptic.success()
      setResult(r)
      onCompleted(clip.id)
    } catch {
      haptic.error()
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="h-full flex flex-col relative" style={{ background: 'var(--ws-bg)' }}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.button whileTap={{ scale: 0.92 }} onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
          <ArrowLeft size={18} style={{ color: 'var(--ws-muted)' }} />
        </motion.button>
        <span className="font-black text-sm truncate px-3" style={{ color: 'var(--ws-text)' }}>
          {clip?.title ?? t('cinema.title')}
        </span>
        <div className="w-9" />
      </div>

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-9 h-9 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
        </div>
      )}

      {!loading && limitReached && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <Lock size={36} style={{ color: ACCENT }} />
          <p className="font-bold" style={{ color: 'var(--ws-text)' }}>{t('cinema.videoLimitReached')}</p>
          <button onClick={onBack} className="px-5 py-2.5 rounded-btn text-sm font-bold"
            style={{ background: 'var(--ws-card-2)', color: 'var(--ws-text)' }}>
            {t('cinema.back')}
          </button>
        </div>
      )}

      {!loading && error && !limitReached && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Frown size={36} style={{ color: 'var(--ws-muted)' }} />
          <p className="font-bold" style={{ color: 'var(--ws-text)' }}>{t('cinema.loadError')}</p>
        </div>
      )}

      {!loading && !error && !limitReached && clip && (
        <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-8 flex flex-col gap-4">
          <div className="relative rounded-card overflow-hidden bg-black w-full aspect-video shrink-0"
            style={{ border: '1px solid var(--ws-border)' }}>
            <video
              ref={videoRef}
              src={buildCinemaStreamUrl(clip.streamPath)}
              controls
              playsInline
              preload="metadata"
              onTimeUpdate={onTimeUpdate}
              onError={() => setVideoError(true)}
              onLoadedMetadata={() => { setVideoError(false); setVideoReady(true) }}
              onCanPlay={() => setVideoReady(true)}
              className="w-full h-full object-contain bg-black"
            />
            {!videoReady && !videoError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center"
                style={{ background: 'rgba(0,0,0,0.6)' }}>
                <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
                <p className="text-sm font-semibold" style={{ color: '#fff' }}>
                  {phase === 'downloading'
                    ? t('cinema.phaseDownloading')
                    : phase === 'transcoding'
                      ? t('cinema.phaseTranscoding')
                      : t('cinema.phaseLoading')}
                </p>
              </div>
            )}
            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center px-6 text-center"
                style={{ background: 'rgba(0,0,0,0.72)' }}>
                <p className="text-sm font-semibold" style={{ color: '#fff' }}>
                  {t('cinema.videoFormatError')}
                </p>
              </div>
            )}
            {/* Subtitle mode toggle. Hidden for embedded-subtitle clips: the
                video already shows its own burned-in subtitle, so an app overlay
                would just duplicate it. */}
            {!clip.hasEmbeddedSubtitles && (
              <button
                onClick={cycleSubMode}
                className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold"
                style={{ background: 'rgba(0,0,0,0.6)', color: subMode === 'off' ? 'rgba(255,255,255,0.6)' : ACCENT, backdropFilter: 'blur(4px)' }}
              >
                <Subtitles size={14} strokeWidth={2.4} />
                {t(`cinema.sub_${subMode}`)}
              </button>
            )}
            {/* Subtle subtitle overlay — only for clips WITHOUT embedded subtitles.
                Embedded clips rely on their own burned-in subtitle to avoid a
                duplicate line; the vocabulary word list still works via STT. */}
            <AnimatePresence>
              {activeSeg && subMode !== 'off' && !clip.hasEmbeddedSubtitles && (
                <motion.div
                  key={`${activeSeg.start}-${activeSeg.end}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute left-2 right-2 pointer-events-none bottom-10"
                >
                  <div
                    className="mx-auto max-w-[95%] rounded-xl py-2 px-1"
                    style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
                  >
                    <SmartSubtitle seg={activeSeg} mode={subMode} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!clip.hasEmbeddedSubtitles && (
            <p className="text-[11px]" style={{ color: 'var(--ws-faint)' }}>
              {t('cinema.smartHint')}
            </p>
          )}

          {/* Share + offline actions */}
          <div className="flex items-center gap-2">
            {!clip.isMine && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleShare}
                className="flex-1 py-2.5 rounded-btn font-bold text-xs flex items-center justify-center gap-1.5 ws-card-2"
                style={{ color: 'var(--ws-text)' }}
              >
                <Share2 size={15} strokeWidth={2.2} /> {t('cinema.share')}
              </motion.button>
            )}
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
                    ? <><Trash size={15} strokeWidth={2.2} /> {t('cinema.offlineRemove')}</>
                    : <><DownloadCloud size={15} strokeWidth={2.2} /> {t('cinema.offlineSave')}</>}
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
            {t('cinema.viewWords')}
            {(clip.vocabularyCount ?? 0) > 0 && (
              <span className="text-xs opacity-80">({clip.vocabularyCount})</span>
            )}
          </motion.button>

          {clip.isMine && (
            <div className="flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--ws-muted)' }}>
              <Lock size={12} /> {t('cinema.privateOnly')}
            </div>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={finish}
            disabled={completing}
            className="w-full py-4 rounded-btn font-black text-base flex items-center justify-center gap-2 disabled:opacity-60"
            style={
              clip.completed
                ? { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--ws-success)' }
                : { background: ACCENT, color: '#fff', boxShadow: '0 8px 24px rgba(245,158,11,0.3)' }
            }
          >
            {completing ? '…' : clip.completed
              ? <><CheckCircle2 size={18} /> {t('cinema.completed')}</>
              : <><Check size={18} /> {t('cinema.finish')}</>}
          </motion.button>
        </div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 px-8"
            style={{ background: 'rgba(8,8,12,0.86)', backdropFilter: 'blur(6px)' }}
          >
            <CheckCircle2 size={48} style={{ color: 'var(--ws-success)' }} />
            <p className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>{t('cinema.doneTitle')}</p>
            {result.xpEarned > 0 ? (
              <p className="font-black text-xl flex items-center gap-2" style={{ color: ACCENT }}>
                <Sparkles size={20} /> +{result.xpEarned} XP
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--ws-faint)' }}>{t('cinema.noXpMsg')}</p>
            )}
            {onNext ? (
              <div className="w-full max-w-xs flex flex-col gap-2">
                <button onClick={onNext} className="w-full py-4 rounded-btn font-black text-sm text-white"
                  style={{ background: ACCENT }}>
                  {t('series.next')}
                </button>
                <button onClick={onBack} className="w-full py-3 rounded-btn font-bold text-sm"
                  style={{ background: 'var(--ws-card-2)', color: 'var(--ws-text)' }}>
                  {t('cinema.backToList')}
                </button>
              </div>
            ) : (
              <button onClick={onBack} className="w-full max-w-xs py-4 rounded-btn font-black text-sm text-white"
                style={{ background: ACCENT }}>
                {t('cinema.backToList')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mediaToast && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 z-[60]"
            style={{ background: 'var(--ws-card)', border: `1px solid ${ACCENT}55`, color: 'var(--ws-text)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
          >
            <Sparkles size={15} style={{ color: ACCENT }} /> {mediaToast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showWords && <WordsSheet clipId={id} onClose={() => setShowWords(false)} />}
      </AnimatePresence>
    </div>
  )
}

// ── List ──────────────────────────────────────────────────────────────────────
function ListView({
  clips,
  loading,
  error,
  onRetry,
  onOpen,
  onBack,
  onAdd,
  onDeleted,
}: {
  clips: CinemaClipDTO[]
  loading: boolean
  error: boolean
  onRetry: () => void
  onOpen: (id: string) => void
  onBack: () => void
  onAdd: () => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'all' | 'mine'>('all')
  const visible = tab === 'mine' ? clips.filter((c) => c.isMine) : clips

  const remove = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(t('cinema.deleteConfirm'))) return
    try {
      await cinemaApi.delete(id)
      onDeleted()
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar relative" style={{ background: 'var(--ws-bg)' }}>
      <div className="px-5 pt-4 pb-28 max-w-lg mx-auto">
        <motion.button whileTap={{ scale: 0.95 }} onClick={onBack}
          className="font-semibold text-sm flex items-center gap-1 mb-3"
          style={{ color: 'var(--ws-primary-light)' }}>
          <ArrowLeft size={16} /> {t('cinema.back')}
        </motion.button>

        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h1 className="text-3xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--ws-text)' }}>
              <Film size={26} style={{ color: ACCENT }} />
              {t('cinema.title')}
            </h1>
            <p className="text-sm mt-1.5" style={{ color: 'var(--ws-muted)' }}>{t('cinema.subtitle')}</p>
          </div>
          <motion.button whileTap={{ scale: 0.94 }} onClick={onAdd}
            className="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center"
            style={{ background: `${ACCENT}22`, border: `1px solid ${ACCENT}55` }}>
            <Plus size={22} style={{ color: ACCENT }} />
          </motion.button>
        </div>

        <div className="flex gap-2 mb-4">
          {(['all', 'mine'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className="text-xs font-bold px-3.5 py-1.5 rounded-full"
              style={{
                color: tab === k ? ACCENT : 'var(--ws-muted)',
                background: tab === k ? `${ACCENT}1f` : 'var(--ws-card-2)',
                border: `1px solid ${tab === k ? `${ACCENT}55` : 'var(--ws-border)'}`,
              }}
            >
              {k === 'all' ? t('cinema.tabAll') : t('cinema.tabMine')}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-9 h-9 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: ACCENT, borderTopColor: 'transparent' }} />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Frown size={36} style={{ color: 'var(--ws-muted)' }} />
            <p className="font-bold" style={{ color: 'var(--ws-text)' }}>{t('cinema.loadError')}</p>
            <button onClick={onRetry} className="px-5 py-2.5 rounded-btn text-sm font-bold flex items-center gap-2"
              style={{ background: 'var(--ws-card-2)', color: 'var(--ws-text)' }}>
              <RotateCcw size={14} /> {t('cinema.retry')}
            </button>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Inbox size={34} style={{ color: ACCENT }} />
            <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('cinema.emptyTitle')}</p>
            <p className="text-sm max-w-xs" style={{ color: 'var(--ws-muted)' }}>{t('cinema.emptyMsg')}</p>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="flex flex-col gap-3">
            {visible.map((clip, i) => (
              <motion.button
                key={clip.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.4) }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOpen(clip.id)}
                className="w-full flex items-center gap-3 p-4 ws-card text-left"
              >
                <div className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{
                    background: clip.completed ? 'rgba(16,185,129,0.15)' : `${ACCENT}22`,
                    border: `1px solid ${clip.completed ? 'rgba(16,185,129,0.3)' : `${ACCENT}44`}`,
                  }}>
                  {clip.completed
                    ? <CheckCircle2 size={22} style={{ color: 'var(--ws-success)' }} />
                    : <Film size={22} style={{ color: ACCENT }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[15px] truncate" style={{ color: 'var(--ws-text)' }}>{clip.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <LevelBadge level={clip.level} />
                    <span className="text-xs" style={{ color: 'var(--ws-muted)' }}>{fmtTime(clip.durationSec)}</span>
                    {clip.isMine && clip.visibility === 'private' && (
                      <span className="text-[10px] font-bold flex items-center gap-0.5" style={{ color: 'var(--ws-muted)' }}>
                        <Lock size={10} /> {t('cinema.private')}
                      </span>
                    )}
                    {clip.visibility === 'global' && (
                      <span className="text-[10px] font-bold flex items-center gap-0.5" style={{ color: ACCENT }}>
                        <Globe size={10} /> {t('cinema.global')}
                      </span>
                    )}
                  </div>
                </div>
                {clip.isMine && (
                  <button
                    type="button"
                    onClick={(e) => remove(clip.id, e)}
                    className="p-2 rounded-xl"
                    style={{ color: 'var(--ws-muted)' }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function CinemaPage({
  onBack,
  deepLinkClipId,
}: {
  onBack: () => void
  deepLinkClipId?: string | null
}) {
  const [clips, setClips] = useState<CinemaClipDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [openId, setOpenId] = useState<string | null>(deepLinkClipId ?? null)
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    if (deepLinkClipId) setOpenId(deepLinkClipId)
  }, [deepLinkClipId])

  const load = useCallback(() => {
    setLoading(true)
    setError(false)
    cinemaApi
      .list()
      .then((d) => setClips(Array.isArray(d) ? d : []))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const transition = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { type: 'spring' as const, stiffness: 380, damping: 32 },
  }

  return (
    <div className="h-full relative">
      <AnimatePresence mode="wait">
        {openId ? (
          <motion.div key="player" {...transition} className="h-full">
            <CinemaPlayerView
              id={openId}
              onBack={() => setOpenId(null)}
              onCompleted={(id) =>
                setClips((prev) =>
                  prev.map((c) =>
                    c.id === id ? { ...c, completed: true, completedCount: c.completedCount + 1 } : c,
                  ),
                )
              }
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
              onAdd={() => setShowUpload(true)}
              onDeleted={load}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUpload && (
          <UploadSheet onClose={() => setShowUpload(false)} onDone={load} />
        )}
      </AnimatePresence>
    </div>
  )
}
