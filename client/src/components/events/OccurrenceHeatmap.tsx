// Every figure here is a count of things the user actually logged. Nothing is divided by the length
// of a day, and a blank cell means "nothing recorded", not "nothing happened".

/**
 * One day's counts. `GoalHeatmap` (server-built, in the user's day-boundary timezone) is assignable
 * to this; the activity history modal builds the same shape client-side and adds `pending`, which
 * goals have no use for.
 */
export interface HeatmapDayCounts {
  date: string // yyyy-MM-dd
  done: number
  skipped: number
  pending?: number
}

export interface HeatmapWindow {
  start: string // yyyy-MM-dd
  end: string   // yyyy-MM-dd, the day drawn as "today"
  days: HeatmapDayCounts[]
}

interface OccurrenceHeatmapProps {
  heatmap: HeatmapWindow
  /** The accent the scale runs to: a goal's tier colour, an activity's category colour. */
  color: string
  /** Columns to draw, ending on the week containing the payload's "today". */
  weeks: number
  /** Adds the Mon..Sun label column. Costs ~28px of width, so the caller picks `weeks` knowing it. */
  showWeekdays?: boolean
  className?: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Parse a yyyy-MM-dd day key as a local calendar date, never as a UTC instant. */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Monday-first, matching the calendar. */
export function startOfWeek(d: Date): Date {
  const dow = d.getDay()
  return addDays(d, -(dow === 0 ? 6 : dow - 1))
}

// Absolute steps, not a scale relative to the goal's own best day: one busy week should not repaint
// the rest of the history. Skipped shares the activity history strip's grey rather than a red - a
// skip is a day you decided about, not a failure.
function fill(done: number, skipped: number, color: string): string {
  if (done > 0) {
    const pct = done === 1 ? 30 : done === 2 ? 55 : done === 3 ? 78 : 100
    return `color-mix(in srgb, ${color} ${pct}%, var(--color-muted))`
  }
  if (skipped > 0) return 'color-mix(in srgb, var(--color-muted-foreground) 45%, var(--color-muted))'
  return 'var(--color-muted)'
}

/**
 * A day that is only pending is drawn as an outline rather than a fill: it is a plan, not a record,
 * and filling it would read as "this happened". Today's marker wins the ring when they collide -
 * there is only one today, and its position is what makes the rest of the grid readable.
 */
function cellStyle(day: HeatmapDayCounts | undefined, color: string, isToday: boolean) {
  const done = day?.done ?? 0
  const skipped = day?.skipped ?? 0
  const pendingOnly = done === 0 && skipped === 0 && (day?.pending ?? 0) > 0
  return {
    background: pendingOnly ? `color-mix(in srgb, ${color} 12%, var(--color-muted))` : fill(done, skipped, color),
    boxShadow: isToday
      ? 'inset 0 0 0 1px var(--color-muted-foreground)'
      : pendingOnly
        ? `inset 0 0 0 1px color-mix(in srgb, ${color} 55%, transparent)`
        : undefined,
  }
}

function cellTitle(date: Date, day: HeatmapDayCounts | undefined): string {
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  const parts: string[] = []
  if (day && day.done > 0) parts.push(`${day.done} done`)
  if (day && day.skipped > 0) parts.push(`${day.skipped} skipped`)
  if (day?.pending) parts.push(`${day.pending} pending`)
  return parts.length > 0 ? `${label}: ${parts.join(', ')}` : label
}

export function OccurrenceHeatmap({ heatmap, color, weeks, showWeekdays = false, className = '' }: OccurrenceHeatmapProps) {
  const byDay = new Map(heatmap.days.map((d) => [d.date, d]))
  const start = parseDay(heatmap.start)
  const end = parseDay(heatmap.end)
  const todayKey = heatmap.end

  const firstColumn = addDays(startOfWeek(end), -7 * (weeks - 1))

  const columns = Array.from({ length: weeks }, (_, w) => {
    const monday = addDays(firstColumn, 7 * w)
    return { monday, days: Array.from({ length: 7 }, (_, i) => addDays(monday, i)) }
  })

  // Label a column when its month differs from the last labelled one, leaving room so 3-letter
  // labels never collide at narrow cell sizes.
  let lastLabelled = -Infinity
  let prevMonth = -1
  const labels = columns.map((c, i) => {
    const month = c.monday.getMonth()
    const startsMonth = month !== prevMonth
    prevMonth = month
    if (!startsMonth || i - lastLabelled < 3) return ''
    lastLabelled = i
    return MONTHS[month]
  })

  let windowDone = 0
  let windowPending = 0
  for (const day of heatmap.days) {
    const d = parseDay(day.date)
    if (d >= firstColumn && d <= end) {
      windowDone += day.done
      windowPending += day.pending ?? 0
    }
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
    gap: '2px',
  } as const

  return (
    // Full width by design: cell size falls out of the column count, so the caller picks `weeks` to
    // land on a square of roughly 14px at its breakpoint rather than capping the grid and leaving a gap.
    <div className={`flex flex-col gap-1 ${className}`}>
      <div className="flex gap-1">
        {showWeekdays && <span className="w-6 shrink-0" aria-hidden="true" />}
        <div style={gridStyle} className="min-w-0 flex-1 text-[9px] leading-none text-muted-foreground/70">
          {labels.map((l, i) => (
            <span key={i} className="overflow-visible whitespace-nowrap">{l}</span>
          ))}
        </div>
      </div>

      <div className="flex gap-1">
        {/* Rows are 1fr with the same 2px gap, so each label tracks the square beside it whatever
            width the grid ends up at. */}
        {showWeekdays && (
          <div
            className="grid w-6 shrink-0 text-[9px] leading-none text-muted-foreground/70"
            style={{ gridTemplateRows: 'repeat(7, 1fr)', gap: '2px' }}
            aria-hidden="true"
          >
            {WEEKDAYS.map((d) => (
              <span key={d} className="flex items-center justify-end pr-0.5">{d}</span>
            ))}
          </div>
        )}
        <div
          style={{ ...gridStyle, gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, auto)' }}
          className="min-w-0 flex-1"
        >
          {columns.flatMap((c) =>
            c.days.map((date) => {
              const key = keyOf(date)
              // Days outside the window the payload covers, and days still to come, hold their slot
              // without claiming there was nothing there.
              if (date < start || date > end) return <span key={key} className="aspect-square" />
              const day = byDay.get(key)
              return (
                <span
                  key={key}
                  title={cellTitle(date, day)}
                  className="aspect-square rounded-[3px]"
                  style={cellStyle(day, color, key === todayKey)}
                />
              )
            }),
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span>{windowDone} done in {weeks} weeks</span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: fill(0, 1, color) }} /> skipped
        </span>
        {windowPending > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={cellStyle({ date: '', done: 0, skipped: 0, pending: 1 }, color, false)} /> pending
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          less
          {[0, 1, 2, 4].map((n) => (
            <span key={n} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: fill(n, 0, color) }} />
          ))}
          more
        </span>
      </div>
    </div>
  )
}
