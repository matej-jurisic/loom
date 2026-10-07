import type { CSSProperties } from 'react'
import type { Occurrence } from '@/lib/types'
import type { TimeScale } from '@/lib/timeScale'
import { sod } from '@/lib/calendarDates'

export const MIN_EVENT_PX = 16

// ── Layout algorithm ────────────────────────────────────────────────────────

export interface LayoutEvent {
  event: Occurrence
  col: number
  totalCols: number
  topPx: number
  heightPx: number
  trueEndPx: number
}

/**
 * Greedy side-by-side packing for overlapping spans (minutes from day start).
 * Items must be sorted by start; returns each item's column and the divisor its
 * width should use.
 *
 * Blocks are positioned on a global `col / totalCols` percentage grid, so every
 * item in a cluster of transitively-overlapping events must share one
 * `totalCols` — deriving it from an item's direct neighbours understates it
 * whenever a column was recycled after a gap, and the blocks then overlap.
 */
export function packColumns(items: { s: number; end: number }[]): { col: number; totalCols: number }[] {
  const result: { col: number; totalCols: number }[] = []
  const colEnds: number[] = []
  let cluster: number[] = []
  let clusterEnd = -Infinity

  function flush() {
    const total = colEnds.length || 1
    for (const i of cluster) result[i].totalCols = total
    cluster = []
    colEnds.length = 0
  }

  items.forEach((it, i) => {
    // Starts at or after every span seen so far ends → disjoint, start a cluster
    if (it.s >= clusterEnd) flush()
    let c = colEnds.findIndex((e) => e <= it.s)
    if (c === -1) {
      c = colEnds.length
      colEnds.push(it.end)
    } else {
      colEnds[c] = it.end
    }
    result[i] = { col: c, totalCols: 0 }
    cluster.push(i)
    clusterEnd = Math.max(clusterEnd, it.end)
  })
  flush()

  return result
}

export interface DayLayout {
  events: LayoutEvent[]
}

/** Lays out one day's events, packing transitively-overlapping spans into shared columns. */
export function layoutDay(events: Occurrence[], day: Date, scale: TimeScale): DayLayout {
  const dayStartMs = sod(day).getTime()
  const hourPx = scale.hourPx

  const eventItems = events
    .filter((e) => !!e.startAt)
    .map((e) => {
      const startMs = new Date(e.startAt!).getTime()
      const endMs = e.endAt ? new Date(e.endAt).getTime() : startMs + DUE_SPAN_MINUTES * 60 * 1000
      // Clip to this day's boundaries (handles cross-midnight events)
      const clipStartMin = Math.max((startMs - dayStartMs) / 60000, 0)
      const clipEndMin = Math.min((endMs - dayStartMs) / 60000, 24 * 60)
      const s = Math.round(clipStartMin)
      const end = Math.max(Math.round(clipEndMin), s + 15)
      return { event: e, s, end: Math.min(end, 24 * 60) }
    })
    .filter((it) => it.s < 24 * 60 && it.end > it.s)

  const merged = eventItems
    .map((it, i) => ({ s: it.s, end: it.end, i }))
    .sort((a, b) => a.s - b.s)

  const cols = packColumns(merged)

  const eventLayout: LayoutEvent[] = merged.map((m, k) => {
    const { col, totalCols } = cols[k]
    const { event, s, end } = eventItems[m.i]
    // Only the top is scale-dependent: an event's own span always falls inside an
    // expanded segment, so its height is linear in both modes.
    const topPx = scale.toPx(s)
    const spanPx = ((end - s) / 60) * hourPx
    return {
      event,
      col,
      totalCols,
      topPx,
      // Due pins keep their exact 30-minute height so they scale with zoom
      heightPx: isDueOccurrence(event) ? spanPx : Math.max(spanPx, MIN_EVENT_PX),
      trueEndPx: topPx + spanPx,
    }
  })

  return { events: eventLayout }
}

// ── Due occurrence helper ───────────────────────────────────────────────────

// Due pins render as a 30-minute block: the smallest span that stays readable
// at max zoom out (30 min at MIN_HOUR_PX = 16px), scaling up with zoom.
export const DUE_SPAN_MINUTES = 30

export function duePinHeight(hourPx: number): number {
  return (DUE_SPAN_MINUTES / 60) * hourPx
}

export function isDueOccurrence(o: Occurrence): boolean {
  return !!o.startAt && !o.endAt
}

// The date the Due row sorts and labels a straggler by. Falls back to endAt so a
// deadline-only occurrence (end, no start) is carried too - those are exactly the
// ones you least want to lose track of. Null means fully floating: the FLOAT row's job.
export function dueRowRef(o: Occurrence): string | null {
  return o.startAt ?? o.endAt ?? null
}

export function isEODDue(o: Occurrence): boolean {
  if (!isDueOccurrence(o)) return false
  const d = new Date(o.startAt!)
  return d.getHours() > 23 || (d.getHours() === 23 && d.getMinutes() >= 30)
}

// ── Event coloring ──────────────────────────────────────────────────────────

export type EventColors = { bgClass: string; bgHex?: string; leftColor: string; textClass: string }

export function eventColors(o: Occurrence): EventColors {
  const category = o.activity.category
  if (category) {
    return {
      bgClass: '',
      bgHex: category.color,
      leftColor: category.color,
      textClass: 'text-foreground',
    }
  }
  return { bgClass: 'bg-muted', leftColor: 'var(--color-border)', textClass: 'text-foreground' }
}

export function eventAllDayColors(o: Occurrence): { className: string; style?: CSSProperties } {
  const category = o.activity.category
  const plannedBorder = o.isPlanned ? { border: `1px dashed ${category?.color ?? 'var(--color-primary)'}` } : undefined
  if (category) {
    return { className: 'text-foreground', style: { backgroundColor: category.color + '26', ...plannedBorder } }
  }
  return { className: 'bg-primary/10 text-primary', style: plannedBorder }
}

// ── snapToGrid ──────────────────────────────────────────────────────────────

export function snapToGrid(day: Date, yPx: number, scale: TimeScale): Date {
  const totalMin = scale.toMin(yPx)
  const hrs = Math.floor(totalMin / 60)
  const snapMins = Math.round((totalMin % 60) / 15) * 15
  const d = new Date(day)
  if (snapMins >= 60) {
    if (hrs >= 23) {
      // Past 23:52.5 → snap to midnight (start of next day)
      d.setDate(d.getDate() + 1)
      d.setHours(0, 0, 0, 0)
    } else {
      d.setHours(hrs + 1, 0, 0, 0)
    }
  } else {
    d.setHours(Math.min(hrs, 23), snapMins, 0, 0)
  }
  return d
}

export function snapToGridDue(day: Date, yPx: number, scale: TimeScale): Date {
  const totalMin = scale.toMin(yPx)
  const hrs = Math.floor(totalMin / 60)
  const snapMins = Math.round((totalMin % 60) / 15) * 15
  const d = new Date(day)
  if (snapMins >= 60) {
    // Past 23:52.5 → snap to EOD instead of wrapping back to 23:00
    d.setHours(hrs >= 23 ? 23 : hrs + 1, hrs >= 23 ? 59 : 0, 0, 0)
  } else {
    d.setHours(Math.min(hrs, 23), snapMins, 0, 0)
  }
  return d
}

/**
 * Start time for a dragged block, snapped, then held inside the day by its *end*
 * rather than by the pointer. Clamping the pointer alone stops the drag as soon
 * as the cursor reaches midnight, which leaves the block's tail hanging past it
 * whenever the grab was above the block's middle - the deeper you grab, the more
 * hangs over. Clamping the end instead makes the block stop where it looks like
 * it should. The final clamp is in the time domain, not pixels, because snapping
 * to the quarter hour can round back up over a pixel limit.
 */
export function dragStartFor(day: Date, topPx: number, scale: TimeScale, durationMs: number): Date {
  const snapped = snapToGrid(day, topPx, scale)
  const dayStartMs = sod(day).getTime()
  const latest = Math.max(dayStartMs, dayStartMs + 86400000 - durationMs)
  return snapped.getTime() > latest ? new Date(latest) : snapped
}

// ── DayColumn ────────────────────────────────────────────────────────────────

/**
 * Does this occurrence render in the given day's grid column? Shared by the
 * column and by the compact scale builder, which has to reserve room for exactly
 * the events the column will draw.
 */
export function occursOnDay(e: Occurrence, dayStartMs: number, dayEndMs: number): boolean {
  if (!e.startAt) return false
  // EOD due pins never render in the grid; they live in the sticky Due row
  if (isEODDue(e)) return false
  const startMs = new Date(e.startAt).getTime()
  // Due pins are point-in-time — only show in the day their start falls in
  if (!e.endAt) return startMs >= dayStartMs && startMs < dayEndMs
  return startMs < dayEndMs && new Date(e.endAt).getTime() > dayStartMs
}
