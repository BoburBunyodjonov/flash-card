import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Zap, Dumbbell, Mic, Search, User, type LucideIcon } from 'lucide-react'

interface Props {
  active: string
  onChange: (page: string) => void
}

const tabs: { key: string; Icon: LucideIcon }[] = [
  { key: 'feed',       Icon: Zap },
  { key: 'practice',   Icon: Dumbbell },
  { key: 'speaking',   Icon: Mic },
  { key: 'dictionary', Icon: Search },
  { key: 'profile',    Icon: User },
]

export function BottomNav({ active, onChange }: Props) {
  const { t } = useTranslation()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 nav-blur pb-safe"
      style={{ background: 'rgba(8,8,12,0.88)', borderTop: '1px solid var(--ws-border)' }}
    >
      <div className="flex items-stretch px-1.5 pt-1.5">
        {tabs.map(({ key, Icon }) => {
          const isActive = active === key
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className="flex-1 flex flex-col items-center justify-center py-2 gap-1 relative"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute top-0 h-[3px] w-8 rounded-full"
                  style={{ background: 'var(--ws-primary)', boxShadow: '0 0 12px rgba(99,102,241,0.7)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}

              <motion.div
                animate={{ scale: isActive ? 1.08 : 1, y: isActive ? -1 : 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              >
                <Icon
                  size={21}
                  strokeWidth={2}
                  style={{ color: isActive ? 'var(--ws-primary-light)' : 'var(--ws-faint)' }}
                />
              </motion.div>

              <span
                className="text-[9px] font-bold transition-colors duration-150 truncate max-w-full px-0.5"
                style={{ color: isActive ? 'var(--ws-primary-light)' : 'var(--ws-faint)' }}
              >
                {t(`nav.${key}`)}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
