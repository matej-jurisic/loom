import type { GoalHeatmap } from '@/lib/types'

// Every figure here is a count of things the user actually logged. Nothing is divided by the length
// of a day, and a blank cell means "nothing recorded", not "nothing happened".

interface OccurrenceHeatmapProps {
  heatmap: GoalHeatmap
  /** The goal's tier colour: the scale runs from muted to this. */
  color: string
  /** Columns to draw, ending on the week containing the server's "today". */
  weeks: number
  className?: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Parse a yyyy-MM-dd day key as a local calendar date, never as a UTC instant. */
function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

/** Monday-first, matching the calendar. */
function startOfWeek(d: Date): Date {
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

function cellTitle(date: Date, done: number, skipped: number): string {
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  const parts: string[] = []
  if (done > 0) parts.push(`${done} done`)
  if (skipped > 0) parts.push(`${skipped} skipped`)
  return parts.length > 0 ? `${label}: ${parts.join(', ')}` : label
}

export function OccurrenceHeatmap({ heatmap, color, weeks, className = '' }: OccurrenceHeatmapProps) {
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
  for (const day of heatmap.days) {
    const d = parseDay(day.date)
    if (d >= firstColumn && d <= end) windowDone += day.done
  }

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`,
    gap: '2px',
  } as const

  return (
    // Capped so the squares stay squares rather than growing into blocks on a wide card.
    <div className={`flex flex-col gap-1 ${className}`} style={{ maxWidth: weeks * 15 }}>
      <div style={gridStyle} className="text-[9px] leading-none text-muted-foreground/70">
        {labels.map((l, i) => (
          <span key={i} className="overflow-visible whitespace-nowrap">{l}</span>
        ))}
      </div>

      <div style={{ ...gridStyle, gridAutoFlow: 'column', gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`, gridTemplateRows: 'repeat(7, auto)' }}>
        {columns.flatMap((c) =>
          c.days.map((date) => {
            const key = keyOf(date)
            // Days outside the window the server sent, and days still to come, hold their slot
            // without claiming there was nothing there.
            if (date < start || date > end) return <span key={key} className="aspect-square" />
            const entry = byDay.get(key)
            const done = entry?.done ?? 0
            const skipped = entry?.skipped ?? 0
            return (
              <span
                key={key}
                title={cellTitle(date, done, skipped)}
                className="aspect-square rounded-[3px]"
                style={{
                  background: fill(done, skipped, color),
                  boxShadow: key === todayKey ? 'inset 0 0 0 1px var(--color-muted-foreground)' : undefined,
                }}
              />
            )
          }),
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span>{windowDone} done in {weeks} weeks</span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: fill(0, 1, color) }} /> skipped
        </span>
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
