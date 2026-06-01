import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { onboardingApi, type TestQuestion } from '../../api/onboarding.api'

interface Props { onDone: (level: string) => void }

// Level display config
const LEVEL_CONFIG: Record<string, { color: string; bg: string; emoji: string; title: string; desc: string }> = {
  A1: { color: '#34d399', bg: 'rgba(52,211,153,0.15)', emoji: '🌱', title: 'Boshlang\'ich', desc: 'Siz ingliz tilini endigina o\'rganmoqdasiz. Ajoyib boshlang\'ich!' },
  A2: { color: '#6ee7b7', bg: 'rgba(110,231,183,0.15)', emoji: '📗', title: 'Asosiy', desc: 'Siz asosiy so\'zlarni bilasiz. Ko\'proq o\'rganing!' },
  B1: { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', emoji: '⚡', title: 'O\'rta', desc: 'Yaxshi! Siz o\'rta darajaga erishdingiz.' },
  B2: { color: '#f97316', bg: 'rgba(249,115,22,0.15)', emoji: '🔥', title: 'O\'rta yuqori', desc: 'Zo\'r! Siz ingliz tilini yaxshi bilasiz.' },
  C1: { color: '#f87171', bg: 'rgba(248,113,113,0.15)', emoji: '🏆', title: 'Ilg\'or', desc: 'Ajoyib! Siz ilg\'or darajagasiz.' },
  C2: { color: '#c084fc', bg: 'rgba(192,132,252,0.15)', emoji: '💎', title: 'Usta', desc: 'Zo\'r! Siz so\'z boyligingiz juda yuqori.' },
}

// Determine level from quiz results
function determineLevel(results: { difficulty: string; correct: boolean }[]): string {
  const byLevel: Record<string, { correct: number; total: number }> = {}
  for (const r of results) {
    if (!byLevel[r.difficulty]) byLevel[r.difficulty] = { correct: 0, total: 0 }
    byLevel[r.difficulty].total++
    if (r.correct) byLevel[r.difficulty].correct++
  }

  const levels = ['A1', 'A2', 'B1', 'B2', 'C1']
  let achieved = 'A1'
  for (const lvl of levels) {
    const s = byLevel[lvl]
    if (s && s.correct / s.total >= 0.5) achieved = lvl
    else break
  }

  const c1 = byLevel['C1']
  if (c1 && c1.correct === c1.total && c1.total > 0) return 'C2'
  return achieved
}

export function OnboardingPage({ onDone }: Props) {
  const [step, setStep] = useState<'welcome' | 'quiz' | 'result'>('welcome')
  const [questions, setQuestions] = useState<TestQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [qIndex, setQIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [results, setResults] = useState<{ difficulty: string; correct: boolean }[]>([])
  const [level, setLevel] = useState('A1')

  const startQuiz = async () => {
    setLoading(true)
    try {
      const qs = await onboardingApi.getLevelTest()
      setQuestions(qs)
      setStep('quiz')
    } catch {
      // If API fails, skip to result with default level
      setLevel('A1')
      setStep('result')
    } finally {
      setLoading(false)
    }
  }

  const handleChoice = (idx: number) => {
    if (revealed) return
    setSelected(idx)
    setRevealed(true)
    const q = questions[qIndex]
    const correct = idx === q.correctIndex
    const newResults = [...results, { difficulty: q.difficulty, correct }]
    setResults(newResults)

    setTimeout(() => {
      if (qIndex + 1 >= questions.length) {
        setLevel(determineLevel(newResults))
        setStep('result')
      } else {
        setQIndex(i => i + 1)
        setSelected(null)
        setRevealed(false)
      }
    }, correct ? 600 : 1000)
  }

  const cfg = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.A1

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: '#0a0a14' }}>
      <AnimatePresence mode="wait">

        {/* WELCOME */}
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            className="flex-1 flex flex-col items-center justify-center px-7 text-center gap-7"
          >
            {/* Animated level badges */}
            <div className="relative w-40 h-40 flex items-center justify-center">
              {(['A1', 'B1', 'C1'] as const).map((lvl, i) => {
                const c = LEVEL_CONFIG[lvl]
                return (
                  <motion.div
                    key={lvl}
                    className="absolute px-4 py-2 rounded-2xl font-black text-sm"
                    style={{
                      background: c.bg,
                      color: c.color,
                      border: `1px solid ${c.color}40`,
                      left: `${[10, 50, 78][i]}%`,
                      top: `${[20, 50, 15][i]}%`,
                      transform: `rotate(${[-12, 0, 10][i]}deg)`,
                    }}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 0.8, scale: 1 }}
                    transition={{ delay: i * 0.15, type: 'spring', stiffness: 300 }}
                  >
                    {c.emoji} {lvl}
                  </motion.div>
                )
              })}
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl z-10"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 40px rgba(99,102,241,0.4)' }}
              >
                ⚡
              </div>
            </div>

            <div>
              <h1 className="text-3xl font-black gradient-text mb-2">Darajangizni aniqlaymiz</h1>
              <p className="text-white/45 text-sm leading-relaxed">
                10 ta savol orqali ingliz tili darajangizni bilib olamiz va sizga mos so'zlarni tavsiya qilamiz
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full max-w-xs text-left">
              {[
                { icon: '⏱', text: '~2 daqiqa vaqt ketadi' },
                { icon: '🎯', text: 'So\'zning ma\'nosini tanlang' },
                { icon: '🎁', text: 'Darajangizga mos o\'quv rejasi' },
              ].map(item => (
                <div key={item.text} className="flex items-center gap-3 text-sm text-white/50">
                  <span className="text-xl">{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>

            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={startQuiz}
              disabled={loading}
              className="w-full max-w-xs py-4 rounded-2xl font-black text-lg text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.35)' }}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  Yuklanmoqda...
                </>
              ) : (
                '🚀 Boshlash'
              )}
            </motion.button>
          </motion.div>
        )}

        {/* QUIZ */}
        {step === 'quiz' && questions.length > 0 && (
          <motion.div
            key="quiz"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex-1 flex flex-col px-5 pt-6 pb-8 gap-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
              <span className="text-white/35 text-sm font-bold">{qIndex + 1} / {questions.length}</span>
              <span
                className="text-xs font-black px-3 py-1 rounded-full"
                style={{
                  color: LEVEL_CONFIG[questions[qIndex]?.difficulty]?.color ?? '#fff',
                  background: LEVEL_CONFIG[questions[qIndex]?.difficulty]?.bg ?? 'transparent',
                }}
              >
                {questions[qIndex]?.difficulty}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #6366f1, #a78bfa)' }}
                animate={{ width: `${(qIndex / questions.length) * 100}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 28 }}
              />
            </div>

            {/* Question card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={qIndex}
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                className="flex flex-col gap-5"
              >
                {/* Word hero */}
                <div
                  className="rounded-3xl p-6 text-center"
                  style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
                >
                  <p className="text-white/30 text-xs font-black uppercase tracking-widest mb-3">
                    Bu so'z o'zbekchada nima?
                  </p>
                  <h2
                    className="font-black text-white"
                    style={{ fontSize: 'clamp(2.2rem, 10vw, 3.5rem)', lineHeight: 1.1 }}
                  >
                    {questions[qIndex]?.word}
                  </h2>
                  {questions[qIndex]?.pronunciation && (
                    <p className="text-white/30 font-mono text-sm mt-2">{questions[qIndex].pronunciation}</p>
                  )}
                </div>

                {/* Choices */}
                <div className="flex flex-col gap-2.5">
                  {questions[qIndex]?.choices.map((choice, i) => {
                    const isSelected = selected === i
                    const isCorrect = i === questions[qIndex].correctIndex
                    let bg = 'rgba(255,255,255,0.05)'
                    let border = 'rgba(255,255,255,0.1)'
                    let color = 'rgba(255,255,255,0.8)'

                    if (revealed) {
                      if (isCorrect) {
                        bg = 'rgba(16,185,129,0.15)'
                        border = 'rgba(16,185,129,0.4)'
                        color = '#34d399'
                      } else if (isSelected) {
                        bg = 'rgba(239,68,68,0.15)'
                        border = 'rgba(239,68,68,0.4)'
                        color = '#f87171'
                      } else {
                        color = 'rgba(255,255,255,0.25)'
                      }
                    }

                    return (
                      <motion.button
                        key={i}
                        whileTap={!revealed ? { scale: 0.97 } : {}}
                        onClick={() => handleChoice(i)}
                        className="w-full py-4 px-5 rounded-2xl text-left font-semibold text-base"
                        style={{ background: bg, border: `1px solid ${border}`, color }}
                      >
                        <span className="mr-3 font-black text-sm opacity-50">{['A', 'B', 'C', 'D'][i]}</span>
                        {choice}
                        {revealed && isCorrect && <span className="float-right">✓</span>}
                        {revealed && isSelected && !isCorrect && <span className="float-right">✗</span>}
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}

        {/* RESULT */}
        {step === 'result' && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="flex-1 flex flex-col items-center justify-center px-7 text-center gap-7"
          >
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 250, damping: 20, delay: 0.1 }}
              className="text-8xl"
            >
              {cfg.emoji}
            </motion.div>

            <div>
              <p className="text-white/40 text-sm font-semibold mb-1">Sizning darajangiz</p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-block px-8 py-3 rounded-2xl mb-3"
                style={{ background: cfg.bg, border: `2px solid ${cfg.color}60` }}
              >
                <span className="font-black text-5xl" style={{ color: cfg.color }}>{level}</span>
              </motion.div>
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-black text-white mb-2"
              >
                {cfg.title}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-white/40 text-sm leading-relaxed"
              >
                {cfg.desc}
              </motion.p>
            </div>

            {/* Score summary */}
            {results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="rounded-2xl px-6 py-4 flex gap-6"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div className="text-center">
                  <p className="font-black text-2xl" style={{ color: '#34d399' }}>
                    {results.filter(r => r.correct).length}
                  </p>
                  <p className="text-white/30 text-xs">To'g'ri</p>
                </div>
                <div className="w-px bg-white/10" />
                <div className="text-center">
                  <p className="font-black text-2xl text-white">{results.length}</p>
                  <p className="text-white/30 text-xs">Jami</p>
                </div>
              </motion.div>
            )}

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => onDone(level)}
              className="w-full max-w-xs py-4 rounded-2xl font-black text-lg text-white"
              style={{
                background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`,
                boxShadow: `0 8px 32px ${cfg.color}40`,
              }}
            >
              🚀 Boshlash!
            </motion.button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
