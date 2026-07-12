import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Flame, Zap, BookOpen, Trophy, Award, Activity, Target,
  ArrowLeft, X, Check, PartyPopper, type LucideIcon,
} from 'lucide-react'
import { progressApi } from '../../api/progress.api'
import { myWordsApi } from '../../api/myWords.api'

interface ProgressData {
  streak: number
  streakFreezes?: number
  xp: number
  totalWordsEncountered: number
  learned: number
  learning: number
  mastered: number
  savedWords?: number
}

interface Achievement {
  id: string
  Icon: LucideIcon
  title: string
  desc: string
  unlocked: (p: ProgressData & { savedWords?: number }) => boolean
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_word',  Icon: BookOpen,  title: 'Birinchi qadam',      desc: 'Birinchi so\'z o\'rgandim',         unlocked: p => p.totalWordsEncountered >= 1 },
  { id: 'streak_3',    Icon: Flame,     title: '3 kunlik olov',       desc: '3 kun ketma-ket o\'rgandim',         unlocked: p => p.streak >= 3 },
  { id: 'streak_7',    Icon: Zap,       title: 'Haftalik qahramonlik', desc: '7 kun streak',                      unlocked: p => p.streak >= 7 },
  { id: 'streak_30',   Icon: Award,     title: 'Oylik ustoz',          desc: '30 kun streak',                     unlocked: p => p.streak >= 30 },
  { id: 'words_10',    Icon: BookOpen,  title: '10 so\'z',             desc: '10 ta so\'z o\'rgandim',             unlocked: p => (p.learned + p.mastered) >= 10 },
  { id: 'words_50',    Icon: Award,     title: '50 so\'z',             desc: '50 ta so\'z o\'rgandim',             unlocked: p => (p.learned + p.mastered) >= 50 },
  { id: 'words_100',   Icon: Trophy,    title: '100 so\'z',            desc: '100 ta so\'z o\'rgandim',            unlocked: p => (p.learned + p.mastered) >= 100 },
  { id: 'xp_100',      Icon: Zap,       title: '100 XP',               desc: '100 XP to\'pladim',                  unlocked: p => p.xp >= 100 },
  { id: 'xp_1000',     Icon: Zap,       title: '1000 XP',              desc: '1000 XP to\'pladim',                 unlocked: p => p.xp >= 1000 },
  { id: 'master_10',   Icon: Target,    title: 'Master',               desc: '10 ta so\'z mustahkamlandi',         unlocked: p => p.mastered >= 10 },
  { id: 'saved_5',     Icon: BookOpen,  title: 'Kolleksioner',          desc: '5 ta so\'z qo\'shdim',                unlocked: p => (p as any).savedWords >= 5 },
  { id: 'b1_reached',  Icon: Award,     title: 'B1 daraja',            desc: '50 ta B1 darajali so\'z o\'rgandim', unlocked: p => (p.learned + p.mastered) >= 50 },
]

interface WeakWord {
  id: string
  strength: number
  word: {
    id: string
    word: string
    pronunciation: string | null
    partOfSpeech: string | null
    difficulty: string
    translations: { translation: string | null; definitionEn: string | null; exampleEn: string | null }[]
    category: { name: string } | null
  }
}

const STAT_CONFIG: { key: string; Icon: LucideIcon; color: string }[] = [
  { key: 'streak',   Icon: Flame,    color: '#f59e0b' },
  { key: 'xp',       Icon: Zap,      color: '#2D9B6F' },
  { key: 'total',    Icon: BookOpen, color: '#38bdf8' },
  { key: 'mastered', Icon: Trophy,   color: '#10b981' },
]

function buildHeatmapCells(history: Record<string, { reviewed: number }>, weeks = 12) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const start = new Date(today)
  start.setDate(today.getDate() - weeks * 7)
  const dow = start.getDay()
  const toMonday = dow === 0 ? 1 : 1 - dow
  start.setDate(start.getDate() + toMonday)

  const todayStr = today.toISOString().slice(0, 10)
  const cells = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    cells.push({
      date: dateStr,
      count: history[dateStr]?.reviewed ?? 0,
      isToday: dateStr === todayStr,
      isFuture: d > today,
    })
  }
  return cells
}

function heatColor(count: number, isFuture: boolean) {
  if (isFuture) return 'rgba(28,42,36,0.04)'
  if (count === 0) return 'rgba(28,42,36,0.06)'
  if (count <= 2) return 'rgba(45,155,111,0.3)'
  if (count <= 5) return 'rgba(45,155,111,0.55)'
  if (count <= 9) return 'rgba(45,155,111,0.8)'
  return '#2D9B6F'
}

function WeakWordsReview({ words, onClose }: { words: WeakWord[]; onClose: () => void }) {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [score, setScore] = useState({ know: 0, dontKnow: 0 })
  const [done, setDone] = useState(false)

  const current = words[index]
  const translation = current?.word.translations[0]

  const advance = (knew: boolean) => {
    if (current) {
      myWordsApi.review(current.id, knew ? 'right' : 'left').catch(() => {})
    }
    setScore(s => knew ? { ...s, know: s.know + 1 } : { ...s, dontKnow: s.dontKnow + 1 })
    if (index + 1 >= words.length) setDone(true)
    else { setIndex(i => i + 1); setFlipped(false) }
  }

  if (done) {
    const total = score.know + score.dontKnow
    const pct = total > 0 ? Math.round((score.know / total) * 100) : 0
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-7 px-6 text-center" style={{ background: 'var(--ws-bg)', zIndex: 50 }}>
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 220 }}
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{ background: 'rgba(45,155,111,0.12)', border: '1px solid rgba(45,155,111,0.28)' }}
        >
          <PartyPopper size={36} strokeWidth={1.8} style={{ color: 'var(--ws-primary-light)' }} />
        </motion.div>
        <div>
          <p className="text-3xl font-black ws-gradient-text">{pct}%</p>
          <p className="text-sm mt-1.5" style={{ color: 'var(--ws-muted)' }}>{t('progress.weakReviewDone')}</p>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-center rounded-card px-6 py-4 gap-1.5" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
            <span className="text-2xl font-black" style={{ color: 'var(--ws-success)' }}>{score.know}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--ws-faint)' }}>{t('progress.knew')}</span>
          </div>
          <div className="flex flex-col items-center rounded-card px-6 py-4 gap-1.5" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <span className="text-2xl font-black" style={{ color: 'var(--ws-danger)' }}>{score.dontKnow}</span>
            <span className="text-xs font-medium" style={{ color: 'var(--ws-faint)' }}>{t('progress.didntKnow')}</span>
          </div>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={onClose}
          className="px-8 py-3.5 rounded-btn font-bold text-sm text-white flex items-center gap-2 ws-gradient-bg ws-glow-primary">
          <ArrowLeft size={16} strokeWidth={2.4} /> {t('progress.backToProgress')}
        </motion.button>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col pt-4 pb-8 px-5" style={{ background: 'var(--ws-bg)', zIndex: 50 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <motion.button whileTap={{ scale: 0.95 }} onClick={onClose}
          className="font-semibold text-sm flex items-center gap-1.5" style={{ color: 'var(--ws-primary-light)' }}>
          <ArrowLeft size={16} strokeWidth={2.2} /> {t('progress.exit')}
        </motion.button>
        <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--ws-faint)' }}>{index + 1} / {words.length}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-6 shrink-0" style={{ background: 'rgba(28,42,36,0.06)' }}>
        <motion.div className="h-full rounded-full ws-gradient-bg"
          animate={{ width: `${(index / words.length) * 100}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 28 }} />
      </div>

      {/* Flip card */}
      <div className="flex-1 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${index}-${flipped}`}
            initial={{ opacity: 0, rotateY: flipped ? -90 : 90, scale: 0.96 }}
            animate={{ opacity: 1, rotateY: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={() => !flipped && setFlipped(true)}
            className="rounded-card p-7 flex flex-col gap-3 cursor-pointer select-none min-h-56 ws-card"
            style={{ borderColor: flipped ? 'rgba(16,185,129,0.25)' : 'var(--ws-border)' }}
          >
            {!flipped ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                <span className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--ws-danger)' }}>
                  <Target size={13} strokeWidth={2.4} /> {t('progress.weakWords')}
                </span>
                <h2 className="font-black" style={{ color: 'var(--ws-text)', fontSize: 'clamp(2rem, 7vw, 3.5rem)' }}>{current.word.word}</h2>
                {current.word.pronunciation && <p className="font-mono text-sm" style={{ color: 'var(--ws-faint)' }}>{current.word.pronunciation}</p>}
                {current.word.partOfSpeech && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ color: 'var(--ws-primary-light)', background: 'rgba(45,155,111,0.12)' }}>
                    {current.word.partOfSpeech}
                  </span>
                )}
                <p className="text-xs mt-1" style={{ color: 'var(--ws-faint)' }}>{t('progress.tapToFlip')}</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-3">
                <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--ws-faint)' }}>{t('progress.translation')}</p>
                <h3 className="font-black text-3xl" style={{ color: 'var(--ws-success)' }}>{translation?.translation ?? '—'}</h3>
                {translation?.definitionEn && (
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--ws-muted)' }}>{translation.definitionEn}</p>
                )}
                {translation?.exampleEn && (
                  <p className="text-xs italic" style={{ color: 'var(--ws-faint)' }}>"{translation.exampleEn}"</p>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Action buttons - only when flipped */}
      <div className="h-16 shrink-0 flex items-end">
        <AnimatePresence>
          {flipped && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-3 w-full">
              <motion.button whileTap={{ scale: 0.94 }} onClick={() => advance(false)}
                className="flex-1 py-4 rounded-btn font-bold text-sm flex items-center justify-center gap-2"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)', color: 'var(--ws-danger)' }}>
                <X size={17} strokeWidth={2.6} /> {t('progress.didntKnow')}
              </motion.button>
              <motion.button whileTap={{ scale: 0.94 }} onClick={() => advance(true)}
                className="flex-1 py-4 rounded-btn font-bold text-sm flex items-center justify-center gap-2"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)', color: 'var(--ws-success)' }}>
                <Check size={17} strokeWidth={2.6} /> {t('progress.knew')}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function ProgressPage({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation()
  const [data, setData] = useState<ProgressData | null>(null)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [history, setHistory] = useState<Record<string, { learned: number; reviewed: number }>>({})
  const [heatmapData, setHeatmapData] = useState<Record<string, { reviewed: number }>>({})
  const [weakWords, setWeakWords] = useState<WeakWord[]>([])
  const [showReview, setShowReview] = useState(false)
  // null until the server responds; until then we fall back to local predicates.
  const [unlockedCodes, setUnlockedCodes] = useState<Set<string> | null>(null)

  useEffect(() => { progressApi.getOverall().then(setData).catch(console.error) }, [])
  // Server-side achievements: syncs unlocks, awards XP, returns persisted state.
  useEffect(() => {
    progressApi.getAchievements()
      .then((r) => setUnlockedCodes(new Set(r.list.filter((a) => a.unlocked).map((a) => a.code))))
      .catch(console.error)
  }, [])
  useEffect(() => { progressApi.getHistory(period).then(setHistory).catch(console.error) }, [period])
  useEffect(() => { progressApi.getHistory('3months').then(setHeatmapData).catch(console.error) }, [])
  useEffect(() => { progressApi.getWeakWords().then(setWeakWords).catch(console.error) }, [])

  const statValues = data ? [data.streak, data.xp, data.totalWordsEncountered, data.mastered] : [0, 0, 0, 0]
  const maxVal = Math.max(...Object.values(history).map((h) => h.reviewed), 1)

  const statusBars = data ? [
    { label: t('progress.mastered'), val: data.mastered, color: '#10b981' },
    { label: t('progress.learned'),  val: data.learned,  color: '#2D9B6F' },
    { label: t('progress.learning'), val: data.learning, color: '#f59e0b' },
  ] : []

  return (
    <div className="relative h-full overflow-y-auto no-scrollbar pb-24 pt-4" style={{ background: 'var(--ws-bg)' }}>
      {/* Weak words review overlay */}
      {showReview && (
        <WeakWordsReview
          words={weakWords}
          onClose={() => {
            setShowReview(false)
            progressApi.getWeakWords().then(setWeakWords).catch(console.error)
            progressApi.getOverall().then(setData).catch(console.error)
          }}
        />
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-5 mb-6 flex items-center gap-3">
        {onBack && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} aria-label={t('decks.back')}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--ws-card)', border: '1px solid var(--ws-border)' }}>
            <ArrowLeft size={18} strokeWidth={2.2} style={{ color: 'var(--ws-text)' }} />
          </motion.button>
        )}
        <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--ws-text)' }}>{t('progress.title')}</h1>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 px-5 mb-4">
        {STAT_CONFIG.map((cfg, i) => (
          <motion.div
            key={cfg.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="ws-card p-4 flex flex-col gap-3 relative overflow-hidden"
          >
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: `${cfg.color}1f`, border: `1px solid ${cfg.color}3a` }}
            >
              <cfg.Icon size={20} strokeWidth={2.2} style={{ color: cfg.color }} />
            </div>
            {/* Streak-freeze indicator: how many missed days are still protected */}
            {cfg.key === 'streak' && data?.streakFreezes ? (
              <div
                className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: 'rgba(56,189,248,0.14)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.3)' }}
                title={t('progress.streakFreezeHint')}
              >
                ❄️ {data.streakFreezes}
              </div>
            ) : null}
            <div>
              <span className="text-3xl font-black tabular-nums" style={{ color: 'var(--ws-text)' }}>
                {statValues[i].toLocaleString()}
              </span>
              <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--ws-muted)' }}>{t(`progress.${cfg.key}`)}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Word status breakdown */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mx-5 ws-card p-5 mb-4"
        >
          <h3 className="font-bold mb-4 text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--ws-faint)' }}>
            <Activity size={14} strokeWidth={2.4} style={{ color: 'var(--ws-muted)' }} /> {t('progress.wordStatus')}
          </h3>
          {statusBars.map((item, idx) => (
            <div key={item.label} className="flex items-center gap-3 mb-3 last:mb-0">
              <span className="text-xs w-20 shrink-0" style={{ color: 'var(--ws-muted)' }}>{item.label}</span>
              <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ background: 'rgba(28,42,36,0.06)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: item.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${data.totalWordsEncountered ? (item.val / data.totalWordsEncountered) * 100 : 0}%` }}
                  transition={{ duration: 0.9, delay: 0.4 + idx * 0.1 }}
                />
              </div>
              <span className="font-black text-sm w-8 text-right tabular-nums" style={{ color: item.color }}>{item.val}</span>
            </div>
          ))}
        </motion.div>
      )}

      {/* Weak words card */}
      {weakWords.length > 0 && !showReview && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="mx-5 rounded-card p-5 mb-4"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)' }}>
                <Target size={20} strokeWidth={2.2} style={{ color: 'var(--ws-danger)' }} />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm" style={{ color: 'var(--ws-text)' }}>{t('progress.weakWords')}</h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ws-muted)' }}>{t('progress.weakWordsCount', { count: weakWords.length })}</p>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setShowReview(true)}
              className="shrink-0 px-4 py-2 rounded-btn font-bold text-sm"
              style={{ background: 'rgba(239,68,68,0.16)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--ws-danger)' }}
            >
              {t('progress.startReview')}
            </motion.button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {weakWords.slice(0, 4).map(w => (
              <span key={w.id} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--ws-danger)' }}>
                {w.word.word}
              </span>
            ))}
            {weakWords.length > 4 && (
              <span className="text-xs px-2.5 py-1 rounded-lg" style={{ color: 'var(--ws-faint)' }}>+{weakWords.length - 4}</span>
            )}
          </div>
        </motion.div>
      )}

      {/* Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mx-5 ws-card p-5 mb-4"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--ws-faint)' }}>
            <Activity size={14} strokeWidth={2.4} style={{ color: 'var(--ws-muted)' }} /> {t('progress.activity')}
          </h3>
          <span className="text-xs font-bold" style={{ color: 'var(--ws-primary-light)' }}>
            {t('progress.daysCount', { count: Object.values(heatmapData).filter(d => d.reviewed > 0).length })}
          </span>
        </div>

        <div className="flex gap-1 items-start">
          {/* Day labels column */}
          <div className="flex flex-col gap-0.5 mr-1 shrink-0">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-3 w-5 flex items-center">
                {(i === 0 || i === 2 || i === 4) && (
                  <span className="text-[9px] leading-none" style={{ color: 'var(--ws-faint)' }}>{t(`progress.dow.${i}`)}</span>
                )}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gridTemplateRows: 'repeat(7, 12px)',
              gridAutoFlow: 'column',
              gap: '3px',
              flex: 1,
            }}
          >
            {buildHeatmapCells(heatmapData).map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.count}`}
                style={{
                  background: heatColor(cell.count, cell.isFuture),
                  borderRadius: '2px',
                  outline: cell.isToday ? '1.5px solid rgba(45,155,111,0.8)' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-3 justify-end">
          <span className="text-[9px]" style={{ color: 'var(--ws-faint)' }}>{t('progress.less')}</span>
          {[0, 1, 2, 3, 4].map(level => (
            <div key={level} style={{
              width: '10px', height: '10px', borderRadius: '2px',
              background: heatColor(level === 0 ? 0 : level === 1 ? 1 : level === 2 ? 4 : level === 3 ? 7 : 12, false),
            }} />
          ))}
          <span className="text-[9px]" style={{ color: 'var(--ws-faint)' }}>{t('progress.more')}</span>
        </div>
      </motion.div>

      {/* History chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mx-5 ws-card p-5 mb-4"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--ws-faint)' }}>
            <Activity size={14} strokeWidth={2.4} style={{ color: 'var(--ws-muted)' }} /> {t('progress.history')}
          </h3>
          <div className="flex gap-1 rounded-btn p-1" style={{ background: 'rgba(28,42,36,0.06)' }}>
            {(['week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="text-xs font-bold px-3 py-1 rounded-lg"
                style={period === p
                  ? { background: 'var(--ws-primary)', color: '#fff' }
                  : { color: 'var(--ws-faint)' }
                }
              >
                {t(`progress.${p}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-end gap-1.5 h-24">
          {Object.entries(history).slice(-14).map(([date, val], i) => {
            const h = Math.max(4, (val.reviewed / maxVal) * 80)
            return (
              <motion.div
                key={date}
                className="flex-1 rounded-t-sm ws-gradient-bg"
                style={{ height: h }}
                initial={{ scaleY: 0, originY: 1 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.4, delay: i * 0.03 }}
              />
            )
          })}
        </div>
      </motion.div>

      {/* Achievements */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="mx-5 ws-card p-5 mb-2"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-xs uppercase tracking-widest flex items-center gap-2" style={{ color: 'var(--ws-faint)' }}>
              <Award size={14} strokeWidth={2.4} style={{ color: 'var(--ws-muted)' }} /> {t('progress.achievements')}
            </h3>
            <span className="text-xs font-bold" style={{ color: 'var(--ws-warning)' }}>
              {ACHIEVEMENTS.filter(a => (unlockedCodes ? unlockedCodes.has(a.id) : a.unlocked(data))).length}/{ACHIEVEMENTS.length}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {ACHIEVEMENTS.map((achievement, i) => {
              const isUnlocked = unlockedCodes ? unlockedCodes.has(achievement.id) : achievement.unlocked(data)
              return (
                <motion.div
                  key={achievement.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.55 + i * 0.04, type: 'spring', stiffness: 300 }}
                  className="flex flex-col items-center gap-1.5"
                  title={`${achievement.title}: ${achievement.desc}`}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center relative"
                    style={isUnlocked
                      ? { background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.35)' }
                      : { background: 'rgba(28,42,36,0.04)', border: '1px solid var(--ws-border)', opacity: 0.45 }
                    }
                  >
                    <achievement.Icon size={22} strokeWidth={2} style={{ color: isUnlocked ? 'var(--ws-warning)' : 'var(--ws-faint)' }} />
                    {isUnlocked && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.6 + i * 0.04 }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--ws-warning)' }}
                      >
                        <Check size={9} strokeWidth={3.5} style={{ color: '#000' }} />
                      </motion.div>
                    )}
                  </div>
                  <p className="text-[9px] font-bold text-center leading-tight"
                    style={{ color: isUnlocked ? 'var(--ws-muted)' : 'var(--ws-faint)' }}>
                    {achievement.title}
                  </p>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
