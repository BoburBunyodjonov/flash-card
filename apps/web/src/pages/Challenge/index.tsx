import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../../api/client'

interface Question {
  wordId: string
  word: string
  pronunciation: string | null
  choices: string[]
  correctIndex: number
}

interface ChallengeData {
  date: string
  questions: Question[]
}

type ChoiceState = 'default' | 'correct' | 'wrong' | 'reveal'

function choiceStyle(state: ChoiceState): React.CSSProperties {
  switch (state) {
    case 'correct':
      return {
        background: 'rgba(16,185,129,0.2)',
        border: '1px solid rgba(16,185,129,0.4)',
        color: '#34d399',
      }
    case 'wrong':
      return {
        background: 'rgba(239,68,68,0.2)',
        border: '1px solid rgba(239,68,68,0.4)',
        color: '#f87171',
      }
    case 'reveal':
      return {
        background: 'rgba(16,185,129,0.15)',
        border: '1px solid rgba(16,185,129,0.3)',
        color: '#34d399',
      }
    default:
      return {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.85)',
      }
  }
}

// ── Score screen ───────────────────────────────────────────────────────────────
function ScoreScreen({
  correct,
  total,
  onRetry,
  onBack,
}: {
  correct: number
  total: number
  onRetry: () => void
  onBack: () => void
}) {
  const emoji =
    correct >= total - 1 ? '🎉' : correct >= Math.ceil(total / 2) ? '💪' : '📚'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.05 }}
        className="text-7xl"
      >
        {emoji}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14 }}
      >
        <p className="text-4xl font-black text-white">
          {correct}{' '}
          <span className="text-white/30 font-bold text-2xl">/ {total}</span>
        </p>
        <p className="text-white/50 text-sm mt-1.5">ta to'g'ri javob</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="rounded-2xl px-6 py-4 w-full max-w-xs"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}
      >
        <p className="text-warning font-bold text-sm">Ertaga qaytib keling! 🔥</p>
        <p className="text-white/30 text-xs mt-1">Kunlik challenge bir marta beriladi</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex gap-3 w-full max-w-xs"
      >
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onRetry}
          className="flex-1 py-4 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)', boxShadow: '0 6px 20px rgba(245,158,11,0.28)' }}
        >
          🔄 Qayta urinish
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="flex-1 py-4 rounded-2xl font-bold text-sm"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          ← Feed
        </motion.button>
      </motion.div>
    </motion.div>
  )
}

// ── Question card ──────────────────────────────────────────────────────────────
function QuestionCard({
  question,
  index,
  total,
  onAnswer,
}: {
  question: Question
  index: number
  total: number
  onAnswer: (correct: boolean) => void
}) {
  const [states, setStates] = useState<ChoiceState[]>(
    question.choices.map(() => 'default'),
  )
  const [locked, setLocked] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  // Reset when question changes
  useEffect(() => {
    setStates(question.choices.map(() => 'default'))
    setLocked(false)
    return () => clearTimeout(timerRef.current)
  }, [question.wordId, question.choices.length])

  const handleChoice = (ci: number) => {
    if (locked) return
    setLocked(true)

    const isCorrect = ci === question.correctIndex

    setStates(prev =>
      prev.map((_, i) => {
        if (i === ci) return isCorrect ? 'correct' : 'wrong'
        if (!isCorrect && i === question.correctIndex) return 'reveal'
        return 'default'
      }),
    )

    const delay = isCorrect ? 600 : 1000
    timerRef.current = setTimeout(() => onAnswer(isCorrect), delay)
  }

  const progressPct = (index / total) * 100

  return (
    <motion.div
      key={question.wordId}
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className="flex-1 flex flex-col gap-5"
    >
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.07)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #f59e0b, #f97316)' }}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 26 }}
          />
        </div>
        <span className="text-white/35 text-xs font-bold shrink-0 tabular-nums">
          {index + 1} / {total}
        </span>
      </div>

      {/* Word hero */}
      <div
        className="rounded-3xl p-6 flex flex-col items-center gap-3 text-center"
        style={{
          background:
            'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(249,115,22,0.06) 100%)',
          border: '1px solid rgba(245,158,11,0.2)',
        }}
      >
        <p className="text-white/30 text-xs font-black uppercase tracking-widest">
          Bu so'z o'zbekchada nima?
        </p>
        <motion.h2
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26, delay: 0.06 }}
          className="font-black text-white"
          style={{ fontSize: 'clamp(2.2rem, 9vw, 4rem)', lineHeight: 1.1 }}
        >
          {question.word}
        </motion.h2>
        {question.pronunciation && (
          <p className="text-white/35 font-mono text-sm">{question.pronunciation}</p>
        )}
      </div>

      {/* Choices */}
      <div className="flex flex-col gap-3">
        {question.choices.map((choice, ci) => (
          <motion.button
            key={ci}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + ci * 0.06, type: 'spring', stiffness: 340, damping: 28 }}
            whileTap={locked ? {} : { scale: 0.97 }}
            onClick={() => handleChoice(ci)}
            className="w-full py-4 px-5 rounded-2xl text-left font-semibold text-base transition-none"
            style={choiceStyle(states[ci])}
          >
            <span className="mr-3 font-black text-white/30">
              {String.fromCharCode(65 + ci)}.
            </span>
            {choice}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

// ── Main ChallengePage ─────────────────────────────────────────────────────────
export function ChallengePage({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<ChallengeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [index, setIndex] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [done, setDone] = useState(false)

  const load = () => {
    setLoading(true)
    setError(false)
    setIndex(0)
    setCorrectCount(0)
    setDone(false)
    api
      .get('/api/challenge/today')
      .then(r => {
        const d = r.data?.data as ChallengeData
        setData(d)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const handleAnswer = (correct: boolean) => {
    if (!data) return
    if (correct) setCorrectCount(c => c + 1)
    if (index + 1 >= data.questions.length) {
      setDone(true)
    } else {
      setIndex(i => i + 1)
    }
  }

  const retry = () => {
    setIndex(0)
    setCorrectCount(0)
    setDone(false)
  }

  return (
    <div
      className="h-full flex flex-col"
      style={{ background: '#0a0a14' }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="text-primary font-semibold text-sm flex items-center gap-1.5"
        >
          ← Feed
        </motion.button>
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <span className="text-white font-black text-base">Kunlik Challenge</span>
        </div>
        <div className="w-16" />
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col overflow-hidden px-5 pb-8">
        <AnimatePresence mode="wait">
          {/* Loading */}
          {loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-5"
            >
              <div className="relative w-14 h-14">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{ border: '2px solid rgba(245,158,11,0.15)' }}
                />
                <div
                  className="absolute inset-0 rounded-full animate-spin"
                  style={{ border: '2px solid transparent', borderTopColor: '#f59e0b' }}
                />
                <div className="absolute inset-0 flex items-center justify-center text-xl">🎯</div>
              </div>
              <p className="text-white/35 text-sm font-medium">Challenge yuklanmoqda...</p>
            </motion.div>
          )}

          {/* Error */}
          {!loading && error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-5 text-center"
            >
              <span className="text-6xl">😓</span>
              <div>
                <p className="text-white font-bold text-lg">Challenge yuklanmadi</p>
                <p className="text-white/35 text-sm mt-1">Internet aloqasini tekshiring</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={load}
                className="px-6 py-3 rounded-2xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
              >
                🔄 Qayta urinish
              </motion.button>
            </motion.div>
          )}

          {/* Done / score */}
          {!loading && !error && done && data && (
            <ScoreScreen
              key="score"
              correct={correctCount}
              total={data.questions.length}
              onRetry={retry}
              onBack={onBack}
            />
          )}

          {/* Active question */}
          {!loading && !error && !done && data && data.questions[index] && (
            <AnimatePresence mode="wait">
              <QuestionCard
                key={`q-${index}`}
                question={data.questions[index]}
                index={index}
                total={data.questions.length}
                onAnswer={handleAnswer}
              />
            </AnimatePresence>
          )}

          {/* Empty / no questions */}
          {!loading && !error && !done && data && data.questions.length === 0 && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-5 text-center"
            >
              <span className="text-6xl">📭</span>
              <div>
                <p className="text-white font-bold text-lg">Bugun challenge yo'q</p>
                <p className="text-white/35 text-sm mt-1">Ertaga qaytib keling!</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={onBack}
                className="px-6 py-3 rounded-2xl font-bold text-sm"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                ← Feedga qaytish
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
