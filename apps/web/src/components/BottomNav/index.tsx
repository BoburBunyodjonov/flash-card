import { motion, useReducedMotion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { Zap, Dumbbell, Mic, Search, User, type LucideIcon } from 'lucide-react'
import { useTelegram } from '../../hooks/useTelegram'

interface Props {
  active: string
  onChange: (page: string) => void
}

const tabs: { key: string; Icon: LucideIcon }[] = [
  { key: 'feed', Icon: Zap },
  { key: 'practice', Icon: Dumbbell },
  { key: 'speaking', Icon: Mic },
  { key: 'dictionary', Icon: Search },
  { key: 'profile', Icon: User },
]

export function BottomNav({ active, onChange }: Props) {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const reduceMotion = useReducedMotion()

  return (
    <nav
      className="fixed left-0 right-0 z-50 px-3 pointer-events-none"
      style={{
        bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div
        className="pointer-events-auto mx-auto flex items-stretch max-w-lg"
        style={{
          background: 'var(--ws-card)',
          border: '1px solid var(--ws-border)',
          borderRadius: 20,
          boxShadow: 'var(--ws-shadow-dock)',
          height: 56,
          padding: '0 4px',
        }}
      >
        {tabs.map(({ key, Icon }) => {
          const isActive = active === key
          return (
            <motion.button
              key={key}
              type="button"
              whileTap={reduceMotion ? undefined : { scale: 0.94 }}
              transition={{ duration: 0.08 }}
              onClick={() => {
                haptic.impact('light')
                onChange(key)
              }}
              className="relative flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0"
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative w-9 h-9 flex items-center justify-center">
                {isActive && (
                  <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'var(--ws-primary)', opacity: 0.14 }}
                    initial={reduceMotion ? false : { scale: 0.86, opacity: 0 }}
                    animate={{ scale: 1, opacity: 0.14 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.14, ease: 'easeOut' }
                    }
                  />
                )}
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  className="relative z-10"
                  style={{ color: isActive ? 'var(--ws-primary)' : 'var(--ws-faint)' }}
                />
              </div>
              <span
                className="text-[10px] truncate max-w-full px-0.5 leading-none"
                style={{
                  color: isActive ? 'var(--ws-text)' : 'var(--ws-faint)',
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {t(`nav.${key}`)}
              </span>
            </motion.button>
          )
        })}
      </div>
    </nav>
  )
}
