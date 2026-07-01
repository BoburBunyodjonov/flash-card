import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Users, Share2, Trophy, Check, X, ArrowLeft, Play, User, Crown, Medal } from 'lucide-react'
import { gcApi, type GroupChallenge, type GcQuestion } from '../../api/groupChallenge.api'
import { useTelegram } from '../../hooks/useTelegram'

type ChoiceState = 'default' | 'correct' | 'wrong' | 'reveal'

function choiceStyle(state: ChoiceState): React.CSSProperties {
  switch (state) {
    case 'correct': return { background: 'rgba(16,185,129,0.18)', border: '1px solid rgba(16,185,129,0.4)', color: 'var(--ws-success)' }
    case 'wrong': return { background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--ws-danger)' }
    case 'reveal': return { background: 'rgba(16,185,129,0.13)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--ws-success)' }
    default: return { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)', color: 'var(--ws-text)' }
  }
}

function Avatar({ url, size = 10 }: { url: string | null; size?: number }) {
  return (
    <div className="rounded-full flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: size * 4, height: size * 4, background: 'var(--ws-surface)', border: '1px solid var(--ws-border)' }}>
      {url ? <img src={url} className="w-full h-full object-cover" alt="" />
        : <User size={size * 1.8} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />}
    </div>
  )
}

// Shared MCQ runner — the same question set every player answers.
function GcPlay({ gc, onFinished }: { gc: GroupChallenge; onFinished: (updated: GroupChallenge) => void }) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const [index, setIndex] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [states, setStates] = useState<ChoiceState[]>([])
  const [locked, setLocked] = useState(false)
  const startTime = useRef(Date.now())
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const questions = gc.questions
  const q: GcQuestion | undefined = questions[index]

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
    isCorrect ? haptic.success() : haptic.error()
    setStates((prev) => prev.map((_, i) => {
      if (i === ci) return isCorrect ? 'correct' : 'wrong'
      if (!isCorrect && i === q.correctIndex) return 'reveal'
      return 'default'
    }))
    const newCorrect = correctCount + (isCorrect ? 1 : 0)
    timerRef.current = setTimeout(async () => {
      if (index + 1 >= questions.length) {
        try {
          const updated = await gcApi.submit(gc.id, newCorrect, Date.now() - startTime.current)
          onFinished(updated)
        } catch {
          onFinished(gc)
        }
      } else {
        setCorrectCount(newCorrect)
        setIndex((i) => i + 1)
      }
    }, isCorrect ? 600 : 1100)
  }

  return (
    <motion.div key={`gq-${index}`} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
      className="flex-1 flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #8b5cf6, #6366f1)' }}
            animate={{ width: `${(index / questions.length) * 100}%` }} />
        </div>
        <span className="text-xs font-bold shrink-0 tabular-nums" style={{ color: 'var(--ws-faint)' }}>{index + 1} / {questions.length}</span>
      </div>

      <div className="rounded-card p-6 flex flex-col items-center gap-3 text-center"
        style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(99,102,241,0.05))', border: '1px solid rgba(139,92,246,0.2)' }}>
        <p className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--ws-muted)' }}>{t('groupChallenge.questionPrompt')}</p>
        <h2 className="font-black" style={{ color: 'var(--ws-text)', fontSize: 'clamp(2rem, 8vw, 3.4rem)', lineHeight: 1.1 }}>{q.word}</h2>
        {q.pronunciation && <p className="font-mono text-sm" style={{ color: 'var(--ws-faint)' }}>{q.pronunciation}</p>}
      </div>

      <div className="flex flex-col gap-3">
        {q.choices.map((choice, ci) => {
          const st = states[ci] ?? 'default'
          return (
            <motion.button key={ci} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + ci * 0.06 }}
              whileTap={locked ? {} : { scale: 0.97 }} onClick={() => handleChoice(ci)}
              className="w-full py-4 px-5 rounded-btn text-left font-semibold text-base flex items-center gap-3" style={choiceStyle(st)}>
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

// Leaderboard shown in the lobby and after finishing.
function Leaderboard({ gc }: { gc: GroupChallenge }) {
  const { t } = useTranslation()
  if (gc.leaderboard.length === 0) {
    return <p className="text-sm text-center py-6" style={{ color: 'var(--ws-muted)' }}>{t('groupChallenge.noPlayers')}</p>
  }
  return (
    <div className="flex flex-col gap-2">
      {gc.leaderboard.map((row) => (
        <div key={row.user.id} className="flex items-center gap-3 rounded-card px-4 py-2.5"
          style={row.isMe ? { background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.3)' }
            : { background: 'var(--ws-card)', border: '1px solid var(--ws-border)' }}>
          <span className="w-6 text-center font-black tabular-nums" style={{ color: 'var(--ws-faint)' }}>
            {row.rank === 1 ? <Crown size={16} style={{ color: '#fbbf24' }} className="inline" />
              : row.rank <= 3 ? <Medal size={15} style={{ color: row.rank === 2 ? '#c0c0c0' : '#cd7f32' }} className="inline" />
                : row.rank}
          </span>
          <Avatar url={row.user.avatarUrl} size={8} />
          <p className="flex-1 min-w-0 font-semibold text-sm truncate" style={{ color: 'var(--ws-text)' }}>{row.user.firstName}</p>
          <span className="font-black tabular-nums text-sm" style={{ color: row.completed ? 'var(--ws-primary-light)' : 'var(--ws-faint)' }}>
            {row.completed ? `${row.score}/${gc.questionCount}` : '…'}
          </span>
        </div>
      ))}
    </div>
  )
}

export function GroupChallengePage({ onBack, deepLinkId }: { onBack: () => void; deepLinkId?: string | null }) {
  const { t } = useTranslation()
  const { twa } = useTelegram()
  const [list, setList] = useState<GroupChallenge[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<GroupChallenge | null>(null)
  const [view, setView] = useState<'list' | 'lobby' | 'play' | 'result'>('list')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const loadList = () => {
    setLoading(true)
    gcApi.list().then(setList).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { loadList() }, [])

  // Deep link: opened via a shared challenge invite.
  useEffect(() => {
    if (!deepLinkId) return
    gcApi.get(deepLinkId)
      .then(async (g) => {
        const joined = !g.joined && !g.expired ? await gcApi.join(g.id) : g
        setActive(joined)
        setView(joined.submitted ? 'result' : 'lobby')
      })
      .catch((e) => setError(e?.response?.data?.error ?? t('groupChallenge.notFound')))
  }, [deepLinkId])

  const create = async () => {
    setCreating(true)
    try {
      const g = await gcApi.create()
      setActive(g)
      setView('lobby')
    } catch (e: any) {
      setError(e?.response?.data?.error ?? t('groupChallenge.createError'))
    } finally {
      setCreating(false)
    }
  }

  const share = (g: GroupChallenge) => {
    const text = t('groupChallenge.shareText', { count: g.questionCount })
    const url = g.link ?? 'https://t.me/WordSwipeBot'
    if (twa) twa.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
    else navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {})
  }

  const open = (g: GroupChallenge) => {
    setActive(g)
    setView(g.submitted || g.expired ? 'result' : 'lobby')
  }

  const refreshActive = async () => {
    if (!active) return
    try { setActive(await gcApi.get(active.id)) } catch {}
  }

  const backToList = () => {
    setActive(null); setView('list'); setError(''); loadList()
  }

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--ws-bg)' }}>
      <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
        <motion.button whileTap={{ scale: 0.92 }} onClick={() => (view === 'list' ? onBack() : backToList())}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }}>
          <ArrowLeft size={18} strokeWidth={2.2} style={{ color: 'var(--ws-muted)' }} />
        </motion.button>
        <div className="flex items-center gap-2">
          <Users size={20} strokeWidth={2} style={{ color: '#8b5cf6' }} />
          <span className="font-black text-base" style={{ color: 'var(--ws-text)' }}>{t('groupChallenge.title')}</span>
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden px-5 pb-8">
        <AnimatePresence mode="wait">
          {error && view === 'list' && (
            <motion.p key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-center mb-2" style={{ color: 'var(--ws-danger)' }}>{error}</motion.p>
          )}

          {view === 'list' && (
            <motion.div key="list" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="flex-1 flex flex-col gap-3 overflow-hidden">
              <motion.button whileTap={{ scale: 0.97 }} onClick={create} disabled={creating}
                className="w-full py-4 rounded-btn font-black text-base text-white flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', boxShadow: '0 8px 28px rgba(139,92,246,0.25)' }}>
                <Users size={18} strokeWidth={2.4} />
                {creating ? t('groupChallenge.creating') : t('groupChallenge.createButton')}
              </motion.button>

              <p className="text-xs font-bold uppercase tracking-wider mt-2" style={{ color: 'var(--ws-faint)' }}>{t('groupChallenge.myChallenges')}</p>

              <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-2">
                {loading ? (
                  <div className="flex justify-center pt-8">
                    <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid transparent', borderTopColor: 'var(--ws-primary)', borderRightColor: 'var(--ws-primary)' }} />
                  </div>
                ) : list.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 pt-12 text-center">
                    <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}>
                      <Users size={36} strokeWidth={1.8} style={{ color: '#8b5cf6' }} />
                    </div>
                    <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>{t('groupChallenge.emptyDesc')}</p>
                  </div>
                ) : (
                  list.map((g) => (
                    <motion.button key={g.id} whileTap={{ scale: 0.98 }} onClick={() => open(g)} className="w-full ws-card p-4 flex items-center gap-3 text-left">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)' }}>
                        <Users size={18} strokeWidth={2} style={{ color: '#8b5cf6' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate" style={{ color: 'var(--ws-text)' }}>{t('groupChallenge.byName', { name: g.creator.firstName })}</p>
                        <p className="text-xs font-semibold mt-0.5" style={{ color: g.expired ? 'var(--ws-faint)' : '#8b5cf6' }}>
                          {t('groupChallenge.playerCount', { count: g.playerCount })}{g.submitted ? ` · ${g.myScore}/${g.questionCount}` : g.expired ? ` · ${t('groupChallenge.ended')}` : ''}
                        </p>
                      </div>
                      <Trophy size={18} strokeWidth={2} style={{ color: g.submitted ? '#f59e0b' : 'var(--ws-faint)' }} />
                    </motion.button>
                  ))
                )}
              </div>
            </motion.div>
          )}

          {view === 'lobby' && active && (
            <motion.div key="lobby" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="flex-1 flex flex-col gap-4 overflow-y-auto no-scrollbar">
              <div className="flex flex-col items-center gap-3 pt-2 text-center">
                <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)' }}>
                  <Users size={40} strokeWidth={1.8} style={{ color: '#8b5cf6' }} />
                </div>
                <p className="text-xl font-black" style={{ color: 'var(--ws-text)' }}>{t('groupChallenge.lobbyTitle')}</p>
                <p className="text-sm max-w-[260px]" style={{ color: 'var(--ws-muted)' }}>{t('groupChallenge.lobbyDesc', { count: active.questionCount })}</p>
              </div>

              <button onClick={() => share(active)} className="w-full py-3.5 rounded-btn font-black text-base text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>
                <Share2 size={18} strokeWidth={2.2} /> {t('groupChallenge.shareTelegram')}
              </button>

              {!active.submitted && !active.expired && (
                <button onClick={() => setView('play')} className="w-full py-3.5 rounded-btn font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--ws-primary-light)' }}>
                  <Play size={17} strokeWidth={2.4} /> {t('groupChallenge.playNow')}
                </button>
              )}

              <div className="flex items-center justify-between mt-1">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ws-faint)' }}>{t('groupChallenge.leaderboard')}</p>
                <button onClick={refreshActive} className="text-xs font-semibold" style={{ color: 'var(--ws-primary-light)' }}>{t('groupChallenge.refresh')}</button>
              </div>
              <Leaderboard gc={active} />
            </motion.div>
          )}

          {view === 'play' && active && (
            <GcPlay key="play" gc={active} onFinished={(updated) => { setActive(updated); setView('result') }} />
          )}

          {view === 'result' && active && (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
              className="flex-1 flex flex-col gap-4 overflow-y-auto no-scrollbar">
              <div className="flex flex-col items-center gap-2 pt-2 text-center">
                <motion.div initial={{ scale: 0, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220 }}
                  className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.35)' }}>
                  <Trophy size={40} strokeWidth={1.8} style={{ color: '#f59e0b' }} />
                </motion.div>
                {active.myScore !== null && (
                  <p className="text-2xl font-black" style={{ color: 'var(--ws-text)' }}>{active.myScore}/{active.questionCount}</p>
                )}
                {active.xpEarned ? <p className="text-sm font-bold" style={{ color: 'var(--ws-success)' }}>+{active.xpEarned} XP</p> : null}
              </div>

              <button onClick={() => share(active)} className="w-full py-3.5 rounded-btn font-bold text-sm text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>
                <Share2 size={17} strokeWidth={2.2} /> {t('groupChallenge.inviteMore')}
              </button>

              <div className="flex items-center justify-between mt-1">
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ws-faint)' }}>{t('groupChallenge.leaderboard')}</p>
                <button onClick={refreshActive} className="text-xs font-semibold" style={{ color: 'var(--ws-primary-light)' }}>{t('groupChallenge.refresh')}</button>
              </div>
              <Leaderboard gc={active} />

              <button onClick={backToList} className="w-full py-3.5 rounded-btn font-bold text-sm flex items-center justify-center gap-2 ws-card-2 mt-1" style={{ color: 'var(--ws-muted)' }}>
                <ArrowLeft size={17} strokeWidth={2.2} /> {t('groupChallenge.backToList')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
