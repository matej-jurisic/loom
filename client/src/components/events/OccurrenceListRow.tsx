import { useState, type CSSProperties, type HTMLAttributes, type MouseEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, X, Pencil, Trash2, CalendarPlus, Copy, Clock, History, ListChecks, Flag, Layers, GripVertical, CornerDownRight, ListPlus, Link2 } from 'lucide-react'
import { occurrencesApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Activity, Occurrence, OccurrenceRef, EventStatus } from '@/lib/types'
import { GoalBadge } from '@/components/goals/GoalBadge'
import { ActionMenu, type ActionMenuEntry } from '@/components/ui/ActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CategoryIcon } from '@/components/categories/categoryIcons'
import { OccurrenceSubtasksModal } from '@/components/events/OccurrenceSubtasksModal'
import { SkipRescheduleModal } from '@/components/events/SkipRescheduleModal'
import { ActivityHistoryModal } from '@/components/activities/ActivityHistoryModal'
import { invalidateOccurrences } from '@/lib/invalidate'
import { addNextOccurrence } from '@/lib/repeat'
import { hasRelated } from '@/lib/occurrenceView'
import { RelatedOccurrencesModal } from '@/components/events/RelatedOccurrencesModal'

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  return h > 0 ? `${h}h` : `${m}m`
}

/** Wiring from `SortableOccurrenceList`: the row becomes draggable by a grip in its left gutter. */
export interface RowDrag {
  ref: (el: HTMLElement | null) => void
  style: CSSProperties
  handle: HTMLAttributes<HTMLElement> & { ref: (el: HTMLElement | null) => void }
  dragging: boolean
}

interface OccurrenceListRowProps {
  occurrence: Occurrence
  /** Precomputed date/time label; each page formats its own. */
  timeText?: string | null
  onEdit: (o: Occurrence) => void
  onSchedule?: (o: Occurrence) => void
  onDuplicate?: (o: Occurrence) => void
  onEditActivity?: (a: Activity) => void
  /** Called with the occurrence to follow up on: this one, or its own source when it is a follow-up. */
  onAddFollowUp?: (source: OccurrenceRef) => void
  drag?: RowDrag
}

export function OccurrenceListRow({ occurrence, timeText, onEdit, onSchedule, onDuplicate, onEditActivity, onAddFollowUp, drag }: OccurrenceListRowProps) {
  const qc = useQueryClient()
  const [subtasksOpen, setSubtasksOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [relatedOpen, setRelatedOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isPending = occurrence.status === 'pending'
  const isDone = occurrence.status === 'done'
  const isSkipped = occurrence.status === 'skipped'
  const hasSubtasks = occurrence.subtasks.length > 0
  const completedCount = occurrence.subtasks.filter((s) => s.isDone).length
  const cat = occurrence.activity.category
  const goals = occurrence.activity.goals
  const deadline = occurrence.deadline
  const source = occurrence.source
  const followUpLabel = occurrence.followUpCount > 0
    ? `${occurrence.followUpDoneCount}/${occurrence.followUpCount} related${occurrence.followUpDoneMinutes > 0 ? `, ${formatMinutes(occurrence.followUpDoneMinutes)}` : ''}`
    : null
  const linkedLabel = occurrence.linkedDoneCount > 0
    ? `${occurrence.linkedDoneCount} ${occurrence.linkedDoneCount === 1 ? 'session' : 'sessions'}${occurrence.linkedDoneMinutes > 0 ? `, ${formatMinutes(occurrence.linkedDoneMinutes)}` : ''}`
    : null

  const statusMutation = useMutation({
    mutationFn: (status: EventStatus) => occurrencesApi.setStatus(occurrence.id, status),
    // Optimistic: flip the row in every occurrence list immediately, roll back on error.
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ['events'] })
      const snapshots = qc.getQueriesData<Occurrence[]>({ queryKey: ['events'] })
      // Not every ['events'] entry is an occurrence array (e.g. the subtask-apply count).
      qc.setQueriesData<Occurrence[]>({ queryKey: ['events'] }, (old) =>
        Array.isArray(old)
          ? old.map((o) =>
              o.id === occurrence.id
                ? { ...o, status, isOverdue: status === 'pending' ? o.isOverdue : false, isBehind: status === 'pending' ? o.isBehind : false }
                : o,
            )
          : old,
      )
      return { snapshots, source: occurrence }
    },
    onError: (err, _status, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data))
      toastError(err, 'Could not update the status.')
    },
    onSuccess: (_updated, status, ctx) => {
      if (status === 'done') addNextOccurrence(qc, ctx.source)
    },
    onSettled: () => {
      invalidateOccurrences(qc)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => occurrencesApi.delete(occurrence.id),
    onSuccess: () => {
      setConfirmDelete(false)
      qc.setQueriesData<Occurrence[]>({ queryKey: ['events'] }, (old) =>
        Array.isArray(old) ? old.filter((o) => o.id !== occurrence.id) : old,
      )
      invalidateOccurrences(qc)
    },
    onError: (err) => toastError(err, 'Could not delete the occurrence.'),
  })

  const menuItems: ActionMenuEntry[] = [
    ...(hasSubtasks
      ? [{ icon: ListChecks, label: 'Subtasks', onClick: () => setSubtasksOpen(true) }]
      : []),
    ...(isPending ? [{ icon: X, label: 'Skip', onClick: () => setSkipOpen(true) }] : []),
    ...(isPending && !occurrence.startAt && onSchedule
      ? [{ icon: CalendarPlus, label: 'Schedule', onClick: () => onSchedule(occurrence) }]
      : []),
    { icon: History, label: 'History', onClick: () => setHistoryOpen(true) },
    ...(hasRelated(occurrence) ? [{ icon: Link2, label: 'See related', onClick: () => setRelatedOpen(true) }] : []),
    ...(onDuplicate ? [{ icon: Copy, label: 'Duplicate', onClick: () => onDuplicate(occurrence) }] : []),
    ...(onAddFollowUp ? [{ icon: ListPlus, label: 'Add related', onClick: () => onAddFollowUp(source ?? occurrence) }] : []),
    { icon: Pencil, label: 'Edit', onClick: () => onEdit(occurrence) },
    ...(onEditActivity && occurrence.activity.kind === 'activity'
      ? [{ icon: Layers, label: 'Edit activity', onClick: () => onEditActivity(occurrence.activity) }]
      : []),
    'separator',
    { icon: Trash2, label: 'Delete', onClick: () => setConfirmDelete(true), destructive: true },
  ]

  // A click on the row body edits. Its own controls keep their behaviour, and the modals it mounts
  // portal out of the <li> but still bubble React clicks through it, hence the `contains` check.
  function handleRowClick(e: MouseEvent<HTMLLIElement>) {
    const target = e.target as HTMLElement
    if (!e.currentTarget.contains(target) || target.closest('button, a, input, [role="menu"]')) return
    onEdit(occurrence)
  }

  return (
    <li
      ref={drag?.ref}
      style={drag?.style}
      onClick={handleRowClick}
      className={`group relative flex cursor-pointer items-center gap-3 border-b border-border px-5 py-3 last:border-b-0 first:rounded-t-lg last:rounded-b-lg transition-colors ${
        isPending && occurrence.isOverdue ? 'bg-destructive/10 hover:bg-destructive/15' : 'bg-card hover:bg-muted/40'
      } ${drag?.dragging ? 'z-10 shadow-lg' : ''}`}
    >
      {drag && (
        <button
          type="button"
          {...drag.handle}
          aria-label="Drag to reorder"
          className="absolute inset-y-0 left-0 flex w-5 cursor-grab touch-none items-center justify-center text-muted-foreground/60 transition-opacity hover:text-foreground focus-visible:opacity-100 active:cursor-grabbing [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      )}
      {/* Status checkbox */}
      <button
        onClick={() => statusMutation.mutate(isPending ? 'done' : 'pending')}
        title={isPending ? 'Mark done' : 'Mark pending'}
        aria-label={isPending ? 'Mark done' : 'Mark pending'}
        className={[
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors',
          isDone
            ? 'border-primary bg-primary text-primary-foreground'
            : isSkipped
              ? 'border-dashed border-muted-foreground text-muted-foreground'
              : 'border-border bg-background hover:border-primary',
        ].join(' ')}
      >
        {isDone && <Check className="h-3 w-3" strokeWidth={3} />}
        {isSkipped && <X className="h-3 w-3" strokeWidth={3} />}
      </button>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={`text-sm ${!isPending ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
            {occurrence.effectiveTitle}
          </span>
          {occurrence.activity.shortLabel && (
            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground">
              {occurrence.activity.shortLabel}
            </span>
          )}
          {goals.map((g) => <GoalBadge key={g.id} goal={g} />)}
          {occurrence.isPlanned && (
            <span className="inline-flex items-center rounded-md border border-dashed border-muted-foreground/60 px-1.5 py-0.5 text-[11px] font-medium leading-none tracking-wide text-muted-foreground">
              PLAN
            </span>
          )}
        </div>
        {(timeText || cat || hasSubtasks || deadline || linkedLabel || source || followUpLabel || occurrence.effectiveTags.length > 0) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {timeText && (
              <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" strokeWidth={2} />
                {timeText}
              </span>
            )}
            {cat && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CategoryIcon icon={cat.icon} color={cat.color} size={11} strokeWidth={2} />
                {cat.name}
              </span>
            )}
            {occurrence.effectiveTags.map((t) => (
              <span key={t.id} className="text-xs text-muted-foreground">
                #{t.name}
              </span>
            ))}
            {deadline && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title="Deadline">
                <Flag className="h-3 w-3 shrink-0" strokeWidth={2} />
                <span className="truncate">{deadline.effectiveTitle}</span>
              </span>
            )}
            {source && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title="Related to">
                <CornerDownRight className="h-3 w-3 shrink-0" strokeWidth={2} />
                <span className="truncate">{source.effectiveTitle}</span>
              </span>
            )}
            {followUpLabel && (
              <span className="whitespace-nowrap text-xs text-muted-foreground" title="Related done">
                {followUpLabel}
              </span>
            )}
            {linkedLabel && (
              <span className="whitespace-nowrap text-xs text-muted-foreground" title="Completed sessions linked to this deadline">
                {linkedLabel}
              </span>
            )}
            {hasSubtasks && (
              <button
                type="button"
                onClick={() => setSubtasksOpen(true)}
                title="Subtasks"
                className={`flex items-center gap-1 text-xs transition-colors hover:text-foreground ${
                  completedCount === occurrence.subtasks.length ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <ListChecks className="h-3 w-3 shrink-0" strokeWidth={2} />
                {completedCount}/{occurrence.subtasks.length}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0">
        <ActionMenu items={menuItems} />
      </div>

      {hasSubtasks && subtasksOpen && (
        <OccurrenceSubtasksModal
          open={subtasksOpen}
          onClose={() => setSubtasksOpen(false)}
          occurrence={occurrence}
        />
      )}
      {/* Mounted only while open: the modal fetches this activity's whole history, and a plan day can
          hold dozens of rows. */}
      {historyOpen && (
        <ActivityHistoryModal
          open={historyOpen}
          activity={occurrence.activity}
          onClose={() => setHistoryOpen(false)}
        />
      )}
      {relatedOpen && (
        <RelatedOccurrencesModal
          open={relatedOpen}
          occurrence={occurrence}
          onClose={() => setRelatedOpen(false)}
        />
      )}
      <SkipRescheduleModal
        open={skipOpen}
        onClose={() => setSkipOpen(false)}
        occurrence={occurrence}
        onDone={() => setSkipOpen(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        loading={deleteMutation.isPending}
        title="Delete occurrence?"
        message={`"${occurrence.effectiveTitle}" will be permanently deleted.`}
      />
    </li>
  )
}
