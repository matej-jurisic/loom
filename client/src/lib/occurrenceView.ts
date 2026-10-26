import type { Category, Goal, Occurrence, OccurrenceList, SaveOccurrenceListBody } from './types'
import { shortDate } from './dates'

export type WhenBucket = 'overdue' | 'past' | 'today' | 'planned' | 'upcoming' | 'floating' | 'nodate' | 'done' | 'skipped'

export const WHEN_ORDER: WhenBucket[] = ['overdue', 'past', 'today', 'planned', 'upcoming', 'floating', 'nodate', 'done', 'skipped']

export const WHEN_LABELS: Record<WhenBucket, string> = {
  overdue: 'Overdue',
  past: 'Past',
  today: 'Today',
  planned: 'Planned',
  upcoming: 'Upcoming',
  floating: 'Floating',
  nodate: 'No date',
  done: 'Completed',
  skipped: 'Skipped',
}

export type StatusFilter = 'open' | 'done' | 'skipped' | 'all'
export type OccurrenceGroupBy = 'when' | 'category' | 'tag' | 'goal' | 'activity' | 'source' | 'none'

export const NONE_FILTER = 'none'

export const DEFAULT_STATUS: StatusFilter = 'all'

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'all', label: 'All' },
]

export const GROUP_OPTIONS: { value: OccurrenceGroupBy; label: string }[] = [
  { value: 'when', label: 'When' },
  { value: 'category', label: 'Category' },
  { value: 'tag', label: 'Tag' },
  { value: 'goal', label: 'Goal' },
  { value: 'activity', label: 'Activity' },
  { value: 'source', label: 'Related' },
  { value: 'none', label: 'None' },
]

export interface OccurrenceFilters {
  status: StatusFilter
  category: string | null
  tag: string | null
  goal: string | null
  search: string
}

/** Everything a list saves: the filters plus the grouping. */
export interface OccurrenceView extends OccurrenceFilters {
  group: OccurrenceGroupBy
}

export const DEFAULT_GROUP: OccurrenceGroupBy = 'when'

export function viewFromList(l: OccurrenceList): OccurrenceView {
  return {
    status: l.status,
    category: l.category,
    tag: l.tag,
    goal: l.goal,
    search: l.search ?? '',
    group: l.groupBy ?? DEFAULT_GROUP,
  }
}

export function listBody(name: string, v: OccurrenceView): SaveOccurrenceListBody {
  return {
    name: name.trim(),
    status: v.status,
    category: v.category,
    tag: v.tag,
    goal: v.goal,
    search: v.search.trim() || null,
    groupBy: v.group,
  }
}

/**
 * A list has no look of its own: it borrows its goal filter's icon and colour (when that goal has
 * either), else its category filter's, else null for the plain default tile. "none" and deleted
 * targets borrow nothing.
 */
export function listLook(
  l: Pick<OccurrenceList, 'goal' | 'category'>,
  goals: Pick<Goal, 'id' | 'icon' | 'color'>[],
  categories: Pick<Category, 'id' | 'icon' | 'color'>[],
): { icon: string | null; color: string | null } | null {
  const goal = goals.find((g) => g.id === l.goal)
  if (goal && (goal.icon || goal.color)) return { icon: goal.icon, color: goal.color }
  const category = categories.find((c) => c.id === l.category)
  if (category) return { icon: category.icon, color: category.color }
  return null
}

/** True when the filters narrow anything compared with the page's default (all, no other filter). */
export function isNarrowed(f: OccurrenceFilters): boolean {
  return f.status !== DEFAULT_STATUS || f.category !== null || f.tag !== null || f.goal !== null || f.search.trim() !== ''
}

export function sameView(a: OccurrenceView, b: OccurrenceView): boolean {
  return (
    a.status === b.status &&
    a.category === b.category &&
    a.tag === b.tag &&
    a.goal === b.goal &&
    a.search.trim() === b.search.trim() &&
    a.group === b.group
  )
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
  return shortDate(iso)
}

export function formatOccurrenceDate(o: Occurrence, now: Date = new Date()): string {
  const ref = o.startAt ?? o.endAt
  if (!ref) return ''
  const day = dayLabel(ref, now)
  if (o.isAllDay) return day
  if (o.startAt && o.endAt) return `${day}, ${formatTime(o.startAt)} - ${formatTime(o.endAt)}`
  if (o.startAt) return `${day}, ${formatTime(o.startAt)}`
  return `${day}, Due ${formatTime(o.endAt!)}`
}

export function classify(o: Occurrence, now: Date = new Date()): WhenBucket {
  if (o.status === 'done') return 'done'
  if (o.status === 'skipped') return 'skipped'
  if (o.isNoDate) return 'nodate'
  if (o.isPlanned) return 'planned'
  if (!o.startAt && !o.endAt && !o.isAllDay) return 'floating'
  if (o.isOverdue) return 'overdue'

  const ref = o.startAt ?? o.endAt
  if (!ref) return 'upcoming'
  const todayStart = startOfDay(now)
  const tomorrowStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate() + 1)
  if (new Date(ref) < todayStart) return 'past'
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
      if (o.effectiveTags.length > 0) return false
    } else if (f.tag && !o.effectiveTags.some((t) => t.id === f.tag)) {
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
        ...o.effectiveTags.map((t) => t.name),
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

/**
 * The manual order wraps every section's own sort: ranked occurrences first, by rank; the unranked
 * ones after them, in the order the section would otherwise use.
 */
function byRank(fallback: (a: Occurrence, b: Occurrence) => number) {
  return (a: Occurrence, b: Occurrence) => {
    if (a.sortOrder !== null && b.sortOrder !== null) return a.sortOrder - b.sortOrder
    if (a.sortOrder !== null) return -1
    if (b.sortOrder !== null) return 1
    return fallback(a, b)
  }
}

/**
 * Mirrors `OccurrenceService.ReorderAsync` for the optimistic update: the listed occurrences trade
 * the ranks they already hold, and the unranked ones take fresh ranks after every ranked occurrence.
 */
export function applyReorder(all: Occurrence[], orderedIds: string[]): Occurrence[] {
  const moving = new Set(orderedIds)
  const held = all.filter((o) => moving.has(o.id) && o.sortOrder !== null).map((o) => o.sortOrder!)
  let next = Math.max(-1, ...all.map((o) => o.sortOrder ?? -1)) + 1
  const slots = [...held]
  while (slots.length < orderedIds.length) slots.push(next++)
  slots.sort((a, b) => a - b)
  const rank = new Map(orderedIds.map((id, i) => [id, slots[i]]))
  return all.map((o) => (rank.has(o.id) ? { ...o, sortOrder: rank.get(o.id)! } : o))
}

interface Bucket {
  label: string
  /** The source's date, for the follow-up grouping's section order. */
  at: number | null
  items: Occurrence[]
}

interface BucketKey {
  key: string
  label: string
  at?: number | null
}

/**
 * One section per source: the source itself plus everything that follows up on it. The link is one
 * level deep, so every occurrence has exactly one root. The label comes from the follow-up's own
 * `source` ref, so a section is named correctly even when a filter hides the source row.
 */
function sourceKey(o: Occurrence): BucketKey {
  const root = o.source ?? (o.followUpCount > 0 ? o : null)
  if (!root) return { key: NONE_BUCKET, label: 'Not linked' }
  const iso = root.startAt ?? root.endAt
  return {
    key: root.id,
    label: iso ? `${root.effectiveTitle} - ${shortDate(iso)}` : root.effectiveTitle,
    at: iso ? new Date(iso).getTime() : null,
  }
}

function bucketKeys(o: Occurrence, by: OccurrenceGroupBy): BucketKey[] {
  if (by === 'source') return [sourceKey(o)]
  if (by === 'category') {
    return o.activity.category
      ? [{ key: o.activity.category.id, label: o.activity.category.name }]
      : [{ key: NONE_BUCKET, label: 'No category' }]
  }
  if (by === 'tag') {
    return o.effectiveTags.length
      ? o.effectiveTags.map((t) => ({ key: t.id, label: t.name }))
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
    return [{ key: 'all', label: null, items: [...list].sort(byRank((a, b) => compareByDate(a, b))) }]
  }

  if (by === 'when') {
    const buckets = new Map<WhenBucket, Occurrence[]>(WHEN_ORDER.map((k) => [k, []]))
    for (const o of list) buckets.get(classify(o, now))!.push(o)
    return WHEN_ORDER.filter((k) => buckets.get(k)!.length > 0).map((k) => ({
      key: k,
      label: WHEN_LABELS[k],
      tone: k === 'overdue' ? ('overdue' as const) : undefined,
      items: [...buckets.get(k)!].sort(
        byRank((a, b) => (k === 'floating' || k === 'nodate' ? 0 : compareByDate(a, b, k === 'done' || k === 'skipped'))),
      ),
    }))
  }

  const buckets = new Map<string, Bucket>()
  for (const o of list) {
    for (const { key, label, at } of bucketKeys(o, by)) {
      if (!buckets.has(key)) buckets.set(key, { label, at: at ?? null, items: [] })
      buckets.get(key)!.items.push(o)
    }
  }

  const sections = Array.from(buckets.entries()).map(([key, b]) => ({
    key,
    label: b.label,
    at: b.at,
    items: [...b.items].sort(byRank((a, c) => compareByDate(a, c))),
  }))

  // Follow-up sections run in their sources' date order (Lecture 01 before Lecture 02), undated last.
  const order = by === 'source'
    ? (a: (typeof sections)[number], b: (typeof sections)[number]) =>
        a.at === null && b.at === null ? a.label.localeCompare(b.label)
          : a.at === null ? 1 : b.at === null ? -1 : a.at - b.at
    : (a: (typeof sections)[number], b: (typeof sections)[number]) => a.label.localeCompare(b.label)
  const named = sections.filter((s) => s.key !== NONE_BUCKET).sort(order)
  return [...named, ...sections.filter((s) => s.key === NONE_BUCKET)]
}

/** True when the occurrence has anything for "See related" to show. */
export function hasRelated(o: Occurrence): boolean {
  return o.deadlineOccurrenceId !== null || o.sourceOccurrenceId !== null || o.followUpCount > 0 || o.linkedCount > 0
}

/**
 * Everything linked to `o` through either link, a section per role: its deadline target, the sessions
 * working toward that target or toward `o` itself, its source, and the follow-ups of that source or of
 * `o`. `o` itself is left out, so a session sees its fellow sessions and a follow-up its siblings.
 */
export function relatedSections(all: Occurrence[], o: Occurrence): OccurrenceSection[] {
  const byId = new Map(all.map((x) => [x.id, x]))
  const targets = new Set([o.id, o.deadlineOccurrenceId].filter((id): id is string => id !== null))
  const sources = new Set([o.id, o.sourceOccurrenceId].filter((id): id is string => id !== null))
  const others = all.filter((x) => x.id !== o.id)
  const pick = (id: string | null) => (id ? byId.get(id) : undefined)

  const sections: OccurrenceSection[] = [
    { key: 'deadline', label: 'Deadline', items: [pick(o.deadlineOccurrenceId)].filter((x) => x !== undefined) },
    { key: 'sessions', label: 'Sessions', items: others.filter((x) => x.deadlineOccurrenceId !== null && targets.has(x.deadlineOccurrenceId)) },
    { key: 'source', label: 'Related to', items: [pick(o.sourceOccurrenceId)].filter((x) => x !== undefined) },
    { key: 'related', label: 'Related', items: others.filter((x) => x.sourceOccurrenceId !== null && sources.has(x.sourceOccurrenceId)) },
  ]
  return sections
    .filter((s) => s.items.length > 0)
    .map((s) => ({ ...s, items: [...s.items].sort((a, b) => compareByDate(a, b)) }))
}
