import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { api } from '../../api/client'
import { useAuthStore } from '../../store/auth.store'
import { leagueApi, type LeagueData } from '../../api/league.api'

interface LeaderboardUser {
  id: string
  firstName: string
  lastName?: string
  username?: string
  avatarUrl?: string
  xp: number
  streak: number
  isFollowing?: boolean
}

const TIER_CONFIG = [
  { name: 'Bronze', icon: '🥉', color: '#cd7f32' },
  { name: 'Silver', icon: '🥈', color: '#c0c0c0' },
  { name: 'Gold', icon: '🥇', color: '#fbbf24' },
  { name: 'Sapphire', icon: '💎', color: '#38bdf8' },
  { name: 'Diamond', icon: '👑', color: '#a78bfa' },
]

function daysLeft(weekEnd: string): number {
  return Math.max(0, Math.ceil((new Date(weekEnd).getTime() - Date.now()) / 86400_000))
}

function LeagueView() {
  const [league, setLeague] = useState<LeagueData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    leagueApi.me().then(setLeague).catch(console.error).finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center pt-12">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  if (!league) return <p className="text-muted text-sm text-center pt-12">Liga yuklanmadi</p>

  const tier = TIER_CONFIG[league.tier] ?? TIER_CONFIG[0]
  const demoteFrom = league.members.length - league.demoteCount

  return (
    <div className="flex flex-col gap-3">
      {/* Tier header */}
      <div
        className="rounded-3xl px-5 py-4 flex items-center gap-4"
        style={{ background: `${tier.color}14`, border: `1px solid ${tier.color}35` }}
      >
        <span className="text-4xl">{tier.icon}</span>
        <div className="flex-1">
          <p className="font-black text-lg" style={{ color: tier.color }}>{tier.name} Liga</p>
          <p className="text-white/35 text-xs mt-0.5">
            Top {league.promoteCount} yuqoriga ko'tariladi · {daysLeft(league.weekEnd)} kun qoldi
          </p>
        </div>
        <div className="flex gap-1">
          {TIER_CONFIG.map((tc, i) => (
            <span key={tc.name} className="text-sm" style={{ opacity: i === league.tier ? 1 : 0.22 }}>
              {tc.icon}
            </span>
          ))}
        </div>
      </div>

      {/* Standings */}
      {league.members.map((m, i) => (
        <div key={m.userId}>
          {i === league.promoteCount && league.members.length > league.promoteCount && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px" style={{ background: 'rgba(52,211,153,0.3)' }} />
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#34d399' }}>
                ↑ Ko'tarilish chizig'i
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(52,211,153,0.3)' }} />
            </div>
          )}
          {i === demoteFrom && league.members.length > league.demoteCount && demoteFrom > league.promoteCount && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px" style={{ background: 'rgba(239,68,68,0.3)' }} />
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#f87171' }}>
                ↓ Tushish chizig'i
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(239,68,68,0.3)' }} />
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`flex items-center gap-4 rounded-2xl px-4 py-3 ${m.isMe ? 'bg-primary/20 border border-primary/30' : 'bg-card'}`}
          >
            <span className={`text-lg font-black w-7 text-center ${i === 0 ? 'text-warning' : 'text-muted'}`}>
              {m.rank}
            </span>
            <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center text-xl overflow-hidden shrink-0">
              {m.avatarUrl ? <img src={m.avatarUrl} className="w-full h-full object-cover" /> : '👤'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold truncate">{m.firstName} {m.lastName ?? ''}</p>
              <p className="text-muted text-xs">🔥 {m.streak} streak</p>
            </div>
            <div className="text-right">
              <p className="text-primary font-black">{m.weeklyXp.toLocaleString()}</p>
              <p className="text-muted text-xs">XP / hafta</p>
            </div>
          </motion.div>
        </div>
      ))}
    </div>
  )
}

export function LeaderboardPage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'league' | 'global' | 'friends'>('league')
  const [list, setList] = useState<LeaderboardUser[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (tab === 'league') return
    setIsLoading(true)
    api.get(`/api/leaderboard/${tab}`)
      .then((r) => setList(r.data.data))
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [tab])

  const toggleFollow = async (u: LeaderboardUser) => {
    // Optimistic toggle; revert on failure
    setList((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFollowing: !u.isFollowing } : x)))
    try {
      if (u.isFollowing) await api.delete(`/api/leaderboard/users/${u.id}/follow`)
      else await api.post(`/api/leaderboard/users/${u.id}/follow`)
    } catch {
      setList((prev) => prev.map((x) => (x.id === u.id ? { ...x, isFollowing: u.isFollowing } : x)))
    }
  }

  return (
    <div className="h-full flex flex-col bg-bg pt-4 pb-20">
      <h1 className="text-2xl font-black text-white px-5 mb-4">{t('nav.leaderboard')}</h1>

      {/* Tabs */}
      <div className="flex gap-2 px-5 mb-4">
        {(['league', 'global', 'friends'] as const).map((t2) => (
          <button
            key={t2}
            onClick={() => setTab(t2)}
            className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-colors ${tab === t2 ? 'bg-primary text-white' : 'bg-surface text-muted'}`}
          >
            {t2 === 'league' ? '🛡 Liga' : t2 === 'global' ? '🌍 Global' : '👥 Friends'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5">
        {tab === 'league' ? (
          <LeagueView />
        ) : isLoading ? (
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
                {tab === 'global' && u.id !== user?.id && (
                  <button
                    onClick={() => toggleFollow(u)}
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-black transition-colors"
                    style={u.isFollowing
                      ? { background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)', color: '#34d399' }
                      : { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#a78bfa' }
                    }
                  >
                    {u.isFollowing ? '✓' : '+'}
                  </button>
                )}
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
