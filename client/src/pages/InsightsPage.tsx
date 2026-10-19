import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, CircleDashed, Hash } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { insightsApi } from '@/lib/api'
import { CategoryIcon } from '@/components/categories/categoryIcons'
import { ActivityList, formatTime } from '@/components/insights/TimeByActivityList'
import { GoalTile } from '@/components/goals/GoalIcon'
import { Select } from '@/components/ui/Select'
import type { InsightsCategory, InsightsGoal, InsightsSummary, InsightsTag } from '@/lib/types'

// ── sub-components ─────────────────────────────────────────────────────────

const PERIODS = [7, 30, 90, 365] as const
type Period = (typeof PERIODS)[number]

const PERIOD_LABEL: Record<Period, string> = {
  7: '7 days',
  30: '30 days',
  90: '90 days',
  365: '1 year',
}

function PeriodSelect({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div className="w-full sm:w-56">
      <Select
        icon={<CalendarDays className="h-4 w-4" strokeWidth={2} />}
        value={String(value)}
        onChange={(v) => onChange(Number(v) as Period)}
        options={PERIODS.map((p) => ({ value: String(p), label: `Last ${PERIOD_LABEL[p]}` }))}
      />
    </div>
  )
}

function delta(current: number, previous: number, format: (n: number) => string): string | null {
  if (previous === 0 || current === previous) return null
  const diff = current - previous
  return `${diff > 0 ? '+' : '-'}${format(Math.abs(diff))}`
}

function SummaryTile({ label, value, change }: { label: string; value: string; change: string | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-foreground">{value}</span>
      {change && (
        <span className="text-xs tabular-nums text-muted-foreground">{change} vs previous</span>
      )}
    </div>
  )
}

function Summary({ summary }: { summary: InsightsSummary }) {
  const time = delta(summary.timeMinutes, summary.previousTimeMinutes, formatTime)
  const done = delta(summary.done, summary.previousDone, String)
  return (
    <div className="grid grid-cols-3 gap-2">
      <SummaryTile label="Time" value={formatTime(summary.timeMinutes)} change={time} />
      <SummaryTile label="Done" value={String(summary.done)} change={done} />
      <SummaryTile label="Active days" value={String(summary.activeDays)} change={null} />
    </div>
  )
}

interface BarItem {
  key: string
  label: string
  minutes: number
  count: number
  color: string | null
  lead?: ReactNode
  muted?: boolean
}

function BarList({ items }: { items: BarItem[] }) {
  const max = Math.max(...items.map((i) => i.minutes))

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.key} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex items-center gap-2">
              {i.lead}
              <span className={`truncate text-sm ${i.muted ? 'text-muted-foreground' : 'text-foreground'}`}>{i.label}</span>
              <span className="ml-auto shrink-0 text-sm tabular-nums text-foreground">{formatTime(i.minutes)}</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(i.minutes / max) * 100}%`,
                  backgroundColor: i.muted ? 'var(--muted-foreground)' : (i.color ?? 'var(--primary)'),
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function categoryItems(categories: InsightsCategory[]): BarItem[] {
  return categories.map((c) => {
    const none = c.categoryId === null
    return {
      key: c.categoryId ?? 'none',
      label: c.name ?? 'No category',
      minutes: c.timeMinutes,
      count: c.done,
      color: c.color,
      muted: none,
      lead: none ? (
        <CircleDashed className="h-[15px] w-[15px] shrink-0 text-muted-foreground" strokeWidth={2} />
      ) : (
        <CategoryIcon icon={c.icon} color={c.color ?? 'currentColor'} size={15} strokeWidth={2} />
      ),
    }
  })
}

function goalItems(goals: InsightsGoal[]): BarItem[] {
  return goals.map((g) => ({
    key: g.goalId,
    label: g.title,
    minutes: g.timeMinutes,
    count: g.done,
    color: g.color,
    lead: <GoalTile icon={g.icon} color={g.color} size="sm" />,
  }))
}

function tagItems(tags: InsightsTag[]): BarItem[] {
  return tags.map((t) => ({
    key: t.tagId,
    label: t.name,
    minutes: t.timeMinutes,
    count: t.done,
    color: null,
    lead: <Hash className="h-[15px] w-[15px] shrink-0 text-muted-foreground" strokeWidth={2} />,
  }))
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </section>
  )
}

// ── page ───────────────────────────────────────────────────────────────────

export function InsightsPage() {
  const [period, setPeriod] = useState<Period>(7)

  const { data, isLoading } = useQuery({
    queryKey: ['insights', period],
    queryFn: () => insightsApi.get(period),
  })

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader title="Insights" />

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-2xl">
          {isLoading || !data ? (
            <div className="flex justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              <PeriodSelect value={period} onChange={setPeriod} />

              <Summary summary={data.summary} />

              <Section title="Time by activity">
                <ActivityList activities={data.activities} />
              </Section>

              {data.categories.length > 0 && (
                <Section title="Time by category">
                  <BarList items={categoryItems(data.categories)} />
                </Section>
              )}

              {data.goals.length > 0 && (
                <Section title="Time by goal">
                  <BarList items={goalItems(data.goals)} />
                </Section>
              )}

              {data.tags.length > 0 && (
                <Section title="Time by tag">
                  <BarList items={tagItems(data.tags)} />
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
