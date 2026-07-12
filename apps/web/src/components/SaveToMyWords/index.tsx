import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Check, NotebookPen, Pencil, X } from 'lucide-react'
import { myWordsApi, getApiErrorMessage, isConflictError } from '../../api/myWords.api'
import { useTelegram } from '../../hooks/useTelegram'

export interface WordPrefill {
  word: string
  translation?: string | null
  pronunciation?: string | null
  audioUrl?: string | null
  partOfSpeech?: string | null
  definitionEn?: string | null
  exampleEn?: string | null
  synonyms?: string[]
}

interface SaveToMyWordsProps {
  prefill: WordPrefill
  /** Compact icon button vs full-width bar */
  variant?: 'button' | 'bar'
  className?: string
}

export function SaveToMyWords({ prefill, variant = 'bar', className }: SaveToMyWordsProps) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [open, setOpen] = useState(false)
  const [translation, setTranslation] = useState(prefill.translation?.trim() ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [knownWords, setKnownWords] = useState<Set<string> | null>(null)

  const wordKey = prefill.word.trim().toLowerCase()
  const alreadySaved = knownWords?.has(wordKey) ?? false

  useEffect(() => {
    myWordsApi.list()
      .then((data) => setKnownWords(new Set(data.words.map((w) => w.word.toLowerCase()))))
      .catch(() => setKnownWords(new Set()))
  }, [])

  useEffect(() => {
    if (open) setTranslation(prefill.translation?.trim() ?? '')
  }, [open, prefill.translation])

  const markSaved = useCallback(() => {
    setKnownWords((prev) => new Set([...(prev ?? []), wordKey]))
    setSaved(true)
    haptic.success()
  }, [haptic, wordKey])

  const save = async () => {
    if (!translation.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      await myWordsApi.create({
        word: prefill.word.trim(),
        translation: translation.trim(),
        pronunciation: prefill.pronunciation,
        audioUrl: prefill.audioUrl,
        partOfSpeech: prefill.partOfSpeech,
        definitionEn: prefill.definitionEn,
        exampleEn: prefill.exampleEn,
        synonyms: prefill.synonyms,
      })
      markSaved()
      setOpen(false)
    } catch (e) {
      if (isConflictError(e)) {
        markSaved()
        setOpen(false)
      } else {
        setError(getApiErrorMessage(e) ?? t('myWords.error'))
        haptic.error()
      }
    } finally {
      setSaving(false)
    }
  }

  const isDone = saved || alreadySaved

  const trigger = variant === 'button' ? (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => !isDone && setOpen(true)}
      disabled={isDone}
      aria-label={t('dictionary.saveToMyWords')}
      className={className}
      style={{
        width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isDone ? 'rgba(16,185,129,0.15)' : 'rgba(45,155,111,0.14)',
        border: `1px solid ${isDone ? 'rgba(16,185,129,0.35)' : 'rgba(45,155,111,0.3)'}`,
        color: isDone ? '#34d399' : 'var(--ws-primary-light)',
      }}
    >
      {isDone ? <Check size={20} strokeWidth={2.4} /> : <NotebookPen size={19} strokeWidth={2} />}
    </motion.button>
  ) : (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => !isDone && setOpen(true)}
      disabled={isDone}
      className={`w-full py-3.5 rounded-btn font-bold text-sm flex items-center justify-center gap-2 ${className ?? ''}`}
      style={{
        background: isDone
          ? 'rgba(16,185,129,0.12)'
          : 'rgba(45,155,111,0.18)',
        border: `1px solid ${isDone ? 'rgba(16,185,129,0.3)' : 'rgba(45,155,111,0.35)'}`,
        color: isDone ? '#34d399' : 'var(--ws-primary-light)',
      }}
    >
      {isDone ? (
        <><Check size={17} strokeWidth={2.4} /> {t('dictionary.savedToMyWords')}</>
      ) : (
        <><NotebookPen size={17} strokeWidth={2} /> {t('dictionary.saveToMyWords')}</>
      )}
    </motion.button>
  )

  return (
    <>
      {trigger}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-t-3xl px-5 pt-5 pb-8 flex flex-col gap-4"
              style={{ background: 'var(--ws-card)', borderTop: '1px solid var(--ws-border)' }}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black" style={{ color: 'var(--ws-text)' }}>
                  {t('dictionary.saveToMyWords')}
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(28,42,36,0.06)' }}
                >
                  <X size={16} style={{ color: 'var(--ws-muted)' }} />
                </button>
              </div>

              <p className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>{prefill.word}</p>

              {prefill.definitionEn && (
                <p className="text-sm leading-relaxed" style={{ color: 'var(--ws-muted)' }}>{prefill.definitionEn}</p>
              )}

              <div>
                <label
                  className="text-xs font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5"
                  style={{ color: 'var(--ws-success)' }}
                >
                  <Pencil size={13} strokeWidth={2.4} /> {t('myWords.translationLabel')}
                </label>
                <div
                  className="rounded-2xl px-4 py-3.5"
                  style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.25)' }}
                >
                  <input
                    value={translation}
                    onChange={(e) => setTranslation(e.target.value)}
                    placeholder={t('myWords.translationPlaceholder')}
                    autoFocus
                    className="w-full bg-transparent text-lg font-bold outline-none"
                    style={{ color: 'var(--ws-text)' }}
                    onKeyDown={(e) => e.key === 'Enter' && save()}
                  />
                </div>
                <p className="text-xs mt-1.5" style={{ color: 'var(--ws-faint)' }}>{t('myWords.translationHint')}</p>
              </div>

              {error && (
                <p className="text-sm font-semibold text-center" style={{ color: '#f87171' }}>{error}</p>
              )}

              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={save}
                disabled={!translation.trim() || saving}
                className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2"
                style={{
                  background: !translation.trim() || saving
                    ? 'rgba(28,42,36,0.06)'
                    : '#10b981',
                  color: !translation.trim() || saving ? 'rgba(255,255,255,0.55)' : '#fff',
                }}
              >
                {saving ? '…' : <><Check size={18} strokeWidth={2.4} /> {t('myWords.save')}</>}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** Build prefill from a free-dictionary API entry. */
export function prefillFromDictEntry(entry: {
  word: string
  phonetic?: string
  phonetics: { text?: string; audio?: string }[]
  meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[]; synonyms: string[] }[]
}): WordPrefill {
  const phonetic = entry.phonetic ?? entry.phonetics.find((p) => p.text)?.text ?? null
  const audioUrl = entry.phonetics.find((p) => p.audio)?.audio ?? null
  const meaning = entry.meanings[0]
  const def = meaning?.definitions[0]
  return {
    word: entry.word,
    pronunciation: phonetic,
    audioUrl: audioUrl || null,
    partOfSpeech: meaning?.partOfSpeech ?? null,
    definitionEn: def?.definition ?? null,
    exampleEn: def?.example ?? null,
    synonyms: meaning?.synonyms?.slice(0, 8) ?? [],
  }
}
