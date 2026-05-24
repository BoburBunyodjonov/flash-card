import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { wordsApi } from '../../api/words.api'

interface WordResult {
  id: string
  word: string
  pronunciation: string | null
  partOfSpeech: string | null
  difficulty: string
  translations: { translation: string | null; definitionEn: string | null; exampleEn: string | null }[]
}

export function DictionaryPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WordResult[]>([])
  const [selected, setSelected] = useState<WordResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    clearTimeout(timer.current)
    if (!query.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const data = await wordsApi.search(query)
        setResults(data.words)
      } finally {
        setIsLoading(false)
      }
    }, 400)
  }, [query])

  return (
    <div className="h-full flex flex-col bg-bg pt-4 pb-20">
      <h1 className="text-2xl font-black text-white px-5 mb-4">Dictionary</h1>

      {/* Search */}
      <div className="px-5 mb-4">
        <div className="flex items-center gap-3 bg-surface rounded-2xl px-4 py-3">
          <span className="text-muted">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search words..."
            className="flex-1 bg-transparent text-white placeholder-muted outline-none text-base"
            autoComplete="off"
          />
          {isLoading && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5">
        {selected ? (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4">
            <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-primary font-semibold text-sm">
              ← Back
            </button>
            <div className="bg-card rounded-3xl p-6 flex flex-col gap-4">
              <div>
                <h2 className="text-4xl font-black text-white">{selected.word}</h2>
                {selected.pronunciation && <p className="text-muted font-mono mt-1">{selected.pronunciation}</p>}
                {selected.partOfSpeech && (
                  <span className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full mt-2 inline-block">
                    {selected.partOfSpeech}
                  </span>
                )}
              </div>
              {selected.translations[0] && (
                <div className="flex flex-col gap-3">
                  {selected.translations[0].translation && (
                    <div>
                      <p className="text-muted text-xs font-semibold mb-1">TRANSLATION</p>
                      <p className="text-success text-xl font-bold">{selected.translations[0].translation}</p>
                    </div>
                  )}
                  {selected.translations[0].definitionEn && (
                    <div>
                      <p className="text-muted text-xs font-semibold mb-1">DEFINITION</p>
                      <p className="text-white/80 text-sm leading-relaxed">{selected.translations[0].definitionEn}</p>
                    </div>
                  )}
                  {selected.translations[0].exampleEn && (
                    <div className="bg-surface rounded-2xl p-4">
                      <p className="text-muted text-xs font-semibold mb-1">EXAMPLE</p>
                      <p className="text-white/70 text-sm italic">"{selected.translations[0].exampleEn}"</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((word, i) => (
              <motion.button
                key={word.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelected(word)}
                className="w-full flex items-center justify-between bg-card rounded-2xl px-5 py-4 text-left"
              >
                <div>
                  <p className="text-white font-bold">{word.word}</p>
                  {word.translations[0]?.translation && (
                    <p className="text-muted text-sm mt-0.5">{word.translations[0].translation}</p>
                  )}
                </div>
                <span className="text-xs font-bold text-primary/60 bg-primary/10 px-2 py-1 rounded-lg">
                  {word.difficulty}
                </span>
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
