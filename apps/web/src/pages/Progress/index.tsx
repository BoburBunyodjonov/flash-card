import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { progressApi } from '../../api/progress.api'

interface ProgressData {
  streak: number
  xp: number
  totalWordsEncountered: number
  learned: number
  learning: number
  mastered: number
  savedWords?: number
}

interface Achievement {
  id: string
  icon: string
  title: string
  desc: string
  unlocked: (p: ProgressData & { savedWords?: number }) => boolean
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_word',  icon: '🌱', title: 'Birinchi qadam',     desc: 'Birinchi so\'z o\'rgandim',         unlocked: p => p.totalWordsEncountered >= 1 },
  { id: 'streak_3',    icon: '🔥', title: '3 kunlik olov',       desc: '3 kun ketma-ket o\'rgandim',         unlocked: p => p.streak >= 3 },
  { id: 'streak_7',    icon: '⚡', title: 'Haftalik qahramonlik', desc: '7 kun streak',                      unlocked: p => p.streak >= 7 },
  { id: 'streak_30',   icon: '💎', title: 'Oylik ustoz',          desc: '30 kun streak',                     unlocked: p => p.streak >= 30 },
  { id: 'words_10',    icon: '📚', title: '10 so\'z',             desc: '10 ta so\'z o\'rgandim',             unlocked: p => (p.learned + p.mastered) >= 10 },
  { id: 'words_50',    icon: '🎓', title: '50 so\'z',             desc: '50 ta so\'z o\'rgandim',             unlocked: p => (p.learned + p.mastered) >= 50 },
  { id: 'words_100',   icon: '🏆', title: '100 so\'z',            desc: '100 ta so\'z o\'rgandim',            unlocked: p => (p.learned + p.mastered) >= 100 },
  { id: 'xp_100',      icon: '⭐', title: '100 XP',               desc: '100 XP to\'pladim',                  unlocked: p => p.xp >= 100 },
  { id: 'xp_1000',     icon: '🌟', title: '1000 XP',              desc: '1000 XP to\'pladim',                 unlocked: p => p.xp >= 1000 },
  { id: 'master_10',   icon: '🎯', title: 'Master',               desc: '10 ta so\'z mustahkamlandi',         unlocked: p => p.mastered >= 10 },
  { id: 'saved_5',     icon: '🔖', title: 'Kolleksioner',          desc: '5 ta so\'z saqlandi',                unlocked: p => (p as any).savedWords >= 5 },
  { id: 'b1_reached',  icon: '🏅', title: 'B1 daraja',            desc: '50 ta B1 darajali so\'z o\'rgandim', unlocked: p => (p.learned + p.mastered) >= 50 },
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

const STAT_CONFIG = [
  { key: 'streak',   icon: '🔥', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  glow: 'rgba(251,191,36,0.2)' },
  { key: 'xp',       icon: '⚡', color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  glow: 'rgba(99,102,241,0.2)' },
  { key: 'total',    icon: '📚', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  glow: 'rgba(56,189,248,0.2)' },
  { key: 'mastered', icon: '🏆', color: '#34d399', bg: 'rgba(52,211,153,0.12)', glow: 'rgba(52,211,153,0.2)' },
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
  if (isFuture) return 'rgba(255,255,255,0.03)'
  if (count === 0) return 'rgba(255,255,255,0.07)'
  if (count <= 2) return 'rgba(99,102,241,0.3)'
  if (count <= 5) return 'rgba(99,102,241,0.55)'
  if (count <= 9) return 'rgba(99,102,241,0.8)'
  return '#6366f1'
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
    setScore(s => knew ? { ...s, know: s.know + 1 } : { ...s, dontKnow: s.dontKnow + 1 })
    if (index + 1 >= words.length) setDone(true)
    else { setIndex(i => i + 1); setFlipped(false) }
  }

  if (done) {
    const total = score.know + score.dontKnow
    const pct = total > 0 ? Math.round((score.know / total) * 100) : 0
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6 text-center" style={{ background: '#0a0a14', zIndex: 50 }}>
        <div className="text-7xl">{pct >= 70 ? '🎉' : pct >= 40 ? '💪' : '📚'}</div>
        <div>
          <p className="text-white text-2xl font-black">{pct}% to'g'ri</p>
          <p className="text-white/35 text-sm mt-1">Zaif so'zlar mashqi tugadi</p>
        </div>
        <div className="flex gap-4">
          <div className="flex flex-col items-center rounded-2xl px-5 py-3 gap-1" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)' }}>
            <span className="text-2xl font-black" style={{ color: '#34d399' }}>{score.know}</span>
            <span className="text-xs text-white/35">Bildim</span>
          </div>
          <div className="flex flex-col items-center rounded-2xl px-5 py-3 gap-1" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <span className="text-2xl font-black" style={{ color: '#ef4444' }}>{score.dontKnow}</span>
            <span className="text-xs text-white/35">Bilmadim</span>
          </div>
        </div>
        <motion.button whileTap={{ scale: 0.95 }} onClick={onClose}
          className="px-8 py-3.5 rounded-2xl font-bold text-sm"
          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff' }}>
          ← Progress ga qaytish
        </motion.button>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col pt-4 pb-8 px-5" style={{ background: '#0a0a14', zIndex: 50 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <motion.button whileTap={{ scale: 0.95 }} onClick={onClose} className="text-primary font-semibold text-sm">← Chiqish</motion.button>
        <span className="text-white/35 text-xs font-bold">{index + 1} / {words.length}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full overflow-hidden mb-5 shrink-0" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #ef4444, #f97316)' }}
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
            className="rounded-3xl p-7 flex flex-col gap-3 cursor-pointer select-none min-h-56"
            style={{
              background: flipped
                ? 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(52,211,153,0.04))'
                : 'linear-gradient(135deg, rgba(239,68,68,0.08), rgba(249,115,22,0.04))',
              border: `1px solid ${flipped ? 'rgba(52,211,153,0.2)' : 'rgba(239,68,68,0.2)'}`,
            }}
          >
            {!flipped ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#f87171', opacity: 0.6 }}>Zaif so'z</span>
                <h2 className="font-black text-white" style={{ fontSize: 'clamp(2rem, 7vw, 3.5rem)' }}>{current.word.word}</h2>
                {current.word.pronunciation && <p className="text-white/30 font-mono text-sm">{current.word.pronunciation}</p>}
                {current.word.partOfSpeech && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ color: '#a5b4fc', background: 'rgba(99,102,241,0.12)' }}>
                    {current.word.partOfSpeech}
                  </span>
                )}
                <p className="text-white/20 text-xs mt-1">👆 {t('progress.tapToFlip')}</p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-3">
                <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Tarjima</p>
                <h3 className="font-black text-3xl" style={{ color: '#34d399' }}>{translation?.translation ?? '—'}</h3>
                {translation?.definitionEn && (
                  <p className="text-white/55 text-sm leading-relaxed">{translation.definitionEn}</p>
                )}
                {translation?.exampleEn && (
                  <p className="text-white/30 text-xs italic">"{translation.exampleEn}"</p>
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
                className="flex-1 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}>
                ✗ Bilmadim
              </motion.button>
              <motion.button whileTap={{ scale: 0.94 }} onClick={() => advance(true)}
                className="flex-1 py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399' }}>
                ✓ Bildim!
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export function ProgressPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<ProgressData | null>(null)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [history, setHistory] = useState<Record<string, { learned: number; reviewed: number }>>({})
  const [heatmapData, setHeatmapData] = useState<Record<string, { reviewed: number }>>({})
  const [weakWords, setWeakWords] = useState<WeakWord[]>([])
  const [showReview, setShowReview] = useState(false)

  useEffect(() => { progressApi.getOverall().then(setData).catch(console.error) }, [])
  useEffect(() => { progressApi.getHistory(period).then(setHistory).catch(console.error) }, [period])
  useEffect(() => { progressApi.getHistory('3months').then(setHeatmapData).catch(console.error) }, [])
  useEffect(() => { progressApi.getWeakWords().then(setWeakWords).catch(console.error) }, [])

  const statValues = data ? [data.streak, data.xp, data.totalWordsEncountered, data.mastered] : [0, 0, 0, 0]
  const maxVal = Math.max(...Object.values(history).map((h) => h.reviewed), 1)

  const statusBars = data ? [
    { label: t('progress.mastered'), val: data.mastered, color: '#34d399' },
    { label: t('progress.learned'),  val: data.learned,  color: '#6366f1' },
    { label: t('progress.learning'), val: data.learning,  color: '#fbbf24' },
  ] : []

  return (
    <div className="relative h-full overflow-y-auto no-scrollbar pb-24 pt-4" style={{ background: '#0a0a14' }}>
      {/* Weak words review overlay */}
      {showReview && (
        <WeakWordsReview words={weakWords} onClose={() => setShowReview(false)} />
      )}

      {/* Header */}
      <div className="px-5 mb-6">
        <h1 className="text-2xl font-black gradient-text">{t('progress.title')}</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 px-5 mb-5">
        {STAT_CONFIG.map((cfg, i) => (
          <motion.div
            key={cfg.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }}
            className="rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden"
            style={{ background: cfg.bg, border: `1px solid ${cfg.color}25`, boxShadow: `0 4px 20px ${cfg.glow}` }}
          >
            <div className="absolute top-3 right-3 text-2xl opacity-40">{cfg.icon}</div>
            <span className="text-3xl font-black" style={{ color: cfg.color }}>
              {statValues[i].toLocaleString()}
            </span>
            <span className="text-white/40 text-xs font-semibold">{t(`progress.${cfg.key}`)}</span>
          </motion.div>
        ))}
      </div>

      {/* Word status breakdown */}
      {data && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mx-5 rounded-2xl p-5 mb-5"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <h3 className="text-white font-bold mb-4 text-sm uppercase tracking-wider opacity-60">Word Status</h3>
          {statusBars.map((item, idx) => (
            <div key={item.label} className="flex items-center gap-3 mb-3 last:mb-0">
              <span className="text-white/40 text-xs w-20 shrink-0">{item.label}</span>
              <div className="flex-1 rounded-full h-2 overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: item.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${data.totalWordsEncountered ? (item.val / data.totalWordsEncountered) * 100 : 0}%` }}
                  transition={{ duration: 0.9, delay: 0.4 + idx * 0.1 }}
                />
              </div>
              <span className="font-black text-sm w-8 text-right" style={{ color: item.color }}>{item.val}</span>
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
          className="mx-5 rounded-2xl p-5 mb-5"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)' }}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-white font-bold text-sm">Zaif so'zlar</h3>
              <p className="text-white/35 text-xs mt-0.5">{weakWords.length} ta so'z qayta o'rganishni talab qiladi</p>
            </div>
            <motion.button
              whileTap={{ scale: 0.93 }}
              onClick={() => setShowReview(true)}
              className="px-4 py-2 rounded-xl font-bold text-sm"
              style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
            >
              Boshlash →
            </motion.button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {weakWords.slice(0, 4).map(w => (
              <span key={w.id} className="text-xs px-2.5 py-1 rounded-lg font-medium"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                {w.word.word}
              </span>
            ))}
            {weakWords.length > 4 && (
              <span className="text-xs px-2.5 py-1 rounded-lg text-white/25">+{weakWords.length - 4} ta</span>
            )}
          </div>
        </motion.div>
      )}

      {/* Heatmap */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mx-5 rounded-2xl p-5 mb-5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-sm uppercase tracking-wider opacity-60">Faollik</h3>
          <span className="text-xs font-bold" style={{ color: '#6366f1' }}>
            {Object.values(heatmapData).filter(d => d.reviewed > 0).length} kun
          </span>
        </div>

        <div className="flex gap-1 items-start">
          {/* Day labels column */}
          <div className="flex flex-col gap-0.5 mr-1 shrink-0">
            {['Д', 'С', 'Ч', 'П', 'Ж', 'Ш', 'Я'].map((day, i) => (
              <div key={i} className="h-3 w-4 flex items-center">
                {(i === 0 || i === 2 || i === 4) && (
                  <span className="text-white/20 text-[9px] leading-none">{day}</span>
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
                  outline: cell.isToday ? '1.5px solid rgba(99,102,241,0.8)' : 'none',
                }}
              />
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-3 justify-end">
          <span className="text-white/20 text-[9px]">Kam</span>
          {[0, 1, 2, 3, 4].map(level => (
            <div key={level} style={{
              width: '10px', height: '10px', borderRadius: '2px',
              background: heatColor(level === 0 ? 0 : level === 1 ? 1 : level === 2 ? 4 : level === 3 ? 7 : 12, false),
            }} />
          ))}
          <span className="text-white/20 text-[9px]">Ko'p</span>
        </div>
      </motion.div>

      {/* History chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mx-5 rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-bold text-sm uppercase tracking-wider opacity-60">{t('progress.history')}</h3>
          <div className="flex gap-1 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.06)' }}>
            {(['week', 'month'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className="text-xs font-bold px-3 py-1 rounded-lg transition-all"
                style={period === p
                  ? { background: '#6366f1', color: '#fff' }
                  : { color: 'rgba(255,255,255,0.3)' }
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
                className="flex-1 rounded-t-sm"
                style={{ background: 'linear-gradient(to top, #6366f1, #a78bfa)', height: h }}
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
          className="mx-5 rounded-2xl p-5 mt-5 mb-2"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-bold text-sm uppercase tracking-wider opacity-60">Yutuqlar</h3>
            <span className="text-xs font-bold" style={{ color: '#fbbf24' }}>
              {ACHIEVEMENTS.filter(a => a.unlocked(data)).length}/{ACHIEVEMENTS.length}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {ACHIEVEMENTS.map((achievement, i) => {
              const isUnlocked = achievement.unlocked(data)
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
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl relative"
                    style={isUnlocked
                      ? { background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', filter: 'grayscale(1)', opacity: 0.4 }
                    }
                  >
                    {achievement.icon}
                    {isUnlocked && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.6 + i * 0.04 }}
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
                        style={{ background: '#fbbf24', color: '#000' }}
                      >
                        ✓
                      </motion.div>
                    )}
                  </div>
                  <p className="text-[9px] font-bold text-center leading-tight"
                    style={{ color: isUnlocked ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)' }}>
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
