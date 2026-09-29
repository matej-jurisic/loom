import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { OfflineBanner } from './OfflineBanner'
import { Toasts } from '@/components/ui/Toasts'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <OfflineBanner />
        {children}
        <BottomNav />
      </div>
      <Toasts />
    </div>
  )
}
