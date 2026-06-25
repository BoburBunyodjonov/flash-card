import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { paymentsApi, type PlanInfo, type StarsPlan } from '../../api/payments.api'
import { profileApi } from '../../api/profile.api'
import { useAuthStore } from '../../store/auth.store'
import { useTelegram } from '../../hooks/useTelegram'

interface PremiumModalProps {
  open: boolean
  onClose: () => void
}

export function PremiumModal({ open, onClose }: PremiumModalProps) {
  const { t } = useTranslation()
  const { twa, isInsideTelegram, haptic } = useTelegram()
  const setUser = useAuthStore((s) => s.setUser)

  const [plan, setPlan] = useState<PlanInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<StarsPlan>('yearly')
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)

  const loadPlan = () => {
    setLoading(true)
    setLoadError(false)
    paymentsApi
      .getPlan()
      .then(setPlan)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) {
      setPaid(false)
      setPayError(null)
      if (!plan) loadPlan()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const features = t('premium.features', { returnObjects: true })
  const featureList = Array.isArray(features) ? (features as string[]) : []

  const monthlyStars = plan?.prices.stars.monthly ?? 0
  const yearlyStars = plan?.prices.stars.yearly ?? 0
  // % saved when paying yearly vs 12 monthly payments
  const yearlySave =
    monthlyStars > 0 && yearlyStars > 0
      ? Math.max(0, Math.round((1 - yearlyStars / (monthlyStars * 12)) * 100))
      : 0

  const buy = async () => {
    if (paying || !plan) return
    if (!isInsideTelegram || !twa?.openInvoice) return
    haptic.impact('medium')
    setPaying(true)
    setPayError(null)
    try {
      const { link } = await paymentsApi.createInvoice(selected)
      twa.openInvoice(link, (status) => {
        if (status === 'paid') {
          haptic.success()
          setPaid(true)
          // Refresh the profile so isPremium flips everywhere immediately.
          profileApi.get().then((u) => u && setUser(u)).catch(() => {})
        } else if (status === 'failed') {
          haptic.error()
          setPayError(t('premium.failed'))
        }
        // 'cancelled' / 'pending' → just unlock the button.
        setPaying(false)
      })
    } catch {
      setPaying(false)
      setPayError(t('premium.error'))
    }
  }

  const planOptions: { key: StarsPlan; label: string; stars: number; hint?: string }[] = [
    { key: 'monthly', label: t('premium.monthly'), stars: monthlyStars },
    {
      key: 'yearly',
      label: t('premium.yearly'),
      stars: yearlyStars,
      hint: yearlySave > 0 ? t('premium.savePercent', { percent: yearlySave }) : undefined,
    },
  ]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(10,10,10,0.75)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="w-full max-w-md rounded-t-3xl px-5 pt-5 pb-8 overflow-y-auto no-scrollbar"
            style={{ background: '#141420', border: '1px solid rgba(255,255,255,0.07)', maxHeight: '88vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: 'rgba(255,255,255,0.15)' }} />

            {paid ? (
              /* ── Success state ── */
              <div className="flex flex-col items-center text-center py-6">
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                  className="text-6xl mb-4"
                >
                  ⭐
                </motion.span>
                <p className="text-white font-black text-xl">{t('premium.success')}</p>
                <p className="text-white/50 text-sm mt-2 max-w-[260px]">{t('premium.successDesc')}</p>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  className="w-full mt-7 py-4 rounded-2xl font-black text-base text-white"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.35)' }}
                >
                  {t('premium.close')}
                </motion.button>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="text-center mb-5">
                  <span className="text-4xl">⚡</span>
                  <h2 className="text-white font-black text-xl mt-2">{t('premium.title')}</h2>
                  <p className="text-white/45 text-sm mt-1">{t('premium.subtitle')}</p>
                </div>

                {/* Features */}
                <div
                  className="rounded-2xl p-4 mb-5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  {featureList.map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-1">
                      <span className="text-sm font-black shrink-0" style={{ color: '#10b981' }}>✓</span>
                      <span className="text-white/75 text-sm">{f}</span>
                    </div>
                  ))}
                </div>

                {loading && (
                  <div className="flex justify-center py-8">
                    <div
                      className="w-7 h-7 rounded-full border-2 animate-spin"
                      style={{ borderColor: 'rgba(99,102,241,0.25)', borderTopColor: '#6366f1' }}
                    />
                  </div>
                )}

                {!loading && loadError && (
                  <div className="text-center py-6">
                    <p className="text-white/50 text-sm mb-3">{t('premium.error')}</p>
                    <button
                      onClick={loadPlan}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                      style={{ background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.4)' }}
                    >
                      {t('premium.retry')}
                    </button>
                  </div>
                )}

                {!loading && !loadError && plan && (
                  <>
                    {/* Plan options */}
                    <div className="grid grid-cols-2 gap-3 mb-5">
                      {planOptions.map((p) => (
                        <button
                          key={p.key}
                          onClick={() => { setSelected(p.key); haptic.impact('light') }}
                          className="relative rounded-2xl p-4 text-center transition-all"
                          style={
                            selected === p.key
                              ? { background: 'rgba(99,102,241,0.16)', border: '1.5px solid #6366f1' }
                              : { background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.08)' }
                          }
                        >
                          {p.hint && (
                            <span
                              className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap"
                              style={{ background: '#10b981', color: '#fff' }}
                            >
                              {p.hint}
                            </span>
                          )}
                          <p className="text-white/55 text-xs font-bold uppercase tracking-wider">{p.label}</p>
                          <p className="text-white font-black text-2xl mt-1.5">
                            ⭐ {p.stars}
                          </p>
                          <p className="text-white/35 text-[11px] mt-0.5">Telegram Stars</p>
                        </button>
                      ))}
                    </div>

                    {isInsideTelegram ? (
                      <>
                        <motion.button
                          whileTap={{ scale: 0.97 }}
                          onClick={buy}
                          disabled={paying}
                          className="w-full py-4 rounded-2xl font-black text-base text-white disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.35)' }}
                        >
                          {paying
                            ? t('premium.processing')
                            : t('premium.payWithStars', {
                                stars: selected === 'monthly' ? monthlyStars : yearlyStars,
                              })}
                        </motion.button>
                        {payError && (
                          <p className="text-center text-xs mt-3 font-semibold" style={{ color: '#ef4444' }}>
                            {payError}
                          </p>
                        )}
                      </>
                    ) : (
                      /* Browser PWA — Stars only works inside Telegram */
                      <div
                        className="rounded-2xl p-4 text-center"
                        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}
                      >
                        <p className="text-sm" style={{ color: '#f59e0b' }}>
                          ✈️ {t('premium.openInTelegram')}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
