import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { tryRefresh } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { AppShell } from '@/components/layout/AppShell'
import { ConnectionLost } from '@/components/ConnectionLost'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { PlanPage } from '@/pages/PlanPage'
import { GoalsPage } from '@/pages/GoalsPage'
import { CategoriesPage } from '@/pages/CategoriesPage'
import { CalendarPage } from '@/pages/CalendarPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ActivitiesPage } from '@/pages/ActivitiesPage'
import { InsightsPage } from '@/pages/InsightsPage'

function AppRoutes() {
  const { status, setStatus } = useAuthStore()
  const location = useLocation()
  const [unreachable, setUnreachable] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setUnreachable(false)
    tryRefresh().then((outcome) => {
      if (outcome === 'denied') setStatus('unauthenticated')
      else if (outcome === 'unreachable') setUnreachable(true)
    })
  }, [setStatus, attempt])

  if (status === 'loading' && unreachable) {
    return <ConnectionLost onRetry={() => setAttempt((n) => n + 1)} />
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <AppShell>
      {/* Inside the shell so a crashing page leaves the navigation usable; resets on navigation. */}
      <ErrorBoundary resetKey={location.pathname}>
        <Routes>
          <Route path="/plan"     element={<PlanPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/inbox"    element={<Navigate to="/categories" replace />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/goals"         element={<GoalsPage />} />
          <Route path="/activities"     element={<ActivitiesPage />} />
          <Route path="/insights"   element={<InsightsPage />} />
          <Route path="/settings"   element={<SettingsPage />} />
          <Route path="/"       element={<Navigate to="/plan" replace />} />
          <Route path="*"       element={<Navigate to="/plan" replace />} />
        </Routes>
      </ErrorBoundary>
    </AppShell>
  )
}

export default function App() {
  return <AppRoutes />
}
