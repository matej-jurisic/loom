import { describe, expect, it } from 'vitest'
import type { Activity, Occurrence } from './types'
import {
  NONE_BUCKET,
  NONE_FILTER,
  classify,
  filterOccurrences,
  formatOccurrenceDate,
  groupOccurrences,
  type OccurrenceFilters,
} from './occurrenceView'

const now = new Date(2026, 9, 7, 12, 0)

function activity(over: Partial<Activity> = {}): Activity {
  return {
    id: 'a1',
    userId: 'u',
    title: 'CS101 Lecture',
    categoryId: null,
    kind: 'activity',
    createdAt: '2026-01-01T00:00:00Z',
    category: null,
    goals: [],
    tags: [],
    subtasks: [],
    workTypes: [],
    repeatAfterDays: null,
    recentOccurrenceCount: 0,
    ...over,
  }
}

let seq = 0
function occ(over: Partial<Occurrence> = {}, act: Partial<Activity> = {}): Occurrence {
  seq += 1
  const a = activity(act)
  return {
    id: `o${seq}`,
    userId: 'u',
    activityId: a.id,
    title: null,
    notes: null,
    effectiveTitle: `Item ${seq}`,
    startAt: null,
    endAt: null,
    status: 'pending',
    isAllDay: false,
    isPlanned: false,
    createdAt: '2026-01-01T00:00:00Z',
    isOverdue: false,
    isBehind: false,
    subtasks: [],
    timeSplit: [],
    activity: a,
    deadlineOccurrenceId: null,
    deadline: null,
    linkedDoneCount: 0,
    linkedDoneMinutes: 0,
    ...over,
  }
}

const at = (d: number, h = 9) => new Date(2026, 9, d, h, 0).toISOString()

const none: OccurrenceFilters = { status: 'all', category: null, tag: null, goal: null, search: '' }

describe('classify', () => {
  it('puts finished occurrences in done whatever their date', () => {
    expect(classify(occ({ status: 'done', startAt: at(7) }), now)).toBe('done')
    expect(classify(occ({ status: 'skipped' }), now)).toBe('done')
  })

  it('lets planned beat overdue and floating beat nothing but planned', () => {
    expect(classify(occ({ isPlanned: true, isOverdue: true }), now)).toBe('planned')
    expect(classify(occ(), now)).toBe('floating')
    expect(classify(occ({ isOverdue: true, startAt: at(1) }), now)).toBe('overdue')
  })

  it('splits dated pending ones at the end of today', () => {
    expect(classify(occ({ startAt: at(7, 20) }), now)).toBe('today')
    expect(classify(occ({ startAt: at(8, 0) }), now)).toBe('upcoming')
  })
})

describe('formatOccurrenceDate', () => {
  it('uses a 24 hour clock and names today and tomorrow', () => {
    const o = occ({ startAt: at(7, 15), endAt: at(7, 16) })
    expect(formatOccurrenceDate(o, now)).toBe('Today, 15:00 - 16:00')
    expect(formatOccurrenceDate(occ({ startAt: at(8, 9) }), now)).toBe('Tomorrow, 09:00')
  })

  it('handles date-only, due-only and undated', () => {
    expect(formatOccurrenceDate(occ({ startAt: at(7), isAllDay: true }), now)).toBe('Today, Date only')
    expect(formatOccurrenceDate(occ({ endAt: at(7, 18) }), now)).toBe('Today, Due 18:00')
    expect(formatOccurrenceDate(occ(), now)).toBe('')
  })
})

describe('filterOccurrences', () => {
  const cs = { id: 't1', name: 'CS101' }
  const math = { id: 't2', name: 'Math' }
  const rows = [
    occ({ effectiveTitle: 'Lecture 1' }, { tags: [cs] }),
    occ({ effectiveTitle: 'HW 1', status: 'done' }, { id: 'a2', title: 'CS101 Homework', tags: [cs] }),
    occ({ effectiveTitle: 'Calc' }, { id: 'a3', title: 'Math Lecture', tags: [math] }),
    occ({ effectiveTitle: 'Run' }, { id: 'a4', title: 'Run' }),
  ]

  it('filters by status', () => {
    expect(filterOccurrences(rows, { ...none, status: 'open' })).toHaveLength(3)
    expect(filterOccurrences(rows, { ...none, status: 'done' })).toHaveLength(1)
    expect(filterOccurrences(rows, { ...none, status: 'skipped' })).toHaveLength(0)
  })

  it('combines tag and status', () => {
    const result = filterOccurrences(rows, { ...none, status: 'open', tag: 't1' })
    expect(result.map((o) => o.effectiveTitle)).toEqual(['Lecture 1'])
  })

  it('treats "none" as the absence of the attribute', () => {
    expect(filterOccurrences(rows, { ...none, tag: NONE_FILTER }).map((o) => o.effectiveTitle)).toEqual(['Run'])
    expect(filterOccurrences(rows, { ...none, category: NONE_FILTER })).toHaveLength(4)
  })

  it('searches titles, tag names and notes', () => {
    expect(filterOccurrences(rows, { ...none, search: 'cs101' })).toHaveLength(2)
    expect(filterOccurrences(rows, { ...none, search: 'calc' })).toHaveLength(1)
    expect(filterOccurrences([occ({ notes: 'bring laptop' })], { ...none, search: 'laptop' })).toHaveLength(1)
  })
})

describe('groupOccurrences', () => {
  const cs = { id: 't1', name: 'CS101' }
  const math = { id: 't2', name: 'Math' }

  it('orders the when buckets and drops empty ones', () => {
    const rows = [
      occ({ status: 'done' }),
      occ({ startAt: at(20) }),
      occ({ isOverdue: true, startAt: at(1) }),
    ]
    const sections = groupOccurrences(rows, 'when', now)
    expect(sections.map((s) => s.key)).toEqual(['overdue', 'upcoming', 'done'])
    expect(sections[0].tone).toBe('overdue')
  })

  it('lists an occurrence under every tag and puts untagged last', () => {
    const rows = [
      occ({ effectiveTitle: 'Both' }, { tags: [math, cs] }),
      occ({ effectiveTitle: 'Untagged' }, { id: 'a2' }),
    ]
    const sections = groupOccurrences(rows, 'tag', now)
    expect(sections.map((s) => s.label)).toEqual(['CS101', 'Math', 'No tag'])
    expect(sections[0].items.map((o) => o.effectiveTitle)).toEqual(['Both'])
    expect(sections[2].key).toBe(NONE_BUCKET)
  })

  it('groups by activity and sorts each section by date with undated last', () => {
    const rows = [
      occ({ effectiveTitle: 'Floating' }),
      occ({ effectiveTitle: 'Later', startAt: at(20) }),
      occ({ effectiveTitle: 'Sooner', startAt: at(10) }),
    ]
    const sections = groupOccurrences(rows, 'activity', now)
    expect(sections).toHaveLength(1)
    expect(sections[0].items.map((o) => o.effectiveTitle)).toEqual(['Sooner', 'Later', 'Floating'])
  })

  it('returns one headerless section for none and nothing for an empty list', () => {
    expect(groupOccurrences([occ()], 'none', now)).toMatchObject([{ key: 'all', label: null }])
    expect(groupOccurrences([], 'when', now)).toEqual([])
  })
})
