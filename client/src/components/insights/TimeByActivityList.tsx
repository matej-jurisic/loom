import type { InsightsActivity, InsightsWorkType, Occurrence } from '@/lib/types'

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}min`
}

export function activitiesFromOccurrences(occurrences: Occurrence[]): InsightsActivity[] {
  const byActivity = new Map<string, InsightsActivity>()
  const workTypes = new Map<string, Map<string, InsightsWorkType>>()

  for (const o of occurrences) {
    if (o.status !== 'done' || !o.startAt || !o.endAt || o.isAllDay) continue
    const minutes = Math.floor((new Date(o.endAt).getTime() - new Date(o.startAt).getTime()) / 60000)
    if (minutes <= 0) continue

    let entry = byActivity.get(o.activity.id)
    if (!entry) {
      entry = {
        activityId: o.activity.id,
        title: o.activity.title,
        categoryColor: o.activity.category?.color ?? null,
        timeMinutes: 0,
        count: 0,
        workTypes: [],
      }
      byActivity.set(o.activity.id, entry)
      workTypes.set(o.activity.id, new Map())
    }
    entry.timeMinutes += minutes
    entry.count++

    const types = workTypes.get(o.activity.id)!
    for (const t of o.timeSplit) {
      if (t.minutes <= 0) continue
      const w = types.get(t.workTypeId)
      if (w) w.timeMinutes += t.minutes
      else types.set(t.workTypeId, { workTypeId: t.workTypeId, title: t.title, timeMinutes: t.minutes })
    }
  }

  for (const [id, entry] of byActivity) {
    entry.workTypes = [...workTypes.get(id)!.values()]
      .sort((a, b) => b.timeMinutes - a.timeMinutes || a.title.localeCompare(b.title))
  }

  return [...byActivity.values()].sort((a, b) => b.timeMinutes - a.timeMinutes || b.count - a.count)
}

export function ActivityList({ activities }: { activities: InsightsActivity[] }) {
  if (activities.length === 0) {
    return (
      <div className="rounded-lg border border-border px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No timed activities in this period.
        </p>
      </div>
    )
  }

  const max = Math.max(...activities.map((a) => a.timeMinutes))

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <ul className="divide-y divide-border">
        {activities.map((a) => (
          <li key={a.activityId} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm text-foreground">{a.title}</span>
              <span className="ml-auto shrink-0 text-sm tabular-nums text-foreground">
                {formatTime(a.timeMinutes)}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(a.timeMinutes / max) * 100}%`,
                  backgroundColor: a.categoryColor ?? 'var(--primary)',
                }}
              />
            </div>
            <WorkTypeBreakdown activity={a} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function WorkTypeBreakdown({ activity }: { activity: InsightsActivity }) {
  if (activity.workTypes.length === 0) return null

  const split = activity.workTypes.reduce((sum, w) => sum + w.timeMinutes, 0)
  const rest = activity.timeMinutes - split

  return (
    <ul className="mt-1 flex flex-col gap-0.5 pl-3">
      {activity.workTypes.map((w) => (
        <li key={w.workTypeId} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{w.title}</span>
          <span className="ml-auto shrink-0 tabular-nums">{formatTime(w.timeMinutes)}</span>
        </li>
      ))}
      {rest > 0 && (
        <li className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate italic">Not split</span>
          <span className="ml-auto shrink-0 tabular-nums">{formatTime(rest)}</span>
        </li>
      )}
    </ul>
  )
}
