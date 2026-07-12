import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  NotebookPen, Plus, Check, RotateCcw, X, Volume2, ArrowLeft,
  Pencil, Brain, Share2, Users,
} from 'lucide-react'
import {
  myWordsApi,
  getApiErrorMessage,
  isConflictError,
  type UserWord,
  type WordLookup,
  type WordStatus,
} from '../../api/myWords.api'
import { wordShareApi, type ShareUser, type WordShare } from '../../api/wordShare.api'
import { useTelegram } from '../../hooks/useTelegram'
import { playWordAudio } from '../../lib/tts'

type View = 'list' | 'add'

const STATUS_COLORS: Record<WordStatus, string> = {
  new: '#2D9B6F',
  learning: '#f59e0b',
  learned: '#10b981',
  mastered: '#4CB388',
}

function statusColor(s: string): string {
  return STATUS_COLORS[s as WordStatus] ?? '#6b7280'
}

function displayName(u: { firstName: string; lastName?: string | null }) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ')
}

// ── Error toast ─────────────────────────────────────────────────────────────
function useErrorToast() {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [message, setMessage] = useState<string | null>(null)
  const [tone, setTone] = useState<'error' | 'success'>('error')

  useEffect(() => {
    if (!message) return
    const id = setTimeout(() => setMessage(null), 3500)
    return () => clearTimeout(id)
  }, [message])

  const show = useCallback(
    (e: unknown) => {
      setTone('error')
      setMessage(getApiErrorMessage(e) ?? t('myWords.error'))
      haptic.error()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  const showText = useCallback(
    (msg: string) => {
      setTone('error')
      setMessage(msg)
      haptic.error()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const showSuccess = useCallback(
    (msg: string) => {
      setTone('success')
      setMessage(msg)
      haptic.success()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return { message, tone, show, showText, showSuccess }
}

function ErrorToast({ message, tone = 'error' }: { message: string | null; tone?: 'error' | 'success' }) {
  const bg =
    tone === 'success'
      ? { background: 'rgba(45,155,111,0.92)', boxShadow: '0 8px 24px rgba(45,155,111,0.35)' }
      : { background: 'rgba(239,68,68,0.92)', boxShadow: '0 8px 24px rgba(239,68,68,0.35)' }
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="absolute top-3 left-5 right-5 z-50 rounded-2xl px-4 py-3 text-sm font-semibold text-white"
          style={bg}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SpeakerButton({ word, audioUrl }: { word: string; audioUrl?: string | null }) {
  const { haptic } = useTelegram()
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={(e) => {
        e.stopPropagation()
        haptic.impact('light')
        playWordAudio(word, audioUrl)
      }}
      className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
      style={{ background: 'rgba(45,155,111,0.12)', border: '1px solid rgba(45,155,111,0.25)' }}
      aria-label="play"
    >
      <Volume2 size={16} strokeWidth={2} style={{ color: 'var(--ws-primary-light)' }} />
    </motion.button>
  )
}

// ── Follower picker modal ───────────────────────────────────────────────────
function FollowerPicker({
  open,
  wordIds,
  shareAll,
  onClose,
  onSent,
  toast,
}: {
  open: boolean
  wordIds: string[]
  shareAll: boolean
  onClose: () => void
  onSent: () => void
  toast: ReturnType<typeof useErrorToast>
}) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [recipients, setRecipients] = useState<ShareUser[]>([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    setPicked(new Set())
    setLoading(true)
    wordShareApi
      .recipients()
      .then((list) => setRecipients(Array.isArray(list) ? list : []))
      .catch((e) => {
        setRecipients([])
        toast.show(e)
      })
      .finally(() => setLoading(false))
  }, [open, toast])

  const toggle = (id: string) => {
    haptic.impact('light')
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const send = async () => {
    if (picked.size === 0 || sending) return
    setSending(true)
    try {
      const body = shareAll
        ? { toUserIds: [...picked], all: true as const }
        : { toUserIds: [...picked], wordIds }
      await wordShareApi.create(body)
      toast.showSuccess(t('myWords.shareSent', { count: picked.size }))
      onSent()
      onClose()
    } catch (e) {
      toast.show(e)
    } finally {
      setSending(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="absolute inset-0"
            style={{ background: 'rgba(16,22,20,0.45)' }}
            onClick={onClose}
            aria-label="close"
          />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="relative w-full max-w-lg max-h-[75vh] flex flex-col rounded-t-3xl pb-safe"
            style={{
              background: 'var(--ws-card)',
              border: '1px solid var(--ws-border)',
              boxShadow: 'var(--ws-shadow-card)',
            }}
          >
            <div className="px-5 pt-4 pb-3 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-black" style={{ color: 'var(--ws-text)' }}>
                  {t('myWords.pickFollowers')}
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ws-muted)' }}>
                  {shareAll
                    ? t('myWords.shareAll')
                    : t('myWords.shareSelected', { count: wordIds.length })}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ color: 'var(--ws-faint)', background: 'var(--ws-surface)' }}
              >
                <X size={18} strokeWidth={2.2} />
              </motion.button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-2 pb-3">
              {loading && (
                <div className="flex justify-center py-10">
                  <div className="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                </div>
              )}
              {!loading && recipients.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(45,155,111,0.1)', border: '1px solid rgba(45,155,111,0.2)' }}
                  >
                    <Users size={24} strokeWidth={1.8} style={{ color: 'var(--ws-primary-light)' }} />
                  </div>
                  <p className="text-sm font-semibold max-w-xs" style={{ color: 'var(--ws-muted)' }}>
                    {t('myWords.noFollowers')}
                  </p>
                </div>
              )}
              {!loading &&
                recipients.map((u, i) => {
                  const on = picked.has(u.id)
                  return (
                    <motion.button
                      key={u.id}
                      type="button"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.04, 0.3) }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggle(u.id)}
                      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left"
                      style={{
                        background: on ? 'rgba(45,155,111,0.1)' : 'var(--ws-card-2)',
                        border: on ? '1px solid rgba(45,155,111,0.35)' : '1px solid var(--ws-border)',
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center text-sm font-black"
                        style={{
                          background: 'rgba(45,155,111,0.14)',
                          color: 'var(--ws-primary)',
                        }}
                      >
                        {u.avatarUrl ? (
                          <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (u.firstName?.[0] ?? '?').toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate" style={{ color: 'var(--ws-text)' }}>
                          {displayName(u)}
                        </p>
                        {u.username && (
                          <p className="text-xs truncate" style={{ color: 'var(--ws-muted)' }}>
                            @{u.username}
                          </p>
                        )}
                      </div>
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: on ? 'var(--ws-primary)' : 'transparent',
                          border: on ? 'none' : '2px solid var(--ws-border-strong)',
                        }}
                      >
                        {on && <Check size={14} strokeWidth={3} className="text-white" />}
                      </div>
                    </motion.button>
                  )
                })}
            </div>

            {recipients.length > 0 && (
              <div className="px-5 pt-2 pb-4 shrink-0">
                <motion.button
                  whileTap={{ scale: picked.size === 0 || sending ? 1 : 0.97 }}
                  disabled={picked.size === 0 || sending}
                  onClick={send}
                  className="w-full py-3.5 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2"
                  style={{
                    background:
                      picked.size === 0 || sending ? 'rgba(28,42,36,0.08)' : 'var(--ws-primary)',
                    color: picked.size === 0 || sending ? 'rgba(255,255,255,0.5)' : '#fff',
                    boxShadow:
                      picked.size === 0 || sending ? undefined : 'var(--ws-shadow-primary)',
                  }}
                >
                  {sending ? '…' : t('myWords.sendShare')}
                </motion.button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Add view ────────────────────────────────────────────────────────────────
function AddView({
  onBack,
  onSaved,
}: {
  onBack: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const toast = useErrorToast()

  const [word, setWord] = useState('')
  const [lookup, setLookup] = useState<WordLookup | null>(null)
  const [looking, setLooking] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [translation, setTranslation] = useState('')
  const [saving, setSaving] = useState(false)

  // Debounced lookup
  useEffect(() => {
    const q = word.trim()
    if (q.length < 2) {
      setLookup(null)
      setNotFound(false)
      setLooking(false)
      return
    }
    setLooking(true)
    const id = setTimeout(() => {
      myWordsApi
        .lookup(q)
        .then((d) => {
          if (d.found) {
            setLookup(d)
            setNotFound(false)
          } else {
            setLookup(null)
            setNotFound(true)
          }
        })
        .catch(() => {
          setLookup(null)
          setNotFound(true)
        })
        .finally(() => setLooking(false))
    }, 400)
    return () => clearTimeout(id)
  }, [word])

  const save = async () => {
    const w = word.trim()
    const tr = translation.trim()
    if (!w || !tr || saving) return
    setSaving(true)
    try {
      await myWordsApi.create({
        word: w,
        translation: tr,
        pronunciation: lookup?.pronunciation ?? null,
        audioUrl: lookup?.audioUrl ?? null,
        partOfSpeech: lookup?.partOfSpeech ?? null,
        definitionEn: lookup?.definitionEn ?? null,
        exampleEn: lookup?.exampleEn ?? null,
        synonyms: lookup?.synonyms ?? [],
      })
      haptic.success()
      onSaved()
    } catch (e) {
      if (isConflictError(e)) {
        toast.showText(t('myWords.alreadyAdded'))
      } else {
        toast.show(e)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col pb-20 relative">
      <ErrorToast message={toast.message} tone={toast.tone} />

      <div className="px-5 pt-4 pb-2 shrink-0">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="font-semibold text-sm flex items-center gap-1 mb-4"
          style={{ color: 'var(--ws-primary-light)' }}
        >
          <ArrowLeft size={16} strokeWidth={2.2} /> {t('myWords.back')}
        </motion.button>
        <h2 className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>{t('myWords.addTitle')}</h2>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-4 pt-2">
        {/* English word input */}
        <div>
          <label className="text-faint text-xs font-black uppercase tracking-widest mb-1.5 block">
            {t('myWords.englishWord')}
          </label>
          <div className="bg-surface rounded-2xl px-4 py-3.5 flex items-center gap-2">
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={t('myWords.englishPlaceholder')}
              autoFocus
              className="flex-1 bg-transparent text-text text-lg font-bold outline-none placeholder-muted"
            />
            {looking && (
              <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
            )}
            {word.trim().length >= 2 && !looking && (
              <SpeakerButton word={word.trim()} audioUrl={lookup?.audioUrl} />
            )}
          </div>
        </div>

        {/* Lookup result card */}
        <AnimatePresence mode="wait">
          {lookup && (
            <motion.div
              key="lookup"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{
                background: 'rgba(45,155,111,0.1)',
                border: '1px solid rgba(45,155,111,0.2)',
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {lookup.pronunciation && (
                  <span className="text-faint font-mono text-sm">{lookup.pronunciation}</span>
                )}
                {lookup.partOfSpeech && (
                  <span
                    className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                    style={{ color: '#2D9B6F', background: 'rgba(45,155,111,0.15)' }}
                  >
                    {lookup.partOfSpeech}
                  </span>
                )}
              </div>
              {lookup.definitionEn && (
                <div>
                  <p className="text-faint text-[10px] font-black uppercase tracking-widest mb-1">
                    {t('myWords.definition')}
                  </p>
                  <p className="text-muted text-sm leading-relaxed">{lookup.definitionEn}</p>
                </div>
              )}
              {lookup.exampleEn && (
                <div>
                  <p className="text-faint text-[10px] font-black uppercase tracking-widest mb-1">
                    {t('myWords.example')}
                  </p>
                  <p className="text-muted text-xs italic">"{lookup.exampleEn}"</p>
                </div>
              )}
              {lookup.synonyms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {lookup.synonyms.map((s) => (
                    <span
                      key={s}
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ color: '#c4b5fd', background: 'rgba(45,155,111,0.12)' }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
          {notFound && (
            <motion.div
              key="notfound"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="rounded-2xl p-3.5 text-center"
              style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
            >
              <p className="text-warning text-sm font-semibold">{t('myWords.notFound')}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Uzbek translation — the warm, central learning step */}
        <div className="mt-1">
          <label className="text-xs font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--ws-success)' }}>
            <Pencil size={13} strokeWidth={2.4} /> {t('myWords.translationLabel')}
          </label>
          <div
            className="rounded-2xl px-4 py-3.5 flex items-center"
            style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)' }}
          >
            <input
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              placeholder={t('myWords.translationPlaceholder')}
              className="flex-1 bg-transparent text-text text-lg font-bold outline-none placeholder-muted"
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>
          <p className="text-faint text-xs mt-1.5">{t('myWords.translationHint')}</p>
        </div>
      </div>

      {/* Save bar */}
      <div className="px-5 pt-3 shrink-0">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={save}
          disabled={!word.trim() || !translation.trim() || saving}
          className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2"
          style={{
            background:
              !word.trim() || !translation.trim() || saving
                ? 'rgba(28,42,36,0.06)'
                : '#10b981',
            boxShadow:
              !word.trim() || !translation.trim() || saving
                ? undefined
                : '0 8px 24px rgba(16,185,129,0.3)',
            color: !word.trim() || !translation.trim() || saving ? 'rgba(255,255,255,0.55)' : '#fff',
          }}
        >
          {saving ? '…' : <><Check size={18} strokeWidth={2.4} /> {t('myWords.save')}</>}
        </motion.button>
      </div>
    </div>
  )
}


// ── List view (default) ─────────────────────────────────────────────────────
function ListView({
  words,
  dueCount,
  loading,
  onAdd,
  onMemorize,
  onChanged,
  onBack,
  onReload,
  toast,
  focusShareId,
  onShareModeChange,
}: {
  words: UserWord[]
  dueCount: number
  loading: boolean
  onAdd: () => void
  onMemorize?: () => void
  onChanged: (words: UserWord[]) => void
  onBack?: () => void
  onReload: () => void
  toast: ReturnType<typeof useErrorToast>
  focusShareId?: string | null
  onShareModeChange?: (active: boolean) => void
}) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const [incoming, setIncoming] = useState<WordShare[]>([])
  const [actingId, setActingId] = useState<string | null>(null)

  const [shareMode, setShareMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerAll, setPickerAll] = useState(false)
  const focusHandled = useRef<string | null>(null)

  useEffect(() => {
    onShareModeChange?.(shareMode)
    return () => onShareModeChange?.(false)
  }, [shareMode, onShareModeChange])

  const loadIncoming = useCallback(() => {
    wordShareApi
      .incoming()
      .then((list) => setIncoming(Array.isArray(list) ? list : []))
      .catch(() => setIncoming([]))
  }, [])

  useEffect(() => {
    loadIncoming()
  }, [loadIncoming])

  // Deep-link: auto-accept focused pending share once
  useEffect(() => {
    if (!focusShareId || focusHandled.current === focusShareId) return
    const target = incoming.find((s) => s.id === focusShareId && s.status === 'pending')
    if (!target && incoming.length === 0) {
      // Still loading or not in list yet — try fetch by id
      let cancelled = false
      wordShareApi
        .get(focusShareId)
        .then(async (share) => {
          if (cancelled || focusHandled.current === focusShareId) return
          if (share.status !== 'pending') {
            focusHandled.current = focusShareId
            return
          }
          focusHandled.current = focusShareId
          setActingId(share.id)
          try {
            const res = await wordShareApi.accept(share.id)
            haptic.success()
            const parts = [t('myWords.acceptedWords', { count: res.added })]
            if (res.skipped > 0) parts.push(t('myWords.skippedWords', { count: res.skipped }))
            toast.showSuccess(parts.join(' · '))
            loadIncoming()
            onReload()
          } catch (e) {
            toast.show(e)
            // Still surface it in the banner
            setIncoming((prev) => (prev.some((x) => x.id === share.id) ? prev : [share, ...prev]))
          } finally {
            setActingId(null)
          }
        })
        .catch(() => {
          focusHandled.current = focusShareId
        })
      return () => {
        cancelled = true
      }
    }
    if (!target) return
    focusHandled.current = focusShareId
    ;(async () => {
      setActingId(target.id)
      try {
        const res = await wordShareApi.accept(target.id)
        haptic.success()
        const parts = [t('myWords.acceptedWords', { count: res.added })]
        if (res.skipped > 0) parts.push(t('myWords.skippedWords', { count: res.skipped }))
        toast.showSuccess(parts.join(' · '))
        loadIncoming()
        onReload()
      } catch (e) {
        toast.show(e)
      } finally {
        setActingId(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusShareId, incoming])

  useEffect(() => {
    if (!confirmRemoveId) return
    const id = setTimeout(() => setConfirmRemoveId(null), 2500)
    return () => clearTimeout(id)
  }, [confirmRemoveId])

  const remove = async (id: string) => {
    if (confirmRemoveId !== id) {
      setConfirmRemoveId(id)
      haptic.impact('light')
      return
    }
    setConfirmRemoveId(null)
    const prev = words
    onChanged(words.filter((w) => w.id !== id))
    haptic.impact('medium')
    try {
      await myWordsApi.remove(id)
    } catch (e) {
      onChanged(prev)
      toast.show(e)
    }
  }

  const master = async (w: UserWord) => {
    const prev = words
    onChanged(words.map((x) => (x.id === w.id ? { ...x, status: 'mastered' } : x)))
    haptic.success()
    try {
      await myWordsApi.master(w.id)
    } catch (e) {
      onChanged(prev)
      toast.show(e)
    }
  }

  const relearn = async (w: UserWord) => {
    const prev = words
    onChanged(words.map((x) => (x.id === w.id ? { ...x, status: 'new', strength: 0 } : x)))
    haptic.impact('medium')
    try {
      await myWordsApi.relearn(w.id)
    } catch (e) {
      onChanged(prev)
      toast.show(e)
    }
  }

  const startEdit = (w: UserWord) => {
    setConfirmRemoveId(null)
    setEditId(w.id)
    setEditValue(w.translation)
  }

  const saveEdit = async (w: UserWord) => {
    const val = editValue.trim()
    setEditId(null)
    if (!val || val === w.translation) return
    const prev = words
    onChanged(words.map((x) => (x.id === w.id ? { ...x, translation: val } : x)))
    try {
      await myWordsApi.update(w.id, { translation: val })
      haptic.success()
    } catch (e) {
      onChanged(prev)
      toast.show(e)
    }
  }

  const acceptShare = async (share: WordShare) => {
    if (actingId) return
    setActingId(share.id)
    try {
      const res = await wordShareApi.accept(share.id)
      haptic.success()
      const parts = [t('myWords.acceptedWords', { count: res.added })]
      if (res.skipped > 0) parts.push(t('myWords.skippedWords', { count: res.skipped }))
      toast.showSuccess(parts.join(' · '))
      setIncoming((prev) => prev.filter((s) => s.id !== share.id))
      onReload()
    } catch (e) {
      toast.show(e)
    } finally {
      setActingId(null)
    }
  }

  const declineShare = async (share: WordShare) => {
    if (actingId) return
    setActingId(share.id)
    try {
      await wordShareApi.decline(share.id)
      haptic.impact('medium')
      setIncoming((prev) => prev.filter((s) => s.id !== share.id))
    } catch (e) {
      toast.show(e)
    } finally {
      setActingId(null)
    }
  }

  const toggleShareMode = () => {
    haptic.impact('light')
    setShareMode((v) => {
      if (v) setSelected(new Set())
      return !v
    })
  }

  const toggleWord = (id: string) => {
    haptic.impact('light')
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    haptic.impact('light')
    if (selected.size === words.length) setSelected(new Set())
    else setSelected(new Set(words.map((w) => w.id)))
  }

  const openPicker = () => {
    if (selected.size === 0) return
    setPickerAll(selected.size === words.length)
    setPickerOpen(true)
    haptic.impact('medium')
  }

  const pending = incoming.filter((s) => s.status === 'pending')
  const allSelected = words.length > 0 && selected.size === words.length

  return (
    <div className={`h-full flex flex-col relative ${shareMode ? '' : 'pb-20'}`}>
      <ErrorToast message={toast.message} tone={toast.tone} />

      {/* Header */}
      <div className="px-5 pt-4 pb-3 shrink-0">
        {onBack && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className="font-semibold text-sm flex items-center gap-1 mb-3"
            style={{ color: 'var(--ws-primary-light)' }}
          >
            <ArrowLeft size={16} strokeWidth={2.2} /> {t('myWords.back')}
          </motion.button>
        )}
        <div className="flex items-center justify-between mb-4 gap-2">
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2 min-w-0" style={{ color: 'var(--ws-text)' }}>
            <NotebookPen size={22} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
            <span className="truncate">{t('myWords.title')}</span>
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            {words.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={toggleShareMode}
                className="font-bold px-3 py-2 rounded-btn text-sm flex items-center gap-1"
                style={
                  shareMode
                    ? {
                        background: 'rgba(45,155,111,0.14)',
                        color: 'var(--ws-primary)',
                        border: '1px solid rgba(45,155,111,0.3)',
                      }
                    : {
                        background: 'var(--ws-surface)',
                        color: 'var(--ws-text)',
                        border: '1px solid var(--ws-border)',
                      }
                }
              >
                <Share2 size={15} strokeWidth={2.4} /> {shareMode ? t('myWords.shareMode') : t('myWords.share')}
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={onAdd}
              className="text-white font-bold px-4 py-2 rounded-btn text-sm flex items-center gap-1"
              style={{ background: 'var(--ws-primary)', boxShadow: 'var(--ws-shadow-primary)' }}
            >
              <Plus size={16} strokeWidth={2.6} /> {t('myWords.add')}
            </motion.button>
          </div>
        </div>

        {/* Incoming pending shares */}
        <AnimatePresence>
          {pending.map((share) => (
            <motion.div
              key={share.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3 rounded-2xl px-4 py-3.5"
              style={{
                background: 'rgba(45,155,111,0.08)',
                border: share.id === focusShareId
                  ? '1.5px solid var(--ws-primary)'
                  : '1px solid rgba(45,155,111,0.22)',
              }}
            >
              <p className="text-sm font-bold mb-2.5" style={{ color: 'var(--ws-text)' }}>
                {t('myWords.incomingTitle', {
                  name: displayName(share.fromUser),
                  count: share.wordCount,
                })}
              </p>
              <div className="flex items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  disabled={actingId === share.id}
                  onClick={() => acceptShare(share)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black text-white"
                  style={{ background: 'var(--ws-primary)' }}
                >
                  {actingId === share.id ? '…' : t('myWords.accept')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  disabled={actingId === share.id}
                  onClick={() => declineShare(share)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-black"
                  style={{
                    background: 'var(--ws-surface)',
                    color: 'var(--ws-muted)',
                    border: '1px solid var(--ws-border)',
                  }}
                >
                  {t('myWords.decline')}
                </motion.button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-faint font-semibold">
              {words.length} {t('myWords.wordsCount')}
            </span>
            {dueCount > 0 && (
              <span
                className="text-xs font-black px-2.5 py-1 rounded-full"
                style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.14)' }}
              >
                {dueCount} {t('myWords.due')}
              </span>
            )}
          </div>
        </div>

        {shareMode && (
          <p className="text-xs mt-2" style={{ color: 'var(--ws-muted)' }}>
            {t('myWords.shareHint')}
          </p>
        )}

        {/* Flagship: the multi-method "Yodlash muhiti" memorize environment */}
        {!shareMode && (
          <motion.button
            whileTap={{ scale: words.length === 0 ? 1 : 0.97 }}
            onClick={() => words.length > 0 && onMemorize?.()}
            disabled={words.length === 0}
            className="w-full mt-3 py-3.5 rounded-2xl font-black text-base flex items-center justify-center gap-2"
            style={
              words.length === 0
                ? {
                    background: 'rgba(28,42,36,0.06)',
                    border: '1px solid rgba(28,42,36,0.10)',
                    color: 'rgba(28,42,36,0.34)',
                  }
                : {
                    background: 'var(--ws-primary)',
                    boxShadow: 'var(--ws-shadow-primary)',
                    color: '#fff',
                  }
            }
          >
            <Brain size={18} strokeWidth={2.4} /> {t('myWords.study')}
          </motion.button>
        )}
      </div>

      {/* List */}
      <div
        className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-2.5 pt-1"
        style={{ paddingBottom: shareMode ? 96 : undefined }}
      >
        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && words.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4 py-16 text-center"
          >
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
              style={{ background: 'rgba(45,155,111,0.12)', border: '1px solid rgba(45,155,111,0.25)' }}>
              <NotebookPen size={34} strokeWidth={1.8} style={{ color: 'var(--ws-primary-light)' }} />
            </div>
            <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('myWords.emptyTitle')}</p>
            <p className="text-sm max-w-xs" style={{ color: 'var(--ws-muted)' }}>{t('myWords.emptyMsg')}</p>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onAdd}
              className="mt-2 px-6 py-3 rounded-btn font-bold text-sm text-white flex items-center gap-2"
              style={{ background: 'var(--ws-primary)', boxShadow: 'var(--ws-shadow-primary)' }}
            >
              <Plus size={16} strokeWidth={2.6} /> {t('myWords.addFirst')}
            </motion.button>
          </motion.div>
        )}

        {!loading &&
          words.map((w, i) => {
            const sc = statusColor(w.status)
            const isEditing = editId === w.id
            const isSelected = selected.has(w.id)
            return (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                onClick={() => shareMode && toggleWord(w.id)}
                className="ws-card px-4 py-3.5 flex items-center gap-3"
                style={
                  shareMode && isSelected
                    ? { borderColor: 'rgba(45,155,111,0.45)', background: 'rgba(45,155,111,0.06)' }
                    : undefined
                }
              >
                {shareMode && (
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{
                      background: isSelected ? 'var(--ws-primary)' : 'transparent',
                      border: isSelected ? 'none' : '2px solid var(--ws-border-strong)',
                    }}
                  >
                    {isSelected && <Check size={14} strokeWidth={3} className="text-white" />}
                  </div>
                )}

                {!shareMode && <SpeakerButton word={w.word} audioUrl={w.audioUrl} />}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold truncate" style={{ color: 'var(--ws-text)' }}>{w.word}</p>
                    <span
                      className="text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wide"
                      style={{ color: sc, background: `${sc}1f` }}
                    >
                      {t(`myWords.status.${w.status}`)}
                    </span>
                  </div>
                  {isEditing ? (
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoFocus
                      onBlur={() => saveEdit(w)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(w)
                        if (e.key === 'Escape') setEditId(null)
                      }}
                      className="mt-1 w-full bg-transparent text-success text-sm font-semibold outline-none border-b border-success/40 pb-0.5"
                    />
                  ) : (
                    <p
                      className="text-success/90 text-sm mt-0.5 truncate cursor-text"
                      onClick={(e) => {
                        if (shareMode) return
                        e.stopPropagation()
                        startEdit(w)
                      }}
                    >
                      {w.translation}
                    </p>
                  )}
                  {w.sharedFromName && (
                    <p
                      className="text-[10px] font-semibold mt-1 truncate"
                      style={{ color: 'var(--ws-faint)' }}
                    >
                      {t('myWords.sharedFrom', { name: w.sharedFromName })}
                    </p>
                  )}
                </div>

                {!shareMode && (
                  <>
                    {/* Mastered → bring back to learning; otherwise → mark as memorized */}
                    {w.status === 'mastered' ? (
                      <motion.button
                        whileTap={{ scale: 0.88 }}
                        onClick={() => relearn(w)}
                        aria-label={t('myWords.relearn')}
                        title={t('myWords.relearn')}
                        className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                        style={{ color: '#4CB388', background: 'rgba(45,155,111,0.12)', border: '1px solid rgba(45,155,111,0.25)' }}
                      >
                        <RotateCcw size={16} strokeWidth={2.2} />
                      </motion.button>
                    ) : (
                      <motion.button
                        whileTap={{ scale: 0.88 }}
                        onClick={() => master(w)}
                        aria-label={t('myWords.markLearned')}
                        title={t('myWords.markLearned')}
                        className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                        style={{ color: '#34d399', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}
                      >
                        <Check size={16} strokeWidth={2.6} />
                      </motion.button>
                    )}

                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => remove(w.id)}
                      aria-label={t('myWords.delete')}
                      className="shrink-0 flex items-center justify-center rounded-lg"
                      style={
                        confirmRemoveId === w.id
                          ? {
                              color: '#f87171',
                              background: 'rgba(239,68,68,0.15)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              padding: '4px 8px',
                              fontSize: '12px',
                              fontWeight: 800,
                            }
                          : { color: 'var(--ws-faint)', width: 32, height: 32 }
                      }
                    >
                      {confirmRemoveId === w.id ? t('myWords.removeConfirm') : <X size={16} strokeWidth={2.4} />}
                    </motion.button>
                  </>
                )}
              </motion.div>
            )
          })}
      </div>

      {/* Share mode dock — replaces tab bar */}
      <AnimatePresence>
        {shareMode && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="fixed left-0 right-0 z-50 px-3 pointer-events-none"
            style={{ bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div
              className="pointer-events-auto mx-auto flex items-center gap-2 max-w-lg px-2"
              style={{
                background: 'var(--ws-card)',
                border: '1px solid var(--ws-border)',
                borderRadius: 20,
                boxShadow: 'var(--ws-shadow-dock)',
                height: 56,
              }}
            >
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={toggleShareMode}
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ color: 'var(--ws-muted)', background: 'var(--ws-surface)' }}
                aria-label={t('myWords.shareCancel')}
              >
                <X size={18} strokeWidth={2.4} />
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={selectAll}
                disabled={words.length === 0}
                className="px-3 h-10 rounded-full text-xs font-bold shrink-0 flex items-center gap-1.5"
                style={
                  allSelected
                    ? {
                        background: 'rgba(45,155,111,0.16)',
                        color: 'var(--ws-primary)',
                        border: '1px solid rgba(45,155,111,0.35)',
                      }
                    : {
                        background: 'var(--ws-surface)',
                        color: 'var(--ws-text)',
                        border: '1px solid var(--ws-border)',
                      }
                }
              >
                {allSelected && <Check size={14} strokeWidth={2.6} />}
                {allSelected ? t('myWords.deselectAll') : t('myWords.selectAll')}
              </motion.button>

              <motion.button
                whileTap={{ scale: selected.size === 0 ? 1 : 0.96 }}
                onClick={openPicker}
                disabled={selected.size === 0}
                className="flex-1 h-10 rounded-full font-black text-sm text-white flex items-center justify-center gap-1.5 min-w-0"
                style={{
                  background: selected.size === 0 ? 'var(--ws-surface)' : 'var(--ws-primary)',
                  color: selected.size === 0 ? 'var(--ws-faint)' : '#fff',
                  boxShadow: selected.size === 0 ? undefined : 'var(--ws-shadow-primary)',
                }}
              >
                <Share2 size={15} strokeWidth={2.4} className="shrink-0" />
                <span className="truncate">
                  {selected.size === 0
                    ? t('myWords.sharePickFirst')
                    : t('myWords.shareSelected', { count: selected.size })}
                </span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FollowerPicker
        open={pickerOpen}
        wordIds={[...selected]}
        shareAll={pickerAll}
        onClose={() => setPickerOpen(false)}
        onSent={() => {
          setShareMode(false)
          setSelected(new Set())
        }}
        toast={toast}
      />
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export function MyWordsPage({
  onBack,
  onMemorize,
  focusShareId,
  onShareModeChange,
}: {
  onBack?: () => void
  onMemorize?: () => void
  focusShareId?: string | null
  onShareModeChange?: (active: boolean) => void
}) {
  const [view, setView] = useState<View>('list')
  const [words, setWords] = useState<UserWord[]>([])
  const [dueCount, setDueCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const toast = useErrorToast()

  const load = useCallback(() => {
    setLoading(true)
    myWordsApi
      .list()
      .then((d) => {
        setWords(Array.isArray(d?.words) ? d.words : [])
        setDueCount(d?.dueCount ?? 0)
      })
      .catch(() => {
        setWords([])
        setDueCount(0)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const transition = {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { type: 'spring' as const, stiffness: 380, damping: 32 },
  }

  return (
    <AnimatePresence mode="wait">
      {view === 'add' && (
        <motion.div key="add" {...transition} className="h-full bg-bg">
          <AddView
            onBack={() => setView('list')}
            onSaved={() => {
              load()
              setView('list')
            }}
          />
        </motion.div>
      )}
      {view === 'list' && (
        <motion.div key="list" {...transition} className="h-full bg-bg">
          <ListView
            words={words}
            dueCount={dueCount}
            loading={loading}
            onAdd={() => setView('add')}
            onMemorize={onMemorize}
            onChanged={setWords}
            onBack={onBack}
            onReload={load}
            toast={toast}
            focusShareId={focusShareId}
            onShareModeChange={onShareModeChange}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
