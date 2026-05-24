import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

interface Props {
  active: string
  onChange: (page: string) => void
}

const tabs = [
  { key: 'feed',        icon: '⚡', activeColor: '#6366f1' },
  { key: 'dictionary',  icon: '📖', activeColor: '#38bdf8' },
  { key: 'decks',       icon: '🗂',  activeColor: '#a78bfa' },
  { key: 'progress',    icon: '📊', activeColor: '#34d399' },
  { key: 'leaderboard', icon: '🏆', activeColor: '#fbbf24' },
]

export function BottomNav({ active, onChange }: Props) {
  const { t } = useTranslation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 nav-blur pb-safe"
      style={{ background: 'rgba(10,10,20,0.85)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-stretch">
        {tabs.map((tab) => {
          const isActive = active === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className="flex-1 flex flex-col items-center justify-center py-2.5 gap-1 relative"
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-x-2 top-1 h-0.5 rounded-full"
                  style={{ background: tab.activeColor }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}

              <motion.span
                className="text-xl leading-none"
                animate={{ scale: isActive ? 1.15 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              >
                {tab.icon}
              </motion.span>

              <span
                className="text-[10px] font-bold transition-colors duration-150"
                style={{ color: isActive ? tab.activeColor : 'rgba(255,255,255,0.3)' }}
              >
                {t(`nav.${tab.key}`)}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
