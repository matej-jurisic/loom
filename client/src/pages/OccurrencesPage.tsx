import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronLeft,
  CircleDashed,
  ListPlus,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { categoriesApi, goalsApi, listsApi, occurrencesApi, tagsApi } from '@/lib/api'
import { invalidateLists } from '@/lib/invalidate'
import { toastError } from '@/store/toasts'
import type { Activity, Occurrence, OccurrenceList } from '@/lib/types'
import {
  DEFAULT_GROUP,
  GROUP_OPTIONS,
  STATUS_OPTIONS,
  filterOccurrences,
  formatOccurrenceDate,
  groupOccurrences,
  isNarrowed,
  listBody,
  sameView,
  viewFromList,
  type OccurrenceGroupBy,
  type OccurrenceView,
  type StatusFilter,
} from '@/lib/occurrenceView'
import { ActivityModal } from '@/components/activities/ActivityModal'
import { EventModal } from '@/components/events/EventModal'
import { OccurrenceFilterFields } from '@/components/events/OccurrenceFilterFields'
import { OccurrenceListRow } from '@/components/events/OccurrenceListRow'
import { ListModal } from '@/components/lists/ListModal'
import { PageHeader } from '@/components/layout/PageHeader'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const GROUP_KEY = 'loom-occurrences-group'

function storedGroupBy(): OccurrenceGroupBy {
  try {
    const saved = localStorage.getItem(GROUP_KEY)
    return GROUP_OPTIONS.some((g) => g.value === saved) ? (saved as OccurrenceGroupBy) : DEFAULT_GROUP
  } catch {
    return DEFAULT_GROUP
  }
}

function parseStatus(raw: string | null): StatusFilter {
  return STATUS_OPTIONS.some((s) => s.value === raw) ? (raw as StatusFilter) : 'open'
}

const URL_FILTERS = ['status', 'category', 'tag', 'goal'] as const

/**
 * `/occurrences/all`: every occurrence. Status, category, tag and goal filters live in the URL so
 * other pages can link here pre-filtered; the grouping is remembered in localStorage.
 */
export function AllOccurrencesPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [group, setGroup] = useState<OccurrenceGroupBy>(storedGroupBy)
  const [search, setSearch] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)

  const view: OccurrenceView = {
    status: parseStatus(params.get('status')),
    category: params.get('category'),
    tag: params.get('tag'),
    goal: params.get('goal'),
    search,
    group,
  }

  function update(patch: Partial<OccurrenceView>) {
    if (patch.group !== undefined) {
      setGroup(patch.group)
      try {
        localStorage.setItem(GROUP_KEY, patch.group)
      } catch {
        // Grouping just isn't remembered.
      }
    }
    if (patch.search !== undefined) setSearch(patch.search)
    if (URL_FILTERS.some((k) => k in patch)) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const k of URL_FILTERS) {
            if (!(k in patch)) continue
            const value = patch[k]
            if (!value || (k === 'status' && value === 'open')) next.delete(k)
            else next.set(k, value)
          }
          return next
        },
        { replace: true },
      )
    }
  }

  const narrowed = isNarrowed(view)

  return (
    <>
      <OccurrencesView
        title="All occurrences"
        view={view}
        onChange={update}
        footer={
          narrowed && (
            <>
              <button
                onClick={() => setSaveOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
              >
                <ListPlus className="h-3.5 w-3.5" strokeWidth={2} />
                Save as list
              </button>
              <button
                onClick={() => {
                  setSearch('')
                  setParams({}, { replace: true })
                }}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Reset filters
              </button>
            </>
          )
        }
        emptyMessage={narrowed ? 'Nothing matches these filters' : 'Nothing open right now'}
      />
      <ListModal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        initial={view}
        onSaved={(l) => navigate(`/occurrences/lists/${l.id}`)}
      />
    </>
  )
}

/** `/occurrences/lists/:id`: one saved list, with its filters editable in place and savable back. */
export function OccurrenceListPage() {
  const { id } = useParams()
  const { data: lists, isLoading } = useQuery({ queryKey: ['lists'], queryFn: listsApi.list })
  const list = lists?.find((l) => l.id === id)

  if (isLoading) {
    return (
      <div className="flex flex-1 justify-center py-16">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  if (!list) return <Navigate to="/occurrences" replace />
  return <ListView key={list.id} list={list} />
}

function ListView({ list }: { list: OccurrenceList }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const saved = viewFromList(list)
  const [view, setView] = useState<OccurrenceView>(saved)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Picks up a server-side change (the edit modal, or "Save to list") without remounting.
  const [syncedList, setSyncedList] = useState(list)
  if (syncedList !== list) {
    setSyncedList(list)
    setView(viewFromList(list))
  }

  const dirty = !sameView(view, saved)

  const saveMutation = useMutation({
    mutationFn: () => listsApi.update(list.id, listBody(list.name, view)),
    onSuccess: () => invalidateLists(qc),
    onError: (err) => toastError(err, 'Could not save the list.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => listsApi.delete(list.id),
    onSuccess: () => {
      invalidateLists(qc)
      navigate('/occurrences', { replace: true })
    },
    onError: (err) => toastError(err, 'Could not delete the list.'),
  })

  return (
    <>
      <OccurrencesView
        title={list.name}
        view={view}
        onChange={(patch) => setView((v) => ({ ...v, ...patch }))}
        menu={
          <ActionMenu
            ariaLabel={`Actions for ${list.name}`}
            iconClassName="h-3.5 w-3.5"
            triggerClassName="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
            items={[
              { icon: Pencil, label: 'Edit list', onClick: () => setEditOpen(true) },
              'separator',
              { icon: Trash2, label: 'Delete list', onClick: () => setConfirmDelete(true), destructive: true },
            ]}
          />
        }
        footer={
          dirty && (
            <>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="text-xs font-medium text-primary transition-colors hover:text-primary/80 disabled:opacity-50"
              >
                Save to list
              </button>
              <button
                onClick={() => setView(saved)}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Revert
              </button>
            </>
          )
        }
        emptyMessage={dirty ? 'Nothing matches these filters' : 'Nothing in this list right now'}
      />
      <ListModal open={editOpen} onClose={() => setEditOpen(false)} list={list} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        title="Delete list?"
        message={`"${list.name}" is removed. Its occurrences stay.`}
      />
    </>
  )
}

interface OccurrencesViewProps {
  title: string
  view: OccurrenceView
  onChange: (patch: Partial<OccurrenceView>) => void
  /** Extra header control beside the New button. */
  menu?: ReactNode
  /** Row under the search bar, shown only when it has content (save / reset actions). */
  footer?: ReactNode
  emptyMessage: string
}

function OccurrencesView({ title, view, onChange, menu, footer, emptyMessage }: OccurrencesViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Occurrence | undefined>()
  const [duplicating, setDuplicating] = useState<Occurrence | undefined>()
  const [scheduleMode, setScheduleMode] = useState(false)

  const { data: occurrences = [], isLoading } = useQuery({
    queryKey: ['events', 'all'],
    queryFn: () => occurrencesApi.list(),
  })

  const [editingActivity, setEditingActivity] = useState<Activity | undefined>()

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => goalsApi.list(),
    enabled: editingActivity !== undefined,
  })
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
    enabled: editingActivity !== undefined,
  })
  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list(),
    enabled: editingActivity !== undefined,
  })

  function openEditActivity(a: Activity) {
    setEditingActivity(a)
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
    setDuplicating(undefined)
    setScheduleMode(false)
    setModalOpen(true)
  }

  function openEdit(o: Occurrence) {
    setEditing(o)
    setDuplicating(undefined)
    setScheduleMode(false)
    setModalOpen(true)
  }

  function openDuplicate(o: Occurrence) {
    setEditing(undefined)
    setDuplicating(o)
    setScheduleMode(false)
    setModalOpen(true)
  }

  function openSchedule(o: Occurrence) {
    setEditing(o)
    setDuplicating(undefined)
    setScheduleMode(true)
    setModalOpen(true)
  }

  const { status, category, tag, goal, search, group } = view
  const visible = useMemo(
    () => filterOccurrences(occurrences, { status, category, tag, goal, search }),
    [occurrences, status, category, tag, goal, search],
  )
  const sections = useMemo(() => groupOccurrences(visible, group), [visible, group])

  const activeFilterCount =
    (status !== 'open' ? 1 : 0) + (category !== null ? 1 : 0) + (tag !== null ? 1 : 0) + (goal !== null ? 1 : 0)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title={title}
        leading={
          <Link
            to="/occurrences"
            aria-label="Back to lists"
            className="-ml-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </Link>
        }
        action={
          <div className="flex items-center gap-2">
            {menu}
            <button
              onClick={openCreate}
              aria-label="New occurrence"
              className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
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
                onChange={(e) => onChange({ search: e.target.value })}
                placeholder="Search..."
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {search && (
                <button
                  onClick={() => onChange({ search: '' })}
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

          {filtersOpen && <OccurrenceFilterFields value={view} onChange={onChange} />}

          {footer && <div className="flex items-center justify-between gap-3">{footer}</div>}
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
              <p className="text-sm font-medium text-foreground">{emptyMessage}</p>
              <button
                onClick={openCreate}
                className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                New
              </button>
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
                              onDuplicate={openDuplicate}
                              onEditActivity={openEditActivity}
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
        key={`${editing?.id ?? duplicating?.id ?? 'new'}-${duplicating ? 'dup' : scheduleMode}`}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        occurrence={editing}
        duplicateFrom={duplicating}
        focusStartAt={scheduleMode}
        scheduleOnly={scheduleMode}
      />

      <ActivityModal
        key={editingActivity?.id ?? 'none'}
        open={editingActivity !== undefined}
        onClose={() => setEditingActivity(undefined)}
        activity={editingActivity}
        goals={goals}
        categories={categories}
        tags={tags}
      />
    </div>
  )
}
