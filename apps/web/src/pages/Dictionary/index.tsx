import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, X, Check, ArrowLeft, Volume2, ChevronRight, BookOpen, SearchX,
  Target, Sparkles, PartyPopper, Dumbbell, BookText, Zap, Globe,
} from 'lucide-react'
import { wordsApi } from '../../api/words.api'
import { playWordAudio } from '../../lib/tts'
import { SaveToMyWords, prefillFromDictEntry } from '../../components/SaveToMyWords'

// ── App DB types ──────────────────────────────────────────────────────────────
interface WordResult {
  id: string
  word: string
  pronunciation: string | null
  audioUrl?: string | null
  partOfSpeech: string | null
  difficulty: string
  translations: { translation: string | null; definitionEn: string | null; exampleEn: string | null }[]
}

// ── Free Dictionary API types ─────────────────────────────────────────────────
interface DictPhonetic { text?: string; audio?: string }
interface DictDef      { definition: string; example?: string; synonyms: string[]; antonyms: string[] }
interface DictMeaning  { partOfSpeech: string; definitions: DictDef[]; synonyms: string[]; antonyms: string[] }
interface DictEntry    { word: string; phonetic?: string; phonetics: DictPhonetic[]; meanings: DictMeaning[] }

const POS_COLORS: Record<string, { color: string; bg: string }> = {
  noun:        { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)'  },
  verb:        { color: '#34d399', bg: 'rgba(52,211,153,0.12)'  },
  adjective:   { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  adverb:      { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'  },
  pronoun:     { color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  preposition: { color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
  conjunction: { color: '#e879f9', bg: 'rgba(232,121,249,0.12)' },
  exclamation: { color: '#6ee7b7', bg: 'rgba(110,231,183,0.12)' },
}
const DEFAULT_POS = { color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' }

const DIFF_COLORS: Record<string, string> = {
  A1: '#34d399', A2: '#6ee7b7', B1: '#fbbf24', B2: '#f97316', C1: '#f87171', C2: '#c084fc',
}
function diffColor(d: string) { return DIFF_COLORS[d] ?? '#9ca3af' }

async function fetchDictEntry(word: string): Promise<DictEntry[]> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`)
  if (!res.ok) throw new Error('not_found')
  return res.json()
}

// ── sessionStorage helper ─────────────────────────────────────────────────────
function trackExploredWord(word: string) {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = sessionStorage.getItem('dict_explored')
    const parsed = raw ? JSON.parse(raw) : null
    const existing: string[] = (parsed?.date === today ? parsed.words : [])
    if (!existing.includes(word.toLowerCase())) {
      sessionStorage.setItem('dict_explored', JSON.stringify({ date: today, words: [...existing, word.toLowerCase()] }))
    }
  } catch {}
}

function getExploredCount(): number {
  const today = new Date().toISOString().slice(0, 10)
  try {
    const raw = sessionStorage.getItem('dict_explored')
    if (!raw) return 0
    const parsed = JSON.parse(raw)
    return parsed.date === today ? (parsed.words as string[]).length : 0
  } catch { return 0 }
}

// ── Cloze helpers ─────────────────────────────────────────────────────────────
const BLANK_MARKER = '⟦BLANK⟧'

function blankWord(example: string, word: string): string | null {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
  const blanked = example.replace(regex, BLANK_MARKER)
  return blanked !== example ? blanked : null
}

interface ChallengeItem {
  example: string
  blanked: string
  word: string
  definition: string
  partOfSpeech: string
  pos: { color: string; bg: string }
}

function buildChallengeItems(entries: DictEntry[]): ChallengeItem[] {
  const items: ChallengeItem[] = []
  for (const entry of entries) {
    for (const meaning of entry.meanings) {
      const pos = POS_COLORS[meaning.partOfSpeech] ?? DEFAULT_POS
      for (const def of meaning.definitions) {
        if (!def.example) continue
        const blanked = blankWord(def.example, entry.word)
        if (!blanked) continue
        items.push({
          example: def.example,
          blanked,
          word: entry.word,
          definition: def.definition,
          partOfSpeech: meaning.partOfSpeech,
          pos,
        })
      }
    }
  }
  return items
}

// ── BlankedText component ─────────────────────────────────────────────────────
function BlankedText({ blanked, word, pos, revealed }: {
  blanked: string
  word: string
  pos: { color: string; bg: string }
  revealed: boolean
}) {
  const parts = blanked.split(BLANK_MARKER)
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            revealed ? (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                style={{ color: pos.color, background: pos.bg, borderRadius: '6px', padding: '0 5px', fontWeight: 800 }}
              >
                {word}
              </motion.span>
            ) : (
              <span
                style={{
                  display: 'inline-block',
                  minWidth: `${Math.max(word.length * 0.65, 3)}ch`,
                  borderBottom: `2px dashed ${pos.color}`,
                  background: pos.bg,
                  borderRadius: '4px',
                  height: '1.25em',
                  verticalAlign: 'middle',
                  margin: '0 2px',
                }}
              />
            )
          )}
        </span>
      ))}
    </>
  )
}

// ── Shared search input ───────────────────────────────────────────────────────
function SearchInput({
  value, onChange, isLoading, placeholder,
}: { value: string; onChange: (v: string) => void; isLoading: boolean; placeholder: string }) {
  return (
    <div className="flex items-center gap-3 rounded-btn px-4 py-3.5"
      style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
      <Search size={19} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} className="shrink-0" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent outline-none text-base font-medium"
        style={{ color: 'var(--ws-text)' }}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {isLoading
        ? <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
        : value && (
          <button
            onClick={() => onChange('')}
            aria-label="Clear"
            className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            <X size={14} strokeWidth={2.4} style={{ color: 'var(--ws-muted)' }} />
          </button>
        )
      }
    </div>
  )
}

// ── WordSwipe DB dictionary ───────────────────────────────────────────────────
function AppDictionary() {
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<WordResult[]>([])
  const [selected, setSelected] = useState<WordResult | null>(null)
  const [loading, setLoading]   = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(timer.current)
    if (!query.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      try {
        const data = await wordsApi.search(query)
        setResults(data.words)
      } finally {
        setLoading(false)
      }
    }, 400)
  }, [query])

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-5">
      <div className="mb-4">
        <SearchInput value={query} onChange={v => { setQuery(v); setSelected(null) }} isLoading={loading} placeholder="So'z qidirish..." />
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key="detail" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="flex flex-col gap-4 pb-4">
              <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 font-semibold text-sm self-start" style={{ color: 'var(--ws-primary-light)' }}>
                <ArrowLeft size={16} strokeWidth={2.2} /> Orqaga
              </button>
              <div className="ws-card p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-4xl font-black break-words" style={{ color: 'var(--ws-text)' }}>{selected.word}</h2>
                    {selected.pronunciation && <p className="font-mono text-sm mt-1" style={{ color: 'var(--ws-faint)' }}>{selected.pronunciation}</p>}
                    {selected.partOfSpeech && (
                      <span className="text-xs font-bold px-3 py-1 rounded-full mt-2 inline-block"
                        style={{ color: (POS_COLORS[selected.partOfSpeech] ?? DEFAULT_POS).color, background: (POS_COLORS[selected.partOfSpeech] ?? DEFAULT_POS).bg }}>
                        {selected.partOfSpeech}
                      </span>
                    )}
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => playWordAudio(selected.word)}
                    aria-label="Play"
                    className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center"
                    style={{ background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.3)' }}
                  >
                    <Volume2 size={19} strokeWidth={2} style={{ color: 'var(--ws-primary-light)' }} />
                  </motion.button>
                </div>
                {selected.translations[0] && (
                  <div className="flex flex-col gap-3">
                    {selected.translations[0].translation && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--ws-faint)' }}>Tarjima</p>
                        <p className="text-2xl font-black" style={{ color: 'var(--ws-success)' }}>{selected.translations[0].translation}</p>
                      </div>
                    )}
                    {selected.translations[0].definitionEn && (
                      <div className="ws-card-2 rounded-btn p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--ws-faint)' }}>Ta'rif</p>
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--ws-muted)' }}>{selected.translations[0].definitionEn}</p>
                      </div>
                    )}
                    {selected.translations[0].exampleEn && (
                      <div className="rounded-btn p-4" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)' }}>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--ws-primary-light)' }}>Misol</p>
                        <p className="text-sm italic" style={{ color: 'var(--ws-muted)' }}>"{selected.translations[0].exampleEn}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <SaveToMyWords
                prefill={{
                  word: selected.word,
                  translation: selected.translations[0]?.translation,
                  pronunciation: selected.pronunciation,
                  audioUrl: selected.audioUrl,
                  partOfSpeech: selected.partOfSpeech,
                  definitionEn: selected.translations[0]?.definitionEn,
                  exampleEn: selected.translations[0]?.exampleEn,
                }}
              />
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2.5 pb-4">
              {!query.trim() && (
                <div className="flex flex-col items-center gap-4 pt-12 text-center">
                  <motion.div
                    animate={{ y: [0, -6, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-16 h-16 rounded-3xl flex items-center justify-center"
                    style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
                  >
                    <BookOpen size={28} strokeWidth={1.8} style={{ color: 'var(--ws-primary-light)' }} />
                  </motion.div>
                  <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>So'z yozing va qidiring...</p>
                </div>
              )}
              {results.map((word, i) => (
                <motion.button
                  key={word.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelected(word)}
                  className="w-full flex items-center gap-3 ws-card px-5 py-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-bold" style={{ color: 'var(--ws-text)' }}>{word.word}</p>
                    {word.translations[0]?.translation && (
                      <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--ws-muted)' }}>{word.translations[0].translation}</p>
                    )}
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded-lg shrink-0"
                    style={{ color: diffColor(word.difficulty), background: `${diffColor(word.difficulty)}1f` }}>
                    {word.difficulty}
                  </span>
                  <ChevronRight size={18} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} className="shrink-0" />
                </motion.button>
              ))}
              {query.trim() && !loading && results.length === 0 && (
                <div className="flex flex-col items-center gap-3 pt-12 text-center">
                  <SearchX size={36} strokeWidth={1.8} style={{ color: 'var(--ws-faint)' }} />
                  <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>Natija topilmadi</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Practice quiz component ───────────────────────────────────────────────────
function PracticeMode({ items, onReset }: { items: ChallengeItem[]; onReset: () => void }) {
  const [index, setIndex]     = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [score, setScore]     = useState({ know: 0, dontKnow: 0 })
  const [done, setDone]       = useState(false)

  const current = items[index]

  const advance = useCallback((knew: boolean) => {
    setScore(s => knew ? { ...s, know: s.know + 1 } : { ...s, dontKnow: s.dontKnow + 1 })
    if (index + 1 >= items.length) {
      setDone(true)
    } else {
      setIndex(i => i + 1)
      setRevealed(false)
    }
  }, [index, items.length])

  const restart = () => {
    setIndex(0)
    setRevealed(false)
    setScore({ know: 0, dontKnow: 0 })
    setDone(false)
  }

  if (done) {
    const total = score.know + score.dontKnow
    const pct   = total > 0 ? (score.know / total) * 100 : 0
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
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)' }}
        >
          <PartyPopper size={36} strokeWidth={1.8} style={{ color: 'var(--ws-primary-light)' }} />
        </motion.div>
        <div className="text-center">
          <p className="text-2xl font-black mb-1" style={{ color: 'var(--ws-text)' }}>Mashq tugadi!</p>
          <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>{Math.round(pct)}% to'g'ri</p>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-center rounded-2xl px-6 py-4 gap-1"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
            <span className="text-3xl font-black" style={{ color: '#34d399' }}>{score.know}</span>
            <span className="text-xs text-white/40 font-semibold">Bildim</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl px-6 py-4 gap-1"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <span className="text-3xl font-black" style={{ color: '#ef4444' }}>{score.dontKnow}</span>
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
            onClick={onReset}
            className="flex-1 py-3.5 rounded-2xl font-bold text-sm"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
          >
            O'qishga qaytish
          </motion.button>
        </div>
      </motion.div>
    )
  }

  const progress = index / items.length

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 28 }}
          />
        </div>
        <span className="text-white/35 text-xs font-bold shrink-0">{index + 1} / {items.length}</span>
      </div>

      {/* Challenge card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className="rounded-3xl p-5 flex flex-col gap-4"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${current.pos.color}30`,
            boxShadow: `0 0 24px ${current.pos.color}10`,
          }}
        >
          {/* POS badge */}
          <span className="text-[10px] font-black px-3 py-1 rounded-full self-start tracking-wider uppercase"
            style={{ color: current.pos.color, background: current.pos.bg }}>
            {current.partOfSpeech}
          </span>

          {/* Blanked sentence */}
          <p className="text-white/90 text-base leading-relaxed font-medium">
            <BlankedText
              blanked={current.blanked}
              word={current.word}
              pos={current.pos}
              revealed={revealed}
            />
          </p>

          {/* Hint definition */}
          <p className="text-white/35 text-xs italic leading-relaxed"
            style={{ borderLeft: `2px solid ${current.pos.color}40`, paddingLeft: '10px' }}>
            {current.definition}
          </p>
        </motion.div>
      </AnimatePresence>

      {/* Action buttons */}
      <AnimatePresence mode="wait">
        {!revealed ? (
          <motion.button
            key="reveal"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setRevealed(true)}
            className="w-full py-4 rounded-2xl font-black text-base"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}
          >
            Ko'rish
          </motion.button>
        ) : (
          <motion.div
            key="grade"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex gap-3"
          >
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => advance(false)}
              className="flex-1 py-4 rounded-btn font-black text-base flex items-center justify-center gap-2"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
              <X size={18} strokeWidth={2.6} /> Bilmadim
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => advance(true)}
              className="flex-1 py-4 rounded-btn font-black text-base flex items-center justify-center gap-2"
              style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' }}
            >
              <Check size={18} strokeWidth={2.6} /> Bildim!
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Read mode component ───────────────────────────────────────────────────────
function ReadMode({ entries, onNavigate }: { entries: DictEntry[]; onNavigate: (word: string) => void }) {
  return (
    <div className="flex flex-col gap-4 pb-6">
      {entries.flatMap((entry, ei) =>
        entry.meanings.map((meaning, mi) => {
          const pos = POS_COLORS[meaning.partOfSpeech] ?? DEFAULT_POS
          const allSynonyms = [...new Set([...meaning.synonyms, ...meaning.definitions.flatMap(d => d.synonyms)])].slice(0, 8)
          const allAntonyms = [...new Set([...meaning.antonyms, ...meaning.definitions.flatMap(d => d.antonyms)])].slice(0, 8)
          return (
            <motion.div
              key={`${ei}-${mi}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: (ei * 4 + mi) * 0.06, type: 'spring', stiffness: 300, damping: 28 }}
              className="rounded-3xl p-5 flex flex-col gap-4 overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderLeft: `4px solid ${pos.color}`,
              }}
            >
              {/* POS badge */}
              <span className="text-[10px] font-black px-3 py-1 rounded-full self-start tracking-wider uppercase"
                style={{ color: pos.color, background: pos.bg }}>
                {meaning.partOfSpeech}
              </span>

              {/* Definitions */}
              <div className="flex flex-col gap-4">
                {meaning.definitions.map((def, di) => (
                  <div key={di} className="flex gap-3">
                    <span className="text-xs font-black shrink-0 mt-0.5 w-5 text-right" style={{ color: pos.color + 'aa' }}>
                      {di + 1}.
                    </span>
                    <div className="flex-1 flex flex-col gap-2">
                      <p className="text-white/80 text-sm leading-relaxed">{def.definition}</p>
                      {def.example && (
                        <p className="text-white/40 text-xs italic leading-relaxed"
                          style={{ borderLeft: `2px solid ${pos.color}40`, paddingLeft: '8px' }}>
                          "{def.example}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Synonyms */}
              {allSynonyms.length > 0 && (
                <div>
                  <p className="text-white/25 text-[10px] font-black uppercase tracking-widest mb-2">Sinonimlar</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allSynonyms.map((syn, si) => (
                      <motion.button
                        key={si}
                        whileTap={{ scale: 0.93 }}
                        onClick={() => onNavigate(syn)}
                        className="text-xs px-2.5 py-1 rounded-full font-semibold"
                        style={{ background: pos.bg, color: pos.color }}
                      >
                        {syn}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Antonyms */}
              {allAntonyms.length > 0 && (
                <div>
                  <p className="text-white/25 text-[10px] font-black uppercase tracking-widest mb-2">Antonimlar</p>
                  <div className="flex flex-wrap gap-1.5">
                    {allAntonyms.map((ant, ai) => (
                      <motion.button
                        key={ai}
                        whileTap={{ scale: 0.93 }}
                        onClick={() => onNavigate(ant)}
                        className="text-xs px-2.5 py-1 rounded-full font-semibold"
                        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
                      >
                        {ant}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )
        })
      )}
    </div>
  )
}

// ── English Free Dictionary ───────────────────────────────────────────────────
const FEATURED_WORDS = ['serendipity', 'resilience', 'ephemeral', 'eloquent']

function EnglishDictionary() {
  const [query, setQuery]         = useState('')
  const [entries, setEntries]     = useState<DictEntry[] | null>(null)
  const [loading, setLoading]     = useState(false)
  const [notFound, setNotFound]   = useState(false)
  const [innerTab, setInnerTab]   = useState<'read' | 'practice'>('read')
  const [isPlaying, setIsPlaying] = useState(false)
  const [exploredCount, setExploredCount] = useState(() => getExploredCount())

  const timer    = useRef<ReturnType<typeof setTimeout>>()
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const doSearch = useCallback(async (word: string) => {
    if (!word.trim()) return
    setLoading(true)
    setNotFound(false)
    setEntries(null)
    setInnerTab('read')
    try {
      const data = await fetchDictEntry(word)
      setEntries(data)
      trackExploredWord(word)
      setExploredCount(getExploredCount())
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    if (!query.trim()) { setEntries(null); setNotFound(false); return }
    timer.current = setTimeout(() => doSearch(query), 600)
  }, [query, doSearch])

  const playAudio = (url: string) => {
    audioRef.current?.pause()
    setIsPlaying(true)
    const audio = new Audio(url)
    audioRef.current = audio
    audio.play().catch(() => setIsPlaying(false))
    audio.onended = () => setIsPlaying(false)
    audio.onerror = () => setIsPlaying(false)
  }

  const audioUrl = entries?.flatMap(e => e.phonetics).find(p => p.audio)?.audio
  const phoneticText = entries?.[0]?.phonetic ?? entries?.flatMap(e => e.phonetics).find(p => p.text)?.text

  const challengeItems = entries ? buildChallengeItems(entries) : []
  const totalMeanings  = entries?.reduce((acc, e) => acc + e.meanings.length, 0) ?? 0
  const totalDefs      = entries?.reduce((acc, e) => acc + e.meanings.reduce((a, m) => a + m.definitions.length, 0), 0) ?? 0
  const totalExamples  = entries?.reduce((acc, e) => acc + e.meanings.reduce((a, m) => a + m.definitions.filter(d => d.example).length, 0), 0) ?? 0

  const navigateToWord = (word: string) => {
    setQuery(word)
    setInnerTab('read')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-5">
      {/* Today counter */}
      {exploredCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 self-end"
        >
          <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: 'rgba(251,191,36,0.13)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}>
            <Sparkles size={13} strokeWidth={2.2} /> Bugun: {exploredCount} ta so'z
          </span>
        </motion.div>
      )}

      {/* Search */}
      <div className="mb-4">
        <SearchInput
          value={query}
          onChange={v => { setQuery(v); setEntries(null); setNotFound(false) }}
          isLoading={loading}
          placeholder="Type any English word..."
        />
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <AnimatePresence mode="wait">

          {/* ── Empty state ── */}
          {!query.trim() && !entries && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="flex flex-col items-center gap-6 pt-8 pb-6"
            >
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="w-16 h-16 rounded-3xl flex items-center justify-center"
                style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}
              >
                <BookText size={28} strokeWidth={1.8} style={{ color: 'var(--ws-primary-light)' }} />
              </motion.div>
              <p className="text-sm text-center leading-relaxed px-4" style={{ color: 'var(--ws-muted)' }}>
                Har qanday inglizcha so'zni qidiring
              </p>

              {/* Featured word chips */}
              <div className="w-full">
                <p className="text-[10px] font-black uppercase tracking-widest text-center mb-3" style={{ color: 'var(--ws-faint)' }}>
                  Mashhur so'zlar
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {FEATURED_WORDS.map((w, i) => (
                    <motion.button
                      key={w}
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.07, type: 'spring', stiffness: 400, damping: 22 }}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => setQuery(w)}
                      className="px-4 py-2 rounded-2xl text-sm font-bold"
                      style={{
                        background: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.22)',
                        color: '#a5b4fc',
                      }}
                    >
                      {w}
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Not found ── */}
          {notFound && (
            <motion.div
              key="notfound"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-3 mt-10 text-center px-4"
            >
              <SearchX size={38} strokeWidth={1.8} style={{ color: 'var(--ws-faint)' }} />
              <p className="font-bold" style={{ color: 'var(--ws-text)' }}>"{query}" topilmadi</p>
              <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>Imlosini tekshiring yoki boshqa so'z kiriting</p>
            </motion.div>
          )}

          {/* ── Result ── */}
          {entries && entries.length > 0 && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="flex flex-col gap-4 pb-6"
            >
              {/* ── Word hero card ── */}
              <div className="rounded-3xl p-5 flex flex-col gap-3"
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.13) 0%, rgba(139,92,246,0.08) 100%)',
                  border: '1px solid rgba(99,102,241,0.25)',
                }}>
                {/* Word + audio */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <motion.h2
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      className="font-black text-white break-words leading-none"
                      style={{ fontSize: 'clamp(2.5rem, 8vw, 4rem)' }}
                    >
                      {entries[0].word}
                    </motion.h2>
                    {phoneticText && (
                      <p className="text-white/35 font-mono text-sm mt-2 tracking-wide">{phoneticText}</p>
                    )}
                  </div>
                  {audioUrl && (
                    <motion.button
                      whileTap={{ scale: 0.82 }}
                      onClick={() => playAudio(audioUrl)}
                      aria-label="Play"
                      className="shrink-0 w-12 h-12 rounded-full flex items-center justify-center mt-1 relative"
                      style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.35)' }}
                    >
                      {isPlaying && (
                        <motion.div
                          className="absolute inset-0 rounded-full"
                          style={{ border: '2px solid rgba(99,102,241,0.5)' }}
                          animate={{ scale: [1, 1.45, 1], opacity: [0.8, 0, 0.8] }}
                          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                        />
                      )}
                      <Volume2 size={20} strokeWidth={2} style={{ color: 'var(--ws-primary-light)' }} />
                    </motion.button>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex gap-3 flex-wrap">
                  {[
                    { value: totalMeanings, label: "ma'no" },
                    { value: totalDefs,     label: "ta'rif" },
                    { value: totalExamples, label: "misol"  },
                  ].map(({ value, label }) => (
                    <div key={label} className="flex items-baseline gap-1">
                      <span className="font-black text-sm" style={{ color: '#a5b4fc' }}>{value}</span>
                      <span className="text-white/30 text-xs">ta {label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <SaveToMyWords prefill={prefillFromDictEntry(entries[0])} />

              {/* ── Inner tab bar ── */}
              <div className="flex gap-1.5 p-1 rounded-2xl shrink-0"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                {([
                  { key: 'read' as const,     label: `O'qish`,                     Icon: BookText },
                  { key: 'practice' as const, label: `Mashq (${challengeItems.length})`, Icon: Dumbbell },
                ]).map(({ key, label, Icon }) => (
                  <motion.button
                    key={key}
                    onClick={() => setInnerTab(key)}
                    className="flex-1 py-2 rounded-xl text-sm font-bold relative overflow-hidden"
                    style={{ color: innerTab === key ? '#fff' : 'var(--ws-muted)' }}
                  >
                    {innerTab === key && (
                      <motion.div
                        layoutId="inner-tab-bg"
                        className="absolute inset-0 rounded-xl ws-gradient-bg"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center justify-center gap-1.5">
                      <Icon size={15} strokeWidth={2.2} /> {label}
                    </span>
                  </motion.button>
                ))}
              </div>

              {/* ── Tab content ── */}
              <AnimatePresence mode="wait">
                {innerTab === 'read' ? (
                  <motion.div
                    key="read"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.16 }}
                  >
                    <ReadMode entries={entries} onNavigate={navigateToWord} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="practice"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.16 }}
                  >
                    {challengeItems.length > 0 ? (
                      <PracticeMode items={challengeItems} onReset={() => setInnerTab('read')} />
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-10 text-center">
                        <Target size={34} strokeWidth={1.8} style={{ color: 'var(--ws-faint)' }} />
                        <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>
                          Bu so'z uchun mashq topilmadi
                        </p>
                        <p className="text-xs" style={{ color: 'var(--ws-faint)' }}>Misollari bo'lgan so'zlarni qidiring</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}

// ── Main Dictionary page ──────────────────────────────────────────────────────
export function DictionaryPage() {
  const [tab, setTab] = useState<'app' | 'english'>('app')

  return (
    <div className="h-full flex flex-col pb-20" style={{ background: 'var(--ws-bg)' }}>

      {/* Header + tabs */}
      <div className="px-5 pt-4 pb-0 shrink-0">
        <h1 className="text-2xl font-black tracking-tight mb-3" style={{ color: 'var(--ws-text)' }}>Dictionary</h1>

        <div className="flex gap-1.5 p-1 rounded-btn" style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
          {([
            { key: 'app',     label: 'WordSwipe', Icon: Zap   },
            { key: 'english', label: 'English',   Icon: Globe },
          ] as const).map(({ key, label, Icon }) => (
            <motion.button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 py-2 rounded-xl text-sm font-bold relative overflow-hidden"
              style={{ color: tab === key ? '#fff' : 'var(--ws-muted)' }}
            >
              {tab === key && (
                <motion.div
                  layoutId="tab-bg"
                  className="absolute inset-0 rounded-xl ws-gradient-bg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center justify-center gap-1.5">
                <Icon size={15} strokeWidth={2.2} /> {label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 flex flex-col overflow-hidden pt-4">
        <AnimatePresence mode="wait">
          {tab === 'app' ? (
            <motion.div key="app" className="flex-1 flex flex-col overflow-hidden" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
              <AppDictionary />
            </motion.div>
          ) : (
            <motion.div key="english" className="flex-1 flex flex-col overflow-hidden" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>
              <EnglishDictionary />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
