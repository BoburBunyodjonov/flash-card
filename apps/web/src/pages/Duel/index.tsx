import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { duelApi, type Duel, type DuelQuestion } from '../../api/duel.api'
import { useAuthStore } from '../../store/auth.store'
import { useTelegram } from '../../hooks/useTelegram'

type ChoiceState = 'default' | 'correct' | 'wrong' | 'reveal'

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

function Avatar({ url, size = 12 }: { url: string | null; size?: number }) {
  return (
    <div
      className={`w-${size} h-${size} rounded-full bg-surface flex items-center justify-center text-2xl overflow-hidden shrink-0`}
      style={{ width: size * 4, height: size * 4 }}
    >
      {url ? <img src={url} className="w-full h-full object-cover" /> : '👤'}
    </div>
  )
}

function statusBadge(d: Duel): { text: string; color: string } {
  if (d.status === 'pending') return { text: '⏳ Raqib kutilmoqda', color: '#f59e0b' }
  if (d.status === 'expired') return { text: '⌛ Muddati tugagan', color: '#6b7280' }
  if (d.status === 'completed') return { text: '✓ Tugagan', color: '#34d399' }
  if (d.myScore !== null) return { text: '⏳ Raqib o\'ynamoqda', color: '#38bdf8' }
  return { text: '⚡ Sizning navbatingiz', color: '#6366f1' }
}

// ── Duel question runner (same questions for both players) ────────────────────
function DuelPlay({
  duel,
  onFinished,
}: {
  duel: Duel
  onFinished: (updated: Duel) => void
}) {
  const { haptic } = useTelegram()
  const [index, setIndex] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [states, setStates] = useState<ChoiceState[]>([])
  const [locked, setLocked] = useState(false)
  const startTime = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const questions = duel.questions
  const q: DuelQuestion | undefined = questions[index]

  useEffect(() => {
    setStates((q?.choices ?? []).map(() => 'default'))
    setLocked(false)
    return () => clearTimeout(timerRef.current)
  }, [index])

  if (!q) return null

  const handleChoice = (ci: number) => {
    if (locked) return
    setLocked(true)
    const isCorrect = ci === q.correctIndex
    if (isCorrect) haptic.success()
    else haptic.error()
    setStates((prev) =>
      prev.map((_, i) => {
        if (i === ci) return isCorrect ? 'correct' : 'wrong'
        if (!isCorrect && i === q.correctIndex) return 'reveal'
        return 'default'
      }),
    )
    const newCorrect = correctCount + (isCorrect ? 1 : 0)
    timerRef.current = setTimeout(async () => {
      if (index + 1 >= questions.length) {
        try {
          const updated = await duelApi.submit(duel.id, newCorrect, Date.now() - startTime.current)
          onFinished(updated)
        } catch {
          onFinished(duel)
        }
      } else {
        setCorrectCount(newCorrect)
        setIndex((i) => i + 1)
      }
    }, isCorrect ? 600 : 1100)
  }

  return (
    <motion.div
      key={`dq-${index}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -24 }}
      className="flex-1 flex flex-col gap-5"
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #ef4444, #f97316)' }}
            animate={{ width: `${(index / questions.length) * 100}%` }}
          />
        </div>
        <span className="text-white/35 text-xs font-bold shrink-0 tabular-nums">{index + 1} / {questions.length}</span>
      </div>

      <div
        className="rounded-3xl p-6 flex flex-col items-center gap-3 text-center"
        style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(249,115,22,0.06))', border: '1px solid rgba(239,68,68,0.2)' }}
      >
        <p className="text-white/30 text-xs font-black uppercase tracking-widest">Bu so'z o'zbekchada nima?</p>
        <h2 className="font-black text-white" style={{ fontSize: 'clamp(2rem, 8vw, 3.4rem)', lineHeight: 1.1 }}>
          {q.word}
        </h2>
        {q.pronunciation && <p className="text-white/35 font-mono text-sm">{q.pronunciation}</p>}
      </div>

      <div className="flex flex-col gap-3">
        {q.choices.map((choice, ci) => (
          <motion.button
            key={ci}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + ci * 0.06 }}
            whileTap={locked ? {} : { scale: 0.97 }}
            onClick={() => handleChoice(ci)}
            className="w-full py-4 px-5 rounded-2xl text-left font-semibold text-base"
            style={choiceStyle(states[ci] ?? 'default')}
          >
            <span className="mr-3 font-black text-white/30">{String.fromCharCode(65 + ci)}.</span>
            {choice}
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

// ── Result view ────────────────────────────────────────────────────────────────
function DuelResult({ duel, onBack }: { duel: Duel; onBack: () => void }) {
  const { user } = useAuthStore()
  const iWon = duel.winnerId === user?.id
  const draw = duel.status === 'completed' && !duel.winnerId
  const waiting = duel.status !== 'completed'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <div className="text-7xl">{waiting ? '⏳' : draw ? '🤝' : iWon ? '🏆' : '😔'}</div>
      <div>
        <p className="text-2xl font-black text-white">
          {waiting ? "Raqib o'ynashini kuting" : draw ? 'Durang!' : iWon ? "G'alaba!" : 'Mag\'lubiyat'}
        </p>
        {waiting && <p className="text-white/35 text-sm mt-1">Natija raqib o'ynagach chiqadi</p>}
      </div>

      {/* Scoreboard */}
      <div
        className="rounded-3xl px-6 py-5 flex items-center gap-6 w-full max-w-xs justify-center"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="flex flex-col items-center gap-2">
          <Avatar url={duel.challenger.avatarUrl} />
          <p className="text-white/60 text-xs font-bold truncate max-w-[80px]">{duel.challenger.firstName}</p>
          <p className="text-2xl font-black text-white">{duel.challengerScore ?? '–'}</p>
        </div>
        <span className="text-white/20 font-black text-xl">VS</span>
        <div className="flex flex-col items-center gap-2">
          <Avatar url={duel.opponent?.avatarUrl ?? null} />
          <p className="text-white/60 text-xs font-bold truncate max-w-[80px]">{duel.opponent?.firstName ?? '???'}</p>
          <p className="text-2xl font-black text-white">{duel.opponentScore ?? '–'}</p>
        </div>
      </div>

      {!waiting && !draw && (
        <p className="text-white/40 text-sm">{iWon ? '+50 XP' : '+15 XP'}</p>
      )}

      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onBack}
        className="w-full max-w-xs py-4 rounded-2xl font-bold text-sm"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)' }}
      >
        ← Duellar ro'yxati
      </motion.button>
    </motion.div>
  )
}

// ── Main DuelPage ──────────────────────────────────────────────────────────────
export function DuelPage({ onBack, deepLinkDuelId }: { onBack: () => void; deepLinkDuelId?: string | null }) {
  const { user } = useAuthStore()
  const { twa } = useTelegram()
  const [duels, setDuels] = useState<Duel[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<Duel | null>(null)
  const [view, setView] = useState<'list' | 'share' | 'play' | 'result'>('list')
  const [creating, setCreating] = useState(false)
  const [joinError, setJoinError] = useState('')

  const loadList = () => {
    setLoading(true)
    duelApi.list().then(setDuels).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadList() }, [])

  // Deep link: opened via a shared duel invite
  useEffect(() => {
    if (!deepLinkDuelId) return
    duelApi
      .get(deepLinkDuelId)
      .then(async (d) => {
        if (d.isChallenger) {
          openDuel(d)
          return
        }
        if (d.status === 'pending' || (d.status === 'active' && d.myScore === null)) {
          const joined = d.status === 'pending' ? await duelApi.join(d.id) : d
          setActive(joined)
          setView('play')
        } else {
          setActive(d)
          setView('result')
        }
      })
      .catch((e) => setJoinError(e?.response?.data?.error ?? 'Duel topilmadi'))
  }, [deepLinkDuelId])

  const createDuel = async () => {
    setCreating(true)
    try {
      const d = await duelApi.create()
      setActive(d)
      setView('share')
    } finally {
      setCreating(false)
    }
  }

  const shareDuel = (d: Duel) => {
    const text = `⚔️ Seni WordSwipe duelga chaqiraman! ${d.questions.length} ta savol — kim kuchli?`
    const url = d.link ?? 'https://t.me/WordSwipeBot'
    if (twa) {
      twa.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
    } else {
      navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {})
    }
  }

  const openDuel = (d: Duel) => {
    setActive(d)
    if (d.isChallenger && d.status === 'pending') setView('share')
    else if (d.myScore === null && d.status === 'active') setView('play')
    else setView('result')
  }

  const backToList = () => {
    setActive(null)
    setView('list')
    setJoinError('')
    loadList()
  }

  return (
    <div className="h-full flex flex-col" style={{ background: '#0a0a14' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => (view === 'list' ? onBack() : backToList())}
          className="text-primary font-semibold text-sm"
        >
          ← Orqaga
        </motion.button>
        <div className="flex items-center gap-2">
          <span className="text-xl">⚔️</span>
          <span className="text-white font-black text-base">Duel</span>
        </div>
        <div className="w-16" />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden px-5 pb-8">
        <AnimatePresence mode="wait">
          {joinError && view === 'list' && (
            <motion.p
              key="join-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-danger text-sm text-center mb-2"
            >
              {joinError}
            </motion.p>
          )}

          {/* List */}
          {view === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="flex-1 flex flex-col gap-3 overflow-hidden"
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={createDuel}
                disabled={creating}
                className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', boxShadow: '0 8px 32px rgba(239,68,68,0.25)' }}
              >
                {creating ? 'Yaratilmoqda...' : "⚔️ Do'stni duelga chaqirish"}
              </motion.button>

              <p className="text-white/30 text-xs font-bold uppercase tracking-wider mt-2">Mening duellarim</p>

              <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2">
                {loading ? (
                  <div className="flex justify-center pt-8">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : duels.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 pt-10 text-center">
                    <span className="text-5xl">🥊</span>
                    <p className="text-white/35 text-sm">Hali duellar yo'q.<br />Do'stingizni chaqiring!</p>
                  </div>
                ) : (
                  duels.map((d) => {
                    const badge = statusBadge(d)
                    const rival = d.isChallenger ? d.opponent : d.challenger
                    const iWon = d.winnerId === user?.id
                    return (
                      <motion.button
                        key={d.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openDuel(d)}
                        className="w-full rounded-2xl p-4 flex items-center gap-3 text-left"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                      >
                        <Avatar url={rival?.avatarUrl ?? null} size={10} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-bold text-sm truncate">
                            {rival ? `${rival.firstName} bilan` : 'Ochiq taklif'}
                          </p>
                          <p className="text-xs font-semibold mt-0.5" style={{ color: badge.color }}>{badge.text}</p>
                        </div>
                        {d.status === 'completed' && (
                          <span className="text-lg">{!d.winnerId ? '🤝' : iWon ? '🏆' : '😔'}</span>
                        )}
                        <span className="text-white/40 font-black text-sm tabular-nums">
                          {d.challengerScore ?? '–'} : {d.opponentScore ?? '–'}
                        </span>
                      </motion.button>
                    )
                  })
                )}
              </div>
            </motion.div>
          )}

          {/* Share / waiting */}
          {view === 'share' && active && (
            <motion.div
              key="share"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-6 px-4 text-center"
            >
              <div className="text-7xl">⚔️</div>
              <div>
                <p className="text-2xl font-black text-white">Duel tayyor!</p>
                <p className="text-white/35 text-sm mt-1.5 max-w-[260px]">
                  Havolani do'stingizga yuboring. U ham xuddi shu {active.questions.length} ta savolga javob beradi.
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => shareDuel(active)}
                className="w-full max-w-xs py-4 rounded-2xl font-black text-base text-white"
                style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', boxShadow: '0 8px 32px rgba(239,68,68,0.25)' }}
              >
                📤 Telegram'da ulashish
              </motion.button>
              {active.myScore === null && (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setView('play')}
                  className="w-full max-w-xs py-4 rounded-2xl font-bold text-sm text-white"
                  style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
                >
                  ▶️ O'zim hozir o'ynayman
                </motion.button>
              )}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={backToList}
                className="text-white/40 text-sm font-semibold"
              >
                ← Ro'yxatga qaytish
              </motion.button>
            </motion.div>
          )}

          {/* Play */}
          {view === 'play' && active && (
            <DuelPlay
              key="play"
              duel={active}
              onFinished={(updated) => {
                setActive(updated)
                setView('result')
              }}
            />
          )}

          {/* Result */}
          {view === 'result' && active && (
            <DuelResult key="result" duel={active} onBack={backToList} />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
