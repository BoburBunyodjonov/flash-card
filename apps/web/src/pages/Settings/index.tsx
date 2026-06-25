import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/auth.store'
import { profileApi, type ReferralInfo } from '../../api/profile.api'
import { speakingApi } from '../../api/speaking.api'
import { useTelegram } from '../../hooks/useTelegram'
import { PremiumModal } from '../../components/PremiumModal'
import i18n from '../../i18n'

const LANGUAGES = [
  { code: 'uz', label: "O'zbek", flag: '🇺🇿' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
]

const CEFR_LEVELS = [
  { value: 'A1', label: 'A1 · Boshlang\'ich', color: '#34d399' },
  { value: 'A2', label: 'A2 · Elementar', color: '#6ee7b7' },
  { value: 'B1', label: 'B1 · O\'rta', color: '#fbbf24' },
  { value: 'B2', label: 'B2 · O\'rtadan yuqori', color: '#f97316' },
  { value: 'C1', label: 'C1 · Ilg\'or', color: '#f87171' },
  { value: 'C2', label: 'C2 · Mukammal', color: '#c084fc' },
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
  const { user, setUser, logout } = useAuthStore()
  const { twa, haptic } = useTelegram()
  const [lang, setLang] = useState(i18n.language)
  const [notifyEnabled, setNotifyEnabled] = useState(user?.notifyEnabled ?? true)
  const [notifyTime, setNotifyTime] = useState(user?.notifyAt ?? '20:00')
  const [referral, setReferral] = useState<ReferralInfo | null>(null)
  const [premiumOpen, setPremiumOpen] = useState(false)

  useEffect(() => {
    profileApi.getReferral().then(setReferral).catch(() => {})
  }, [])

  const shareReferral = () => {
    if (!referral) return
    haptic.impact('light')
    const url = referral.link ?? `https://t.me/WordSwipeBot?start=${referral.startParam}`
    const text = "🎁 WordSwipe ga qo'shil — ikkalamiz ham +10 ta bonus so'z olamiz! Inglizcha so'zlarni TikTok kabi swipe qilib o'rgan 👇"
    if (twa) {
      twa.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
    } else {
      navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {})
    }
  }
  const [notifySaved, setNotifySaved] = useState(false)
  const [level, setLevel] = useState(() => localStorage.getItem('ws_level') ?? 'A1')

  const changeLevel = async (lvl: string) => {
    setLevel(lvl)
    localStorage.setItem('ws_level', lvl)
    await profileApi.setLevel(lvl).catch(() => {})
  }

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
    await profileApi.setNotifyEnabled(enabled).catch(() => {})
  }

  const changeGender = async (gender: 'male' | 'female' | null) => {
    if (!user) return
    setUser({ ...user, gender })
    await speakingApi.setGender(gender).catch(() => {})
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
                  {t('settings.premiumUntil', { date: new Date(user.premiumUntil).toLocaleDateString() })}
                </p>
              )}
            </div>
            <span className="text-4xl">⭐</span>
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { haptic.impact('medium'); setPremiumOpen(true) }}
            className="w-full rounded-2xl p-5 flex items-center justify-between relative overflow-hidden text-left glow-purple"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'radial-gradient(circle at 80% 50%, rgba(255,255,255,0.3), transparent 60%)' }} />
            <div>
              <p className="text-white font-black text-lg">{t('settings.getPremium')}</p>
              <p className="text-white/60 text-sm mt-0.5">{t('settings.premiumDesc')}</p>
            </div>
            <span className="text-4xl">⚡</span>
          </motion.button>
        )}
      </motion.div>

      {/* Invite friends (referral) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mx-5 mb-4 rounded-2xl p-5"
        style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.18)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-white font-black text-base">🎁 Do'stlarni taklif qiling</p>
            <p className="text-white/40 text-xs mt-0.5">
              Har bir do'st uchun <span className="text-success font-bold">+50 XP</span> va{' '}
              <span className="text-success font-bold">+10 bonus so'z</span>
            </p>
          </div>
          {referral && referral.count > 0 && (
            <div className="text-center shrink-0 ml-3">
              <p className="text-success font-black text-2xl leading-none">{referral.count}</p>
              <p className="text-white/30 text-[10px] mt-1">taklif qilingan</p>
            </div>
          )}
        </div>

        {referral && referral.referrals.length > 0 && (
          <div className="flex items-center mb-3 pl-1">
            {referral.referrals.slice(0, 6).map((r, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-sm -ml-1 first:ml-0"
                style={{ background: '#1e1e30', border: '2px solid #0a0a14' }}
                title={r.firstName}
              >
                {r.avatarUrl ? <img src={r.avatarUrl} className="w-full h-full object-cover" alt="" /> : '👤'}
              </div>
            ))}
            {referral.count > 6 && (
              <span className="text-white/35 text-xs font-bold ml-2">+{referral.count - 6}</span>
            )}
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={shareReferral}
          disabled={!referral}
          className="w-full py-3.5 rounded-xl font-black text-sm text-white disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 6px 20px rgba(16,185,129,0.22)' }}
        >
          📤 Taklif havolasini ulashish
        </motion.button>
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

      {/* CEFR level */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="mx-5 mb-4 rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">
          Ingliz tili darajasi
        </p>
        <p className="text-white/30 text-xs mb-3">Feed shu darajaga mos so'zlarni ko'rsatadi</p>
        <div className="grid grid-cols-3 gap-2">
          {CEFR_LEVELS.map((l) => (
            <button
              key={l.value}
              onClick={() => changeLevel(l.value)}
              className="flex flex-col items-center py-2.5 rounded-xl transition-all"
              style={level === l.value
                ? { background: `${l.color}20`, border: `1px solid ${l.color}55` }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }
              }
            >
              <span className="text-sm font-black" style={{ color: level === l.value ? l.color : 'rgba(255,255,255,0.45)' }}>
                {l.value}
              </span>
              <span className="text-[9px] mt-0.5" style={{ color: level === l.value ? `${l.color}cc` : 'rgba(255,255,255,0.25)' }}>
                {l.label.split('· ')[1]}
              </span>
            </button>
          ))}
        </div>
      </motion.div>

      {/* Gender (for speaking practice matching) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mx-5 mb-4 rounded-2xl p-5"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-1">
          {t('settings.gender')}
        </p>
        <p className="text-white/30 text-xs mb-3">{t('settings.genderHint')}</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'male' as const, label: t('settings.genderMale'), icon: '👨' },
            { value: 'female' as const, label: t('settings.genderFemale'), icon: '👩' },
            { value: null, label: t('settings.genderNone'), icon: '—' },
          ]).map((g) => (
            <button
              key={String(g.value)}
              onClick={() => changeGender(g.value)}
              className="flex flex-col items-center py-2.5 rounded-xl transition-all"
              style={(user?.gender ?? null) === g.value
                ? { background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)' }
                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }
              }
            >
              <span className="text-base">{g.icon}</span>
              <span className="text-xs font-bold mt-0.5"
                style={{ color: (user?.gender ?? null) === g.value ? '#a78bfa' : 'rgba(255,255,255,0.4)' }}>
                {g.label}
              </span>
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

      <PremiumModal open={premiumOpen} onClose={() => setPremiumOpen(false)} />
    </div>
  )
}
