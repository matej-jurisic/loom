import { describe, expect, it } from 'vitest'
import type { Occurrence } from './types'
import { linearScale } from './timeScale'
import {
  DUE_SPAN_MINUTES,
  MIN_EVENT_PX,
  dragStartFor,
  dueRowRef,
  isDueOccurrence,
  isEODDue,
  layoutDay,
  occursOnDay,
  packColumns,
  snapToGrid,
  snapToGridDue,
} from './calendarLayout'

const day = new Date(2026, 6, 7)

function at(h: number, m = 0, base = day): string {
  const d = new Date(base)
  d.setHours(h, m, 0, 0)
  return d.toISOString()
}

function occ(id: string, startAt: string | null, endAt: string | null): Occurrence {
  return { id, startAt, endAt } as Occurrence
}

describe('packColumns', () => {
  it('puts disjoint spans in one column each', () => {
    const cols = packColumns([{ s: 0, end: 60 }, { s: 60, end: 120 }])

    expect(cols).toEqual([{ col: 0, totalCols: 1 }, { col: 0, totalCols: 1 }])
  })

  it('places overlapping spans side by side', () => {
    const cols = packColumns([{ s: 0, end: 90 }, { s: 30, end: 120 }])

    expect(cols).toEqual([{ col: 0, totalCols: 2 }, { col: 1, totalCols: 2 }])
  })

  it('shares one divisor across a cluster whose columns were recycled', () => {
    const cols = packColumns([
      { s: 0, end: 100 },
      { s: 10, end: 50 },
      { s: 60, end: 120 },
    ])

    expect(cols.map((c) => c.totalCols)).toEqual([2, 2, 2])
    expect(cols[2].col).toBe(1)
  })

  it('starts a fresh cluster after a gap', () => {
    const cols = packColumns([{ s: 0, end: 60 }, { s: 10, end: 50 }, { s: 200, end: 260 }])

    expect(cols.map((c) => c.totalCols)).toEqual([2, 2, 1])
  })
})

describe('layoutDay', () => {
  const scale = linearScale(64)

  it('positions an event by its start and duration', () => {
    const { events } = layoutDay([occ('a', at(10), at(12))], day, scale)

    expect(events).toHaveLength(1)
    expect(events[0].topPx).toBe(10 * 64)
    expect(events[0].heightPx).toBe(2 * 64)
    expect(events[0].trueEndPx).toBe(12 * 64)
  })

  it('inflates a short event to the minimum height but keeps its true end', () => {
    const { events } = layoutDay([occ('a', at(10), at(10, 15))], day, scale)

    expect(events[0].heightPx).toBe(Math.max(MIN_EVENT_PX, 0.25 * 64))
    expect(events[0].trueEndPx).toBe(10 * 64 + 0.25 * 64)
  })

  it('gives a due pin its exact fixed span', () => {
    const { events } = layoutDay([occ('a', at(9), null)], day, scale)

    expect(events[0].heightPx).toBe((DUE_SPAN_MINUTES / 60) * 64)
  })

  it('clips an event that crosses midnight to the day', () => {
    const next = new Date(day)
    next.setDate(next.getDate() + 1)
    const { events } = layoutDay([occ('a', at(23), at(1, 0, next))], day, scale)

    expect(events[0].topPx).toBe(23 * 64)
    expect(events[0].trueEndPx).toBe(24 * 64)
  })

  it('skips occurrences without a start', () => {
    expect(layoutDay([occ('a', null, at(10))], day, scale).events).toHaveLength(0)
  })
})

describe('due helpers', () => {
  it('treats start-without-end as a due pin', () => {
    expect(isDueOccurrence(occ('a', at(9), null))).toBe(true)
    expect(isDueOccurrence(occ('a', at(9), at(10)))).toBe(false)
    expect(isDueOccurrence(occ('a', null, at(10)))).toBe(false)
  })

  it('flags end-of-day pins from 23:30', () => {
    expect(isEODDue(occ('a', at(23, 30), null))).toBe(true)
    expect(isEODDue(occ('a', at(23, 29), null))).toBe(false)
    expect(isEODDue(occ('a', at(23, 45), at(23, 55)))).toBe(false)
  })

  it('references the start, then the end, else nothing', () => {
    expect(dueRowRef(occ('a', at(9), at(10)))).toBe(at(9))
    expect(dueRowRef(occ('a', null, at(10)))).toBe(at(10))
    expect(dueRowRef(occ('a', null, null))).toBeNull()
  })
})

describe('snapToGrid', () => {
  const scale = linearScale(60)

  it('snaps to the nearest quarter hour', () => {
    expect(snapToGrid(day, 7 * 60 + 8, scale)).toEqual(new Date(2026, 6, 7, 7, 15))
    expect(snapToGrid(day, 7 * 60 + 7, scale)).toEqual(new Date(2026, 6, 7, 7, 0))
  })

  it('rolls the hour over when the minutes round up to 60', () => {
    expect(snapToGrid(day, 9 * 60 + 53, scale)).toEqual(new Date(2026, 6, 7, 10, 0))
  })

  it('wraps to the next midnight past 23:52', () => {
    expect(snapToGrid(day, 23 * 60 + 55, scale)).toEqual(new Date(2026, 6, 8, 0, 0))
  })
})

describe('snapToGridDue', () => {
  const scale = linearScale(60)

  it('snaps to end of day instead of wrapping', () => {
    expect(snapToGridDue(day, 23 * 60 + 55, scale)).toEqual(new Date(2026, 6, 7, 23, 59))
  })

  it('snaps like the plain grid otherwise', () => {
    expect(snapToGridDue(day, 7 * 60 + 8, scale)).toEqual(new Date(2026, 6, 7, 7, 15))
  })
})

describe('dragStartFor', () => {
  const scale = linearScale(60)

  it('holds a block inside the day by its end', () => {
    const start = dragStartFor(day, 23 * 60, scale, 2 * 3600000)

    expect(start).toEqual(new Date(2026, 6, 7, 22, 0))
  })

  it('leaves a block that already fits where it snapped', () => {
    expect(dragStartFor(day, 10 * 60, scale, 3600000)).toEqual(new Date(2026, 6, 7, 10, 0))
  })
})

describe('occursOnDay', () => {
  const start = new Date(2026, 6, 7).getTime()
  const end = new Date(2026, 6, 8).getTime()

  it('shows a span that overlaps the day', () => {
    expect(occursOnDay(occ('a', at(10), at(11)), start, end)).toBe(true)
  })

  it('hides a span on another day', () => {
    const other = new Date(2026, 6, 9)
    expect(occursOnDay(occ('a', at(10, 0, other), at(11, 0, other)), start, end)).toBe(false)
  })

  it('shows a due pin only on the day its start falls in', () => {
    const other = new Date(2026, 6, 8)
    expect(occursOnDay(occ('a', at(10), null), start, end)).toBe(true)
    expect(occursOnDay(occ('a', at(10, 0, other), null), start, end)).toBe(false)
  })

  it('keeps end-of-day pins out of the grid', () => {
    expect(occursOnDay(occ('a', at(23, 45), null), start, end)).toBe(false)
  })

  it('hides occurrences without a start', () => {
    expect(occursOnDay(occ('a', null, at(10)), start, end)).toBe(false)
  })
})
