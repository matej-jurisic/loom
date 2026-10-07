import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, X, Pencil, Trash2, CalendarPlus, Clock, History, ListChecks, Flag } from 'lucide-react'
import { occurrencesApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Occurrence, EventStatus } from '@/lib/types'
import { Badge } from '@/components/ui/Badge'
import { ActionMenu, type ActionMenuEntry } from '@/components/ui/ActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CategoryIcon } from '@/components/categories/categoryIcons'
import { OccurrenceSubtasksModal } from '@/components/events/OccurrenceSubtasksModal'
import { SkipRescheduleModal } from '@/components/events/SkipRescheduleModal'
import { ActivityHistoryModal } from '@/components/activities/ActivityHistoryModal'
import { invalidateOccurrences } from '@/lib/invalidate'

const GOAL_TONE: Record<string, 'focus' | 'active' | 'bench' | 'neutral'> = {
  focus: 'focus',
  active: 'active',
  bench: 'bench',
  closed: 'neutral',
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  return h > 0 ? `${h}h` : `${m}m`
}

interface OccurrenceListRowProps {
  occurrence: Occurrence
  /** Precomputed date/time label; each page formats its own. */
  timeText?: string | null
  onEdit: (o: Occurrence) => void
  onSchedule?: (o: Occurrence) => void
}

export function OccurrenceListRow({ occurrence, timeText, onEdit, onSchedule }: OccurrenceListRowProps) {
  const qc = useQueryClient()
  const [subtasksOpen, setSubtasksOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isPending = occurrence.status === 'pending'
  const isDone = occurrence.status === 'done'
  const isSkipped = occurrence.status === 'skipped'
  const hasSubtasks = occurrence.subtasks.length > 0
  const completedCount = occurrence.subtasks.filter((s) => s.isDone).length
  const cat = occurrence.activity.category
  const goals = occurrence.activity.goals
  const deadline = occurrence.deadline
  const linkedLabel = occurrence.linkedDoneCount > 0
    ? `${occurrence.linkedDoneCount} ${occurrence.linkedDoneCount === 1 ? 'session' : 'sessions'}${occurrence.linkedDoneMinutes > 0 ? `, ${formatMinutes(occurrence.linkedDoneMinutes)}` : ''}`
    : null

  const statusMutation = useMutation({
    mutationFn: (status: EventStatus) => occurrencesApi.setStatus(occurrence.id, status),
    // Optimistic: flip the row in every occurrence list immediately, roll back on error.
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: ['events'] })
      const snapshots = qc.getQueriesData<Occurrence[]>({ queryKey: ['events'] })
      qc.setQueriesData<Occurrence[]>({ queryKey: ['events'] }, (old) =>
        old?.map((o) =>
          o.id === occurrence.id
            ? { ...o, status, isOverdue: status === 'pending' ? o.isOverdue : false }
            : o,
        ),
      )
      return { snapshots }
    },
    onError: (err, _status, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data))
      toastError(err, 'Could not update the status.')
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
        old ? old.filter((o) => o.id !== occurrence.id) : old,
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
    { icon: Pencil, label: 'Edit', onClick: () => onEdit(occurrence) },
    { icon: Trash2, label: 'Delete', onClick: () => setConfirmDelete(true), destructive: true },
  ]

  return (
    <li className="group relative flex items-center gap-3 border-b border-border bg-card px-5 py-3 last:border-b-0 first:rounded-t-lg last:rounded-b-lg hover:bg-muted/40 transition-colors">
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
          {goals.map((g) => <Badge key={g.id} tone={GOAL_TONE[g.status] ?? 'neutral'}>{g.title}</Badge>)}
        </div>
        {(timeText || cat || hasSubtasks || deadline || linkedLabel) && (
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
            {deadline && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title="Deadline">
                <Flag className="h-3 w-3 shrink-0" strokeWidth={2} />
                <span className="truncate">{deadline.effectiveTitle}</span>
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
        message={`"${occurrence.effectiveTitle}" will be permanently deleted. This cannot be undone.`}
      />
    </li>
  )
}
