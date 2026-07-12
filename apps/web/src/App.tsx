import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuthStore } from './store/auth.store'
import { useThemeStore } from './store/theme.store'
import { onboardingApi } from './api/onboarding.api'
import { BottomNav } from './components/BottomNav'
import { ReferralBonusToast } from './components/ReferralBonusToast'
import { LoginPage } from './pages/Login'
import { OnboardingPage } from './pages/Onboarding'
import { FeedPage } from './pages/Feed'
import { PracticePage } from './pages/Practice'
import { DictionaryPage } from './pages/Dictionary'
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
import { TeacherPage } from './pages/Teacher'
import { flushPendingSwipes } from './store/feed.store'
import { flushOfflineQueue } from './lib/offlineQueue'
import { WORD_SHARE_PREFIX } from '@wordswipe/shared'

type Page = 'feed' | 'practice' | 'dictionary' | 'progress' | 'leaderboard' | 'settings' | 'challenge' | 'quiz' | 'duel' | 'groupchallenge' | 'speaking' | 'mywords' | 'mywordsstudy' | 'shadowing' | 'profile' | 'teacher'

const NAV_PAGES: Page[] = ['feed', 'practice', 'speaking', 'dictionary', 'profile']
const PROFILE_SUBPAGES: Page[] = ['progress', 'leaderboard', 'mywords', 'settings']
// Focused, full-screen sessions hide the (fixed) tab bar — otherwise it overlaps
// their bottom-anchored action buttons. Each has its own in-page back button.
const IMMERSIVE_PAGES: Page[] = ['quiz', 'duel', 'groupchallenge', 'challenge', 'shadowing', 'mywordsstudy', 'teacher']

const DUEL_PREFIX = 'duel_'
const GC_PREFIX = 'gc_'

export default function App() {
  const { user, setUser } = useAuthStore()
  const [page, setPage] = useState<Page>('feed')
  const [duelId, setDuelId] = useState<string | null>(null)
  const [gcId, setGcId] = useState<string | null>(null)
  const [wordShareId, setWordShareId] = useState<string | null>(null)
  const [myWordsShareMode, setMyWordsShareMode] = useState(false)
  const [speakingAuto, setSpeakingAuto] = useState(false)
  const [onboardingDone, setOnboardingDone] = useState(() => !!localStorage.getItem('ws_onboarding_done'))

  useEffect(() => useThemeStore.getState().init(), [])

  const finishOnboarding = (level?: string) => {
    localStorage.setItem('ws_onboarding_done', '1')
    setOnboardingDone(true)
    if (level) {
      localStorage.setItem('ws_level', level)
      setUser({ ...user!, cefrLevel: level, onboardingDone: true })
    } else {
      setUser({ ...user!, onboardingDone: true })
    }
  }

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
    } else if (startParam?.startsWith(WORD_SHARE_PREFIX)) {
      setWordShareId(startParam.slice(WORD_SHARE_PREFIX.length))
      setPage('mywords')
    } else if (startParam === 'speaking') {
      // Opened from the bot's "Start Practice" speaking ping → auto-find a partner
      setSpeakingAuto(true)
      setPage('speaking')
    }
  }, [user])

  if (!user) return <LoginPage />

  // Server-side onboardingDone survives Telegram webview localStorage wipes
  if (user && !user.onboardingDone && !onboardingDone) return (
    <>
      <OnboardingPage
        onDone={(level) => {
          if (level) {
            onboardingApi.complete(level).catch(() => {})
            finishOnboarding(level)
          } else {
            onboardingApi.skip().catch(() => {})
            finishOnboarding()
          }
        }}
      />
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
              onDictionary={() => setPage('dictionary')}
              onProgress={() => setPage('progress')}
            />
          )}
          {page === 'profile' && (
            <ProfilePage
              onProgress={() => setPage('progress')}
              onLeaderboard={() => setPage('leaderboard')}
              onMyWords={() => setPage('mywords')}
              onSettings={() => setPage('settings')}
              onTeacher={() => setPage('teacher')}
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
            <MyWordsPage
              onBack={() => { setWordShareId(null); setMyWordsShareMode(false); setPage('profile') }}
              onMemorize={() => setPage('mywordsstudy')}
              focusShareId={wordShareId}
              onShareModeChange={setMyWordsShareMode}
            />
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
          {page === 'progress' && <ProgressPage onBack={() => setPage('profile')} />}
          {page === 'leaderboard' && <LeaderboardPage onBack={() => setPage('profile')} />}
          {page === 'settings' && <SettingsPage onBack={() => setPage('profile')} />}
          {page === 'teacher' && <TeacherPage onBack={() => setPage('profile')} />}
        </motion.div>
      </AnimatePresence>
      {!IMMERSIVE_PAGES.includes(page) && !(page === 'mywords' && myWordsShareMode) && (
        <BottomNav active={navPage} onChange={(p) => { setSpeakingAuto(false); setPage(p as Page) }} />
      )}
      <ReferralBonusToast />
    </div>
  )
}
