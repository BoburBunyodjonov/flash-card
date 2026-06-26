import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Sprout, BookOpen, Zap, Flame, Trophy, Gem,
  Clock, Target, Gift, Check, X, ArrowRight, type LucideIcon,
} from 'lucide-react'
import { onboardingApi, type TestQuestion } from '../../api/onboarding.api'

interface Props { onDone: (level: string) => void }

// Level display config — color + icon per CEFR level (titles/descriptions via i18n)
const LEVEL_CONFIG: Record<string, { color: string; bg: string; Icon: LucideIcon }> = {
  A1: { color: '#34d399', bg: 'rgba(52,211,153,0.15)', Icon: Sprout },
  A2: { color: '#6ee7b7', bg: 'rgba(110,231,183,0.15)', Icon: BookOpen },
  B1: { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', Icon: Zap },
  B2: { color: '#f97316', bg: 'rgba(249,115,22,0.15)', Icon: Flame },
  C1: { color: '#f87171', bg: 'rgba(248,113,113,0.15)', Icon: Trophy },
  C2: { color: '#c084fc', bg: 'rgba(192,132,252,0.15)', Icon: Gem },
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
  const { t } = useTranslation()
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
  const ResultIcon = cfg.Icon

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ background: 'var(--ws-bg)' }}>
      <AnimatePresence mode="wait">

        {/* WELCOME */}
        {step === 'welcome' && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            className="flex-1 flex flex-col items-center justify-center px-7 text-center gap-8"
          >
            {/* Animated level badges around hero */}
            <div className="relative w-44 h-44 flex items-center justify-center">
              {(['A1', 'B1', 'C1'] as const).map((lvl, i) => {
                const c = LEVEL_CONFIG[lvl]
                const BadgeIcon = c.Icon
                return (
                  <motion.div
                    key={lvl}
                    className="absolute px-3 py-2 rounded-btn font-black text-sm flex items-center gap-1.5"
                    style={{
                      background: c.bg,
                      color: c.color,
                      border: `1px solid ${c.color}40`,
                      left: `${[6, 52, 78][i]}%`,
                      top: `${[18, 52, 12][i]}%`,
                      transform: `rotate(${[-12, 0, 10][i]}deg)`,
                    }}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 0.9, scale: 1 }}
                    transition={{ delay: i * 0.15, type: 'spring', stiffness: 300 }}
                  >
                    <BadgeIcon size={14} strokeWidth={2.4} /> {lvl}
                  </motion.div>
                )
              })}
              <div className="w-[5.5rem] h-[5.5rem] rounded-[1.6rem] flex items-center justify-center z-10 ws-gradient-bg ws-glow-primary">
                <Zap size={40} strokeWidth={2.2} className="text-white" fill="currentColor" />
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <h1 className="text-[1.75rem] font-black tracking-tight ws-gradient-text leading-tight">
                {t('onboarding.welcomeTitle')}
              </h1>
              <p className="text-sm leading-relaxed max-w-xs" style={{ color: 'var(--ws-muted)' }}>
                {t('onboarding.welcomeDesc')}
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full max-w-xs text-left">
              {[
                { Icon: Clock, key: 'onboarding.featTime' },
                { Icon: Target, key: 'onboarding.featChoose' },
                { Icon: Gift, key: 'onboarding.featPlan' },
              ].map(({ Icon, key }) => (
                <div key={key} className="flex items-center gap-3.5 ws-card-2 px-4 py-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.22)' }}>
                    <Icon size={18} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
                  </div>
                  <span className="text-sm font-medium" style={{ color: 'var(--ws-muted)' }}>{t(key)}</span>
                </div>
              ))}
            </div>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={startQuiz}
              disabled={loading}
              className="w-full max-w-xs py-4 rounded-btn font-bold text-base text-white flex items-center justify-center gap-2 ws-gradient-bg ws-glow-primary disabled:opacity-60"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  {t('onboarding.loading')}
                </>
              ) : (
                <>
                  {t('onboarding.start')} <ArrowRight size={18} strokeWidth={2.6} />
                </>
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
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--ws-muted)' }}>
                {qIndex + 1} / {questions.length}
              </span>
              <span
                className="text-xs font-black px-3 py-1 rounded-full"
                style={{
                  color: LEVEL_CONFIG[questions[qIndex]?.difficulty]?.color ?? 'var(--ws-text)',
                  background: LEVEL_CONFIG[questions[qIndex]?.difficulty]?.bg ?? 'transparent',
                }}
              >
                {questions[qIndex]?.difficulty}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: 'var(--ws-border)' }}>
              <motion.div
                className="h-full rounded-full ws-gradient-bg"
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
                  className="rounded-card p-6 text-center"
                  style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' }}
                >
                  <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: 'var(--ws-faint)' }}>
                    {t('onboarding.questionPrompt')}
                  </p>
                  <h2
                    className="font-black"
                    style={{ fontSize: 'clamp(2.2rem, 10vw, 3.5rem)', lineHeight: 1.1, color: 'var(--ws-text)' }}
                  >
                    {questions[qIndex]?.word}
                  </h2>
                  {questions[qIndex]?.pronunciation && (
                    <p className="font-mono text-sm mt-2" style={{ color: 'var(--ws-faint)' }}>{questions[qIndex].pronunciation}</p>
                  )}
                </div>

                {/* Choices */}
                <div className="flex flex-col gap-2.5">
                  {questions[qIndex]?.choices.map((choice, i) => {
                    const isSelected = selected === i
                    const isCorrect = i === questions[qIndex].correctIndex
                    let bg = 'var(--ws-card-2)'
                    let border = 'var(--ws-border)'
                    let color = 'var(--ws-text)'

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
                        color = 'var(--ws-faint)'
                      }
                    }

                    return (
                      <motion.button
                        key={i}
                        whileTap={!revealed ? { scale: 0.98 } : {}}
                        onClick={() => handleChoice(i)}
                        className="w-full py-4 px-5 rounded-btn text-left font-semibold text-base flex items-center"
                        style={{ background: bg, border: `1px solid ${border}`, color }}
                      >
                        <span className="mr-3 font-black text-sm opacity-50">{['A', 'B', 'C', 'D'][i]}</span>
                        <span className="flex-1">{choice}</span>
                        {revealed && isCorrect && <Check size={18} strokeWidth={2.6} className="ml-2 shrink-0" />}
                        {revealed && isSelected && !isCorrect && <X size={18} strokeWidth={2.6} className="ml-2 shrink-0" />}
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
              className="w-24 h-24 rounded-[1.8rem] flex items-center justify-center"
              style={{ background: cfg.bg, border: `1px solid ${cfg.color}50`, boxShadow: `0 0 40px ${cfg.color}33` }}
            >
              <ResultIcon size={48} strokeWidth={2} style={{ color: cfg.color }} />
            </motion.div>

            <div className="flex flex-col items-center">
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ws-faint)' }}>
                {t('onboarding.yourLevel')}
              </p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-block px-8 py-3 rounded-card mb-3"
                style={{ background: cfg.bg, border: `2px solid ${cfg.color}60` }}
              >
                <span className="font-black text-5xl" style={{ color: cfg.color }}>{level}</span>
              </motion.div>
              <motion.h2
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-black mb-2"
                style={{ color: 'var(--ws-text)' }}
              >
                {t(`onboarding.levels.${level}.title`)}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-sm leading-relaxed max-w-xs"
                style={{ color: 'var(--ws-muted)' }}
              >
                {t(`onboarding.levels.${level}.desc`)}
              </motion.p>
            </div>

            {/* Score summary */}
            {results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="ws-card px-8 py-4 flex gap-8"
              >
                <div className="text-center">
                  <p className="font-black text-2xl" style={{ color: 'var(--ws-success)' }}>
                    {results.filter(r => r.correct).length}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ws-faint)' }}>{t('onboarding.correct')}</p>
                </div>
                <div className="w-px" style={{ background: 'var(--ws-border)' }} />
                <div className="text-center">
                  <p className="font-black text-2xl" style={{ color: 'var(--ws-text)' }}>{results.length}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ws-faint)' }}>{t('onboarding.total')}</p>
                </div>
              </motion.div>
            )}

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onDone(level)}
              className="w-full max-w-xs py-4 rounded-btn font-bold text-base text-white flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`,
                boxShadow: `0 8px 28px ${cfg.color}40`,
              }}
            >
              {t('onboarding.begin')} <ArrowRight size={18} strokeWidth={2.6} />
            </motion.button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
