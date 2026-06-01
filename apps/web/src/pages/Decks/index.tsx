import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'

interface Deck {
  id: string
  name: string
  description?: string
  isDefault: boolean
  _count: { words: number }
}

interface DeckWord {
  id: string
  word: string
  pronunciation: string | null
  partOfSpeech: string | null
  difficulty: string
  addedAt: string
  category: { name: string } | null
  translation: {
    translation: string | null
    definitionEn: string | null
    exampleEn: string | null
    exampleTranslated: string | null
  } | null
}

const DIFF_COLORS: Record<string, string> = {
  A1: '#34d399',
  A2: '#6ee7b7',
  B1: '#fbbf24',
  B2: '#f97316',
  C1: '#f87171',
  C2: '#c084fc',
}

function diffColor(d: string) {
  return DIFF_COLORS[d] ?? '#9ca3af'
}

// ── Mini flashcard quiz ────────────────────────────────────────────────────────
function DeckQuiz({ words, onExit }: { words: DeckWord[]; onExit: () => void }) {
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [score, setScore] = useState({ know: 0, dontKnow: 0 })
  const [done, setDone] = useState(false)

  const current = words[index]

  const advance = useCallback(
    (knew: boolean) => {
      setScore(s =>
        knew ? { ...s, know: s.know + 1 } : { ...s, dontKnow: s.dontKnow + 1 },
      )
      if (index + 1 >= words.length) {
        setDone(true)
      } else {
        setIndex(i => i + 1)
        setFlipped(false)
      }
    },
    [index, words.length],
  )

  const restart = () => {
    setIndex(0)
    setFlipped(false)
    setScore({ know: 0, dontKnow: 0 })
    setDone(false)
  }

  if (done) {
    const total = score.know + score.dontKnow
    const pct = total > 0 ? (score.know / total) * 100 : 0
    const emoji = pct >= 80 ? '🎉' : pct >= 50 ? '💪' : '📚'

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        className="flex flex-col items-center gap-6 py-10 px-2"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
          className="text-7xl"
        >
          {emoji}
        </motion.div>
        <div className="text-center">
          <p className="text-white text-2xl font-black mb-1">Mashq tugadi!</p>
          <p className="text-white/40 text-sm">{Math.round(pct)}% to'g'ri</p>
        </div>
        <div className="flex gap-4">
          <div
            className="flex flex-col items-center rounded-2xl px-6 py-4 gap-1"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}
          >
            <span className="text-3xl font-black" style={{ color: '#34d399' }}>
              {score.know}
            </span>
            <span className="text-xs text-white/40 font-semibold">Bildim</span>
          </div>
          <div
            className="flex flex-col items-center rounded-2xl px-6 py-4 gap-1"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
          >
            <span className="text-3xl font-black" style={{ color: '#ef4444' }}>
              {score.dontKnow}
            </span>
            <span className="text-xs text-white/40 font-semibold">Bilmadim</span>
          </div>
        </div>
        <div className="flex gap-3 w-full">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={restart}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
          >
            Qayta sinash
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onExit}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            Orqaga
          </motion.button>
        </div>
      </motion.div>
    )
  }

  const progressPct = (index / words.length) * 100

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onExit}
          className="text-primary font-semibold text-sm flex items-center gap-1"
        >
          ← Orqaga
        </motion.button>
        <span className="text-white/40 text-xs font-bold">
          {index + 1} / {words.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
          animate={{ width: `${progressPct}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 28 }}
        />
      </div>

      {/* Flip card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`card-${index}-${flipped ? 'back' : 'front'}`}
          initial={{ opacity: 0, rotateY: flipped ? -90 : 90, scale: 0.96 }}
          animate={{ opacity: 1, rotateY: 0, scale: 1 }}
          exit={{ opacity: 0, rotateY: flipped ? 90 : -90, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          onClick={() => !flipped && setFlipped(true)}
          className="rounded-3xl p-6 flex flex-col gap-4 cursor-pointer select-none min-h-52"
          style={{
            background: flipped
              ? 'linear-gradient(135deg, rgba(52,211,153,0.08), rgba(16,185,129,0.04))'
              : 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.06))',
            border: flipped
              ? '1px solid rgba(52,211,153,0.2)'
              : '1px solid rgba(99,102,241,0.2)',
          }}
        >
          {!flipped ? (
            /* Front: English word */
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-white/30 text-xs font-black uppercase tracking-widest">Inglizcha</p>
              <h2
                className="font-black text-white"
                style={{ fontSize: 'clamp(2rem, 7vw, 3.5rem)', lineHeight: 1.1 }}
              >
                {current.word}
              </h2>
              {current.pronunciation && (
                <p className="text-white/35 font-mono text-sm">{current.pronunciation}</p>
              )}
              {current.partOfSpeech && (
                <span
                  className="text-xs font-bold px-3 py-1 rounded-full"
                  style={{ color: '#a5b4fc', background: 'rgba(99,102,241,0.15)' }}
                >
                  {current.partOfSpeech}
                </span>
              )}
              <p className="text-white/20 text-xs mt-2">Tap to flip</p>
            </div>
          ) : (
            /* Back: Uzbek translation + definition */
            <div className="flex-1 flex flex-col gap-4">
              <p className="text-white/30 text-xs font-black uppercase tracking-widest text-center">O'zbekcha</p>
              {current.translation?.translation && (
                <p
                  className="text-center font-black"
                  style={{ color: '#34d399', fontSize: 'clamp(1.5rem, 6vw, 2.5rem)', lineHeight: 1.2 }}
                >
                  {current.translation.translation}
                </p>
              )}
              {current.translation?.definitionEn && (
                <div
                  className="rounded-2xl p-3"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-1">Ta'rif</p>
                  <p className="text-white/65 text-sm leading-relaxed">{current.translation.definitionEn}</p>
                </div>
              )}
              {current.translation?.exampleEn && (
                <div
                  className="rounded-2xl p-3"
                  style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.15)' }}
                >
                  <p className="text-primary/50 text-[10px] font-black uppercase tracking-widest mb-1">Misol</p>
                  <p className="text-white/55 text-xs italic">"{current.translation.exampleEn}"</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Action buttons — only after flip */}
      <AnimatePresence>
        {flipped && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex gap-3"
          >
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => advance(false)}
              className="flex-1 py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2"
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#f87171',
              }}
            >
              <span>✗</span> Bilmadim
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => advance(true)}
              className="flex-1 py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2"
              style={{
                background: 'rgba(52,211,153,0.15)',
                border: '1px solid rgba(52,211,153,0.3)',
                color: '#34d399',
              }}
            >
              <span>✓</span> Bildim!
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Deck detail view ───────────────────────────────────────────────────────────
function DeckDetail({ deck, onBack }: { deck: Deck; onBack: () => void }) {
  const [words, setWords] = useState<DeckWord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [quizMode, setQuizMode] = useState(false)

  useEffect(() => {
    setLoading(true)
    api
      .get(`/api/decks/${deck.id}/words`)
      .then(r => {
        const data = r.data?.data
        setWords(Array.isArray(data?.words) ? data.words : [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [deck.id])

  if (quizMode) {
    return (
      <div className="h-full flex flex-col pb-20 overflow-y-auto no-scrollbar px-5 pt-4">
        <DeckQuiz words={words} onExit={() => setQuizMode(false)} />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col pb-20">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 shrink-0">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="text-primary font-semibold text-sm flex items-center gap-1 mb-4"
        >
          ← Orqaga
        </motion.button>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{deck.isDefault ? '🔖' : '🗂'}</span>
            <div>
              <h2 className="text-xl font-black text-white">{deck.name}</h2>
              <p className="text-white/35 text-xs">{words.length} ta so'z</p>
            </div>
          </div>
          {words.length > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setQuizMode(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-black text-sm text-white"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
              }}
            >
              🎯 Mashq
            </motion.button>
          )}
        </div>
      </div>

      {/* Word list */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-3 pt-2">
        {loading && (
          <div className="flex justify-center py-10">
            <div
              className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"
            />
          </div>
        )}

        {!loading && words.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-3 py-16 text-center"
          >
            <span className="text-5xl">📭</span>
            <p className="text-white/50 font-semibold">Bu deck bo'sh</p>
            <p className="text-white/25 text-sm">So'zlarni saqlang va bu yerda ko'rsatiladi</p>
          </motion.div>
        )}

        {!loading &&
          words.map((w, i) => {
            const isExpanded = expandedId === w.id
            const dc = diffColor(w.difficulty)

            return (
              <motion.div
                key={w.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl overflow-hidden"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: isExpanded
                    ? `1px solid ${dc}30`
                    : '1px solid rgba(255,255,255,0.07)',
                }}
              >
                {/* Row */}
                <motion.button
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setExpandedId(isExpanded ? null : w.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-white font-bold">{w.word}</p>
                      {w.pronunciation && (
                        <span className="text-white/30 font-mono text-xs">{w.pronunciation}</span>
                      )}
                    </div>
                    {w.translation?.translation && (
                      <p className="text-white/50 text-sm mt-0.5 truncate">
                        {w.translation.translation}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span
                      className="text-xs font-black px-2.5 py-1 rounded-lg"
                      style={{ color: dc, background: `${dc}18` }}
                    >
                      {w.difficulty}
                    </span>
                    <motion.span
                      animate={{ rotate: isExpanded ? 90 : 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      className="text-white/25 text-lg"
                    >
                      ›
                    </motion.span>
                  </div>
                </motion.button>

                {/* Expanded definition */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                      className="overflow-hidden"
                    >
                      <div
                        className="px-5 pb-4 flex flex-col gap-3 pt-1"
                        style={{ borderTop: `1px solid ${dc}20` }}
                      >
                        {w.partOfSpeech && (
                          <span
                            className="text-xs font-bold px-3 py-1 rounded-full self-start"
                            style={{ color: '#a5b4fc', background: 'rgba(99,102,241,0.15)' }}
                          >
                            {w.partOfSpeech}
                          </span>
                        )}
                        {w.translation?.definitionEn && (
                          <div
                            className="rounded-xl p-3"
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            <p className="text-white/25 text-[10px] font-black uppercase tracking-widest mb-1.5">
                              Ta'rif
                            </p>
                            <p className="text-white/65 text-sm leading-relaxed">
                              {w.translation.definitionEn}
                            </p>
                          </div>
                        )}
                        {w.translation?.exampleEn && (
                          <div
                            className="rounded-xl p-3"
                            style={{
                              background: 'rgba(99,102,241,0.06)',
                              border: '1px solid rgba(99,102,241,0.15)',
                            }}
                          >
                            <p className="text-primary/40 text-[10px] font-black uppercase tracking-widest mb-1.5">
                              Misol
                            </p>
                            <p className="text-white/55 text-xs italic leading-relaxed">
                              "{w.translation.exampleEn}"
                            </p>
                          </div>
                        )}
                        {w.category && (
                          <p className="text-white/20 text-xs">
                            Kategoriya: {w.category.name}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
      </div>
    </div>
  )
}

// ── Main Decks page ────────────────────────────────────────────────────────────
export function DecksPage() {
  const { t } = useTranslation()
  const [decks, setDecks] = useState<Deck[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null)

  const load = () =>
    api
      .get('/api/decks')
      .then(r => setDecks(r.data.data))
      .catch(console.error)

  useEffect(() => {
    load()
  }, [])

  const create = async () => {
    if (!newName.trim()) return
    await api.post('/api/decks', { name: newName })
    setNewName('')
    setShowCreate(false)
    load()
  }

  // Show deck detail when a deck is selected
  if (selectedDeck) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="detail"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="h-full bg-bg"
        >
          <DeckDetail deck={selectedDeck} onBack={() => setSelectedDeck(null)} />
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="list"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        className="h-full flex flex-col bg-bg pt-4 pb-20"
      >
        <div className="flex items-center justify-between px-5 mb-5">
          <h1 className="text-2xl font-black text-white">{t('nav.decks')}</h1>
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCreate(true)}
            className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-sm"
          >
            + New
          </motion.button>
        </div>

        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-5 mb-4 bg-surface rounded-2xl p-4 flex gap-3"
          >
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Deck name..."
              className="flex-1 bg-transparent text-white outline-none placeholder-muted"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && create()}
            />
            <button onClick={create} className="text-primary font-bold">
              Create
            </button>
            <button onClick={() => setShowCreate(false)} className="text-muted font-bold">
              ✕
            </button>
          </motion.div>
        )}

        <div className="flex-1 overflow-y-auto no-scrollbar px-5 flex flex-col gap-3">
          {decks.map((deck, i) => (
            <motion.div
              key={deck.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="bg-card rounded-2xl px-5 py-4 flex items-center justify-between cursor-pointer"
              onClick={() => setSelectedDeck(deck)}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{deck.isDefault ? '🔖' : '🗂'}</span>
                <div>
                  <p className="text-white font-semibold">{deck.name}</p>
                  <p className="text-muted text-xs mt-0.5">{deck._count.words} words</p>
                </div>
              </div>
              <span className="text-primary text-xl">›</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
