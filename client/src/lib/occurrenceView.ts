import type { Occurrence } from './types'

export type WhenBucket = 'overdue' | 'today' | 'planned' | 'upcoming' | 'floating' | 'done'

export const WHEN_ORDER: WhenBucket[] = ['overdue', 'today', 'planned', 'upcoming', 'floating', 'done']

export const WHEN_LABELS: Record<WhenBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  planned: 'Planned',
  upcoming: 'Upcoming',
  floating: 'Floating',
  done: 'Completed / Skipped',
}

export type StatusFilter = 'open' | 'done' | 'skipped' | 'all'
export type OccurrenceGroupBy = 'when' | 'category' | 'tag' | 'goal' | 'activity' | 'none'

export const NONE_FILTER = 'none'

export interface OccurrenceFilters {
  status: StatusFilter
  category: string | null
  tag: string | null
  goal: string | null
  search: string
}

export interface OccurrenceSection {
  key: string
  label: string | null
  tone?: 'overdue'
  items: Occurrence[]
}

export const NONE_BUCKET = '__none__'

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function dayLabel(iso: string, now: Date): string {
  const dayStart = startOfDay(new Date(iso)).getTime()
  const todayStart = startOfDay(now)
  if (dayStart === todayStart.getTime()) return 'Today'
  if (dayStart === new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1).getTime()) return 'Tomorrow'
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
}

export function formatOccurrenceDate(o: Occurrence, now: Date = new Date()): string {
  const ref = o.startAt ?? o.endAt
  if (!ref) return ''
  const day = dayLabel(ref, now)
  if (o.isAllDay) return `${day}, Date only`
  if (o.startAt && o.endAt) return `${day}, ${formatTime(o.startAt)} - ${formatTime(o.endAt)}`
  if (o.startAt) return `${day}, ${formatTime(o.startAt)}`
  return `${day}, Due ${formatTime(o.endAt!)}`
}

export function classify(o: Occurrence, now: Date = new Date()): WhenBucket {
  if (o.status !== 'pending') return 'done'
  if (o.isPlanned) return 'planned'
  if (!o.startAt && !o.endAt && !o.isAllDay) return 'floating'
  if (o.isOverdue) return 'overdue'

  const ref = o.startAt ?? o.endAt
  if (!ref) return 'upcoming'
  const todayStart = startOfDay(now)
  const tomorrowStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1)
  return new Date(ref) < tomorrowStart ? 'today' : 'upcoming'
}

export function filterOccurrences(list: Occurrence[], f: OccurrenceFilters): Occurrence[] {
  const query = f.search.trim().toLowerCase()
  return list.filter((o) => {
    if (f.status === 'open' && o.status !== 'pending') return false
    if (f.status === 'done' && o.status !== 'done') return false
    if (f.status === 'skipped' && o.status !== 'skipped') return false

    if (f.category === NONE_FILTER) {
      if (o.activity.category) return false
    } else if (f.category && o.activity.category?.id !== f.category) {
      return false
    }

    if (f.tag === NONE_FILTER) {
      if (o.activity.tags.length > 0) return false
    } else if (f.tag && !o.activity.tags.some((t) => t.id === f.tag)) {
      return false
    }

    if (f.goal === NONE_FILTER) {
      if (o.activity.goals.length > 0) return false
    } else if (f.goal && !o.activity.goals.some((g) => g.id === f.goal)) {
      return false
    }

    if (query) {
      const fields = [
        o.effectiveTitle,
        o.activity.title,
        o.notes,
        o.activity.category?.name,
        ...o.activity.tags.map((t) => t.name),
        ...o.activity.goals.map((g) => g.title),
      ]
      if (!fields.some((field) => field?.toLowerCase().includes(query))) return false
    }

    return true
  })
}

function refTime(o: Occurrence): number | null {
  const ref = o.startAt ?? o.endAt
  return ref ? new Date(ref).getTime() : null
}

export function compareByDate(a: Occurrence, b: Occurrence, descending = false): number {
  const at = refTime(a)
  const bt = refTime(b)
  if (at === null && bt === null) return a.effectiveTitle.localeCompare(b.effectiveTitle)
  if (at === null) return 1
  if (bt === null) return -1
  return descending ? bt - at : at - bt
}

interface Bucket {
  label: string
  items: Occurrence[]
}

function bucketKeys(o: Occurrence, by: OccurrenceGroupBy): { key: string; label: string }[] {
  if (by === 'category') {
    return o.activity.category
      ? [{ key: o.activity.category.id, label: o.activity.category.name }]
      : [{ key: NONE_BUCKET, label: 'No category' }]
  }
  if (by === 'tag') {
    return o.activity.tags.length
      ? o.activity.tags.map((t) => ({ key: t.id, label: t.name }))
      : [{ key: NONE_BUCKET, label: 'No tag' }]
  }
  if (by === 'goal') {
    return o.activity.goals.length
      ? o.activity.goals.map((g) => ({ key: g.id, label: g.title }))
      : [{ key: NONE_BUCKET, label: 'No goal' }]
  }
  return [{ key: o.activityId, label: o.activity.title }]
}

export function groupOccurrences(
  list: Occurrence[],
  by: OccurrenceGroupBy,
  now: Date = new Date(),
): OccurrenceSection[] {
  if (list.length === 0) return []

  if (by === 'none') {
    return [{ key: 'all', label: null, items: [...list].sort((a, b) => compareByDate(a, b)) }]
  }

  if (by === 'when') {
    const buckets = new Map<WhenBucket, Occurrence[]>(WHEN_ORDER.map((k) => [k, []]))
    for (const o of list) buckets.get(classify(o, now))!.push(o)
    return WHEN_ORDER.filter((k) => buckets.get(k)!.length > 0).map((k) => ({
      key: k,
      label: WHEN_LABELS[k],
      tone: k === 'overdue' ? ('overdue' as const) : undefined,
      items: [...buckets.get(k)!].sort((a, b) => (k === 'floating' ? 0 : compareByDate(a, b, k === 'done'))),
    }))
  }

  const buckets = new Map<string, Bucket>()
  for (const o of list) {
    for (const { key, label } of bucketKeys(o, by)) {
      if (!buckets.has(key)) buckets.set(key, { label, items: [] })
      buckets.get(key)!.items.push(o)
    }
  }

  const sections = Array.from(buckets.entries()).map(([key, b]) => ({
    key,
    label: b.label,
    items: [...b.items].sort((a, c) => compareByDate(a, c)),
  }))

  const named = sections.filter((s) => s.key !== NONE_BUCKET).sort((a, b) => a.label!.localeCompare(b.label!))
  return [...named, ...sections.filter((s) => s.key === NONE_BUCKET)]
}
