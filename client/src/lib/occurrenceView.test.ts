import { describe, expect, it } from 'vitest'
import type { Activity, Occurrence } from './types'
import {
  NONE_BUCKET,
  NONE_FILTER,
  classify,
  filterOccurrences,
  formatOccurrenceDate,
  groupOccurrences,
  isNarrowed,
  listBody,
  listLook,
  sameView,
  viewFromList,
  type OccurrenceFilters,
  type OccurrenceView,
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
    showAsOverdue: true,
    recentOccurrenceCount: 0,
    ...over,
  }
}

let seq = 0
function occ(over: Partial<Occurrence> = {}, act: Partial<Activity> = {}): Occurrence {
  seq += 1
  const a = activity(act)
  const base: Occurrence = {
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
    isNoDate: false,
    createdAt: '2026-01-01T00:00:00Z',
    isOverdue: false,
    isBehind: false,
    subtasks: [],
    timeSplit: [],
    tags: [],
    effectiveTags: [],
    activity: a,
    deadlineOccurrenceId: null,
    deadline: null,
    linkedDoneCount: 0,
    linkedDoneMinutes: 0,
    ...over,
  }
  return {
    ...base,
    effectiveTags: [...a.tags, ...base.tags.filter((t) => !a.tags.some((x) => x.id === t.id))],
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
    expect(classify(occ({ isNoDate: true }), now)).toBe('nodate')
    expect(classify(occ({ isNoDate: true, status: 'done' }), now)).toBe('done')
    expect(classify(occ({ isOverdue: true, startAt: at(1) }), now)).toBe('overdue')
  })

  it('splits dated pending ones at the end of today', () => {
    expect(classify(occ({ startAt: at(7, 20) }), now)).toBe('today')
    expect(classify(occ({ startAt: at(8, 0) }), now)).toBe('upcoming')
    expect(classify(occ({ startAt: at(3) }), now)).toBe('past')
  })
})

describe('formatOccurrenceDate', () => {
  it('uses a 24 hour clock and names today and tomorrow', () => {
    const o = occ({ startAt: at(7, 15), endAt: at(7, 16) })
    expect(formatOccurrenceDate(o, now)).toBe('Today, 15:00 - 16:00')
    expect(formatOccurrenceDate(occ({ startAt: at(8, 9) }), now)).toBe('Tomorrow, 09:00')
  })

  it('handles date-only, due-only and undated', () => {
    expect(formatOccurrenceDate(occ({ startAt: at(7), isAllDay: true }), now)).toBe('Today')
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

  it('matches the tags set on the occurrence itself', () => {
    const lecture = occ({ effectiveTitle: 'Lecture', tags: [math] }, { id: 'a5', title: 'Lecture' })
    expect(filterOccurrences([...rows, lecture], { ...none, tag: 't2' }).map((o) => o.effectiveTitle)).toEqual(['Calc', 'Lecture'])
    expect(filterOccurrences([lecture], { ...none, tag: NONE_FILTER })).toHaveLength(0)
    expect(filterOccurrences([lecture], { ...none, search: 'math' })).toHaveLength(1)
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

  it('groups under the occurrence tags as well as the activity tags', () => {
    const rows = [
      occ({ effectiveTitle: 'Calc', tags: [math] }, { id: 'a1', title: 'Lecture', tags: [cs] }),
      occ({ effectiveTitle: 'Physics' }, { id: 'a1', title: 'Lecture', tags: [cs] }),
    ]
    const sections = groupOccurrences(rows, 'tag', now)
    expect(sections.map((s) => s.label)).toEqual(['CS101', 'Math'])
    expect(sections[0].items).toHaveLength(2)
    expect(sections[1].items.map((o) => o.effectiveTitle)).toEqual(['Calc'])
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

describe('lists', () => {
  const view: OccurrenceView = { status: 'open', category: null, tag: 't1', goal: null, search: ' milk ', group: 'when' }

  it('round-trips a view through the saved list shape', () => {
    const body = listBody('  Errands ', view)
    expect(body).toEqual({ name: 'Errands', status: 'open', category: null, tag: 't1', goal: null, search: 'milk', groupBy: 'when' })
    const back = viewFromList({ id: 'l1', ...body })
    expect(sameView(back, view)).toBe(true)
  })

  it('defaults a list without grouping to when and treats an empty search as none', () => {
    const v = viewFromList({ id: 'l1', name: 'x', status: 'done', category: null, tag: null, goal: null, search: null, groupBy: null })
    expect(v.group).toBe('when')
    expect(v.search).toBe('')
    expect(listBody('x', { ...v, search: '   ' }).search).toBeNull()
  })

  it('sees a grouping change as a difference but not as narrowing', () => {
    const regrouped = { ...view, group: 'tag' as const }
    expect(sameView(view, regrouped)).toBe(false)
    const plain = { ...view, tag: null, search: '' }
    expect(isNarrowed(plain)).toBe(false)
    expect(isNarrowed({ ...plain, group: 'tag' })).toBe(false)
    expect(isNarrowed({ ...plain, category: 'none' })).toBe(true)
  })

  it('borrows its look from the goal, then the category, else none', () => {
    const goals = [
      { id: 'g1', icon: 'Flag', color: '#ff0000' },
      { id: 'g2', icon: null, color: null },
    ]
    const categories = [{ id: 'c1', icon: 'Leaf', color: '#00ff00' }]
    expect(listLook({ goal: 'g1', category: 'c1' }, goals, categories)).toEqual({ icon: 'Flag', color: '#ff0000' })
    expect(listLook({ goal: 'g2', category: 'c1' }, goals, categories)).toEqual({ icon: 'Leaf', color: '#00ff00' })
    expect(listLook({ goal: 'gone', category: null }, goals, categories)).toBeNull()
    expect(listLook({ goal: 'none', category: 'none' }, goals, categories)).toBeNull()
  })
})
