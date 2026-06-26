import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Swords, Share2, Clock, Trophy, Check, X, ArrowLeft, Play, User, Handshake, Frown,
} from 'lucide-react'
import { duelApi, type Duel, type DuelQuestion } from '../../api/duel.api'
import { useAuthStore } from '../../store/auth.store'
import { useTelegram } from '../../hooks/useTelegram'

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

function Avatar({ url, size = 12 }: { url: string | null; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: size * 4, height: size * 4, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)' }}
    >
      {url
        ? <img src={url} className="w-full h-full object-cover" alt="" />
        : <User size={size * 1.8} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />}
    </div>
  )
}

function statusBadge(d: Duel, t: (k: string) => string): { text: string; color: string } {
  if (d.status === 'pending') return { text: t('duel.status.pending'), color: '#f59e0b' }
  if (d.status === 'expired') return { text: t('duel.status.expired'), color: '#6b7280' }
  if (d.status === 'completed') return { text: t('duel.status.completed'), color: '#34d399' }
  if (d.myScore !== null) return { text: t('duel.status.opponentPlaying'), color: '#38bdf8' }
  return { text: t('duel.status.yourTurn'), color: '#6366f1' }
}

// ── Duel question runner (same questions for both players) ────────────────────
function DuelPlay({
  duel,
  onFinished,
}: {
  duel: Duel
  onFinished: (updated: Duel) => void
}) {
  const { t } = useTranslation()
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
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg, #ef4444, #f97316)' }}
            animate={{ width: `${(index / questions.length) * 100}%` }}
          />
        </div>
        <span className="text-xs font-bold shrink-0 tabular-nums" style={{ color: 'var(--ws-faint)' }}>{index + 1} / {questions.length}</span>
      </div>

      <div
        className="rounded-card p-6 flex flex-col items-center gap-3 text-center"
        style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(249,115,22,0.05))', border: '1px solid rgba(239,68,68,0.2)' }}
      >
        <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--ws-muted)' }}>{t('duel.questionPrompt')}</p>
        <h2 className="font-black" style={{ color: 'var(--ws-text)', fontSize: 'clamp(2rem, 8vw, 3.4rem)', lineHeight: 1.1 }}>
          {q.word}
        </h2>
        {q.pronunciation && <p className="font-mono text-sm" style={{ color: 'var(--ws-faint)' }}>{q.pronunciation}</p>}
      </div>

      <div className="flex flex-col gap-3">
        {q.choices.map((choice, ci) => {
          const st = states[ci] ?? 'default'
          return (
            <motion.button
              key={ci}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + ci * 0.06 }}
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
    </motion.div>
  )
}

// ── Result view ────────────────────────────────────────────────────────────────
function DuelResult({ duel, onBack }: { duel: Duel; onBack: () => void }) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const iWon = duel.winnerId === user?.id
  const draw = duel.status === 'completed' && !duel.winnerId
  const waiting = duel.status !== 'completed'

  const heroTint = waiting ? '#6366f1' : draw ? '#38bdf8' : iWon ? '#f59e0b' : '#ef4444'
  const HeroIcon = waiting ? Clock : draw ? Handshake : iWon ? Trophy : Frown

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex-1 flex flex-col items-center justify-center gap-6 px-6 text-center"
    >
      <motion.div
        initial={{ scale: 0, rotate: -15 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 220 }}
        className="w-24 h-24 rounded-3xl flex items-center justify-center"
        style={{ background: `${heroTint}1f`, border: `1px solid ${heroTint}3a` }}
      >
        <HeroIcon size={46} strokeWidth={1.8} style={{ color: heroTint }} />
      </motion.div>
      <div>
        <p className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>
          {waiting ? t('duel.result.waiting') : draw ? t('duel.result.draw') : iWon ? t('duel.result.won') : t('duel.result.lost')}
        </p>
        {waiting && <p className="text-sm mt-1" style={{ color: 'var(--ws-muted)' }}>{t('duel.result.waitingDesc')}</p>}
      </div>

      {/* Scoreboard */}
      <div className="ws-card px-6 py-5 flex items-center gap-6 w-full max-w-xs justify-center">
        <div className="flex flex-col items-center gap-2">
          <Avatar url={duel.challenger.avatarUrl} />
          <p className="text-xs font-bold truncate max-w-[80px]" style={{ color: 'var(--ws-muted)' }}>{duel.challenger.firstName}</p>
          <p className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>{duel.challengerScore ?? '–'}</p>
        </div>
        <span className="font-black text-xl" style={{ color: 'var(--ws-faint)' }}>VS</span>
        <div className="flex flex-col items-center gap-2">
          <Avatar url={duel.opponent?.avatarUrl ?? null} />
          <p className="text-xs font-bold truncate max-w-[80px]" style={{ color: 'var(--ws-muted)' }}>{duel.opponent?.firstName ?? '???'}</p>
          <p className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>{duel.opponentScore ?? '–'}</p>
        </div>
      </div>

      {!waiting && !draw && (
        <p className="text-sm font-bold" style={{ color: 'var(--ws-muted)' }}>{iWon ? '+50 XP' : '+15 XP'}</p>
      )}

      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={onBack}
        className="w-full max-w-xs py-4 rounded-btn font-bold text-sm flex items-center justify-center gap-2 ws-card-2"
        style={{ color: 'var(--ws-muted)' }}
      >
        <ArrowLeft size={17} strokeWidth={2.2} /> {t('duel.backToList')}
      </motion.button>
    </motion.div>
  )
}

// ── Main DuelPage ──────────────────────────────────────────────────────────────
export function DuelPage({ onBack, deepLinkDuelId }: { onBack: () => void; deepLinkDuelId?: string | null }) {
  const { t } = useTranslation()
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
      .catch((e) => setJoinError(e?.response?.data?.error ?? t('duel.notFound')))
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
    <div className="h-full flex flex-col" style={{ background: 'var(--ws-bg)' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={() => (view === 'list' ? onBack() : backToList())}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}
        >
          <ArrowLeft size={18} strokeWidth={2.2} style={{ color: 'var(--ws-muted)' }} />
        </motion.button>
        <div className="flex items-center gap-2">
          <Swords size={20} strokeWidth={2} style={{ color: 'var(--ws-danger)' }} />
          <span className="font-black text-base" style={{ color: 'var(--ws-text)' }}>{t('practice.duel.title')}</span>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden px-5 pb-8">
        <AnimatePresence mode="wait">
          {joinError && view === 'list' && (
            <motion.p
              key="join-error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-sm text-center mb-2"
              style={{ color: 'var(--ws-danger)' }}
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
                className="w-full py-4 rounded-btn font-black text-base text-white flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', boxShadow: '0 8px 28px rgba(239,68,68,0.25)' }}
              >
                <Swords size={18} strokeWidth={2.4} />
                {creating ? t('duel.creating') : t('duel.challengeFriend')}
              </motion.button>

              <p className="text-xs font-bold uppercase tracking-wider mt-2" style={{ color: 'var(--ws-faint)' }}>{t('duel.myDuels')}</p>

              <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2">
                {loading ? (
                  <div className="flex justify-center pt-8">
                    <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid transparent', borderTopColor: 'var(--ws-primary)', borderRightColor: 'var(--ws-primary)' }} />
                  </div>
                ) : duels.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 pt-12 text-center">
                    <div
                      className="w-20 h-20 rounded-3xl flex items-center justify-center"
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}
                    >
                      <Swords size={36} strokeWidth={1.8} style={{ color: 'var(--ws-danger)' }} />
                    </div>
                    <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>{t('duel.emptyTitle')}<br />{t('duel.emptyDesc')}</p>
                  </div>
                ) : (
                  duels.map((d) => {
                    const badge = statusBadge(d, t)
                    const rival = d.isChallenger ? d.opponent : d.challenger
                    const iWon = d.winnerId === user?.id
                    return (
                      <motion.button
                        key={d.id}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openDuel(d)}
                        className="w-full ws-card p-4 flex items-center gap-3 text-left"
                      >
                        <Avatar url={rival?.avatarUrl ?? null} size={10} />
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate" style={{ color: 'var(--ws-text)' }}>
                            {rival ? t('duel.withName', { name: rival.firstName }) : t('duel.openInvite')}
                          </p>
                          <p className="text-xs font-semibold mt-0.5" style={{ color: badge.color }}>{badge.text}</p>
                        </div>
                        {d.status === 'completed' && (
                          !d.winnerId
                            ? <Handshake size={18} strokeWidth={2} style={{ color: '#38bdf8' }} />
                            : iWon
                              ? <Trophy size={18} strokeWidth={2} style={{ color: '#f59e0b' }} />
                              : <Frown size={18} strokeWidth={2} style={{ color: 'var(--ws-danger)' }} />
                        )}
                        <span className="font-black text-sm tabular-nums" style={{ color: 'var(--ws-muted)' }}>
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
              <motion.div
                initial={{ scale: 0, rotate: -15 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 220 }}
                className="w-24 h-24 rounded-3xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }}
              >
                <Swords size={46} strokeWidth={1.8} style={{ color: 'var(--ws-danger)' }} />
              </motion.div>
              <div>
                <p className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>{t('duel.ready')}</p>
                <p className="text-sm mt-1.5 max-w-[260px]" style={{ color: 'var(--ws-muted)' }}>
                  {t('duel.readyDesc', { count: active.questions.length })}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => shareDuel(active)}
                className="w-full max-w-xs py-4 rounded-btn font-black text-base text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', boxShadow: '0 8px 28px rgba(239,68,68,0.25)' }}
              >
                <Share2 size={18} strokeWidth={2.2} /> {t('duel.shareTelegram')}
              </motion.button>
              {active.myScore === null && (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setView('play')}
                  className="w-full max-w-xs py-4 rounded-btn font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--ws-primary-light)' }}
                >
                  <Play size={17} strokeWidth={2.4} /> {t('duel.playNow')}
                </motion.button>
              )}
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={backToList}
                className="text-sm font-semibold flex items-center gap-1.5"
                style={{ color: 'var(--ws-faint)' }}
              >
                <ArrowLeft size={15} strokeWidth={2.2} /> {t('duel.backToList')}
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
