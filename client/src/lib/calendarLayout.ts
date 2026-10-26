import type { CSSProperties } from 'react'
import type { CalendarColorBy, Occurrence } from '@/lib/types'
import type { TimeScale } from '@/lib/timeScale'
import { eodMs, sod, wallMinute } from '@/lib/calendarDates'

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

/**
 * Lays out one day's events, packing transitively-overlapping spans into shared columns.
 * Due pins are a moment, not a span, so they take no part in that packing: each is a line
 * across the column with a pill hanging from it, and only pins whose pills would collide
 * are packed against each other.
 */
export function layoutDay(events: Occurrence[], day: Date, scale: TimeScale): DayLayout {
  const dayStartMs = sod(day).getTime()
  const hourPx = scale.hourPx

  const timed = events.filter((e) => !!e.startAt)

  const eventItems = timed
    .filter((e) => !isDueOccurrence(e))
    .map((e) => {
      const startMs = new Date(e.startAt!).getTime()
      const endMs = new Date(e.endAt!).getTime()
      // Clip to this day's boundaries (handles cross-midnight events)
      const clipStartMin = Math.max(wallMinute(startMs, dayStartMs), 0)
      const clipEndMin = Math.min(wallMinute(endMs, dayStartMs), 24 * 60)
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
      heightPx: Math.max(spanPx, MIN_EVENT_PX),
      trueEndPx: topPx + spanPx,
    }
  })

  const pins = timed
    .filter(isDueOccurrence)
    .map((e) => {
      const min = Math.max(0, Math.min(wallMinute(new Date(e.startAt!).getTime(), dayStartMs), 24 * 60))
      return { event: e, topPx: scale.toPx(min) }
    })
    .sort((a, b) => a.topPx - b.topPx)
  const pinCols = packColumns(pins.map((p) => ({ s: p.topPx, end: p.topPx + DUE_PIN_PX })))
  const pinLayout: LayoutEvent[] = pins.map((p, k) => ({
    event: p.event,
    ...pinCols[k],
    topPx: p.topPx,
    heightPx: DUE_PIN_PX,
    trueEndPx: p.topPx + DUE_PIN_PX,
  }))

  return { events: [...eventLayout, ...pinLayout] }
}

// ── Due occurrence helper ───────────────────────────────────────────────────

// A due pin's pill hangs this far below its line, whatever the zoom: it marks a moment,
// so it has no span to scale with.
export const DUE_PIN_PX = 14

// The "Due" option of the event modal's type picker: one date and no span. Same test the
// modal uses to pick that segment when it opens an occurrence, so the Plan's Deadlines section
// and the deadline picker list exactly what the modal calls Due - including the end-only shape.
// The server's deadline validation applies the same test.
export function isDue(o: Occurrence): boolean {
  return (o.startAt === null) !== (o.endAt === null)
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

/**
 * The colour an occurrence is drawn in. Colouring by goal uses the activity's goal colour only when
 * its coloured goals agree on one; none, or two different ones, falls back to the category, so an
 * activity shared by two courses never picks one of them arbitrarily.
 */
export function occurrenceColor(o: Occurrence, by: CalendarColorBy): string | null {
  if (by === 'goal') {
    const colors = new Set(o.activity.goals.flatMap((g) => (g.color ? [g.color] : [])))
    if (colors.size === 1) return [...colors][0]
  }
  return o.activity.category?.color ?? null
}

export type EventColors = { bgClass: string; bgHex?: string; leftColor: string; textClass: string }

export function eventColors(o: Occurrence, by: CalendarColorBy): EventColors {
  const color = occurrenceColor(o, by)
  if (color) {
    return {
      bgClass: '',
      bgHex: color,
      leftColor: color,
      textClass: 'text-foreground',
    }
  }
  return { bgClass: 'bg-muted', leftColor: 'var(--color-border)', textClass: 'text-foreground' }
}

export function eventAllDayColors(o: Occurrence, by: CalendarColorBy): { className: string; style?: CSSProperties } {
  // Skipped: an empty grey outline, matching the grid's skipped block.
  if (o.status === 'skipped') return { className: 'border border-muted-foreground/40 text-muted-foreground' }
  const color = occurrenceColor(o, by)
  const plannedBorder = o.isPlanned ? { border: `1px dashed ${color ?? 'var(--color-primary)'}` } : undefined
  if (color) {
    return { className: 'text-foreground', style: { backgroundColor: color + '26', ...plannedBorder } }
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
  const latest = Math.max(dayStartMs, eodMs(dayStartMs) - durationMs)
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

/** Goal names after the title, so same-titled occurrences in different goals ("Lab 2") stay apart. */
/** The effective title with the activity's short label appended. */
export function labelledTitle(o: Occurrence): string {
  return o.activity.shortLabel ? `${o.effectiveTitle} ${o.activity.shortLabel}` : o.effectiveTitle
}

export function titleWithGoals(o: Occurrence): string {
  const goals = o.activity.goals.map((g) => g.title).join(', ')
  return goals ? `${labelledTitle(o)} · ${goals}` : labelledTitle(o)
}

export function calendarTitle(o: Occurrence): string {
  const title = titleWithGoals(o)
  return [o.status === 'skipped' ? `× ${title}` : title, ...o.effectiveTags.map((t) => `#${t.name}`)].join(' ')
}
