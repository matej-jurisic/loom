export type ViewMode = 'day' | '3day' | 'week'

export const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: '3day', label: '3 days' },
  { value: 'week', label: 'Week' },
]

export function sod(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  return r
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export function startOfWeek(d: Date): Date {
  const r = new Date(d)
  const dow = r.getDay()
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1))
  r.setHours(0, 0, 0, 0)
  return r
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function effectiveAllDayEnd(e: { startAt: string | null; endAt: string | null }): number {
  return e.endAt ? new Date(e.endAt).getTime() : new Date(e.startAt!).getTime() + 86400000
}

export function getEventDayRange(e: { startAt: string | null; endAt: string | null }, days: Date[]): { startIdx: number; endIdx: number } {
  const startMs = new Date(e.startAt!).getTime()
  const endMs = effectiveAllDayEnd(e)
  const viewStart = days[0].getTime()
  const dayMs = 86400000
  const startIdx = Math.max(0, Math.round((startMs - viewStart) / dayMs))
  const endIdx = Math.min(days.length, Math.round((endMs - viewStart) / dayMs))
  return { startIdx, endIdx }
}

export function assignAllDayRows(events: { id: string; startAt: string | null; endAt: string | null }[], days: Date[]): Array<{ id: string; row: number; startIdx: number; endIdx: number }> {
  const rowEnds: number[] = []
  return events.map((e) => {
    const { startIdx, endIdx } = getEventDayRange(e, days)
    let row = rowEnds.findIndex((end) => end <= startIdx)
    if (row === -1) {
      row = rowEnds.length
      rowEnds.push(endIdx)
    } else {
      rowEnds[row] = endIdx
    }
    return { id: e.id, row, startIdx, endIdx }
  })
}

export function formatDatetimeLocal(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}

export function formatDateInput(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

// ── Label helpers ──────────────────────────────────────────────────────────

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}

export function timeLabel(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function pageTitle(view: ViewMode, days: Date[]): string {
  if (view === 'day') {
    return days[0].toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }
  const f = days[0]
  const l = days[days.length - 1]
  if (f.getFullYear() !== l.getFullYear()) {
    return `${f.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${l.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  if (f.getMonth() !== l.getMonth()) {
    return `${f.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${l.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${l.getFullYear()}`
  }
  return `${f.toLocaleDateString('en-US', { month: 'long' })} ${f.getDate()} – ${l.getDate()}, ${l.getFullYear()}`
}

export function compactTitle(view: ViewMode, days: Date[]): string {
  if (view === 'day') {
    return days[0].toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
  const f = days[0]
  const l = days[days.length - 1]
  if (f.getMonth() === l.getMonth() && f.getFullYear() === l.getFullYear()) {
    return `${f.toLocaleDateString('en-US', { month: 'short' })} ${f.getDate()}-${l.getDate()}`
  }
  return `${f.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${l.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export function dayHeader(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })
}
