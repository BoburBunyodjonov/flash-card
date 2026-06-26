import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Trophy, Crown, Medal, Shield, Globe, Users, Flame,
  TrendingUp, TrendingDown, UserPlus, UserCheck, User, ArrowLeft, type LucideIcon,
} from 'lucide-react'
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

const TIER_CONFIG: { key: string; Icon: LucideIcon; color: string }[] = [
  { key: 'bronze',   Icon: Medal,  color: '#cd7f32' },
  { key: 'silver',   Icon: Medal,  color: '#c0c0c0' },
  { key: 'gold',     Icon: Trophy, color: '#fbbf24' },
  { key: 'sapphire', Icon: Shield, color: '#38bdf8' },
  { key: 'diamond',  Icon: Crown,  color: '#a78bfa' },
]

function daysLeft(weekEnd: string): number {
  return Math.max(0, Math.ceil((new Date(weekEnd).getTime() - Date.now()) / 86400_000))
}

function rankColor(rank: number): string {
  if (rank === 1) return '#fbbf24'
  if (rank === 2) return '#c0c0c0'
  if (rank === 3) return '#cd7f32'
  return 'var(--ws-faint)'
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    return (
      <span className="w-7 flex items-center justify-center">
        {rank === 1
          ? <Crown size={20} strokeWidth={2.2} style={{ color: rankColor(rank) }} />
          : <Medal size={19} strokeWidth={2.2} style={{ color: rankColor(rank) }} />}
      </span>
    )
  }
  return <span className="text-base font-black w-7 text-center tabular-nums" style={{ color: 'var(--ws-faint)' }}>{rank}</span>
}

function LeagueView() {
  const { t } = useTranslation()
  const [league, setLeague] = useState<LeagueData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    leagueApi.me().then(setLeague).catch(console.error).finally(() => setIsLoading(false))
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center pt-12">
        <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid transparent', borderTopColor: 'var(--ws-primary)', borderRightColor: 'var(--ws-primary)' }} />
      </div>
    )
  }
  if (!league) return <p className="text-sm text-center pt-12" style={{ color: 'var(--ws-muted)' }}>{t('league.loadError')}</p>

  const tier = TIER_CONFIG[league.tier] ?? TIER_CONFIG[0]
  const demoteFrom = league.members.length - league.demoteCount

  return (
    <div className="flex flex-col gap-3">
      {/* Tier header */}
      <div
        className="rounded-card px-5 py-4 flex items-center gap-4"
        style={{ background: `${tier.color}14`, border: `1px solid ${tier.color}35` }}
      >
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${tier.color}1f`, border: `1px solid ${tier.color}45` }}>
          <tier.Icon size={26} strokeWidth={2} style={{ color: tier.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-lg" style={{ color: tier.color }}>{t(`league.tier.${tier.key}`)}</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ws-muted)' }}>
            {t('league.promoteInfo', { count: league.promoteCount })} · {t('league.daysLeft', { count: daysLeft(league.weekEnd) })}
          </p>
        </div>
        <div className="flex gap-1.5">
          {TIER_CONFIG.map((tc, i) => (
            <tc.Icon key={tc.key} size={15} strokeWidth={2.2} style={{ color: tc.color, opacity: i === league.tier ? 1 : 0.25 }} />
          ))}
        </div>
      </div>

      {/* Standings */}
      {league.members.map((m, i) => (
        <div key={m.userId}>
          {i === league.promoteCount && league.members.length > league.promoteCount && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px" style={{ background: 'rgba(16,185,129,0.3)' }} />
              <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--ws-success)' }}>
                <TrendingUp size={12} strokeWidth={2.6} /> {t('league.promoteLine')}
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(16,185,129,0.3)' }} />
            </div>
          )}
          {i === demoteFrom && league.members.length > league.demoteCount && demoteFrom > league.promoteCount && (
            <div className="flex items-center gap-2 py-1">
              <div className="flex-1 h-px" style={{ background: 'rgba(239,68,68,0.3)' }} />
              <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1" style={{ color: 'var(--ws-danger)' }}>
                <TrendingDown size={12} strokeWidth={2.6} /> {t('league.demoteLine')}
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(239,68,68,0.3)' }} />
            </div>
          )}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-center gap-3 rounded-card px-4 py-3"
            style={m.isMe
              ? { background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.3)' }
              : { background: 'var(--ws-card)', border: '1px solid var(--ws-border)' }
            }
          >
            <RankBadge rank={m.rank} />
            <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0"
              style={{ background: 'var(--ws-surface)' }}>
              {m.avatarUrl
                ? <img src={m.avatarUrl} className="w-full h-full object-cover" />
                : <User size={18} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate" style={{ color: 'var(--ws-text)' }}>{m.firstName} {m.lastName ?? ''}</p>
              <p className="text-xs flex items-center gap-1" style={{ color: 'var(--ws-muted)' }}>
                <Flame size={12} strokeWidth={2.2} style={{ color: 'var(--ws-warning)' }} /> {m.streak}
              </p>
            </div>
            <div className="text-right">
              <p className="font-black tabular-nums" style={{ color: 'var(--ws-primary-light)' }}>{m.weeklyXp.toLocaleString()}</p>
              <p className="text-[10px]" style={{ color: 'var(--ws-faint)' }}>{t('league.xpWeek')}</p>
            </div>
          </motion.div>
        </div>
      ))}
    </div>
  )
}

const TABS: { key: 'league' | 'global' | 'friends'; Icon: LucideIcon }[] = [
  { key: 'league', Icon: Shield },
  { key: 'global', Icon: Globe },
  { key: 'friends', Icon: Users },
]

export function LeaderboardPage({ onBack }: { onBack?: () => void }) {
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
    <div className="h-full flex flex-col pt-4 pb-20" style={{ background: 'var(--ws-bg)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-5 mb-4">
        {onBack && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} aria-label={t('decks.back')}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--ws-card)', border: '1px solid var(--ws-border)' }}>
            <ArrowLeft size={18} strokeWidth={2.2} style={{ color: 'var(--ws-text)' }} />
          </motion.button>
        )}
        <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--ws-text)' }}>
          {t('nav.leaderboard')}
        </h1>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 px-5 mb-4">
        {TABS.map(({ key, Icon }) => {
          const isActive = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 py-2.5 rounded-btn text-sm font-bold flex items-center justify-center gap-1.5"
              style={isActive
                ? { background: 'var(--ws-gradient)', color: '#fff', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }
                : { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)', color: 'var(--ws-muted)' }
              }
            >
              <Icon size={16} strokeWidth={2.2} />
              {t(`leaderboard.${key}`)}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5">
        {tab === 'league' ? (
          <LeagueView />
        ) : isLoading ? (
          <div className="flex justify-center pt-12">
            <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid transparent', borderTopColor: 'var(--ws-primary)', borderRightColor: 'var(--ws-primary)' }} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {list.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-3 rounded-card px-4 py-3"
                style={u.id === user?.id
                  ? { background: 'rgba(99,102,241,0.16)', border: '1px solid rgba(99,102,241,0.3)' }
                  : { background: 'var(--ws-card)', border: '1px solid var(--ws-border)' }
                }
              >
                <RankBadge rank={i + 1} />
                <div className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                  style={{ background: 'var(--ws-surface)' }}>
                  {u.avatarUrl
                    ? <img src={u.avatarUrl} className="w-full h-full object-cover" />
                    : <User size={18} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate" style={{ color: 'var(--ws-text)' }}>{u.firstName} {u.lastName ?? ''}</p>
                  <p className="text-xs flex items-center gap-1" style={{ color: 'var(--ws-muted)' }}>
                    <Flame size={12} strokeWidth={2.2} style={{ color: 'var(--ws-warning)' }} /> {u.streak}
                  </p>
                </div>
                {tab === 'global' && u.id !== user?.id && (
                  <button
                    onClick={() => toggleFollow(u)}
                    aria-label={u.isFollowing ? t('leaderboard.following') : t('leaderboard.follow')}
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                    style={u.isFollowing
                      ? { background: 'rgba(16,185,129,0.14)', border: '1px solid rgba(16,185,129,0.35)', color: 'var(--ws-success)' }
                      : { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--ws-primary-light)' }
                    }
                  >
                    {u.isFollowing ? <UserCheck size={17} strokeWidth={2.2} /> : <UserPlus size={17} strokeWidth={2.2} />}
                  </button>
                )}
                <div className="text-right">
                  <p className="font-black tabular-nums" style={{ color: 'var(--ws-primary-light)' }}>{u.xp.toLocaleString()}</p>
                  <p className="text-[10px]" style={{ color: 'var(--ws-faint)' }}>{t('leaderboard.xp')}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
