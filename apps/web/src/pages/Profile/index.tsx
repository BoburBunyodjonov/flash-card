import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  TrendingUp, Trophy, Settings as SettingsIcon,
  ChevronRight, Flame, Zap, Crown, User, NotebookPen, GraduationCap, type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'
import { api } from '../../api/client'

interface Props {
  onProgress: () => void
  onLeaderboard: () => void
  onMyWords: () => void
  onSettings: () => void
  onTeacher: () => void
}

interface Entry {
  key: string
  Icon: LucideIcon
  tint: string
  onPress: () => void
}

export function ProfilePage({ onProgress, onLeaderboard, onMyWords, onSettings, onTeacher }: Props) {
  const { t } = useTranslation()
  const { user, setUser } = useAuthStore()

  useEffect(() => {
    if (!user || user.isTeacher) return
    api.get('/api/teacher/status').then((r) => {
      if (r.data.data?.is_teacher) setUser({ ...user, isTeacher: true })
    }).catch(() => {})
  }, [user, setUser])

  const entries: Entry[] = [
    { key: 'progress',    Icon: TrendingUp,   tint: '#6366F1', onPress: onProgress },
    { key: 'leaderboard', Icon: Trophy,       tint: '#F59E0B', onPress: onLeaderboard },
    { key: 'myWords',     Icon: NotebookPen,  tint: '#10B981', onPress: onMyWords },
    ...(user?.isTeacher
      ? [{ key: 'teacher', Icon: GraduationCap, tint: '#EC4899', onPress: onTeacher }]
      : []),
    { key: 'settings',    Icon: SettingsIcon, tint: '#8B5CF6', onPress: onSettings },
  ]

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-24" style={{ background: 'var(--ws-bg)' }}>
      {/* Header */}
      <div className="px-5 pt-6 pb-2">
        <h1 className="text-3xl font-black" style={{ color: 'var(--ws-text)' }}>{t('profile.title')}</h1>
      </div>

      {/* User card */}
      <div className="px-5 pt-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="ws-card p-5 flex items-center gap-4"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: 'var(--ws-gradient)' }}
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <User size={30} strokeWidth={2} color="#fff" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="font-black text-lg truncate" style={{ color: 'var(--ws-text)' }}>
                {user?.firstName} {user?.lastName ?? ''}
              </p>
              {user?.isPremium && (
                <Crown size={16} strokeWidth={2.4} style={{ color: '#fbbf24' }} />
              )}
            </div>
            {user?.cefrLevel && (
              <span
                className="inline-block mt-1 text-[11px] font-black px-2 py-0.5 rounded-md"
                style={{ color: 'var(--ws-primary-light)', background: 'rgba(99,102,241,0.15)' }}
              >
                {user.cefrLevel}
              </span>
            )}
          </div>
        </motion.div>
      </div>

      {/* Stats */}
      <div className="px-5 pt-3 grid grid-cols-2 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.04 }}
          className="ws-card p-4 flex items-center gap-3"
        >
          <Zap size={22} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
          <div>
            <p className="font-black text-xl tabular-nums" style={{ color: 'var(--ws-text)' }}>
              {(user?.xp ?? 0).toLocaleString()}
            </p>
            <p className="text-xs" style={{ color: 'var(--ws-muted)' }}>XP</p>
          </div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="ws-card p-4 flex items-center gap-3"
        >
          <Flame size={22} strokeWidth={2.2} style={{ color: '#f59e0b' }} />
          <div>
            <p className="font-black text-xl tabular-nums" style={{ color: 'var(--ws-text)' }}>
              {user?.streak ?? 0}
            </p>
            <p className="text-xs" style={{ color: 'var(--ws-muted)' }}>{t('feed.streak')}</p>
          </div>
        </motion.div>
      </div>

      {/* Entries */}
      <div className="px-5 pt-3 flex flex-col gap-2.5">
        {entries.map(({ key, Icon, tint, onPress }, i) => (
          <motion.button
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 + i * 0.04 }}
            whileTap={{ scale: 0.98 }}
            onClick={onPress}
            className="ws-card p-4 flex items-center gap-3.5"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${tint}1f`, border: `1px solid ${tint}40` }}
            >
              <Icon size={21} strokeWidth={2} style={{ color: tint }} />
            </div>
            <span className="flex-1 text-left font-bold" style={{ color: 'var(--ws-text)' }}>
              {t(`profile.${key}`)}
            </span>
            <ChevronRight size={20} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />
          </motion.button>
        ))}
      </div>
    </div>
  )
}
