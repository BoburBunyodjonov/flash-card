import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuthStore } from './store/auth.store'
import { BottomNav } from './components/BottomNav'
import { LoginPage } from './pages/Login'
import { FeedPage } from './pages/Feed'
import { DictionaryPage } from './pages/Dictionary'
import { DecksPage } from './pages/Decks'
import { ProgressPage } from './pages/Progress'
import { LeaderboardPage } from './pages/Leaderboard'
import { SettingsPage } from './pages/Settings'

const PAGES: Record<string, React.ReactNode> = {
  feed: <FeedPage />,
  dictionary: <DictionaryPage />,
  decks: <DecksPage />,
  progress: <ProgressPage />,
  leaderboard: <LeaderboardPage />,
  settings: <SettingsPage />,
}

export default function App() {
  const { user } = useAuthStore()
  const [page, setPage] = useState('feed')

  if (!user) return <LoginPage />

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
          {PAGES[page]}
        </motion.div>
      </AnimatePresence>
      <BottomNav active={page} onChange={setPage} />
    </div>
  )
}
