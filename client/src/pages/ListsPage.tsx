import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, GripVertical, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { categoriesApi, goalsApi, listsApi, occurrencesApi, tagsApi } from '@/lib/api'
import { invalidateLists } from '@/lib/invalidate'
import { toastError } from '@/store/toasts'
import type { OccurrenceList } from '@/lib/types'
import {
  GROUP_OPTIONS,
  NONE_FILTER,
  STATUS_OPTIONS,
  filterOccurrences,
  listLook,
  viewFromList,
} from '@/lib/occurrenceView'
import { ListTile } from '@/components/lists/ListIcon'
import { ListModal } from '@/components/lists/ListModal'
import { PageHeader } from '@/components/layout/PageHeader'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** `/occurrences`: the saved lists first, then the way into every occurrence. */
export function ListsPage() {
  const location = useLocation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<OccurrenceList | undefined>()
  const [deleting, setDeleting] = useState<OccurrenceList | null>(null)

  const { data: lists = [], isLoading } = useQuery({ queryKey: ['lists'], queryFn: listsApi.list })
  const { data: occurrences = [] } = useQuery({
    queryKey: ['events', 'all'],
    queryFn: () => occurrencesApi.list(),
  })
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: tagsApi.list })
  const { data: goals = [] } = useQuery({ queryKey: ['goals'], queryFn: () => goalsApi.list() })

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of lists) map.set(l.id, filterOccurrences(occurrences, viewFromList(l)).length)
    return map
  }, [lists, occurrences])
  const openCount = useMemo(() => occurrences.filter((o) => o.status === 'pending').length, [occurrences])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => listsApi.delete(id),
    onSuccess: () => {
      setDeleting(null)
      invalidateLists(qc)
    },
    onError: (err) => toastError(err, 'Could not delete the list.'),
  })

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => listsApi.reorder(ids),
    // Optimistic: the row stays where it was dropped instead of jumping back until the refetch.
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['lists'] })
      const snapshot = qc.getQueryData<OccurrenceList[]>(['lists'])
      if (snapshot) {
        const byId = new Map(snapshot.map((l) => [l.id, l]))
        qc.setQueryData(['lists'], ids.map((id) => byId.get(id)).filter((l) => l !== undefined))
      }
      return { snapshot }
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(['lists'], ctx.snapshot)
      toastError(err, 'Could not save the order.')
    },
    onSettled: () => invalidateLists(qc),
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const ids = lists.map((l) => l.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    reorderMutation.mutate(arrayMove(ids, from, to))
  }

  // Old filtered links (`/occurrences?category=...`) belong to the full view.
  if (location.search) return <Navigate to={`/occurrences/all${location.search}`} replace />

  function describe(l: OccurrenceList): string {
    const ref = (value: string | null, none: string, name: string | undefined, missing: string) =>
      value === null ? null : value === NONE_FILTER ? none : (name ?? missing)
    const parts = [
      STATUS_OPTIONS.find((s) => s.value === l.status)?.label,
      ref(l.category, 'No category', categories.find((c) => c.id === l.category)?.name, 'Deleted category'),
      ref(l.tag, 'No tag', tags.find((t) => t.id === l.tag)?.name, 'Deleted tag'),
      ref(l.goal, 'No goal', goals.find((g) => g.id === l.goal)?.title, 'Deleted goal'),
      l.search ? `"${l.search}"` : null,
      l.groupBy && l.groupBy !== 'when'
        ? `by ${GROUP_OPTIONS.find((g) => g.value === l.groupBy)?.label.toLowerCase()}`
        : null,
    ]
    return parts.filter(Boolean).join(', ')
  }

  function openAdd() {
    setEditing(undefined)
    setModalOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Occurrences"
        action={
          <button
            onClick={openAdd}
            aria-label="New list"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          <div>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Lists</p>
            {isLoading ? (
              <div className="flex justify-center py-10">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : lists.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">No lists yet</p>
                <button
                  onClick={openAdd}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  New List
                </button>
              </div>
            ) : (
              <div className="rounded-lg border border-border">
                <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={handleDragEnd}>
                  <SortableContext items={lists.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                    <ul>
                      {lists.map((l) => (
                        <SortableListRow key={l.id} id={l.id}>
                          <ListTile look={listLook(l, goals, categories)} />
                          <Link to={`/occurrences/lists/${l.id}`} className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-foreground">{l.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{describe(l)}</span>
                          </Link>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{counts.get(l.id) ?? 0}</span>
                          <ActionMenu
                            ariaLabel={`Actions for ${l.name}`}
                            iconClassName="h-3.5 w-3.5"
                            items={[
                              {
                                icon: Pencil,
                                label: 'Edit',
                                onClick: () => {
                                  setEditing(l)
                                  setModalOpen(true)
                                },
                              },
                              'separator',
                              { icon: Trash2, label: 'Delete', onClick: () => setDeleting(l), destructive: true },
                            ]}
                          />
                        </SortableListRow>
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>
              </div>
            )}
          </div>

          <Link
            to="/occurrences/all"
            className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <ListTodo className="h-[15px] w-[15px] text-primary" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-foreground">All occurrences</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{openCount} open</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
          </Link>
        </div>
      </div>

      <ListModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        list={editing}
        onSaved={(l) => {
          if (!editing) navigate(`/occurrences/lists/${l.id}`)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        loading={deleteMutation.isPending}
        title="Delete list?"
        message={`"${deleting?.name ?? ''}" is removed. Its occurrences stay.`}
      />
    </div>
  )
}

function SortableListRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group relative flex items-center gap-3 border-b border-border bg-card py-2.5 pl-5 pr-3 transition-colors first:rounded-t-lg last:rounded-b-lg last:border-b-0 hover:bg-muted/40 ${
        isDragging ? 'z-10 shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        className="absolute inset-y-0 left-0 flex w-5 cursor-grab touch-none items-center justify-center text-muted-foreground/60 transition-opacity hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <GripVertical className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      {children}
    </li>
  )
}
