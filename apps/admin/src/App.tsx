import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { theme } from './theme'
import { useAuthStore } from './store/auth.store'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { WordsPage } from './pages/Words'
import { CategoriesPage } from './pages/Categories'
import { UsersPage } from './pages/Users'
import { PlanSettingsPage } from './pages/PlanSettings'
import { AnalyticsPage } from './pages/Analytics'
import { NotificationsPage } from './pages/Notifications'
import { SpeakingPage } from './pages/Speaking'
import { ShadowingPage } from './pages/Shadowing'

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuthStore()
  const hasToken = Boolean(token ?? localStorage.getItem('admin_token'))
  if (!user?.isAdmin || !hasToken) return <Navigate to="/login" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {/* base is '/admin/' in prod — keeps SPA routes at /admin/words etc. so reloads hit the right Caddy block */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAdmin><DashboardPage /></RequireAdmin>} />
          <Route path="/words" element={<RequireAdmin><WordsPage /></RequireAdmin>} />
          <Route path="/categories" element={<RequireAdmin><CategoriesPage /></RequireAdmin>} />
          <Route path="/users" element={<RequireAdmin><UsersPage /></RequireAdmin>} />
          <Route path="/settings" element={<RequireAdmin><PlanSettingsPage /></RequireAdmin>} />
          <Route path="/analytics" element={<RequireAdmin><AnalyticsPage /></RequireAdmin>} />
          <Route path="/notifications" element={<RequireAdmin><NotificationsPage /></RequireAdmin>} />
          <Route path="/speaking" element={<RequireAdmin><SpeakingPage /></RequireAdmin>} />
          <Route path="/shadowing" element={<RequireAdmin><ShadowingPage /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
