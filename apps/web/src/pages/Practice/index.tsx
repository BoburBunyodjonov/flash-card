import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Brain, Swords, Target, NotebookPen, Users, ChevronRight, type LucideIcon } from 'lucide-react'

interface Props {
  onQuiz?: () => void
  onDuel?: () => void
  onSpeaking?: () => void
  onChallenge?: () => void
  onMyWords?: () => void
  onGroupChallenge?: () => void
}

interface Mode {
  key: string
  Icon: LucideIcon
  tint: string
  onPress?: () => void
}

export function PracticePage({ onQuiz, onDuel, onChallenge, onMyWords, onGroupChallenge }: Props) {
  const { t } = useTranslation()

  // Speaking has its own bottom-nav tab now, so it's not listed here.
  const modes: Mode[] = [
    { key: 'quiz',           Icon: Brain,       tint: '#6366F1', onPress: onQuiz },
    { key: 'duel',           Icon: Swords,      tint: '#EF4444', onPress: onDuel },
    { key: 'groupChallenge', Icon: Users,       tint: '#06B6D4', onPress: onGroupChallenge },
    { key: 'challenge',      Icon: Target,      tint: '#F59E0B', onPress: onChallenge },
    { key: 'myWords',        Icon: NotebookPen, tint: '#8B5CF6', onPress: onMyWords },
  ]

  return (
    <div className="h-full overflow-y-auto no-scrollbar" style={{ background: 'var(--ws-bg)' }}>
      <div className="px-5 pt-8 pb-28 max-w-lg mx-auto">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-7"
        >
          <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--ws-text)' }}>
            {t('practice.title')}
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--ws-muted)' }}>
            {t('practice.subtitle')}
          </p>
        </motion.div>

        {/* Mode cards */}
        <div className="flex flex-col gap-3">
          {modes.map(({ key, Icon, tint, onPress }, index) => (
            <motion.button
              key={key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              whileTap={{ scale: 0.98 }}
              onClick={onPress}
              className="w-full flex items-center gap-4 p-4 ws-card text-left"
            >
              <div
                className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: `${tint}1f`, border: `1px solid ${tint}3a` }}
              >
                <Icon size={22} strokeWidth={2} style={{ color: tint }} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-[15px]" style={{ color: 'var(--ws-text)' }}>
                  {t(`practice.${key}.title`)}
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--ws-muted)' }}>
                  {t(`practice.${key}.desc`)}
                </p>
              </div>

              <ChevronRight size={20} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
