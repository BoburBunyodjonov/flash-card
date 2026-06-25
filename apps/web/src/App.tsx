import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuthStore } from './store/auth.store'
import { api } from './api/client'
import { BottomNav } from './components/BottomNav'
import { ReferralBonusToast } from './components/ReferralBonusToast'
import { LoginPage } from './pages/Login'
import { OnboardingPage } from './pages/Onboarding'
import { FeedPage } from './pages/Feed'
import { DictionaryPage } from './pages/Dictionary'
import { DecksPage } from './pages/Decks'
import { ProgressPage } from './pages/Progress'
import { LeaderboardPage } from './pages/Leaderboard'
import { SettingsPage } from './pages/Settings'
import { ChallengePage } from './pages/Challenge'
import { QuizPage } from './pages/Quiz'
import { DuelPage } from './pages/Duel'
import { SpeakingPage } from './pages/Speaking'
import { flushPendingSwipes } from './store/feed.store'

type Page = 'feed' | 'dictionary' | 'decks' | 'progress' | 'leaderboard' | 'settings' | 'challenge' | 'quiz' | 'duel' | 'speaking'

const NAV_PAGES: Page[] = ['feed', 'dictionary', 'decks', 'progress', 'leaderboard', 'settings']

const DUEL_PREFIX = 'duel_'

export default function App() {
  const { user, setUser } = useAuthStore()
  const [page, setPage] = useState<Page>('feed')
  const [duelId, setDuelId] = useState<string | null>(null)
  const [onboardingDone, setOnboardingDone] = useState(() => !!localStorage.getItem('ws_onboarding_done'))

  // Duel invite deep link (t.me/...?startapp=duel_<id>) + replay of offline swipes
  useEffect(() => {
    if (!user) return
    flushPendingSwipes()
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param
    if (startParam?.startsWith(DUEL_PREFIX)) {
      setDuelId(startParam.slice(DUEL_PREFIX.length))
      setPage('duel')
    }
  }, [user])

  if (!user) return <LoginPage />

  // Server-side cefrLevel is the source of truth — Telegram webviews wipe
  // localStorage between sessions, so the local flag alone re-triggers the test
  if (!user.cefrLevel && !onboardingDone) return (
    <>
      <OnboardingPage onDone={(level) => {
        localStorage.setItem('ws_onboarding_done', '1')
        localStorage.setItem('ws_level', level)
        // Persist the CEFR level so the feed serves level-appropriate words
        api.post('/api/onboarding/complete', { level }).catch(() => {})
        setUser({ ...user, cefrLevel: level })
        setOnboardingDone(true)
      }} />
      {/* Referred users see onboarding first — bonus toast must show over it */}
      <ReferralBonusToast />
    </>
  )

  const navPage = NAV_PAGES.includes(page) ? page : 'feed'

  return (
    <div className="h-full flex flex-col bg-bg overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div
          key={page}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="flex-1 overflow-hidden"
        >
          {page === 'feed' && (
            <FeedPage
              onChallenge={() => setPage('challenge')}
              onQuiz={() => setPage('quiz')}
              onDuel={() => setPage('duel')}
              onSpeaking={() => setPage('speaking')}
            />
          )}
          {page === 'speaking' && (
            <SpeakingPage onBack={() => setPage('feed')} />
          )}
          {page === 'challenge' && (
            <ChallengePage onBack={() => setPage('feed')} />
          )}
          {page === 'quiz' && (
            <QuizPage onBack={() => setPage('feed')} />
          )}
          {page === 'duel' && (
            <DuelPage
              deepLinkDuelId={duelId}
              onBack={() => { setDuelId(null); setPage('feed') }}
            />
          )}
          {page === 'dictionary' && <DictionaryPage />}
          {page === 'decks' && <DecksPage />}
          {page === 'progress' && <ProgressPage />}
          {page === 'leaderboard' && <LeaderboardPage />}
          {page === 'settings' && <SettingsPage />}
        </motion.div>
      </AnimatePresence>
      <BottomNav active={navPage} onChange={(p) => setPage(p as Page)} />
      <ReferralBonusToast />
    </div>
  )
}
