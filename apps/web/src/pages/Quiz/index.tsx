import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Brain, Check, X, Volume2, ArrowRight, ArrowLeft, Trophy,
  Dices, Languages, Type, Headphones, PenLine, RefreshCw, Frown, Inbox, type LucideIcon,
} from 'lucide-react'
import { quizApi, type QuizMode, type QuizQuestion } from '../../api/quiz.api'
import { playWordAudio } from '../../lib/tts'
import { useTelegram } from '../../hooks/useTelegram'

type ChoiceState = 'default' | 'correct' | 'wrong' | 'reveal'

const MODES: { key: QuizMode; Icon: LucideIcon; tint: string }[] = [
  { key: 'mixed',     Icon: Dices,      tint: '#6366f1' },
  { key: 'mcq',       Icon: Languages,  tint: '#10b981' },
  { key: 'reverse',   Icon: Languages,  tint: '#38bdf8' },
  { key: 'typing',    Icon: Type,       tint: '#f59e0b' },
  { key: 'listening', Icon: Headphones, tint: '#a78bfa' },
  { key: 'cloze',     Icon: PenLine,    tint: '#f87171' },
]

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

// ── Single question ────────────────────────────────────────────────────────────
function QuestionView({
  question,
  index,
  total,
  onAnswer,
}: {
  question: QuizQuestion
  index: number
  total: number
  onAnswer: (correct: boolean) => void
}) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [states, setStates] = useState<ChoiceState[]>([])
  const [locked, setLocked] = useState(false)
  const [typed, setTyped] = useState('')
  const [typedResult, setTypedResult] = useState<'correct' | 'wrong' | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    setStates((question.choices ?? []).map(() => 'default'))
    setLocked(false)
    setTyped('')
    setTypedResult(null)
    // Listening questions speak themselves on appear
    if (question.mode === 'listening' && question.ttsWord) {
      const t = setTimeout(() => playWordAudio(question.ttsWord!, question.audioUrl), 350)
      return () => { clearTimeout(t); clearTimeout(timerRef.current) }
    }
    return () => clearTimeout(timerRef.current)
  }, [question.wordId, question.mode])

  const finish = (isCorrect: boolean) => {
    if (isCorrect) haptic.success()
    else haptic.error()
    timerRef.current = setTimeout(() => onAnswer(isCorrect), isCorrect ? 650 : 1300)
  }

  const handleChoice = (ci: number) => {
    if (locked) return
    setLocked(true)
    const isCorrect = ci === question.correctIndex
    setStates((prev) =>
      prev.map((_, i) => {
        if (i === ci) return isCorrect ? 'correct' : 'wrong'
        if (!isCorrect && i === question.correctIndex) return 'reveal'
        return 'default'
      }),
    )
    finish(isCorrect)
  }

  const handleTypedSubmit = () => {
    if (locked || !typed.trim()) return
    setLocked(true)
    const isCorrect = typed.trim().toLowerCase() === (question.answer ?? '').trim().toLowerCase()
    setTypedResult(isCorrect ? 'correct' : 'wrong')
    finish(isCorrect)
  }

  const progressPct = (index / total) * 100

  return (
    <motion.div
      key={question.wordId + question.mode}
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
            className="h-full rounded-full ws-gradient-bg"
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 26 }}
          />
        </div>
        <span className="text-xs font-bold shrink-0 tabular-nums" style={{ color: 'var(--ws-faint)' }}>{index + 1} / {total}</span>
      </div>

      {/* Prompt hero */}
      <div
        className="rounded-card p-6 flex flex-col items-center gap-3 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.05) 100%)',
          border: '1px solid rgba(99,102,241,0.2)',
        }}
      >
        <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--ws-muted)' }}>
          {t(`quiz.prompt.${question.mode}`)}
        </p>

        {question.mode === 'listening' ? (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => playWordAudio(question.ttsWord ?? question.word, question.audioUrl)}
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)' }}
          >
            <Volume2 size={34} strokeWidth={2} style={{ color: '#a78bfa' }} />
          </motion.button>
        ) : (
          <motion.h2
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26, delay: 0.06 }}
            className="font-black"
            style={{
              color: 'var(--ws-text)',
              fontSize: question.mode === 'cloze' ? 'clamp(1.1rem, 5vw, 1.5rem)' : 'clamp(2rem, 8vw, 3.4rem)',
              lineHeight: question.mode === 'cloze' ? 1.5 : 1.1,
            }}
          >
            {question.mode === 'cloze' ? `"${question.prompt}"` : question.prompt}
          </motion.h2>
        )}

        {question.mode === 'mcq' && question.pronunciation && (
          <p className="font-mono text-sm" style={{ color: 'var(--ws-faint)' }}>{question.pronunciation}</p>
        )}
      </div>

      {/* Answer area */}
      {question.mode === 'typing' ? (
        <div className="flex flex-col gap-3">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTypedSubmit()}
            disabled={locked}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('quiz.typePlaceholder')}
            className="w-full py-4 px-5 rounded-btn font-semibold text-base outline-none"
            style={
              typedResult === 'correct'
                ? { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: 'var(--ws-text)' }
                : typedResult === 'wrong'
                  ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--ws-text)' }
                  : { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)', color: 'var(--ws-text)' }
            }
          />
          {typedResult === 'wrong' && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-bold px-1" style={{ color: 'var(--ws-success)' }}>
              {t('quiz.correctAnswer')}: {question.answer}
            </motion.p>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleTypedSubmit}
            disabled={locked || !typed.trim()}
            className="w-full py-4 rounded-btn font-black text-base text-white disabled:opacity-40 ws-gradient-bg ws-glow-primary"
          >
            {t('quiz.check')}
          </motion.button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(question.choices ?? []).map((choice, ci) => {
            const st = states[ci] ?? 'default'
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
                <span className="font-black tabular-nums" style={{ color: 'var(--ws-faint)' }}>{String.fromCharCode(65 + ci)}</span>
                <span className="flex-1">{choice}</span>
                {st === 'correct' || st === 'reveal' ? <Check size={18} strokeWidth={2.6} />
                  : st === 'wrong' ? <X size={18} strokeWidth={2.6} /> : null}
              </motion.button>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}

// ── Score screen ───────────────────────────────────────────────────────────────
function ScoreScreen({
  correct,
  total,
  xpEarned,
  onRetry,
  onBack,
}: {
  correct: number
  total: number
  xpEarned: number | null
  onRetry: () => void
  onBack: () => void
}) {
  const { t } = useTranslation()
  const good = correct >= Math.ceil(total / 2)
  const tint = good ? '#10b981' : '#f59e0b'

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
        style={{ background: `${tint}1f`, border: `1px solid ${tint}3a` }}
      >
        <Trophy size={46} strokeWidth={1.8} style={{ color: tint }} />
      </motion.div>

      <div>
        <p className="text-4xl font-black" style={{ color: 'var(--ws-text)' }}>
          {correct} <span className="font-bold text-2xl" style={{ color: 'var(--ws-faint)' }}>/ {total}</span>
        </p>
        <p className="text-sm mt-1.5" style={{ color: 'var(--ws-muted)' }}>{t('quiz.correctCount')}</p>
      </div>

      {xpEarned !== null && xpEarned > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-btn px-6 py-4"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}
        >
          <p className="font-black text-xl" style={{ color: 'var(--ws-primary-light)' }}>+{xpEarned} XP</p>
        </motion.div>
      )}

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onRetry}
          className="w-full py-4 rounded-btn font-black text-sm text-white flex items-center justify-center gap-2 ws-gradient-bg ws-glow-primary"
        >
          <RefreshCw size={17} strokeWidth={2.4} /> {t('quiz.retry')}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onBack}
          className="w-full py-4 rounded-btn font-bold text-sm flex items-center justify-center gap-2 ws-card-2"
          style={{ color: 'var(--ws-muted)' }}
        >
          <ArrowLeft size={17} strokeWidth={2.2} /> {t('quiz.back')}
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Main QuizPage ──────────────────────────────────────────────────────────────
export function QuizPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<QuizMode | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<{ wordId: string; correct: boolean }[]>([])
  const [done, setDone] = useState(false)
  const [xpEarned, setXpEarned] = useState<number | null>(null)

  const start = (m: QuizMode) => {
    setMode(m)
    setLoading(true)
    setError(false)
    setIndex(0)
    setAnswers([])
    setDone(false)
    setXpEarned(null)
    quizApi
      .getQuestions(m)
      .then(setQuestions)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  const handleAnswer = (correct: boolean) => {
    const q = questions[index]
    const next = [...answers, { wordId: q.wordId, correct }]
    setAnswers(next)
    if (index + 1 >= questions.length) {
      setDone(true)
      quizApi
        .submit(next)
        .then((r) => setXpEarned(r.xpEarned))
        .catch(() => setXpEarned(null))
    } else {
      setIndex((i) => i + 1)
    }
  }

  const correctCount = answers.filter((a) => a.correct).length

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--ws-bg)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => (mode && !done ? setMode(null) : onBack())}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}
        >
          <ArrowLeft size={18} strokeWidth={2.2} style={{ color: 'var(--ws-muted)' }} />
        </motion.button>
        <div className="flex items-center gap-2">
          <Brain size={20} strokeWidth={2} style={{ color: 'var(--ws-primary-light)' }} />
          <span className="font-black text-base" style={{ color: 'var(--ws-text)' }}>{t('practice.quiz.title')}</span>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden px-5 pb-8">
        <AnimatePresence mode="wait">
          {/* Mode selection */}
          {!mode && (
            <motion.div
              key="modes"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-3 pt-2"
            >
              <p className="text-sm mb-1" style={{ color: 'var(--ws-muted)' }}>
                {t('quiz.pickMode')}
              </p>
              {MODES.map((m, i) => (
                <motion.button
                  key={m.key}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => start(m.key)}
                  className="w-full ws-card p-4 flex items-center gap-4 text-left"
                >
                  <div
                    className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                    style={{ background: `${m.tint}1f`, border: `1px solid ${m.tint}3a` }}
                  >
                    <m.Icon size={22} strokeWidth={2} style={{ color: m.tint }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[15px]" style={{ color: 'var(--ws-text)' }}>{t(`quiz.modes.${m.key}.title`)}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ws-muted)' }}>{t(`quiz.modes.${m.key}.desc`)}</p>
                  </div>
                  <ArrowRight size={20} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* Loading */}
          {mode && loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-5"
            >
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(99,102,241,0.15)' }} />
                <div className="absolute inset-0 rounded-full animate-spin" style={{ border: '2px solid transparent', borderTopColor: 'var(--ws-primary)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--ws-faint)' }}>{t('quiz.preparing')}</p>
            </motion.div>
          )}

          {/* Error / empty */}
          {mode && !loading && (error || questions.length === 0) && !done && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-5 text-center"
            >
              <div
                className="w-20 h-20 rounded-3xl flex items-center justify-center"
                style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}
              >
                {error
                  ? <Frown size={36} strokeWidth={1.8} style={{ color: 'var(--ws-muted)' }} />
                  : <Inbox size={36} strokeWidth={1.8} style={{ color: 'var(--ws-muted)' }} />}
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{error ? t('quiz.loadError') : t('quiz.noWords')}</p>
                <p className="text-sm mt-1" style={{ color: 'var(--ws-muted)' }}>{error ? t('quiz.checkConnection') : t('quiz.learnFirst')}</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => (error ? start(mode) : setMode(null))}
                className="px-6 py-3 rounded-btn font-bold text-sm text-white flex items-center gap-2 ws-gradient-bg ws-glow-primary"
              >
                {error
                  ? <><RefreshCw size={16} strokeWidth={2.4} /> {t('quiz.retry')}</>
                  : <><ArrowLeft size={16} strokeWidth={2.4} /> {t('quiz.back')}</>}
              </motion.button>
            </motion.div>
          )}

          {/* Score */}
          {mode && !loading && done && (
            <ScoreScreen
              key="score"
              correct={correctCount}
              total={questions.length}
              xpEarned={xpEarned}
              onRetry={() => start(mode)}
              onBack={() => setMode(null)}
            />
          )}

          {/* Active question */}
          {mode && !loading && !error && !done && questions[index] && (
            <AnimatePresence mode="wait">
              <QuestionView
                key={`q-${index}`}
                question={questions[index]}
                index={index}
                total={questions.length}
                onAnswer={handleAnswer}
              />
            </AnimatePresence>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
