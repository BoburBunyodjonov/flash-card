import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Target, Flame, Check, X, Trophy, ArrowLeft, RefreshCw, Frown, Inbox } from 'lucide-react'
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
      return { background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.4)', color: 'var(--ws-success)' }
    case 'wrong':
      return { background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--ws-danger)' }
    case 'reveal':
      return { background: 'rgba(16,185,129,0.13)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--ws-success)' }
    default:
      return { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)', color: 'var(--ws-text)' }
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
  const { t } = useTranslation()

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
        className="w-24 h-24 rounded-3xl flex items-center justify-center"
        style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.3)' }}
      >
        <Trophy size={46} strokeWidth={1.8} style={{ color: 'var(--ws-warning)' }} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}>
        <p className="text-4xl font-black" style={{ color: 'var(--ws-text)' }}>
          {correct} <span className="font-bold text-2xl" style={{ color: 'var(--ws-faint)' }}>/ {total}</span>
        </p>
        <p className="text-sm mt-1.5" style={{ color: 'var(--ws-muted)' }}>{t('challenge.correctCount')}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="rounded-btn px-6 py-4 w-full max-w-xs flex items-start gap-3"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.18)' }}
      >
        <Flame size={20} strokeWidth={2.2} style={{ color: 'var(--ws-warning)', flexShrink: 0, marginTop: 1 }} />
        <div className="text-left">
          <p className="font-bold text-sm" style={{ color: 'var(--ws-warning)' }}>{t('challenge.comeBack')}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--ws-muted)' }}>{t('challenge.onceADay')}</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex flex-col gap-3 w-full max-w-xs"
      >
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onRetry}
          className="w-full py-4 rounded-btn font-black text-sm text-white flex items-center justify-center gap-2"
          style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)', boxShadow: '0 6px 20px rgba(245,158,11,0.28)' }}
        >
          <RefreshCw size={17} strokeWidth={2.4} /> {t('challenge.retry')}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onBack}
          className="w-full py-4 rounded-btn font-bold text-sm flex items-center justify-center gap-2 ws-card-2"
          style={{ color: 'var(--ws-muted)' }}
        >
          <ArrowLeft size={17} strokeWidth={2.2} /> {t('challenge.toFeed')}
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
  const { t } = useTranslation()
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
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #f59e0b, #f97316)' }}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 26 }}
          />
        </div>
        <span className="text-xs font-bold shrink-0 tabular-nums" style={{ color: 'var(--ws-faint)' }}>
          {index + 1} / {total}
        </span>
      </div>

      {/* Word hero */}
      <div
        className="rounded-card p-6 flex flex-col items-center gap-3 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(249,115,22,0.05) 100%)',
          border: '1px solid rgba(245,158,11,0.2)',
        }}
      >
        <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--ws-muted)' }}>
          {t('challenge.questionPrompt')}
        </p>
        <motion.h2
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 26, delay: 0.06 }}
          className="font-black"
          style={{ color: 'var(--ws-text)', fontSize: 'clamp(2.2rem, 9vw, 4rem)', lineHeight: 1.1 }}
        >
          {question.word}
        </motion.h2>
        {question.pronunciation && (
          <p className="font-mono text-sm" style={{ color: 'var(--ws-faint)' }}>{question.pronunciation}</p>
        )}
      </div>

      {/* Choices */}
      <div className="flex flex-col gap-3">
        {question.choices.map((choice, ci) => {
          const st = states[ci]
          return (
            <motion.button
              key={ci}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + ci * 0.06, type: 'spring', stiffness: 340, damping: 28 }}
              whileTap={locked ? {} : { scale: 0.97 }}
              onClick={() => handleChoice(ci)}
              className="w-full py-4 px-5 rounded-btn text-left font-semibold text-base flex items-center gap-3"
              style={choiceStyle(st)}
            >
              <span className="font-black tabular-nums" style={{ color: 'var(--ws-faint)' }}>
                {String.fromCharCode(65 + ci)}
              </span>
              <span className="flex-1">{choice}</span>
              {st === 'correct' || st === 'reveal' ? <Check size={18} strokeWidth={2.6} />
                : st === 'wrong' ? <X size={18} strokeWidth={2.6} /> : null}
            </motion.button>
          )
        })}
      </div>
    </motion.div>
  )
}

// ── Main ChallengePage ─────────────────────────────────────────────────────────
export function ChallengePage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
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
    <div className="h-full flex flex-col" style={{ background: 'var(--ws-bg)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}
        >
          <ArrowLeft size={18} strokeWidth={2.2} style={{ color: 'var(--ws-muted)' }} />
        </motion.button>
        <div className="flex items-center gap-2">
          <Target size={20} strokeWidth={2} style={{ color: 'var(--ws-warning)' }} />
          <span className="font-black text-base" style={{ color: 'var(--ws-text)' }}>{t('challenge.title')}</span>
        </div>
        <div className="w-9" />
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
                <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(245,158,11,0.15)' }} />
                <div className="absolute inset-0 rounded-full animate-spin" style={{ border: '2px solid transparent', borderTopColor: '#f59e0b' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Target size={18} strokeWidth={2.2} style={{ color: 'var(--ws-warning)' }} />
                </div>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--ws-faint)' }}>{t('challenge.loading')}</p>
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
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
                <Frown size={36} strokeWidth={1.8} style={{ color: 'var(--ws-muted)' }} />
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('challenge.loadError')}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--ws-muted)' }}>{t('challenge.checkConnection')}</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={load}
                className="px-6 py-3 rounded-btn font-bold text-sm text-white flex items-center gap-2"
                style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
              >
                <RefreshCw size={16} strokeWidth={2.4} /> {t('challenge.retry')}
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
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
                <Inbox size={36} strokeWidth={1.8} style={{ color: 'var(--ws-muted)' }} />
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{t('challenge.emptyTitle')}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--ws-muted)' }}>{t('challenge.emptyDesc')}</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onBack}
                className="px-6 py-3 rounded-btn font-bold text-sm flex items-center gap-2 ws-card-2"
                style={{ color: 'var(--ws-muted)' }}
              >
                <ArrowLeft size={16} strokeWidth={2.4} /> {t('challenge.toFeed')}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
