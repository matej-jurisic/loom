import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, CircleDashed, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { categoriesApi, goalsApi, occurrencesApi, tagsApi } from '@/lib/api'
import type { Occurrence } from '@/lib/types'
import {
  NONE_FILTER,
  filterOccurrences,
  formatOccurrenceDate,
  groupOccurrences,
  type OccurrenceFilters,
  type OccurrenceGroupBy,
  type StatusFilter,
} from '@/lib/occurrenceView'
import { EventModal } from '@/components/events/EventModal'
import { OccurrenceListRow } from '@/components/events/OccurrenceListRow'
import { PageHeader } from '@/components/layout/PageHeader'
import { Select } from '@/components/ui/Select'

const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'all', label: 'All' },
]

const GROUPS: { value: OccurrenceGroupBy; label: string }[] = [
  { value: 'when', label: 'When' },
  { value: 'category', label: 'Category' },
  { value: 'tag', label: 'Tag' },
  { value: 'goal', label: 'Goal' },
  { value: 'activity', label: 'Activity' },
  { value: 'none', label: 'None' },
]

const GROUP_KEY = 'loom-occurrences-group'

function storedGroupBy(): OccurrenceGroupBy {
  try {
    const saved = localStorage.getItem(GROUP_KEY)
    return GROUPS.some((g) => g.value === saved) ? (saved as OccurrenceGroupBy) : 'when'
  } catch {
    return 'when'
  }
}

function parseStatus(raw: string | null): StatusFilter {
  return STATUSES.some((s) => s.value === raw) ? (raw as StatusFilter) : 'open'
}

export function OccurrencesPage() {
  const [params, setParams] = useSearchParams()
  const [group, setGroup] = useState<OccurrenceGroupBy>(storedGroupBy)
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Occurrence | undefined>()
  const [scheduleMode, setScheduleMode] = useState(false)

  const filters: OccurrenceFilters = {
    status: parseStatus(params.get('status')),
    category: params.get('category'),
    tag: params.get('tag'),
    goal: params.get('goal'),
    search,
  }

  const { data: occurrences = [], isLoading } = useQuery({
    queryKey: ['events', 'all'],
    queryFn: () => occurrencesApi.list(),
  })
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: tagsApi.list })
  const { data: goals = [] } = useQuery({ queryKey: ['goals'], queryFn: () => goalsApi.list() })

  function setParam(name: string, value: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null || value === '') next.delete(name)
        else next.set(name, value)
        return next
      },
      { replace: true },
    )
  }

  function chooseGroup(value: OccurrenceGroupBy) {
    setGroup(value)
    try {
      localStorage.setItem(GROUP_KEY, value)
    } catch {
      return
    }
  }

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openCreate() {
    setEditing(undefined)
    setScheduleMode(false)
    setModalOpen(true)
  }

  function openEdit(o: Occurrence) {
    setEditing(o)
    setScheduleMode(false)
    setModalOpen(true)
  }

  function openSchedule(o: Occurrence) {
    setEditing(o)
    setScheduleMode(true)
    setModalOpen(true)
  }

  const visible = useMemo(() => filterOccurrences(occurrences, filters), [occurrences, params, search])
  const sections = useMemo(() => groupOccurrences(visible, group), [visible, group])

  const activeFilterCount =
    (filters.status !== 'open' ? 1 : 0) +
    (filters.tag !== null ? 1 : 0) +
    (filters.goal !== null ? 1 : 0)

  const narrowed =
    filters.status !== 'open' ||
    filters.category !== null ||
    filters.tag !== null ||
    filters.goal !== null ||
    search.trim() !== ''

  function clearFilters() {
    setSearch('')
    setParams({}, { replace: true })
  }

  const categoryOptions = [
    { value: '', label: 'Any category' },
    { value: NONE_FILTER, label: 'No category' },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ]
  const categorySelect = (
    <Select value={filters.category ?? ''} onChange={(v) => setParam('category', v)} options={categoryOptions} />
  )
  const tagOptions = [
    { value: '', label: 'Any tag' },
    { value: NONE_FILTER, label: 'No tag' },
    ...tags.map((t) => ({ value: t.id, label: t.name })),
  ]
  const goalOptions = [
    { value: '', label: 'Any goal' },
    { value: NONE_FILTER, label: 'No goal' },
    ...goals.map((g) => ({ value: g.id, label: g.title })),
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Occurrences"
        action={
          <button
            onClick={openCreate}
            aria-label="New occurrence"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        }
      />

      <div className="shrink-0 border-b border-border px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-2.5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                strokeWidth={2}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
            <button
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-label="Filters"
              className={`flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                filtersOpen || activeFilterCount > 0
                  ? 'border-primary text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <div className="md:hidden">{categorySelect}</div>

          <div className={`${filtersOpen ? 'flex' : 'hidden'} flex-col gap-2.5`}>
            <div className="flex overflow-hidden rounded-md border border-border">
              {STATUSES.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setParam('status', value === 'open' ? null : value)}
                  aria-pressed={filters.status === value}
                  className={`flex-1 border-l border-border px-2.5 py-1.5 text-xs font-medium transition-colors first:border-l-0 ${
                    filters.status === value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="hidden md:block">{categorySelect}</div>
              <Select value={filters.tag ?? ''} onChange={(v) => setParam('tag', v)} options={tagOptions} />
              <Select value={filters.goal ?? ''} onChange={(v) => setParam('goal', v)} options={goalOptions} />
              <Select
                value={group}
                onChange={(v) => chooseGroup(v as OccurrenceGroupBy)}
                options={GROUPS.map((g) => ({ value: g.value, label: `Group: ${g.label}` }))}
              />
            </div>

            {narrowed && (
              <button
                onClick={clearFilters}
                className="self-end text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Reset filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-2xl">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : sections.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <CircleDashed className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-medium text-foreground">
                {narrowed ? 'Nothing matches these filters' : 'Nothing open right now'}
              </p>
              {narrowed ? (
                <button
                  onClick={clearFilters}
                  className="flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Reset filters
                </button>
              ) : (
                <button
                  onClick={openCreate}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  New
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sections.map((section) => {
                const collapseKey = `${group}:${section.key}`
                const isCollapsed = collapsed.has(collapseKey)
                return (
                  <div key={section.key}>
                    {section.label !== null && (
                      <button
                        onClick={() => toggleCollapsed(collapseKey)}
                        aria-expanded={!isCollapsed}
                        className={`mb-2 flex w-full min-w-0 items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide transition-colors hover:text-foreground ${
                          section.tone === 'overdue' ? 'text-destructive' : 'text-muted-foreground'
                        }`}
                      >
                        <ChevronDown
                          className={`h-3 w-3 shrink-0 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                          strokeWidth={2.5}
                        />
                        <span className="truncate" title={section.label}>{section.label}</span>
                        <span className="font-normal opacity-60">{section.items.length}</span>
                      </button>
                    )}
                    {!isCollapsed && (
                      <div className="rounded-lg border border-border">
                        <ul>
                          {section.items.map((o) => (
                            <OccurrenceListRow
                              key={o.id}
                              occurrence={o}
                              timeText={formatOccurrenceDate(o) || null}
                              onEdit={openEdit}
                              onSchedule={openSchedule}
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <EventModal
        key={`${editing?.id ?? 'new'}-${scheduleMode}`}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        occurrence={editing}
        focusStartAt={scheduleMode}
        scheduleOnly={scheduleMode}
      />
    </div>
  )
}
