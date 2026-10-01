import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleDashed } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { insightsApi } from '@/lib/api'
import { CategoryIcon } from '@/components/categories/categoryIcons'
import { ActivityList, formatTime } from '@/components/insights/TimeByActivityList'
import type { InsightsCategory } from '@/lib/types'

// ── sub-components ─────────────────────────────────────────────────────────

const PERIODS = [7, 30, 90, 365] as const
type Period = (typeof PERIODS)[number]

const PERIOD_LABEL: Record<Period, string> = {
  7: '7 days',
  30: '30 days',
  90: '90 days',
  365: '1 year',
}

function PeriodToggle({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  return (
    <div className="flex w-fit rounded-lg border border-border bg-muted p-0.5">
      {PERIODS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
            value === p
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {PERIOD_LABEL[p]}
        </button>
      ))}
    </div>
  )
}

function CategoryList({ categories }: { categories: InsightsCategory[] }) {
  if (categories.length === 0) return null

  const max = Math.max(...categories.map((c) => c.timeMinutes))

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <ul className="divide-y divide-border">
        {categories.map((c) => {
          const isUncategorized = c.categoryId === null
          return (
            <li key={c.categoryId ?? 'none'} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-center gap-2">
                {isUncategorized ? (
                  <CircleDashed className="h-[15px] w-[15px] shrink-0 text-muted-foreground" strokeWidth={2} />
                ) : (
                  <CategoryIcon icon={c.icon} color={c.color ?? 'currentColor'} size={15} strokeWidth={2} />
                )}
                <span className={`truncate text-sm ${isUncategorized ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {c.name ?? 'No category'}
                </span>
                <span className="ml-auto shrink-0 text-sm tabular-nums text-foreground">
                  {formatTime(c.timeMinutes)}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(c.timeMinutes / max) * 100}%`,
                    backgroundColor: isUncategorized ? 'var(--muted-foreground)' : (c.color ?? 'var(--primary)'),
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
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
              <PeriodToggle value={period} onChange={setPeriod} />

              <section>
                <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Time by activity
                </p>
                <ActivityList activities={data.activities} />
              </section>

              {data.categories.length > 0 && (
                <section>
                  <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Time by category
                  </p>
                  <CategoryList categories={data.categories} />
                </section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
