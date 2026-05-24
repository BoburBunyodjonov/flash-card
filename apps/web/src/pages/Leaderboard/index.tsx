import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { useAuthStore } from '../../store/auth.store'

interface LeaderboardUser {
  id: string
  firstName: string
  lastName?: string
  username?: string
  avatarUrl?: string
  xp: number
  streak: number
}

export function LeaderboardPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'global' | 'friends'>('global')
  const [list, setList] = useState<LeaderboardUser[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    api.get(`/api/leaderboard/${tab}`)
      .then((r) => setList(r.data.data))
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [tab])

  return (
    <div className="h-full flex flex-col bg-bg pt-4 pb-20">
      <h1 className="text-2xl font-black text-white px-5 mb-4">{t('nav.leaderboard')}</h1>

      {/* Tabs */}
      <div className="flex gap-2 px-5 mb-4">
        {(['global', 'friends'] as const).map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-colors ${tab === t2 ? 'bg-primary text-white' : 'bg-surface text-muted'}`}
          >
            {t2 === 'global' ? '🌍 Global' : '👥 Friends'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5">
        {isLoading ? (
          <div className="flex justify-center pt-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`flex items-center gap-4 rounded-2xl px-4 py-3 ${u.id === user?.id ? 'bg-primary/20 border border-primary/30' : 'bg-card'}`}
              >
                <span className={`text-lg font-black w-7 text-center ${i === 0 ? 'text-warning' : i === 1 ? 'text-white/60' : i === 2 ? 'text-amber-600' : 'text-muted'}`}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </span>
                <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-xl overflow-hidden shrink-0">
                  {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full object-cover" /> : '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{u.firstName} {u.lastName ?? ''}</p>
                  <p className="text-muted text-xs">🔥 {u.streak} streak</p>
                </div>
                <div className="text-right">
                  <p className="text-primary font-black">{u.xp.toLocaleString()}</p>
                  <p className="text-muted text-xs">XP</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
