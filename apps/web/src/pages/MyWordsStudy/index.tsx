import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Sparkles, Layers, ListChecks, ArrowLeftRight, Keyboard, Headphones,
  Grid2x2, Shuffle, PenLine, ArrowLeft, ArrowRight, Check, X, Volume2,
  Trophy, RefreshCw, Frown, Inbox, PartyPopper, type LucideIcon,
} from 'lucide-react'
import {
  myWordsStudyApi,
  type StudyMode,
  type StudyQuestion,
  type StudyAnswer,
} from '../../api/my-words-study.api'
import { playWordAudio } from '../../lib/tts'
import { useTelegram } from '../../hooks/useTelegram'

type ChoiceState = 'default' | 'correct' | 'wrong' | 'reveal'

// The "smart mixed" method leads and is visually flagged as recommended.
const METHODS: { key: StudyMode; Icon: LucideIcon; tint: string; recommended?: boolean }[] = [
  { key: 'mixed',     Icon: Sparkles,      tint: '#2D9B6F', recommended: true },
  { key: 'flashcard', Icon: Layers,        tint: '#4CB388' },
  { key: 'mcq',       Icon: ListChecks,    tint: '#10b981' },
  { key: 'reverse',   Icon: ArrowLeftRight, tint: '#38bdf8' },
  { key: 'typing',    Icon: Keyboard,      tint: '#f59e0b' },
  { key: 'listening', Icon: Headphones,    tint: '#f472b6' },
  { key: 'matching',  Icon: Grid2x2,       tint: '#06b6d4' },
  { key: 'scramble',  Icon: Shuffle,       tint: '#F0A04B' },
  { key: 'cloze',     Icon: PenLine,       tint: '#f87171' },
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

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

// ── Speaker button ──────────────────────────────────────────────────────────
function SpeakerButton({ word, audioUrl, size = 'md' }: { word: string; audioUrl?: string | null; size?: 'md' | 'lg' }) {
  const { haptic } = useTelegram()
  const dim = size === 'lg' ? 'w-20 h-20' : 'w-11 h-11'
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={(e) => {
        e.stopPropagation()
        haptic.impact('light')
        playWordAudio(word, audioUrl)
      }}
      className={`${dim} rounded-full flex items-center justify-center shrink-0`}
      style={{ background: 'rgba(45,155,111,0.14)', border: '1px solid rgba(45,155,111,0.3)' }}
      aria-label="play"
    >
      <Volume2 size={size === 'lg' ? 32 : 18} strokeWidth={2} style={{ color: 'var(--ws-primary-light)' }} />
    </motion.button>
  )
}

// ── Progress bar ────────────────────────────────────────────────────────────
function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-3 shrink-0">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(28,42,36,0.06)' }}>
        <motion.div
          className="h-full rounded-full ws-gradient-bg"
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 160, damping: 26 }}
        />
      </div>
      <span className="text-xs font-bold shrink-0 tabular-nums" style={{ color: 'var(--ws-faint)' }}>
        {value} / {total}
      </span>
    </div>
  )
}

// ── Flashcard (self-graded) ──────────────────────────────────────────────────
function FlashcardQuestion({ question, onAnswer }: { question: StudyQuestion; onAnswer: (c: boolean) => void }) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [flipped, setFlipped] = useState(false)

  const grade = (correct: boolean) => {
    if (correct) haptic.success()
    else haptic.impact('medium')
    onAnswer(correct)
  }

  return (
    <div className="flex-1 flex flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={flipped ? 'back' : 'front'}
          initial={{ opacity: 0, rotateY: flipped ? -90 : 90, scale: 0.96 }}
          animate={{ opacity: 1, rotateY: 0, scale: 1 }}
          exit={{ opacity: 0, rotateY: flipped ? 90 : -90, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          onClick={() => !flipped && setFlipped(true)}
          className="flex-1 rounded-3xl p-6 flex flex-col cursor-pointer select-none"
          style={{
            background: flipped
              ? 'rgba(16,185,129,0.08)'
              : 'rgba(45,155,111,0.1)',
            border: flipped ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(45,155,111,0.2)',
          }}
        >
          {!flipped ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--ws-faint)' }}>
                {t('myWordsStudy.prompt.flashcard')}
              </p>
              <h2 className="font-black" style={{ color: 'var(--ws-text)', fontSize: 'clamp(2rem, 7vw, 3.4rem)', lineHeight: 1.1 }}>
                {question.prompt}
              </h2>
              {question.pronunciation && (
                <p className="font-mono text-sm" style={{ color: 'var(--ws-faint)' }}>{question.pronunciation}</p>
              )}
              <SpeakerButton word={question.ttsWord ?? question.word} audioUrl={question.audioUrl} />
              <p className="text-xs mt-2" style={{ color: 'var(--ws-faint)' }}>{t('myWordsStudy.tapToFlip')}</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--ws-faint)' }}>
                {t('myWordsStudy.uzbek')}
              </p>
              <p className="font-black" style={{ color: '#34d399', fontSize: 'clamp(1.6rem, 6vw, 2.6rem)', lineHeight: 1.2 }}>
                {question.translation}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--ws-faint)' }}>{question.word}</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {flipped && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="flex gap-3 mt-4">
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => grade(false)}
              className="flex-1 py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
              <X size={18} strokeWidth={2.6} /> {t('myWordsStudy.dontKnow')}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => grade(true)}
              className="flex-1 py-4 rounded-2xl font-black text-base flex items-center justify-center gap-2"
              style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' }}
            >
              <Check size={18} strokeWidth={2.6} /> {t('myWordsStudy.know')}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Scramble (letter tiles) ──────────────────────────────────────────────────
function ScrambleQuestion({ question, onAnswer }: { question: StudyQuestion; onAnswer: (c: boolean) => void }) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const answer = question.answer ?? question.word
  const letters = useMemo(() => (question.scrambled ?? answer).split(''), [question.id])
  const [placed, setPlaced] = useState<number[]>([]) // indices into `letters`, in build order
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const used = new Set(placed)
  const built = placed.map((i) => letters[i]).join('')

  const tapTile = (i: number) => {
    if (result || used.has(i)) return
    haptic.impact('light')
    setPlaced((p) => [...p, i])
  }
  const removeAt = (pos: number) => {
    if (result) return
    haptic.impact('light')
    setPlaced((p) => p.filter((_, k) => k !== pos))
  }
  const check = () => {
    if (result || placed.length === 0) return
    const ok = built.toLowerCase() === answer.toLowerCase()
    setResult(ok ? 'correct' : 'wrong')
    if (ok) haptic.success()
    else haptic.error()
    timerRef.current = setTimeout(() => onAnswer(ok), ok ? 700 : 1400)
  }

  const slotColor =
    result === 'correct' ? 'rgba(16,185,129,0.4)' : result === 'wrong' ? 'rgba(239,68,68,0.4)' : 'rgba(45,155,111,0.35)'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className="flex-1 flex flex-col gap-5"
    >
      <div
        className="rounded-card p-6 flex flex-col items-center gap-2 text-center"
        style={{ background: 'rgba(45,155,111,0.1)', border: '1px solid rgba(45,155,111,0.2)' }}
      >
        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--ws-muted)' }}>
          {t('myWordsStudy.prompt.scramble')}
        </p>
        <h2 className="font-black" style={{ color: 'var(--ws-text)', fontSize: 'clamp(1.5rem, 6vw, 2.4rem)', lineHeight: 1.2 }}>
          {question.prompt}
        </h2>
      </div>

      {/* Answer slots */}
      <div className="flex flex-wrap justify-center gap-2 min-h-[3.25rem]">
        {Array.from({ length: answer.length }).map((_, k) => {
          const filled = k < placed.length
          return (
            <motion.button
              key={k}
              whileTap={filled && !result ? { scale: 0.9 } : {}}
              onClick={() => filled && removeAt(k)}
              disabled={!filled || !!result}
              className="rounded-xl flex items-center justify-center font-black text-xl"
              style={{
                height: '3rem',
                width: '2.75rem',
                background: filled ? 'rgba(45,155,111,0.16)' : 'rgba(28,42,36,0.04)',
                border: `1.5px ${filled ? 'solid' : 'dashed'} ${filled ? slotColor : 'var(--ws-border)'}`,
                color: 'var(--ws-text)',
              }}
            >
              {filled ? letters[placed[k]] : ''}
            </motion.button>
          )
        })}
      </div>

      {/* Letter pool */}
      <div className="flex flex-wrap justify-center gap-2">
        {letters.map((ch, i) => {
          const isUsed = used.has(i)
          return (
            <motion.button
              key={i}
              whileTap={isUsed || result ? {} : { scale: 0.9 }}
              onClick={() => tapTile(i)}
              disabled={isUsed || !!result}
              className="rounded-xl flex items-center justify-center font-black text-xl"
              style={{
                width: '2.75rem',
                height: '3rem',
                background: isUsed ? 'rgba(28,42,36,0.04)' : 'var(--ws-card-2)',
                border: '1px solid var(--ws-border)',
                color: isUsed ? 'var(--ws-faint)' : 'var(--ws-text)',
                opacity: isUsed ? 0.35 : 1,
              }}
            >
              {ch}
            </motion.button>
          )
        })}
      </div>

      {result === 'wrong' && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm font-bold text-center" style={{ color: 'var(--ws-success)' }}>
          {t('myWordsStudy.correctAnswer')}: {answer}
        </motion.p>
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={check}
        disabled={placed.length === 0 || !!result}
        className="w-full py-4 rounded-btn font-black text-base text-white disabled:opacity-40 ws-gradient-bg ws-glow-primary mt-auto"
      >
        {t('myWordsStudy.check')}
      </motion.button>
    </motion.div>
  )
}

// ── Choice / typing (mcq, reverse, listening, cloze, typing) ─────────────────
function ChoiceOrTypingQuestion({ question, onAnswer }: { question: StudyQuestion; onAnswer: (c: boolean) => void }) {
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
    if (question.mode === 'listening') {
      const id = setTimeout(() => playWordAudio(question.ttsWord ?? question.word, question.audioUrl), 350)
      return () => { clearTimeout(id); clearTimeout(timerRef.current) }
    }
    return () => clearTimeout(timerRef.current)
  }, [question.id, question.mode])

  const finish = (correct: boolean) => {
    if (correct) haptic.success()
    else haptic.error()
    timerRef.current = setTimeout(() => onAnswer(correct), correct ? 650 : 1300)
  }

  const handleChoice = (ci: number) => {
    if (locked) return
    setLocked(true)
    const correct = ci === question.correctIndex
    setStates((prev) =>
      prev.map((_, i) => {
        if (i === ci) return correct ? 'correct' : 'wrong'
        if (!correct && i === question.correctIndex) return 'reveal'
        return 'default'
      }),
    )
    finish(correct)
  }

  const handleTyped = () => {
    if (locked || !typed.trim()) return
    setLocked(true)
    const correct = typed.trim().toLowerCase() === (question.answer ?? '').trim().toLowerCase()
    setTypedResult(correct ? 'correct' : 'wrong')
    finish(correct)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -24, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      className="flex-1 flex flex-col gap-5"
    >
      {/* Prompt hero */}
      <div
        className="rounded-card p-6 flex flex-col items-center gap-3 text-center"
        style={{ background: 'rgba(45,155,111,0.1)', border: '1px solid rgba(45,155,111,0.2)' }}
      >
        <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--ws-muted)' }}>
          {t(`myWordsStudy.prompt.${question.mode}`)}
        </p>

        {question.mode === 'listening' ? (
          <SpeakerButton word={question.ttsWord ?? question.word} audioUrl={question.audioUrl} size="lg" />
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
            onKeyDown={(e) => e.key === 'Enter' && handleTyped()}
            disabled={locked}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={t('myWordsStudy.typePlaceholder')}
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
              {t('myWordsStudy.correctAnswer')}: {question.answer}
            </motion.p>
          )}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleTyped}
            disabled={locked || !typed.trim()}
            className="w-full py-4 rounded-btn font-black text-base text-white disabled:opacity-40 ws-gradient-bg ws-glow-primary"
          >
            {t('myWordsStudy.check')}
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

function QuestionView({ question, onAnswer }: { question: StudyQuestion; onAnswer: (c: boolean) => void }) {
  if (question.mode === 'flashcard') return <FlashcardQuestion question={question} onAnswer={onAnswer} />
  if (question.mode === 'scramble') return <ScrambleQuestion question={question} onAnswer={onAnswer} />
  return <ChoiceOrTypingQuestion question={question} onAnswer={onAnswer} />
}

// ── Matching board (whole-session) ───────────────────────────────────────────
type TileState = 'default' | 'selected' | 'solved' | 'wrong'

function tileStyle(state: TileState): React.CSSProperties {
  switch (state) {
    case 'selected':
      return { background: 'rgba(45,155,111,0.18)', border: '1px solid rgba(45,155,111,0.5)', color: 'var(--ws-primary-light)' }
    case 'solved':
      return { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: 'var(--ws-success)', opacity: 0.75 }
    case 'wrong':
      return { background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.45)', color: 'var(--ws-danger)' }
    default:
      return { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)', color: 'var(--ws-text)' }
  }
}

function MatchingBoard({ questions, onDone }: { questions: StudyQuestion[]; onDone: (answers: StudyAnswer[]) => void }) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const rights = useMemo(() => shuffle(questions), [questions])
  const [selected, setSelected] = useState<string | null>(null) // selected word's id
  const [solved, setSolved] = useState<Set<string>>(new Set())
  const [everWrong, setEverWrong] = useState<Set<string>>(new Set()) // ids that had a wrong first try
  const [wrong, setWrong] = useState<{ wordId: string; transId: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const pickWord = (id: string) => {
    if (solved.has(id) || wrong) return
    haptic.impact('light')
    setSelected((cur) => (cur === id ? null : id))
  }

  const pickTranslation = (id: string) => {
    if (!selected || solved.has(id) || wrong) return
    if (id === selected) {
      // correct pairing (word id === translation id)
      haptic.success()
      const next = new Set(solved).add(id)
      setSolved(next)
      setSelected(null)
      if (next.size === questions.length) {
        const answers: StudyAnswer[] = questions.map((q) => ({ id: q.id, correct: !everWrong.has(q.id) }))
        timerRef.current = setTimeout(() => onDone(answers), 650)
      }
    } else {
      haptic.error()
      setEverWrong((prev) => new Set(prev).add(selected))
      setWrong({ wordId: selected, transId: id })
      timerRef.current = setTimeout(() => { setWrong(null); setSelected(null) }, 550)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col gap-5 overflow-y-auto no-scrollbar"
    >
      <ProgressBar value={solved.size} total={questions.length} />

      <p className="text-sm text-center shrink-0" style={{ color: 'var(--ws-muted)' }}>{t('myWordsStudy.matchingHint')}</p>

      <div className="grid grid-cols-2 gap-3">
        {/* Words */}
        <div className="flex flex-col gap-2.5">
          {questions.map((q) => {
            const state: TileState = solved.has(q.id)
              ? 'solved'
              : wrong?.wordId === q.id
                ? 'wrong'
                : selected === q.id
                  ? 'selected'
                  : 'default'
            return (
              <motion.button
                key={q.id}
                whileTap={state === 'solved' ? {} : { scale: 0.96 }}
                onClick={() => pickWord(q.id)}
                disabled={state === 'solved'}
                className="w-full py-3.5 px-3 rounded-btn font-bold text-sm text-center break-words"
                style={tileStyle(state)}
              >
                {q.word}
              </motion.button>
            )
          })}
        </div>
        {/* Translations (shuffled) */}
        <div className="flex flex-col gap-2.5">
          {rights.map((q) => {
            const state: TileState = solved.has(q.id)
              ? 'solved'
              : wrong?.transId === q.id
                ? 'wrong'
                : 'default'
            return (
              <motion.button
                key={q.id}
                whileTap={state === 'solved' ? {} : { scale: 0.96 }}
                onClick={() => pickTranslation(q.id)}
                disabled={state === 'solved'}
                className="w-full py-3.5 px-3 rounded-btn font-bold text-sm text-center break-words"
                style={tileStyle(state)}
              >
                {q.translation}
              </motion.button>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

// ── Method picker ────────────────────────────────────────────────────────────
function MethodPicker({ onPick }: { onPick: (m: StudyMode) => void }) {
  const { t } = useTranslation()
  return (
    <motion.div
      key="picker"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-3 pt-1"
    >
      <p className="text-sm mb-1" style={{ color: 'var(--ws-muted)' }}>{t('myWordsStudy.pickMethod')}</p>
      {METHODS.map((m, i) => (
        <motion.button
          key={m.key}
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: Math.min(i * 0.045, 0.4) }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onPick(m.key)}
          className="w-full p-4 flex items-center gap-4 text-left rounded-card"
          style={
            m.recommended
              ? { background: 'rgba(45,155,111,0.14)', border: '1px solid rgba(45,155,111,0.4)', boxShadow: '0 8px 28px rgba(45,155,111,0.18)' }
              : { background: 'var(--ws-card)', border: '1px solid var(--ws-border)' }
          }
        >
          <div
            className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: `${m.tint}1f`, border: `1px solid ${m.tint}3a` }}
          >
            <m.Icon size={22} strokeWidth={2} style={{ color: m.tint }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-[15px]" style={{ color: 'var(--ws-text)' }}>{t(`myWordsStudy.methods.${m.key}.title`)}</p>
              {m.recommended && (
                <span
                  className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1"
                  style={{ color: 'var(--ws-primary-light)', background: 'rgba(45,155,111,0.18)' }}
                >
                  <Sparkles size={10} strokeWidth={2.6} /> {t('myWordsStudy.recommended')}
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--ws-muted)' }}>{t(`myWordsStudy.methods.${m.key}.desc`)}</p>
          </div>
          <ArrowRight size={20} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />
        </motion.button>
      ))}
    </motion.div>
  )
}

// ── Results ──────────────────────────────────────────────────────────────────
function ResultsScreen({
  correct, total, xpEarned, onAgain, onExit,
}: {
  correct: number
  total: number
  xpEarned: number | null
  onAgain: () => void
  onExit: () => void
}) {
  const { t } = useTranslation()
  const good = total > 0 && correct >= Math.ceil(total / 2)
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
        {good ? <Trophy size={46} strokeWidth={1.8} style={{ color: tint }} /> : <PartyPopper size={44} strokeWidth={1.8} style={{ color: tint }} />}
      </motion.div>

      <div>
        <p className="text-lg font-black mb-1" style={{ color: 'var(--ws-text)' }}>{t('myWordsStudy.resultTitle')}</p>
        <p className="text-4xl font-black" style={{ color: 'var(--ws-text)' }}>
          {correct} <span className="font-bold text-2xl" style={{ color: 'var(--ws-faint)' }}>/ {total}</span>
        </p>
        <p className="text-sm mt-1.5" style={{ color: 'var(--ws-muted)' }}>{t('myWordsStudy.correctCount')}</p>
      </div>

      {xpEarned !== null && (
        xpEarned > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 320, damping: 20 }}
            className="rounded-btn px-6 py-4 flex items-center gap-2"
            style={{ background: 'rgba(45,155,111,0.1)', border: '1px solid rgba(45,155,111,0.25)' }}
          >
            <Sparkles size={20} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
            <p className="font-black text-xl" style={{ color: 'var(--ws-primary-light)' }}>+{xpEarned} XP</p>
          </motion.div>
        ) : (
          <p className="text-sm max-w-xs" style={{ color: 'var(--ws-faint)' }}>{t('myWordsStudy.noXp')}</p>
        )
      )}

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onAgain}
          className="w-full py-4 rounded-btn font-black text-sm text-white flex items-center justify-center gap-2 ws-gradient-bg ws-glow-primary"
        >
          <RefreshCw size={17} strokeWidth={2.4} /> {t('myWordsStudy.again')}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onExit}
          className="w-full py-4 rounded-btn font-bold text-sm flex items-center justify-center gap-2 ws-card-2"
          style={{ color: 'var(--ws-muted)' }}
        >
          <ArrowLeft size={17} strokeWidth={2.2} /> {t('myWordsStudy.exit')}
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function MyWordsStudyPage({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<StudyMode | null>(null)
  const [questions, setQuestions] = useState<StudyQuestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<StudyAnswer[]>([])
  const [done, setDone] = useState(false)
  const [xpEarned, setXpEarned] = useState<number | null>(null)

  const isMatching = questions.length > 0 && questions[0].mode === 'matching'

  const start = (m: StudyMode) => {
    setMode(m)
    setLoading(true)
    setError(false)
    setIndex(0)
    setAnswers([])
    setDone(false)
    setXpEarned(null)
    myWordsStudyApi
      .getQuestions(m)
      .then(setQuestions)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  const finishSession = (all: StudyAnswer[]) => {
    setAnswers(all)
    setDone(true)
    myWordsStudyApi
      .submit(all)
      .then((r) => setXpEarned(r.xpEarned))
      .catch(() => setXpEarned(null))
  }

  const handleAnswer = (correct: boolean) => {
    const q = questions[index]
    const next = [...answers, { id: q.id, correct }]
    if (index + 1 >= questions.length) finishSession(next)
    else { setAnswers(next); setIndex((i) => i + 1) }
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
          <Sparkles size={20} strokeWidth={2} style={{ color: 'var(--ws-primary-light)' }} />
          <span className="font-black text-base" style={{ color: 'var(--ws-text)' }}>{t('myWordsStudy.title')}</span>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden px-5 pb-8">
        <AnimatePresence mode="wait">
          {/* Method picker */}
          {!mode && <MethodPicker key="picker" onPick={start} />}

          {/* Loading */}
          {mode && loading && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col items-center justify-center gap-5">
              <div className="relative w-12 h-12">
                <div className="absolute inset-0 rounded-full" style={{ border: '2px solid rgba(45,155,111,0.15)' }} />
                <div className="absolute inset-0 rounded-full animate-spin" style={{ border: '2px solid transparent', borderTopColor: 'var(--ws-primary)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--ws-faint)' }}>{t('myWordsStudy.preparing')}</p>
            </motion.div>
          )}

          {/* Error / empty */}
          {mode && !loading && (error || questions.length === 0) && !done && (
            <motion.div key="empty" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
                {error ? <Frown size={36} strokeWidth={1.8} style={{ color: 'var(--ws-muted)' }} /> : <Inbox size={36} strokeWidth={1.8} style={{ color: 'var(--ws-muted)' }} />}
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: 'var(--ws-text)' }}>{error ? t('myWordsStudy.loadError') : t('myWordsStudy.emptyTitle')}</p>
                <p className="text-sm mt-1 max-w-xs" style={{ color: 'var(--ws-muted)' }}>{error ? t('myWordsStudy.checkConnection') : t('myWordsStudy.emptyMsg')}</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => (error ? start(mode) : setMode(null))}
                className="px-6 py-3 rounded-btn font-bold text-sm text-white flex items-center gap-2 ws-gradient-bg ws-glow-primary"
              >
                {error ? <><RefreshCw size={16} strokeWidth={2.4} /> {t('myWordsStudy.retry')}</> : <><ArrowLeft size={16} strokeWidth={2.4} /> {t('myWordsStudy.back')}</>}
              </motion.button>
            </motion.div>
          )}

          {/* Results */}
          {mode && !loading && done && (
            <ResultsScreen
              key="results"
              correct={correctCount}
              total={answers.length}
              xpEarned={xpEarned}
              onAgain={() => start(mode)}
              onExit={() => setMode(null)}
            />
          )}

          {/* Active session */}
          {mode && !loading && !error && !done && questions.length > 0 && (
            isMatching ? (
              <MatchingBoard key="matching" questions={questions} onDone={finishSession} />
            ) : (
              <motion.div key="session" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col gap-5">
                <ProgressBar value={index + 1} total={questions.length} />
                <AnimatePresence mode="wait">
                  <QuestionView key={`q-${index}`} question={questions[index]} onAnswer={handleAnswer} />
                </AnimatePresence>
              </motion.div>
            )
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
