import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/auth.store'
import { profileApi } from '../../api/profile.api'
import i18n from '../../i18n'

const LANGUAGES = [
  { code: 'uz', label: "O'zbek", flag: '🇺🇿' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
]

const NOTIFY_TIMES = [
  { value: '08:00', label: '08:00', hint: '🌅' },
  { value: '12:00', label: '12:00', hint: '☀️' },
  { value: '18:00', label: '18:00', hint: '🌆' },
  { value: '20:00', label: '20:00', hint: '🌙' },
  { value: '21:00', label: '21:00', hint: '🌙' },
  { value: '22:00', label: '22:00', hint: '🌙' },
]

export function SettingsPage() {
  const { t } = useTranslation()
  const { user, logout } = useAuthStore()
  const [lang, setLang] = useState(i18n.language)
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const [notifyTime, setNotifyTime] = useState(user?.notifyAt ?? '20:00')
  const [notifySaved, setNotifySaved] = useState(false)

  const changeLang = async (code: string) => {
    setLang(code)
    i18n.changeLanguage(code)
    localStorage.setItem('lang', code)
    await profileApi.setLanguage(code).catch(() => {})
  }

  const saveNotifyTime = async (time: string) => {
    setNotifyTime(time)
    await profileApi.setNotifyTime(time).catch(() => {})
    setNotifySaved(true)
    setTimeout(() => setNotifySaved(false), 2000)
  }

  const toggleNotify = async (enabled: boolean) => {
    setNotifyEnabled(enabled)
    if (!enabled) {
      await profileApi.setNotifyTime('00:00').catch(() => {})
    } else {
      await profileApi.setNotifyTime(notifyTime).catch(() => {})
    }
  }

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-24 pt-4" style={{ background: '#0a0a14' }}>
      <div className="px-5 mb-6">
        <h1 className="text-2xl font-black gradient-text">{t('settings.title')}</h1>
      </div>

      {/* Profile card */}
      {user && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-5 mb-4 rounded-2xl p-5 flex items-center gap-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center text-3xl"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            {user.avatarUrl
              ? <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
              : '👤'
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-lg truncate">{user.firstName} {user.lastName ?? ''}</p>
            {user.username && <p className="text-white/40 text-sm">@{user.username}</p>}
            <div className="flex items-center gap-3 mt-1.5">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>
                🔥 {user.streak} streak
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(99,102,241,0.15)', color: '#a78bfa' }}>
                ⚡ {user.xp} XP
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Premium card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="mx-5 mb-4"
      >
        {user?.isPremium ? (
          <div className="rounded-2xl p-5 flex items-center justify-between relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'radial-gradient(circle at 80% 50%, rgba(255,255,255,0.3), transparent 60%)' }} />
            <div>
              <p className="text-white font-black text-lg">✨ {t('settings.premiumActive')}</p>
              {user.premiumUntil && (
                <p className="text-white/60 text-sm mt-0.5">
                  Until {new Date(user.premiumUntil).toLocaleDateString()}
                </p>
              )}
            </div>
            <span className="text-4xl">⭐</span>
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="w-full rounded-2xl p-5 flex items-center justify-between relative overflow-hidden text-left glow-purple"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'radial-gradient(circle at 80% 50%, rgba(255,255,255,0.3), transparent 60%)' }} />
            <div>
              <p className="text-white font-black text-lg">{t('settings.getPremium')}</p>
              <p className="text-white/60 text-sm mt-0.5">Unlimited words · No ads · All features</p>
            </div>
            <span className="text-4xl">⚡</span>
          </motion.button>
        )}
      </motion.div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mx-5 mb-4 rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
              {t('settings.notifications')}
            </p>
            <p className="text-white/60 text-xs mt-0.5">Telegram orqali eslatma</p>
          </div>
          {/* Toggle */}
          <button
            onClick={() => toggleNotify(!notifyEnabled)}
            className="relative w-12 h-6 rounded-full transition-all duration-200"
            style={{ background: notifyEnabled ? '#6366f1' : 'rgba(255,255,255,0.1)' }}
          >
            <motion.div
              className="absolute top-1 w-4 h-4 rounded-full bg-white"
              animate={{ left: notifyEnabled ? '1.5rem' : '0.25rem' }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          </button>
        </div>

        {/* Time picker */}
        <AnimatePresence>
          {notifyEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <p className="text-white/30 text-xs mb-2">{t('settings.notifyTime')}</p>
              <div className="grid grid-cols-3 gap-2">
                {NOTIFY_TIMES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => saveNotifyTime(t.value)}
                    className="flex flex-col items-center py-2 rounded-xl transition-all"
                    style={notifyTime === t.value
                      ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)' }
                      : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }
                    }
                  >
                    <span className="text-base">{t.hint}</span>
                    <span className="text-xs font-bold mt-0.5"
                      style={{ color: notifyTime === t.value ? '#a78bfa' : 'rgba(255,255,255,0.4)' }}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>

              <AnimatePresence>
                {notifySaved && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-center text-xs mt-3 font-semibold"
                    style={{ color: '#34d399' }}
                  >
                    ✓ Saqlandi — {notifyTime} da eslatma yuboriladi
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Language picker */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
        className="mx-5 mb-4 rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-3">
          {t('settings.language')}
        </p>
        <div className="flex flex-col gap-1">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => changeLang(l.code)}
              className="flex items-center justify-between py-2.5 px-3 rounded-xl transition-all"
              style={lang === l.code
                ? { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }
                : { border: '1px solid transparent' }
              }
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{l.flag}</span>
                <span className="text-white font-semibold">{l.label}</span>
              </div>
              {lang === l.code && (
                <span className="text-sm font-black" style={{ color: '#6366f1' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Logout */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.22 }}
        className="mx-5"
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={logout}
          className="w-full rounded-2xl py-4 font-bold text-base"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}
        >
          {t('settings.logout')}
        </motion.button>
      </motion.div>
    </div>
  )
}
