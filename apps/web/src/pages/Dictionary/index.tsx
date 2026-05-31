import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { wordsApi } from '../../api/words.api'

// ── App DB types ──────────────────────────────────────────────────────────────
interface WordResult {
  id: string
  word: string
  pronunciation: string | null
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

async function fetchDictEntry(word: string): Promise<DictEntry[]> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`)
  if (!res.ok) throw new Error('not_found')
  return res.json()
}

// ── Shared search input ───────────────────────────────────────────────────────
function SearchInput({
  value, onChange, isLoading, placeholder,
}: { value: string; onChange: (v: string) => void; isLoading: boolean; placeholder: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <span className="text-white/30 text-lg">🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-white placeholder-white/25 outline-none text-base"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {isLoading
        ? <div className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
        : value && (
          <button onClick={() => onChange('')} className="text-white/25 text-xl leading-none shrink-0">×</button>
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
              <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-primary font-semibold text-sm">
                ← Orqaga
              </button>
              <div className="rounded-3xl p-5 flex flex-col gap-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div>
                  <h2 className="text-4xl font-black text-white">{selected.word}</h2>
                  {selected.pronunciation && <p className="text-white/35 font-mono text-sm mt-1">{selected.pronunciation}</p>}
                  {selected.partOfSpeech && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full mt-2 inline-block"
                      style={{ ...(POS_COLORS[selected.partOfSpeech] ?? DEFAULT_POS) }}>
                      {selected.partOfSpeech}
                    </span>
                  )}
                </div>
                {selected.translations[0] && (
                  <div className="flex flex-col gap-3">
                    {selected.translations[0].translation && (
                      <div>
                        <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-1.5">Tarjima</p>
                        <p className="text-success text-2xl font-black">{selected.translations[0].translation}</p>
                      </div>
                    )}
                    {selected.translations[0].definitionEn && (
                      <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-1.5">Ta'rif</p>
                        <p className="text-white/70 text-sm leading-relaxed">{selected.translations[0].definitionEn}</p>
                      </div>
                    )}
                    {selected.translations[0].exampleEn && (
                      <div className="rounded-2xl p-4" style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.18)' }}>
                        <p className="text-primary/50 text-[10px] font-black uppercase tracking-widest mb-1.5">Misol</p>
                        <p className="text-white/65 text-sm italic">"{selected.translations[0].exampleEn}"</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col gap-2 pb-4">
              {!query.trim() && (
                <p className="text-white/20 text-sm text-center mt-8">So'z yozing va qidiring...</p>
              )}
              {results.map((word, i) => (
                <motion.button
                  key={word.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  onClick={() => setSelected(word)}
                  className="w-full flex items-center justify-between rounded-2xl px-5 py-4 text-left"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  <div>
                    <p className="text-white font-bold">{word.word}</p>
                    {word.translations[0]?.translation && (
                      <p className="text-white/35 text-sm mt-0.5">{word.translations[0].translation}</p>
                    )}
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ml-3"
                    style={{ color: '#6366f1', background: 'rgba(99,102,241,0.12)' }}>
                    {word.difficulty}
                  </span>
                </motion.button>
              ))}
              {query.trim() && !loading && results.length === 0 && (
                <p className="text-white/25 text-sm text-center mt-8">Natija topilmadi</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ── English Free Dictionary ───────────────────────────────────────────────────
function EnglishDictionary() {
  const [query, setQuery]     = useState('')
  const [entries, setEntries] = useState<DictEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    clearTimeout(timer.current)
    if (!query.trim()) { setEntries(null); setNotFound(false); return }
    timer.current = setTimeout(async () => {
      setLoading(true)
      setNotFound(false)
      setEntries(null)
      try {
        const data = await fetchDictEntry(query)
        setEntries(data)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }, 600)
  }, [query])

  const playAudio = (url: string) => {
    audioRef.current?.pause()
    audioRef.current = new Audio(url)
    audioRef.current.play()
  }

  // Find first available audio URL across all entries
  const audioUrl = entries?.flatMap(e => e.phonetics).find(p => p.audio)?.audio

  return (
    <div className="flex-1 flex flex-col overflow-hidden px-5">
      <div className="mb-4">
        <SearchInput value={query} onChange={v => { setQuery(v); setEntries(null); setNotFound(false) }} isLoading={loading} placeholder="Type any English word..." />
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {!query.trim() && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 mt-10 px-2 text-center">
            <span className="text-5xl">📖</span>
            <p className="text-white/30 text-sm leading-relaxed">
              Har qanday inglizcha so'zni qidirib, barcha ma'nolarini, misollarini va talaffuzini o'rganing.
            </p>
          </motion.div>
        )}

        {notFound && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-3 mt-10 text-center px-4">
            <span className="text-4xl">🔎</span>
            <p className="text-white font-bold">"{query}" topilmadi</p>
            <p className="text-white/30 text-sm">Imlosini tekshiring yoki boshqa so'z kiriting</p>
          </motion.div>
        )}

        {entries && entries.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 pb-6">

            {/* Word header */}
            <div className="rounded-3xl p-5"
              style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.07) 100%)', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-4xl font-black text-white break-words">{entries[0].word}</h2>
                  {entries[0].phonetic && (
                    <p className="text-white/40 font-mono text-sm mt-1 tracking-wide">{entries[0].phonetic}</p>
                  )}
                </div>
                {audioUrl && (
                  <motion.button
                    whileTap={{ scale: 0.82 }}
                    onClick={() => playAudio(audioUrl)}
                    className="shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-xl mt-0.5"
                    style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)' }}
                  >
                    🔊
                  </motion.button>
                )}
              </div>
            </div>

            {/* Meanings from all entries, grouped */}
            {entries.flatMap((entry, ei) =>
              entry.meanings.map((meaning, mi) => {
                const pos = POS_COLORS[meaning.partOfSpeech] ?? DEFAULT_POS
                return (
                  <motion.div
                    key={`${ei}-${mi}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: (ei * entry.meanings.length + mi) * 0.05 }}
                    className="rounded-3xl p-5 flex flex-col gap-4"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    {/* Part of speech badge */}
                    <span className="text-xs font-black px-3 py-1 rounded-full self-start tracking-wider uppercase"
                      style={{ color: pos.color, background: pos.bg }}>
                      {meaning.partOfSpeech}
                    </span>

                    {/* Definitions */}
                    <div className="flex flex-col gap-3">
                      {meaning.definitions.map((def, di) => (
                        <div key={di} className="flex gap-3">
                          {/* Number */}
                          <span className="text-xs font-black shrink-0 mt-0.5 w-5 text-right" style={{ color: pos.color + 'aa' }}>
                            {di + 1}.
                          </span>
                          <div className="flex-1 flex flex-col gap-1.5">
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
                    {(meaning.synonyms.length > 0 || meaning.definitions.some(d => d.synonyms.length > 0)) && (
                      <div>
                        <p className="text-white/25 text-[10px] font-black uppercase tracking-widest mb-2">Synonyms</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            ...meaning.synonyms,
                            ...meaning.definitions.flatMap(d => d.synonyms),
                          ].slice(0, 8).map((syn, si) => (
                            <button
                              key={si}
                              onClick={() => setQuery(syn)}
                              className="text-xs px-2.5 py-1 rounded-full font-medium transition-opacity hover:opacity-80"
                              style={{ background: pos.bg, color: pos.color }}
                            >
                              {syn}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Antonyms */}
                    {(meaning.antonyms.length > 0 || meaning.definitions.some(d => d.antonyms.length > 0)) && (
                      <div>
                        <p className="text-white/25 text-[10px] font-black uppercase tracking-widest mb-2">Antonyms</p>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            ...meaning.antonyms,
                            ...meaning.definitions.flatMap(d => d.antonyms),
                          ].slice(0, 8).map((ant, ai) => (
                            <button
                              key={ai}
                              onClick={() => setQuery(ant)}
                              className="text-xs px-2.5 py-1 rounded-full font-medium"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
                            >
                              {ant}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )
              })
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}

// ── Main Dictionary page ──────────────────────────────────────────────────────
export function DictionaryPage() {
  const [tab, setTab] = useState<'app' | 'english'>('app')

  return (
    <div className="h-full flex flex-col pb-20" style={{ background: '#0a0a14' }}>

      {/* Header + tabs */}
      <div className="px-5 pt-4 pb-0 shrink-0">
        <h1 className="text-2xl font-black text-white mb-3">Dictionary</h1>

        <div className="flex gap-1.5 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {([
            { key: 'app',     label: '⚡ WordSwipe' },
            { key: 'english', label: '🌐 English'   },
          ] as const).map(({ key, label }) => (
            <motion.button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 py-2 rounded-xl text-sm font-bold relative overflow-hidden"
              style={{ color: tab === key ? '#fff' : 'rgba(255,255,255,0.35)' }}
            >
              {tab === key && (
                <motion.div
                  layoutId="tab-bg"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{label}</span>
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
