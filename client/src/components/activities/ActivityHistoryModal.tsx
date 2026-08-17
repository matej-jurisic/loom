import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { CategoryIcon } from '@/components/categories/categoryIcons'
import {
  OccurrenceHeatmap, addDays, keyOf, parseDay, startOfWeek,
  type HeatmapDayCounts, type HeatmapWindow,
} from '@/components/events/OccurrenceHeatmap'
import { occurrencesApi } from '@/lib/api'
import type { Activity, Occurrence } from '@/lib/types'

/** Columns in the heatmap, one per week. Both are suffixes of the same window, with counts picked so
 *  the squares land near 14px inside the modal's fixed width. */
const HEATMAP_WEEKS_NARROW = 18
const HEATMAP_WEEKS_WIDE = 26
const RECENT_LIMIT = 10
const GOAL_TONE: Record<string, 'focus' | 'active' | 'bench' | 'neutral'> = {
  focus: 'focus', active: 'active', bench: 'bench', closed: 'neutral',
}

/**
 * An activity's track record: "have I been doing this, and when".
 *
 * Read-only, so the only way out is to the activity itself. Every figure is derived here from the
 * activity's own occurrences - the list the detail page already loads, on the same cache key, so
 * opening this warms that page and the other way round. Nothing is passed in, which is what lets any
 * caller (a row menu, the detail page) open it with just an activity.
 */
export function ActivityHistoryModal({
  open,
  activity,
  onClose,
}: {
  open: boolean
  /** Null keeps the modal closed. */
  activity: Activity | null
  onClose: () => void
}) {
  const navigate = useNavigate()

  const { data: occurrences, isLoading } = useQuery({
    queryKey: ['events', 'activity', activity?.id],
    queryFn: () => occurrencesApi.list({ activityId: activity!.id }),
    enabled: open && !!activity,
  })

  const summary = useMemo(() => summarise(occurrences ?? []), [occurrences])
  const loading = isLoading || !occurrences

  return (
    <Modal
      open={open && !!activity}
      onClose={onClose}
      title={activity ? `${activity.title} - history` : 'History'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button
            variant="outline"
            onClick={() => { onClose(); navigate(`/activities/${activity!.id}`) }}
          >
            Open activity
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" strokeWidth={2} />
          </Button>
        </>
      }
    >
      {activity && <MetaLine activity={activity} />}

      {/*
        Every section below is rendered on the first frame, loaded or not: the tiles and the strip have
        a data-independent shape, and the list is a fixed-height box that scrolls. The request lands
        while the panel is still animating in, so a shell that grows into the answer reads as a stutter.
      */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Last done" value={summary.lastDoneLabel} loading={loading} />
        <Stat label="Cadence" value={cadenceLabel(summary)} loading={loading} />
        <Stat label="Usual time" value={summary.usualStartTime} loading={loading} />
        <Stat label="Usual length" value={durationLabel(summary.usualDurationMinutes)} loading={loading} />
      </div>

      <ActivityHeatmap occurrences={occurrences ?? []} activity={activity} loading={loading} />

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent
          </h3>
          {loading ? (
            <span className="h-3 w-32 animate-pulse rounded bg-border" />
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {summary.done} done, {summary.skipped} skipped, {summary.pending} pending
            </span>
          )}
        </div>
        <div className="h-[11.5rem] overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <RecentSkeleton />
          ) : summary.recent.length === 0 ? (
            <p className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
              Nothing recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {summary.recent.map((o) => <RecentRow key={o.id} occ={o} />)}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** Category and goal, matching the meta line an activity row shows. */
function MetaLine({ activity }: { activity: Activity }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      {activity.category && (
        <span className="flex items-center gap-1.5">
          <CategoryIcon icon={activity.category.icon} color={activity.category.color} size={12} strokeWidth={2} />
          {activity.category.name}
        </span>
      )}
      {activity.goal && (
        <Badge tone={GOAL_TONE[activity.goal.status] ?? 'neutral'}>{activity.goal.title}</Badge>
      )}
    </div>
  )
}

function Stat({ label, value, loading }: { label: string; value: string | null; loading?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {loading ? (
        <span className="mt-0.5 flex h-5 items-center" aria-hidden="true">
          <span className="h-3 w-12 animate-pulse rounded bg-border" />
        </span>
      ) : (
        <p className={`mt-0.5 text-sm ${value ? 'text-foreground' : 'text-muted-foreground'}`}>
          {value ?? 'Unknown'}
        </p>
      )}
    </div>
  )
}

/** Fills the recent box while the occurrences load; the box owns the height, these own the shape. */
function RecentSkeleton() {
  return (
    <div className="animate-pulse divide-y divide-border" aria-busy="true" aria-label="Loading history">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex h-9 items-center gap-3 px-3">
          <span className="h-2 w-2 shrink-0 rounded-full bg-border" />
          <span className="h-3 flex-1 rounded bg-border" />
          <span className="h-3 w-10 shrink-0 rounded bg-border" />
        </div>
      ))}
    </div>
  )
}

/**
 * The same grid the Goals page draws, on this activity's own occurrences: a column per week, a row
 * per weekday, the current week last. A habit that only ever happens at the weekend is then a
 * horizontal stripe, and one that lapsed a month ago stops partway across. This is the part the
 * activities page cannot do: a flat list makes you reconstruct the rhythm yourself.
 *
 * Goals get their window from the server; this one is built here, like every other figure in the
 * dialog, so any caller can open it with just an activity. The grid is the same size empty as full,
 * so it renders while loading too - only the fills wait.
 */
function ActivityHeatmap({
  occurrences,
  activity,
  loading,
}: {
  occurrences: Occurrence[]
  activity: Activity | null
  loading?: boolean
}) {
  const heatmap = useMemo(() => buildHeatmap(loading ? [] : occurrences), [occurrences, loading])
  const color = activity?.category?.color ?? 'var(--color-primary)'

  return (
    <div className={loading ? 'animate-pulse' : undefined}>
      <div className="sm:hidden">
        <OccurrenceHeatmap heatmap={heatmap} color={color} weeks={HEATMAP_WEEKS_NARROW} showWeekdays />
      </div>
      <div className="hidden sm:block">
        <OccurrenceHeatmap heatmap={heatmap} color={color} weeks={HEATMAP_WEEKS_WIDE} showWeekdays />
      </div>
    </div>
  )
}

/**
 * Per-day counts over the widest window either layout draws, ending today. Unlike the goal payload
 * this keeps `pending` as its own count: an activity's grid is read alongside its upcoming plans,
 * and a scheduled day is worth telling apart from an empty one.
 */
function buildHeatmap(occurrences: Occurrence[]): HeatmapWindow {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const first = addDays(startOfWeek(today), -7 * (HEATMAP_WEEKS_WIDE - 1))

  const byDay = new Map<string, HeatmapDayCounts>()
  for (const o of occurrences) {
    if (!o.startAt) continue
    const day = new Date(o.startAt)
    day.setHours(0, 0, 0, 0)
    if (day < first || day > today) continue
    const key = keyOf(day)
    let entry = byDay.get(key)
    if (!entry) {
      entry = { date: key, done: 0, skipped: 0, pending: 0 }
      byDay.set(key, entry)
    }
    if (o.status === 'done') entry.done++
    else if (o.status === 'skipped') entry.skipped++
    else entry.pending = (entry.pending ?? 0) + 1
  }

  return { start: keyOf(first), end: keyOf(today), days: [...byDay.values()] }
}

function RecentRow({ occ }: { occ: Occurrence }) {
  const dotCls =
    occ.status === 'done'    ? 'bg-primary' :
    occ.status === 'skipped' ? 'bg-muted-foreground' :
                               'border border-border bg-background'
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dotCls}`} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {occ.startAt ? formatDay(occ.startAt) : 'No date'}
        {occ.startAt && !occ.isAllDay && (
          <span className="ml-2 font-mono text-xs text-muted-foreground">{hhmm(new Date(occ.startAt))}</span>
        )}
      </span>
      <span className="shrink-0 text-[11px] capitalize text-muted-foreground">
        {occ.status === 'pending' ? (occ.isPlanned ? 'planned' : 'pending') : occ.status}
      </span>
    </div>
  )
}

interface Summary {
  done: number
  skipped: number
  pending: number
  lastDoneLabel: string | null
  /** Median days between consecutive completion days; null until there are two of them. */
  medianGapDays: number | null
  /** Most common quarter-hour start across timed completions, "HH:mm". */
  usualStartTime: string | null
  /** Median measured length across completions, falling back to a typed estimate. */
  usualDurationMinutes: number | null
  recent: Occurrence[]
}

function summarise(occurrences: Occurrence[]): Summary {
  let done = 0, skipped = 0, pending = 0
  for (const o of occurrences) {
    if (o.status === 'done') done++
    else if (o.status === 'skipped') skipped++
    else pending++
  }

  const doneDates = occurrences
    .filter((o) => o.status === 'done' && o.startAt)
    .map((o) => new Date(o.startAt!))
    .sort((a, b) => b.getTime() - a.getTime())

  const recent = occurrences
    .slice()
    .sort((a, b) => {
      if (a.startAt && b.startAt) return new Date(b.startAt).getTime() - new Date(a.startAt).getTime()
      if (a.startAt) return -1
      if (b.startAt) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
    .slice(0, RECENT_LIMIT)

  const completions = occurrences.filter((o) => o.status === 'done')

  return {
    done, skipped, pending,
    lastDoneLabel: doneDates.length > 0 ? relativeDayLabel(doneDates[0]) : null,
    medianGapDays: medianGap(doneDates),
    usualStartTime: modeStartTime(completions),
    usualDurationMinutes: median(completions.map(lengthOf).filter((m): m is number => m != null)),
    recent,
  }
}

function cadenceLabel(summary: Summary): string | null {
  if (summary.medianGapDays == null) return null
  return `Every ${Math.max(1, summary.medianGapDays)}d`
}

/**
 * Median gap between consecutive completion *days*, not occurrences: two sessions on one day are one
 * day's worth of the habit, and counting them separately would report a zero-day cadence.
 */
function medianGap(doneDatesDesc: Date[]): number | null {
  const days = [...new Set(doneDatesDesc.map(keyOf))]
    .map((k) => parseDay(k).getTime())
    .sort((a, b) => a - b)
  if (days.length < 2) return null
  return median(days.slice(1).map((t, i) => Math.round((t - days[i]) / 86400000)))
}

/** Most common start rounded to a quarter hour. An all-day row is anchored at midnight, not a time. */
function modeStartTime(completions: Occurrence[]): string | null {
  const counts = new Map<string, number>()
  for (const o of completions) {
    if (!o.startAt || o.isAllDay) continue
    const d = new Date(o.startAt)
    const rounded = new Date(d)
    rounded.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0)
    const key = hhmm(rounded)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
}

/** Measured span when both ends exist, else the typed estimate. An all-day row has no span. */
function lengthOf(o: Occurrence): number | null {
  if (o.startAt && o.endAt && !o.isAllDay) {
    const mins = Math.round((new Date(o.endAt).getTime() - new Date(o.startAt).getTime()) / 60000)
    if (mins > 0) return mins
  }
  return o.durationMinutes && o.durationMinutes > 0 ? o.durationMinutes : null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

function durationLabel(mins: number | null): string | null {
  if (!mins || mins <= 0) return null
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "Today", "Yesterday", or "12d ago" - a count, not a date: the question is how long it has been. */
function relativeDayLabel(d: Date): string {
  const days = daysBetween(d, new Date())
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Whole days between two instants, counted on local calendar days rather than by elapsed hours. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
