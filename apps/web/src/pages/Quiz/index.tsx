import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { quizApi, type QuizMode, type QuizQuestion } from '../../api/quiz.api'
import { playWordAudio } from '../../lib/tts'
import { useTelegram } from '../../hooks/useTelegram'

type ChoiceState = 'default' | 'correct' | 'wrong' | 'reveal'

const MODES: { key: QuizMode; icon: string; title: string; desc: string; color: string }[] = [
  { key: 'mixed', icon: '🎲', title: 'Aralash', desc: 'Har xil savol turlari', color: '#6366f1' },
  { key: 'mcq', icon: '🇺🇿', title: "Tarjimani top", desc: "Inglizcha so'z → o'zbekcha", color: '#34d399' },
  { key: 'reverse', icon: '🇬🇧', title: "So'zni top", desc: "O'zbekcha → inglizcha so'z", color: '#38bdf8' },
  { key: 'typing', icon: '⌨️', title: 'Yozish', desc: "So'zni o'zingiz yozing", color: '#f59e0b' },
  { key: 'listening', icon: '🎧', title: 'Tinglash', desc: "Eshiting va so'zni toping", color: '#a78bfa' },
  { key: 'cloze', icon: '✏️', title: "Bo'sh joyni to'ldir", desc: "Gapdagi tushgan so'zni top", color: '#f87171' },
]

const MODE_PROMPTS: Record<string, string> = {
  mcq: "Bu so'z o'zbekchada nima?",
  reverse: "Bu tarjimaning inglizchasi qaysi?",
  typing: "Inglizcha so'zni yozing",
  listening: "Eshitganingiz qaysi so'z?",
  cloze: "Bo'sh joyga qaysi so'z mos keladi?",
}

function choiceStyle(state: ChoiceState): React.CSSProperties {
  switch (state) {
    case 'correct':
      return { background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399' }
    case 'wrong':
      return { background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }
    case 'reveal':
      return { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }
    default:
      return { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.85)' }
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
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
            animate={{ width: `${progressPct}%` }}
            transition={{ type: 'spring', stiffness: 160, damping: 26 }}
          />
        </div>
        <span className="text-white/35 text-xs font-bold shrink-0 tabular-nums">{index + 1} / {total}</span>
      </div>

      {/* Prompt hero */}
      <div
        className="rounded-3xl p-6 flex flex-col items-center gap-3 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.06) 100%)',
          border: '1px solid rgba(99,102,241,0.2)',
        }}
      >
        <p className="text-white/30 text-xs font-black uppercase tracking-widest">
          {MODE_PROMPTS[question.mode]}
        </p>

        {question.mode === 'listening' ? (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => playWordAudio(question.ttsWord ?? question.word, question.audioUrl)}
            className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
            style={{ background: 'rgba(167,139,250,0.15)', border: '1px solid rgba(167,139,250,0.35)' }}
          >
            🔊
          </motion.button>
        ) : (
          <motion.h2
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 26, delay: 0.06 }}
            className="font-black text-white"
            style={{
              fontSize: question.mode === 'cloze' ? 'clamp(1.1rem, 5vw, 1.5rem)' : 'clamp(2rem, 8vw, 3.4rem)',
              lineHeight: question.mode === 'cloze' ? 1.5 : 1.1,
            }}
          >
            {question.mode === 'cloze' ? `"${question.prompt}"` : question.prompt}
          </motion.h2>
        )}

        {question.mode === 'mcq' && question.pronunciation && (
          <p className="text-white/35 font-mono text-sm">{question.pronunciation}</p>
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
            placeholder="So'zni yozing..."
            className="w-full py-4 px-5 rounded-2xl font-semibold text-base text-white outline-none"
            style={
              typedResult === 'correct'
                ? { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)' }
                : typedResult === 'wrong'
                  ? { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)' }
                  : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }
            }
          />
          {typedResult === 'wrong' && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-success text-sm font-bold px-1">
              To'g'ri javob: {question.answer}
            </motion.p>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleTypedSubmit}
            disabled={locked || !typed.trim()}
            className="w-full py-4 rounded-2xl font-black text-base text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            Tekshirish
          </motion.button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(question.choices ?? []).map((choice, ci) => (
            <motion.button
              key={ci}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + ci * 0.06, type: 'spring', stiffness: 340, damping: 28 }}
              whileTap={locked ? {} : { scale: 0.97 }}
              onClick={() => handleChoice(ci)}
              className="w-full py-4 px-5 rounded-2xl text-left font-semibold text-base transition-none"
              style={choiceStyle(states[ci] ?? 'default')}
            >
              <span className="mr-3 font-black text-white/30">{String.fromCharCode(65 + ci)}.</span>
              {choice}
            </motion.button>
          ))}
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
  const emoji = correct >= total - 1 ? '🎉' : correct >= Math.ceil(total / 2) ? '💪' : '📚'

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

      <div>
        <p className="text-4xl font-black text-white">
          {correct} <span className="text-white/30 font-bold text-2xl">/ {total}</span>
        </p>
        <p className="text-white/50 text-sm mt-1.5">ta to'g'ri javob</p>
      </div>

      {xpEarned !== null && xpEarned > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl px-6 py-4"
          style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)' }}
        >
          <p className="text-primary font-black text-xl">+{xpEarned} XP</p>
        </motion.div>
      )}

      <div className="flex gap-3 w-full max-w-xs">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onRetry}
          className="flex-1 py-4 rounded-2xl font-black text-sm text-white"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 6px 20px rgba(99,102,241,0.28)' }}
        >
          🔄 Yana mashq
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
          className="flex-1 py-4 rounded-2xl font-bold text-sm"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}
        >
          ← Orqaga
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Main QuizPage ──────────────────────────────────────────────────────────────
export function QuizPage({ onBack }: { onBack: () => void }) {
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
    <div className="h-full flex flex-col" style={{ background: '#0a0a14' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => (mode && !done ? setMode(null) : onBack())}
          className="text-primary font-semibold text-sm flex items-center gap-1.5"
        >
          ← Orqaga
        </motion.button>
        <div className="flex items-center gap-2">
          <span className="text-xl">🧠</span>
          <span className="text-white font-black text-base">Mashq</span>
        </div>
        <div className="w-16" />
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
              <p className="text-white/40 text-sm mb-1">
                Qaysi usulda mashq qilamiz? Zaif va takrorlash vaqti kelgan so'zlar tanlanadi.
              </p>
              {MODES.map((m, i) => (
                <motion.button
                  key={m.key}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => start(m.key)}
                  className="w-full rounded-2xl p-4 flex items-center gap-4 text-left"
                  style={{ background: `${m.color}14`, border: `1px solid ${m.color}30` }}
                >
                  <span className="text-3xl">{m.icon}</span>
                  <div className="flex-1">
                    <p className="font-black text-base" style={{ color: m.color }}>{m.title}</p>
                    <p className="text-white/35 text-xs mt-0.5">{m.desc}</p>
                  </div>
                  <span className="text-white/25 text-lg">→</span>
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
              <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-white/35 text-sm font-medium">Savollar tayyorlanmoqda...</p>
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
              <span className="text-6xl">{error ? '😓' : '📭'}</span>
              <div>
                <p className="text-white font-bold text-lg">{error ? 'Savollar yuklanmadi' : "Mashq uchun so'zlar yo'q"}</p>
                <p className="text-white/35 text-sm mt-1">
                  {error ? 'Internet aloqasini tekshiring' : "Avval feed'da so'zlarni o'rganing"}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => (error ? start(mode) : setMode(null))}
                className="px-6 py-3 rounded-2xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                {error ? '🔄 Qayta urinish' : '← Orqaga'}
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
