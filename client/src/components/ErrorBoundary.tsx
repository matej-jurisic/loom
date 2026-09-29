import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from '@/components/ui/Button'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Changing this clears a caught error, so navigating away from a broken page recovers. */
  resetKey?: unknown
  /** Fill the whole viewport (app root) instead of just the area it wraps. */
  fullScreen?: boolean
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack)
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div
        role="alert"
        className={`flex flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center ${
          this.props.fullScreen ? 'min-h-screen' : 'h-full'
        }`}
      >
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          This page hit an unexpected error. Your data is safe on the server. Try again, or reload the app.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </div>
      </div>
    )
  }
}
