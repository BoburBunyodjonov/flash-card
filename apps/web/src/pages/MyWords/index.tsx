import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  NotebookPen, Plus, Check, RotateCcw, X, Volume2, ArrowLeft,
  Pencil, Brain,
} from 'lucide-react'
import {
  myWordsApi,
  getApiErrorMessage,
  isConflictError,
  type UserWord,
  type WordLookup,
  type WordStatus,
} from '../../api/myWords.api'
import { useTelegram } from '../../hooks/useTelegram'
import { playWordAudio } from '../../lib/tts'

type View = 'list' | 'add'

const STATUS_COLORS: Record<WordStatus, string> = {
  new: '#6366f1',
  learning: '#f59e0b',
  learned: '#10b981',
  mastered: '#a78bfa',
}

function statusColor(s: string): string {
  return STATUS_COLORS[s as WordStatus] ?? '#6b7280'
}

// ── Error toast ─────────────────────────────────────────────────────────────
function useErrorToast() {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!message) return
    const id = setTimeout(() => setMessage(null), 3500)
    return () => clearTimeout(id)
  }, [message])

  const show = useCallback(
    (e: unknown) => {
      setMessage(getApiErrorMessage(e) ?? t('myWords.error'))
      haptic.error()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  )

  const showText = useCallback(
    (msg: string) => {
      setMessage(msg)
      haptic.error()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return { message, show, showText }
}

function ErrorToast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="absolute top-3 left-5 right-5 z-50 rounded-2xl px-4 py-3 text-sm font-semibold text-white"
          style={{ background: 'rgba(239,68,68,0.92)', boxShadow: '0 8px 24px rgba(239,68,68,0.35)' }}
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
      style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
      aria-label="play"
    >
      <Volume2 size={16} strokeWidth={2} style={{ color: 'var(--ws-primary-light)' }} />
    </motion.button>
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
      <ErrorToast message={toast.message} />

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
          <label className="text-white/35 text-xs font-black uppercase tracking-widest mb-1.5 block">
            {t('myWords.englishWord')}
          </label>
          <div className="bg-surface rounded-2xl px-4 py-3.5 flex items-center gap-2">
            <input
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={t('myWords.englishPlaceholder')}
              autoFocus
              className="flex-1 bg-transparent text-white text-lg font-bold outline-none placeholder-muted"
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
                background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.05))',
                border: '1px solid rgba(99,102,241,0.2)',
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {lookup.pronunciation && (
                  <span className="text-white/45 font-mono text-sm">{lookup.pronunciation}</span>
                )}
                {lookup.partOfSpeech && (
                  <span
                    className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                    style={{ color: '#a5b4fc', background: 'rgba(99,102,241,0.15)' }}
                  >
                    {lookup.partOfSpeech}
                  </span>
                )}
              </div>
              {lookup.definitionEn && (
                <div>
                  <p className="text-white/25 text-[10px] font-black uppercase tracking-widest mb-1">
                    {t('myWords.definition')}
                  </p>
                  <p className="text-white/65 text-sm leading-relaxed">{lookup.definitionEn}</p>
                </div>
              )}
              {lookup.exampleEn && (
                <div>
                  <p className="text-white/25 text-[10px] font-black uppercase tracking-widest mb-1">
                    {t('myWords.example')}
                  </p>
                  <p className="text-white/55 text-xs italic">"{lookup.exampleEn}"</p>
                </div>
              )}
              {lookup.synonyms.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {lookup.synonyms.map((s) => (
                    <span
                      key={s}
                      className="text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ color: '#c4b5fd', background: 'rgba(139,92,246,0.12)' }}
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
              className="flex-1 bg-transparent text-white text-lg font-bold outline-none placeholder-muted"
              onKeyDown={(e) => e.key === 'Enter' && save()}
            />
          </div>
          <p className="text-white/25 text-xs mt-1.5">{t('myWords.translationHint')}</p>
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
                ? 'rgba(255,255,255,0.06)'
                : 'linear-gradient(135deg, #10b981, #059669)',
            boxShadow:
              !word.trim() || !translation.trim() || saving
                ? undefined
                : '0 8px 24px rgba(16,185,129,0.3)',
            color: !word.trim() || !translation.trim() || saving ? 'rgba(255,255,255,0.35)' : '#fff',
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
  toast,
}: {
  words: UserWord[]
  dueCount: number
  loading: boolean
  onAdd: () => void
  onMemorize?: () => void
  onChanged: (words: UserWord[]) => void
  onBack?: () => void
  toast: ReturnType<typeof useErrorToast>
}) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

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

  return (
    <div className="h-full flex flex-col pb-20 relative">
      <ErrorToast message={toast.message} />

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
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2" style={{ color: 'var(--ws-text)' }}>
            <NotebookPen size={22} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
            {t('myWords.title')}
          </h1>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onAdd}
            className="text-white font-bold px-4 py-2 rounded-btn text-sm flex items-center gap-1 ws-gradient-bg ws-glow-primary"
          >
            <Plus size={16} strokeWidth={2.6} /> {t('myWords.add')}
          </motion.button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/40 font-semibold">
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

        {/* Flagship: the multi-method "Yodlash muhiti" memorize environment */}
        <motion.button
          whileTap={{ scale: words.length === 0 ? 1 : 0.97 }}
          onClick={() => words.length > 0 && onMemorize?.()}
          disabled={words.length === 0}
          className="w-full mt-3 py-3.5 rounded-2xl font-black text-base flex items-center justify-center gap-2"
          style={
            words.length === 0
              ? {
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.3)',
                }
              : {
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  boxShadow: '0 8px 24px rgba(99,102,241,0.35)',
                  color: '#fff',
                }
          }
        >
          <Brain size={18} strokeWidth={2.4} /> {t('myWords.study')}
        </motion.button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-2.5 pt-1">
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
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <NotebookPen size={34} strokeWidth={1.8} style={{ color: 'var(--ws-primary-light)' }} />
            </div>
            <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('myWords.emptyTitle')}</p>
            <p className="text-sm max-w-xs" style={{ color: 'var(--ws-muted)' }}>{t('myWords.emptyMsg')}</p>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={onAdd}
              className="mt-2 px-6 py-3 rounded-btn font-bold text-sm text-white flex items-center gap-2 ws-gradient-bg ws-glow-primary"
            >
              <Plus size={16} strokeWidth={2.6} /> {t('myWords.addFirst')}
            </motion.button>
          </motion.div>
        )}

        {!loading &&
          words.map((w, i) => {
            const sc = statusColor(w.status)
            const isEditing = editId === w.id
            return (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                className="ws-card px-4 py-3.5 flex items-center gap-3"
              >
                <SpeakerButton word={w.word} audioUrl={w.audioUrl} />

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
                      onClick={() => startEdit(w)}
                    >
                      {w.translation}
                    </p>
                  )}
                </div>

                {/* Mastered → bring back to learning; otherwise → mark as memorized */}
                {w.status === 'mastered' ? (
                  <motion.button
                    whileTap={{ scale: 0.88 }}
                    onClick={() => relearn(w)}
                    aria-label={t('myWords.relearn')}
                    title={t('myWords.relearn')}
                    className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center"
                    style={{ color: '#818cf8', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
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
              </motion.div>
            )
          })}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export function MyWordsPage({ onBack, onMemorize }: { onBack?: () => void; onMemorize?: () => void }) {
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
            toast={toast}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
