import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../store/auth.store'
import { useTelegram } from '../../hooks/useTelegram'

const AUTO_DISMISS_MS = 6000

/**
 * One-time celebration overlay shown when the backend reports a referral
 * bonus on first login of a referred user. Rendered at App level so it
 * also appears over the onboarding screen.
 */
export function ReferralBonusToast() {
  const { t } = useTranslation()
  const { haptic } = useTelegram()
  const { referralBonus, clearReferralBonus } = useAuthStore()

  useEffect(() => {
    if (!referralBonus) return
    haptic.success()
    const timer = setTimeout(clearReferralBonus, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referralBonus])

  return (
    <AnimatePresence>
      {referralBonus && (
        <motion.div
          initial={{ opacity: 0, y: -32, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="fixed top-4 left-4 right-4 z-[100] flex justify-center pointer-events-none"
        >
          <div
            className="pointer-events-auto w-full max-w-sm rounded-3xl p-5 glow-purple relative overflow-hidden"
            style={{ background: '#141420', border: '1px solid rgba(99,102,241,0.35)' }}
          >
            {/* Ambient glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% -20%, rgba(99,102,241,0.25) 0%, transparent 60%)' }}
            />

            <div className="relative flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-white font-black text-lg"
                  >
                    {t('referral.bonusTitle')}
                  </motion.p>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-white/50 text-xs mt-0.5"
                  >
                    {t('referral.bonusSubtitle')}
                  </motion.p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={clearReferralBonus}
                  aria-label={t('referral.dismiss')}
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white/40 text-sm"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  ✕
                </motion.button>
              </div>

              {/* Reward chips */}
              <div className="flex gap-2">
                <motion.div
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25, type: 'spring', stiffness: 400, damping: 22 }}
                  className="flex-1 rounded-2xl px-3 py-2.5 text-center"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}
                >
                  <p className="text-success font-black text-lg leading-tight">
                    {t('referral.bonusXp', { n: referralBonus.xp })}
                  </p>
                </motion.div>
                {referralBonus.bonusWords > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.33, type: 'spring', stiffness: 400, damping: 22 }}
                    className="flex-1 rounded-2xl px-3 py-2.5 text-center"
                    style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.28)' }}
                  >
                    <p className="text-primary font-black text-lg leading-tight">
                      {t('referral.bonusWords', { n: referralBonus.bonusWords })}
                    </p>
                  </motion.div>
                )}
              </div>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                whileTap={{ scale: 0.96 }}
                onClick={clearReferralBonus}
                className="w-full py-2.5 rounded-2xl font-bold text-sm text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
              >
                {t('referral.dismiss')}
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
