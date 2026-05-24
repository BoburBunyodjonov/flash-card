import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { progressApi } from '../../api/progress.api'

interface ProgressData {
  streak: number
  xp: number
  totalWordsEncountered: number
  learned: number
  learning: number
  mastered: number
}

const STAT_CONFIG = [
  { key: 'streak',   icon: '🔥', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  glow: 'rgba(251,191,36,0.2)' },
  { key: 'xp',       icon: '⚡', color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  glow: 'rgba(99,102,241,0.2)' },
  { key: 'total',    icon: '📚', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  glow: 'rgba(56,189,248,0.2)' },
  { key: 'mastered', icon: '🏆', color: '#34d399', bg: 'rgba(52,211,153,0.12)', glow: 'rgba(52,211,153,0.2)' },
]

export function ProgressPage() {
  const { t } = useTranslation()
  const [data, setData] = useState<ProgressData | null>(null)
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [history, setHistory] = useState<Record<string, { learned: number; reviewed: number }>>({})

  useEffect(() => { progressApi.getOverall().then(setData).catch(console.error) }, [])
  useEffect(() => { progressApi.getHistory(period).then(setHistory).catch(console.error) }, [period])

  const statValues = data ? [data.streak, data.xp, data.totalWordsEncountered, data.mastered] : [0, 0, 0, 0]
  const maxVal = Math.max(...Object.values(history).map((h) => h.reviewed), 1)

  const statusBars = data ? [
    { label: t('progress.mastered'), val: data.mastered, color: '#34d399' },
    { label: t('progress.learned'),  val: data.learned,  color: '#6366f1' },
    { label: t('progress.learning'), val: data.learning,  color: '#fbbf24' },
  ] : []

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-24 pt-4" style={{ background: '#0a0a14' }}>
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
    </div>
  )
}
