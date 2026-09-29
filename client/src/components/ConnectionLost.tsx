import { Button } from '@/components/ui/Button'

interface ConnectionLostProps {
  onRetry: () => void
}

/** Shown at startup when the server cannot be reached, instead of dropping a signed-in user on the login page. */
export function ConnectionLost({ onRetry }: ConnectionLostProps) {
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <h1 className="text-lg font-semibold text-foreground">Cannot reach the server</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Check your connection and try again. You are still signed in.
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  )
}
