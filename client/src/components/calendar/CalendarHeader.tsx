import type { RefObject } from 'react'
import { CalendarCheck, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FoldVertical, Plus, UnfoldVertical } from 'lucide-react'
import { VIEW_OPTIONS, compactTitle, formatDateInput, pageTitle } from '@/lib/calendarDates'
import type { ViewMode } from '@/lib/calendarDates'

// Dial needle angle per range, for the mobile dial control - clockwise as the
// range grows, so cycling forward always reads as "advancing" visually.
const VIEW_ANGLE: Record<ViewMode, number> = { day: 0, '3day': 120, week: 240 }

interface CalendarHeaderProps {
  view: ViewMode
  days: Date[]
  current: Date
  compact: boolean
  datePopOpen: boolean
  onDatePopOpenChange: (open: boolean) => void
  datePopRef: RefObject<HTMLDivElement | null>
  dateInputRef: RefObject<HTMLInputElement | null>
  onPrev: () => void
  onNext: () => void
  onPrevDay: () => void
  onNextDay: () => void
  onToday: () => void
  onPickDate: (d: Date) => void
  onToggleCompact: () => void
  onChangeView: (v: ViewMode) => void
  onCycleView: () => void
  onCreate: () => void
}

export function CalendarHeader({
  view,
  days,
  current,
  compact,
  datePopOpen,
  onDatePopOpenChange,
  datePopRef,
  dateInputRef,
  onPrev,
  onNext,
  onPrevDay,
  onNextDay,
  onToday,
  onPickDate,
  onToggleCompact,
  onChangeView,
  onCycleView,
  onCreate,
}: CalendarHeaderProps) {
  return (
      <header className="relative flex h-[57px] shrink-0 items-center gap-2 border-b border-border px-4 md:gap-3 md:px-6">
        {/* Mobile: date popup trigger */}
        <div className="sm:hidden relative flex-1 min-w-0" ref={datePopRef}>
          <button
            onClick={() => onDatePopOpenChange(!datePopOpen)}
            className="flex items-center gap-1 text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors"
          >
            <span className="truncate">{compactTitle(view, days)}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${datePopOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
          </button>
          {datePopOpen && (
            <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-border bg-card shadow-pop p-3 flex flex-col gap-2">
              {/* Current selection */}
              <p className="text-sm font-semibold text-foreground">{pageTitle(view, days)}</p>
              {/* Nav row */}
              <div className="flex items-center gap-1">
                <button
                  onClick={onPrev}
                  aria-label={view === 'day' ? 'Previous day' : view === '3day' ? 'Back 3 days' : 'Back 7 days'}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {view === 'day' ? <ChevronLeft className="h-4 w-4" strokeWidth={2} /> : <ChevronsLeft className="h-4 w-4" strokeWidth={2} />}
                </button>
                {view !== 'day' && (
                  <button
                    onClick={onPrevDay}
                    aria-label="Back 1 day"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={2} />
                  </button>
                )}
                <div className="flex-1" />
                {view !== 'day' && (
                  <button
                    onClick={onNextDay}
                    aria-label="Forward 1 day"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={2} />
                  </button>
                )}
                <button
                  onClick={onNext}
                  aria-label={view === 'day' ? 'Next day' : view === '3day' ? 'Forward 3 days' : 'Forward 7 days'}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {view === 'day' ? <ChevronRight className="h-4 w-4" strokeWidth={2} /> : <ChevronsRight className="h-4 w-4" strokeWidth={2} />}
                </button>
              </div>
              {/* Today + date picker row */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onToday(); onDatePopOpenChange(false) }}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <CalendarCheck className="h-3.5 w-3.5" strokeWidth={2} />
                  Today
                </button>
                <input
                  type="date"
                  value={formatDateInput(current)}
                  onChange={(e) => {
                    const d = new Date(e.target.value + 'T00:00:00')
                    if (!isNaN(d.getTime())) { onPickDate(d); onDatePopOpenChange(false) }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
                  }}
                  className="flex-1 h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          )}
        </div>

        {/* Desktop: nav + title */}
        <div className="hidden sm:flex items-center gap-0.5">
          <button
            onClick={onPrev}
            aria-label={view === 'day' ? 'Previous day' : view === '3day' ? 'Back 3 days' : 'Back 7 days'}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {view === 'day' ? (
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            ) : (
              <ChevronsLeft className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
          {view !== 'day' && (
            <>
              <button
                onClick={onPrevDay}
                aria-label="Back 1 day"
                className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={2} />
              </button>
              <button
                onClick={onNextDay}
                aria-label="Forward 1 day"
                className="hidden md:flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </button>
            </>
          )}
          <button
            onClick={onNext}
            aria-label={view === 'day' ? 'Next day' : view === '3day' ? 'Forward 3 days' : 'Forward 7 days'}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {view === 'day' ? (
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            ) : (
              <ChevronsRight className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        </div>

        <h1 className="hidden sm:block min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {pageTitle(view, days)}
        </h1>

        <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
          <button
            onClick={onToday}
            className="hidden sm:flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted transition-colors"
          >
            <CalendarCheck className="h-3.5 w-3.5" strokeWidth={2} />
          </button>

          <input
            ref={dateInputRef}
            type="date"
            value={formatDateInput(current)}
            onChange={(e) => {
              const d = new Date(e.target.value + 'T00:00:00')
              if (!isNaN(d.getTime())) onPickDate(d)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
            }}
            className="hidden sm:block h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
          />

          <button
            onClick={onToggleCompact}
            aria-pressed={compact}
            title={compact ? 'Show the full day' : 'Collapse empty hours'}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border transition-colors ${
              compact ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {compact
              ? <UnfoldVertical className="h-3.5 w-3.5" strokeWidth={2} />
              : <FoldVertical className="h-3.5 w-3.5" strokeWidth={2} />}
          </button>

          {/* View switch, desktop: all three ranges visible, so the current one is readable at a glance.
              Below sm there isn't room for three labelled segments next to the fold toggle and +,
              so mobile gets a single dial button instead (below). */}
          <div role="group" aria-label="Calendar range" className="hidden sm:flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-border">
            {VIEW_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onChangeView(value)}
                aria-pressed={view === value}
                className={`h-full px-2.5 text-xs transition-colors ${
                  view === value
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* View switch, mobile: one dial button steps forward through the ranges.
              The needle rotates to the current position instead of listing three labels. */}
          <button
            onClick={onCycleView}
            aria-label={`Calendar range: ${VIEW_OPTIONS.find((o) => o.value === view)?.label}. Tap to change.`}
            className="sm:hidden flex h-8 w-[86px] shrink-0 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground hover:bg-muted transition-colors"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none">
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" className="text-muted-foreground/40" />
              {(['day', '3day', 'week'] as ViewMode[]).map((v) => (
                <line
                  key={v}
                  x1="8" y1="8" x2="8" y2="4"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                  className="text-muted-foreground/40"
                  style={{ transform: `rotate(${VIEW_ANGLE[v]}deg)`, transformOrigin: '8px 8px' }}
                />
              ))}
              <line
                x1="8" y1="8" x2="8" y2="3"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                style={{ transform: `rotate(${VIEW_ANGLE[view]}deg)`, transformOrigin: '8px 8px', transition: 'transform 200ms ease' }}
              />
            </svg>
            {VIEW_OPTIONS.find((o) => o.value === view)?.label}
          </button>

          <button
            onClick={onCreate}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground hover:bg-muted transition-colors"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>

        </div>
      </header>
  )
}
