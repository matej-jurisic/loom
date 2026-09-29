import { WifiOff } from 'lucide-react'
import { useOnline } from '@/lib/useOnline'

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-2 bg-muted px-4 py-1.5 text-xs text-muted-foreground"
    >
      <WifiOff className="h-3.5 w-3.5" strokeWidth={2} />
      You are offline. Changes will not be saved until the connection returns.
    </div>
  )
}
