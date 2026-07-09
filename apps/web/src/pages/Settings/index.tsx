import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import {
  Bell, Clock, Globe, GraduationCap, User, Crown, Sparkles,
  Gift, Share2, LogOut, Check, Flame, Zap, Users, ArrowLeft, Smartphone,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth.store'
import { profileApi, type ReferralInfo } from '../../api/profile.api'
import { speakingApi } from '../../api/speaking.api'
import { useTelegram } from '../../hooks/useTelegram'
import { PremiumModal } from '../../components/PremiumModal'
import i18n from '../../i18n'

const LANGUAGES = [
  { code: 'uz', label: "O'zbek" },
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
]

const CEFR_LEVELS = [
  { value: 'A1', label: 'A1 · Boshlang\'ich', color: '#10b981' },
  { value: 'A2', label: 'A2 · Elementar', color: '#34d399' },
  { value: 'B1', label: 'B1 · O\'rta', color: '#f59e0b' },
  { value: 'B2', label: 'B2 · O\'rtadan yuqori', color: '#f97316' },
  { value: 'C1', label: 'C1 · Ilg\'or', color: '#ef4444' },
  { value: 'C2', label: 'C2 · Mukammal', color: '#a78bfa' },
]

const NOTIFY_TIMES = ['08:00', '12:00', '18:00', '20:00', '21:00', '22:00']

// Reusable settings section wrapper
function SettingsSection({
  Icon, title, hint, delay, children,
}: {
  Icon: typeof Bell
  title: string
  hint?: string
  delay: number
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="mx-5 mb-4 ws-card p-5"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
          <Icon size={18} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm" style={{ color: 'var(--ws-text)' }}>{title}</p>
          {hint && <p className="text-xs mt-0.5" style={{ color: 'var(--ws-muted)' }}>{hint}</p>}
        </div>
      </div>
      {children}
    </motion.div>
  )
}

export function SettingsPage({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation()
  const { user, setUser, logout } = useAuthStore()
  const { twa, haptic, isInsideTelegram } = useTelegram()
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
    const text = "🎁 WordSwipe ga qo'shil — ikkalamiz ham +10 qo'shimcha takrorlash olamiz! O'z so'zlaringizni swipe qilib o'rgan 👇"
    if (twa) {
      twa.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`)
    } else {
      navigator.clipboard?.writeText(`${text}\n${url}`).catch(() => {})
    }
  }
  const [notifySaved, setNotifySaved] = useState(false)
  const [level, setLevel] = useState(() => localStorage.getItem('ws_level') ?? 'A1')

  // Mobile-app credentials (phone + password) for the current account
  const [pwPhone, setPwPhone] = useState('')
  const [pwValue, setPwValue] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSaved, setPwSaved] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  useEffect(() => {
    profileApi.get().then((p) => {
      if (p?.phone) setPwPhone(p.phone)
      setHasPassword(!!p?.hasPassword)
    }).catch(() => {})
  }, [])

  const savePassword = async () => {
    if (pwSaving || !pwPhone.trim() || pwValue.length < 6) {
      if (pwValue.length > 0 && pwValue.length < 6) setPwError(t('settings.pwTooShort'))
      return
    }
    setPwSaving(true)
    setPwError(null)
    try {
      await profileApi.setPassword(pwPhone.trim(), pwValue)
      setHasPassword(true)
      setPwValue('')
      setPwSaved(true)
      haptic.success()
      setTimeout(() => setPwSaved(false), 2500)
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      setPwError(msg ?? t('settings.pwError'))
      haptic.error()
    } finally {
      setPwSaving(false)
    }
  }

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
    <div className="h-full overflow-y-auto no-scrollbar pb-24 pt-4" style={{ background: 'var(--ws-bg)' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-5 mb-6 flex items-center gap-3">
        {onBack && (
          <motion.button whileTap={{ scale: 0.9 }} onClick={onBack} aria-label={t('decks.back')}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: 'var(--ws-card)', border: '1px solid var(--ws-border)' }}>
            <ArrowLeft size={18} strokeWidth={2.2} style={{ color: 'var(--ws-text)' }} />
          </motion.button>
        )}
        <h1 className="text-3xl font-black tracking-tight" style={{ color: 'var(--ws-text)' }}>{t('settings.title')}</h1>
      </motion.div>

      {/* Profile card */}
      {user && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-5 mb-4 ws-card p-5 flex items-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center ws-gradient-bg">
            {user.avatarUrl
              ? <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
              : <User size={30} strokeWidth={2} style={{ color: '#fff' }} />
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-lg truncate" style={{ color: 'var(--ws-text)' }}>{user.firstName} {user.lastName ?? ''}</p>
            {user.username && <p className="text-sm" style={{ color: 'var(--ws-muted)' }}>@{user.username}</p>}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: 'rgba(245,158,11,0.14)', color: 'var(--ws-warning)' }}>
                <Flame size={12} strokeWidth={2.4} /> {user.streak}
              </span>
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: 'rgba(99,102,241,0.14)', color: 'var(--ws-primary-light)' }}>
                <Zap size={12} strokeWidth={2.4} /> {user.xp} XP
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
          <div className="rounded-card p-5 flex items-center justify-between relative overflow-hidden ws-gradient-bg ws-glow-primary">
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'radial-gradient(circle at 80% 50%, rgba(255,255,255,0.3), transparent 60%)' }} />
            <div className="relative">
              <p className="text-white font-black text-lg flex items-center gap-2">
                <Sparkles size={20} strokeWidth={2.2} /> {t('settings.premiumActive')}
              </p>
              {user.premiumUntil && (
                <p className="text-white/70 text-sm mt-0.5">
                  {t('settings.premiumUntil', { date: new Date(user.premiumUntil).toLocaleDateString() })}
                </p>
              )}
            </div>
            <Crown size={34} strokeWidth={1.8} className="relative text-white/90" />
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => { haptic.impact('medium'); setPremiumOpen(true) }}
            className="w-full rounded-card p-5 flex items-center justify-between relative overflow-hidden text-left ws-gradient-bg ws-glow-primary"
          >
            <div className="absolute inset-0 opacity-20"
              style={{ background: 'radial-gradient(circle at 80% 50%, rgba(255,255,255,0.3), transparent 60%)' }} />
            <div className="relative">
              <p className="text-white font-black text-lg">{t('settings.getPremium')}</p>
              <p className="text-white/70 text-sm mt-0.5">{t('settings.premiumDesc')}</p>
            </div>
            <Crown size={34} strokeWidth={1.8} className="relative text-white/90" />
          </motion.button>
        )}
      </motion.div>

      {/* Mobile app password (link phone+password to this account) */}
      <SettingsSection Icon={Smartphone} title={t('settings.mobilePassword')} hint={t('settings.mobilePasswordHint')} delay={0.11}>
        {hasPassword && (
          <p className="text-xs mb-3 flex items-center gap-1.5" style={{ color: 'var(--ws-success)' }}>
            <Check size={13} strokeWidth={2.6} /> {t('settings.pwSet')}
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          {isInsideTelegram && twa?.requestContact && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                haptic.impact('light')
                twa.requestContact?.((shared) => {
                  if (!shared) return
                  // Bot saves the verified number async — refetch shortly after
                  const refetch = () => profileApi.get().then((p) => { if (p?.phone) setPwPhone(p.phone) }).catch(() => {})
                  setTimeout(refetch, 1500)
                  setTimeout(refetch, 3500)
                })
              }}
              className="w-full py-3 rounded-btn font-bold text-sm flex items-center justify-center gap-2"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: 'var(--ws-primary-light)' }}
            >
              <Smartphone size={16} strokeWidth={2.2} /> {t('settings.pwFromTelegram')}
            </motion.button>
          )}
          <input
            value={pwPhone}
            onChange={(e) => setPwPhone(e.target.value)}
            inputMode="tel"
            placeholder="+998 90 123 45 67"
            className="w-full rounded-btn px-4 py-3 text-sm outline-none"
            style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)', color: 'var(--ws-text)' }}
          />
          <input
            value={pwValue}
            onChange={(e) => setPwValue(e.target.value)}
            type="password"
            placeholder={t('settings.pwPlaceholder')}
            className="w-full rounded-btn px-4 py-3 text-sm outline-none"
            style={{ background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)', color: 'var(--ws-text)' }}
          />
          {pwError && <p className="text-xs" style={{ color: 'var(--ws-danger)' }}>{pwError}</p>}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={savePassword}
            disabled={pwSaving}
            className="w-full py-3 rounded-btn font-bold text-sm text-white disabled:opacity-60 ws-gradient-bg"
          >
            {pwSaved ? `✓ ${t('settings.pwSaved')}` : hasPassword ? t('settings.pwUpdate') : t('settings.pwSave')}
          </motion.button>
        </div>
      </SettingsSection>

      {/* Invite friends (referral) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mx-5 mb-4 rounded-card p-5"
        style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.28)' }}>
              <Gift size={18} strokeWidth={2.2} style={{ color: 'var(--ws-success)' }} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm" style={{ color: 'var(--ws-text)' }}>{t('settings.inviteTitle')}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ws-muted)' }}>{t('settings.inviteReward')}</p>
            </div>
          </div>
          {referral && referral.count > 0 && (
            <div className="text-center shrink-0 ml-3">
              <p className="font-black text-2xl leading-none" style={{ color: 'var(--ws-success)' }}>{referral.count}</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--ws-faint)' }}>{t('settings.invited')}</p>
            </div>
          )}
        </div>

        {referral && referral.referrals.length > 0 && (
          <div className="flex items-center mb-3 pl-1">
            {referral.referrals.slice(0, 6).map((r, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center -ml-1 first:ml-0"
                style={{ background: 'var(--ws-surface)', border: '2px solid var(--ws-bg)' }}
                title={r.firstName}
              >
                {r.avatarUrl
                  ? <img src={r.avatarUrl} className="w-full h-full object-cover" alt="" />
                  : <User size={14} strokeWidth={2} style={{ color: 'var(--ws-faint)' }} />}
              </div>
            ))}
            {referral.count > 6 && (
              <span className="text-xs font-bold ml-2" style={{ color: 'var(--ws-muted)' }}>+{referral.count - 6}</span>
            )}
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={shareReferral}
          disabled={!referral}
          className="w-full py-3.5 rounded-btn font-bold text-sm text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 6px 20px rgba(16,185,129,0.22)' }}
        >
          <Share2 size={17} strokeWidth={2.2} /> {t('settings.shareInvite')}
        </motion.button>
      </motion.div>

      {/* Notifications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mx-5 mb-4 ws-card p-5"
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
              <Bell size={18} strokeWidth={2.2} style={{ color: 'var(--ws-primary-light)' }} />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: 'var(--ws-text)' }}>{t('settings.notifications')}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ws-muted)' }}>{t('settings.notifyHint')}</p>
            </div>
          </div>
          {/* Toggle */}
          <button
            onClick={() => toggleNotify(!notifyEnabled)}
            className="relative w-12 h-6 rounded-full shrink-0"
            style={{ background: notifyEnabled ? 'var(--ws-primary)' : 'rgba(255,255,255,0.1)' }}
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
              <p className="text-xs mb-2 flex items-center gap-1.5" style={{ color: 'var(--ws-muted)' }}>
                <Clock size={13} strokeWidth={2.2} /> {t('settings.notifyTime')}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {NOTIFY_TIMES.map((time) => (
                  <button
                    key={time}
                    onClick={() => saveNotifyTime(time)}
                    className="flex items-center justify-center gap-1.5 py-2.5 rounded-btn"
                    style={notifyTime === time
                      ? { background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)' }
                      : { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }
                    }
                  >
                    <Clock size={13} strokeWidth={2.2} style={{ color: notifyTime === time ? 'var(--ws-primary-light)' : 'var(--ws-faint)' }} />
                    <span className="text-xs font-bold tabular-nums"
                      style={{ color: notifyTime === time ? 'var(--ws-primary-light)' : 'var(--ws-muted)' }}>
                      {time}
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
                    className="text-center text-xs mt-3 font-semibold flex items-center justify-center gap-1.5"
                    style={{ color: 'var(--ws-success)' }}
                  >
                    <Check size={13} strokeWidth={2.6} /> {t('settings.notifySaved', { time: notifyTime })}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Language picker */}
      <SettingsSection Icon={Globe} title={t('settings.language')} delay={0.16}>
        <div className="flex flex-col gap-1">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => changeLang(l.code)}
              className="flex items-center justify-between py-2.5 px-3 rounded-btn"
              style={lang === l.code
                ? { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }
                : { border: '1px solid transparent' }
              }
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-black uppercase tracking-wider w-7"
                  style={{ color: lang === l.code ? 'var(--ws-primary-light)' : 'var(--ws-faint)' }}>{l.code}</span>
                <span className="font-semibold" style={{ color: 'var(--ws-text)' }}>{l.label}</span>
              </div>
              {lang === l.code && <Check size={17} strokeWidth={2.6} style={{ color: 'var(--ws-primary-light)' }} />}
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* CEFR level */}
      <SettingsSection Icon={GraduationCap} title={t('settings.cefrTitle')} hint={t('settings.cefrHint')} delay={0.18}>
        <div className="grid grid-cols-3 gap-2">
          {CEFR_LEVELS.map((l) => (
            <button
              key={l.value}
              onClick={() => changeLevel(l.value)}
              className="flex flex-col items-center py-2.5 rounded-btn"
              style={level === l.value
                ? { background: `${l.color}20`, border: `1px solid ${l.color}55` }
                : { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }
              }
            >
              <span className="text-sm font-black" style={{ color: level === l.value ? l.color : 'var(--ws-muted)' }}>
                {l.value}
              </span>
              <span className="text-[9px] mt-0.5" style={{ color: level === l.value ? `${l.color}cc` : 'var(--ws-faint)' }}>
                {l.label.split('· ')[1]}
              </span>
            </button>
          ))}
        </div>
      </SettingsSection>

      {/* Gender (for speaking practice matching) */}
      <SettingsSection Icon={Users} title={t('settings.gender')} hint={t('settings.genderHint')} delay={0.2}>
        <div className="grid grid-cols-3 gap-2">
          {([
            { value: 'male' as const, label: t('settings.genderMale') },
            { value: 'female' as const, label: t('settings.genderFemale') },
            { value: null, label: t('settings.genderNone') },
          ]).map((g) => {
            const isActive = (user?.gender ?? null) === g.value
            return (
              <button
                key={String(g.value)}
                onClick={() => changeGender(g.value)}
                className="flex flex-col items-center gap-1.5 py-3 rounded-btn"
                style={isActive
                  ? { background: 'rgba(99,102,241,0.18)', border: '1px solid rgba(99,102,241,0.4)' }
                  : { background: 'var(--ws-card-2)', border: '1px solid var(--ws-border)' }
                }
              >
                <User size={18} strokeWidth={2.2} style={{ color: isActive ? 'var(--ws-primary-light)' : 'var(--ws-faint)' }} />
                <span className="text-xs font-bold"
                  style={{ color: isActive ? 'var(--ws-primary-light)' : 'var(--ws-muted)' }}>
                  {g.label}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsSection>

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
          className="w-full rounded-card py-4 font-bold text-base flex items-center justify-center gap-2"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: 'var(--ws-danger)' }}
        >
          <LogOut size={18} strokeWidth={2.2} /> {t('settings.logout')}
        </motion.button>
      </motion.div>

      <PremiumModal open={premiumOpen} onClose={() => setPremiumOpen(false)} />
    </div>
  )
}
