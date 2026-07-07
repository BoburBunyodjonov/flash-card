import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuthStore } from './store/auth.store'
import { api } from './api/client'
import { BottomNav } from './components/BottomNav'
import { ReferralBonusToast } from './components/ReferralBonusToast'
import { LoginPage } from './pages/Login'
import { OnboardingPage } from './pages/Onboarding'
import { FeedPage } from './pages/Feed'
import { PracticePage } from './pages/Practice'
import { DictionaryPage } from './pages/Dictionary'
import { DecksPage } from './pages/Decks'
import { ProgressPage } from './pages/Progress'
import { LeaderboardPage } from './pages/Leaderboard'
import { SettingsPage } from './pages/Settings'
import { ChallengePage } from './pages/Challenge'
import { QuizPage } from './pages/Quiz'
import { DuelPage } from './pages/Duel'
import { GroupChallengePage } from './pages/GroupChallenge'
import { SpeakingPage } from './pages/Speaking'
import { MyWordsPage } from './pages/MyWords'
import { MyWordsStudyPage } from './pages/MyWordsStudy'
import { ShadowingPage } from './pages/Shadowing'
import { ProfilePage } from './pages/Profile'
import { flushPendingSwipes } from './store/feed.store'
import { flushOfflineQueue } from './lib/offlineQueue'

type Page = 'feed' | 'practice' | 'dictionary' | 'decks' | 'progress' | 'leaderboard' | 'settings' | 'challenge' | 'quiz' | 'duel' | 'groupchallenge' | 'speaking' | 'mywords' | 'mywordsstudy' | 'shadowing' | 'profile'

const NAV_PAGES: Page[] = ['feed', 'practice', 'speaking', 'dictionary', 'profile']
// Pages reached from inside the Profile tab — they keep the Profil tab highlighted
const PROFILE_SUBPAGES: Page[] = ['progress', 'leaderboard', 'decks', 'settings']
// Focused, full-screen sessions hide the (fixed) tab bar — otherwise it overlaps
// their bottom-anchored action buttons. Each has its own in-page back button.
const IMMERSIVE_PAGES: Page[] = ['quiz', 'duel', 'groupchallenge', 'challenge', 'shadowing', 'mywordsstudy']

const DUEL_PREFIX = 'duel_'
const GC_PREFIX = 'gc_'

export default function App() {
  const { user, setUser } = useAuthStore()
  const [page, setPage] = useState<Page>('feed')
  const [duelId, setDuelId] = useState<string | null>(null)
  const [gcId, setGcId] = useState<string | null>(null)
  const [speakingAuto, setSpeakingAuto] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(() => !!localStorage.getItem('ws_onboarding_done'))

  // Duel invite deep link + replay of offline swipes.
  // start_param comes from a direct ?startapp= link; ?sp= is the fallback used
  // when the app is opened via the bot's /start "Open" web_app button.
  useEffect(() => {
    if (!user) return
    flushPendingSwipes()
    flushOfflineQueue()
    const startParam =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
      new URLSearchParams(window.location.search).get('sp') ||
      undefined
    if (startParam?.startsWith(DUEL_PREFIX)) {
      setDuelId(startParam.slice(DUEL_PREFIX.length))
      setPage('duel')
    } else if (startParam?.startsWith(GC_PREFIX)) {
      setGcId(startParam.slice(GC_PREFIX.length))
      setPage('groupchallenge')
    } else if (startParam === 'speaking') {
      // Opened from the bot's "Start Practice" speaking ping → auto-find a partner
      setSpeakingAuto(true)
      setPage('speaking')
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

  const navPage = NAV_PAGES.includes(page)
    ? page
    : PROFILE_SUBPAGES.includes(page) ? 'profile' : 'feed'

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
              onMyWords={() => setPage('mywords')}
              onProgress={() => setPage('profile')}
            />
          )}
          {page === 'profile' && (
            <ProfilePage
              onProgress={() => setPage('progress')}
              onLeaderboard={() => setPage('leaderboard')}
              onDecks={() => setPage('decks')}
              onSettings={() => setPage('settings')}
            />
          )}
          {page === 'practice' && (
            <PracticePage
              onQuiz={() => setPage('quiz')}
              onDuel={() => setPage('duel')}
              onSpeaking={() => setPage('speaking')}
              onChallenge={() => setPage('challenge')}
              onMyWords={() => setPage('mywords')}
              onGroupChallenge={() => setPage('groupchallenge')}
              onShadowing={() => setPage('shadowing')}
            />
          )}
          {page === 'speaking' && (
            <SpeakingPage onBack={() => setPage('feed')} autoStart={speakingAuto} />
          )}
          {page === 'mywords' && (
            <MyWordsPage onBack={() => setPage('feed')} onMemorize={() => setPage('mywordsstudy')} />
          )}
          {page === 'mywordsstudy' && (
            <MyWordsStudyPage onBack={() => setPage('mywords')} />
          )}
          {page === 'shadowing' && (
            <ShadowingPage onBack={() => setPage('practice')} />
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
          {page === 'groupchallenge' && (
            <GroupChallengePage
              deepLinkId={gcId}
              onBack={() => { setGcId(null); setPage('practice') }}
            />
          )}
          {page === 'dictionary' && <DictionaryPage />}
          {page === 'decks' && <DecksPage onBack={() => setPage('profile')} />}
          {page === 'progress' && <ProgressPage onBack={() => setPage('profile')} />}
          {page === 'leaderboard' && <LeaderboardPage onBack={() => setPage('profile')} />}
          {page === 'settings' && <SettingsPage onBack={() => setPage('profile')} />}
        </motion.div>
      </AnimatePresence>
      {!IMMERSIVE_PAGES.includes(page) && (
        <BottomNav active={navPage} onChange={(p) => { setSpeakingAuto(false); setPage(p as Page) }} />
      )}
      <ReferralBonusToast />
    </div>
  )
}
