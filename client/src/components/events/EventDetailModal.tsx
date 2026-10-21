import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, X, Pencil, Trash2, Clock, CalendarPlus, Copy, History, MoreHorizontal, Pin, PinOff, Layers, Flag, CalendarOff } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { GoalBadge } from '@/components/goals/GoalBadge'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { CategoryIcon } from '@/components/categories/categoryIcons'
import { SkipRescheduleModal } from '@/components/events/SkipRescheduleModal'
import { TimeSplitEditor } from '@/components/events/TimeSplitEditor'
import { OccurrenceNotes } from '@/components/events/OccurrenceNotes'
import { ActivityHistoryModal } from '@/components/activities/ActivityHistoryModal'
import { occurrencesApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Activity, Occurrence, OccurrenceSubtask, EventStatus } from '@/lib/types'
import { invalidateOccurrences } from '@/lib/invalidate'
import { addNextOccurrence, formatDay, nextRepeatFor } from '@/lib/repeat'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

function formatOccurrenceTime(o: Occurrence): string {
  const refIso = o.startAt ?? o.endAt
  if (!refIso) return ''

  const d = new Date(refIso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  let dateLabel: string
  if (sameDay(d, today)) dateLabel = 'Today'
  else if (sameDay(d, tomorrow)) dateLabel = 'Tomorrow'
  else dateLabel = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  if (o.isAllDay) {
    if (o.endAt) {
      // endAt is exclusive; inclusive end = endAt - 1 day
      const endInclusive = new Date(new Date(o.endAt).getTime() - 86400000)
      if (!sameDay(d, endInclusive)) {
        let endLabel: string
        if (sameDay(endInclusive, today)) endLabel = 'Today'
        else if (sameDay(endInclusive, tomorrow)) endLabel = 'Tomorrow'
        else endLabel = endInclusive.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
        return `${dateLabel} - ${endLabel}`
      }
    }
    return `${dateLabel}, Date only`
  }

  if (o.startAt && o.endAt) {
    return `${dateLabel}, ${formatTime(o.startAt)} - ${formatTime(o.endAt)}`
  }

  if (o.startAt) return `${dateLabel}, ${formatTime(o.startAt)}`
  return `${dateLabel}, Due ${formatTime(o.endAt!)}`
}

interface EventDetailModalProps {
  open: boolean
  onClose: () => void
  event: Occurrence | null
  onEdit: (o: Occurrence) => void
  onSchedule?: (o: Occurrence) => void
  onDuplicate?: (o: Occurrence) => void
  /** Edits the parent activity rather than this occurrence. Only offered for the activity kind. */
  onEditActivity?: (a: Activity) => void
}

export function EventDetailModal({ open, onClose, event: occurrence, onEdit, onSchedule, onDuplicate, onEditActivity }: EventDetailModalProps) {
  const qc = useQueryClient()
  const [moreOpen, setMoreOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [menuPos, setMenuPos] = useState<{ bottom: number; left: number } | null>(null)
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const [localSubtasks, setLocalSubtasks] = useState<OccurrenceSubtask[]>(() => occurrence?.subtasks ?? [])

  const [addNext, setAddNext] = useState(true)

  useEffect(() => {
    setLocalSubtasks(occurrence?.subtasks ?? [])
  }, [occurrence?.subtasks])

  useEffect(() => {
    setAddNext(true)
  }, [occurrence?.id])

  useEffect(() => {
    if (!moreOpen) return
    function close(e: MouseEvent) {
      const target = e.target as Node
      if (moreButtonRef.current?.contains(target)) return
      if (moreMenuRef.current?.contains(target)) return
      setMoreOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [moreOpen])

  // Measured after render: the menu hangs right-aligned under the button, but the
  // footer's left side can push the button close to the edge, so clamp it into view.
  useLayoutEffect(() => {
    if (!moreOpen || !moreButtonRef.current || !moreMenuRef.current) return
    const rect = moreButtonRef.current.getBoundingClientRect()
    const width = moreMenuRef.current.offsetWidth
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    setMenuPos({ bottom: window.innerHeight - rect.top + 4, left })
  }, [moreOpen])

  function openMore() {
    setMenuPos(null)
    setMoreOpen((o) => !o)
  }

  const subtaskToggleMutation = useMutation({
    mutationFn: (subtaskId: string) => occurrencesApi.toggleSubtask(occurrence!.id, subtaskId),
    onMutate: (subtaskId) => {
      setLocalSubtasks((prev) => prev.map((s) => s.id === subtaskId ? { ...s, isDone: !s.isDone } : s))
    },
    onSuccess: (updated) => {
      setLocalSubtasks(updated.subtasks)
      invalidateOccurrences(qc)
    },
    onError: (err, subtaskId) => {
      setLocalSubtasks((prev) => prev.map((s) => s.id === subtaskId ? { ...s, isDone: !s.isDone } : s))
      toastError(err, 'Could not update subtask.')
    },
  })

const statusMutation = useMutation({
    mutationFn: (status: EventStatus) => occurrencesApi.setStatus(occurrence!.id, status),
    onMutate: () => ({ source: occurrence! }),
    onSuccess: (_updated, status, ctx) => {
      invalidateOccurrences(qc)
      if (status === 'done' && addNext) addNextOccurrence(qc, ctx.source)
      onClose()
    },
    onError: (err) => toastError(err, 'Could not update the status.'),
  })

  const planMutation = useMutation({
    mutationFn: () => {
      const d = new Date(occurrence!.startAt!)
      d.setHours(0, 0, 0, 0)
      return occurrencesApi.patch(occurrence!.id, { startAt: d.toISOString(), endAt: null, isAllDay: true, isPlanned: true })
    },
    onSuccess: () => {
      invalidateOccurrences(qc)
      onClose()
    },
    onError: (err) => toastError(err, 'Could not update the occurrence.'),
  })

  const floatMutation = useMutation({
    mutationFn: (isNoDate: boolean) =>
      occurrencesApi.patch(occurrence!.id, { startAt: null, endAt: null, isAllDay: false, isPlanned: false, isNoDate }),
    onSuccess: () => {
      invalidateOccurrences(qc)
      onClose()
    },
    onError: (err) => toastError(err, 'Could not update the occurrence.'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => occurrencesApi.delete(occurrence!.id),
    onSuccess: () => {
      setConfirmDelete(false)
      qc.setQueriesData<Occurrence[]>({ queryKey: ['events'] }, (old) =>
        Array.isArray(old) ? old.filter((o) => o.id !== occurrence!.id) : old,
      )
      invalidateOccurrences(qc)
      onClose()
    },
    onError: (err) => toastError(err, 'Could not delete the occurrence.'),
  })

  if (!occurrence) return null

  const isPending = occurrence.status === 'pending'
  const isFloat = !occurrence.startAt && !occurrence.endAt && !occurrence.isAllDay
  // SkipRescheduleModal rendered outside the main Modal so it layers on top
  if (skipOpen) return (
    <SkipRescheduleModal
      open={skipOpen}
      onClose={() => setSkipOpen(false)}
      occurrence={occurrence}
      onDone={() => { setSkipOpen(false); onClose() }}
    />
  )
  // Same swap, but history is read-only, so closing it drops back to the detail panel it was opened from.
  if (historyOpen) return (
    <ActivityHistoryModal
      open={historyOpen}
      activity={occurrence.activity}
      onClose={() => setHistoryOpen(false)}
    />
  )
  const busy = statusMutation.isPending || deleteMutation.isPending || planMutation.isPending || floatMutation.isPending
  const timeLabel = formatOccurrenceTime(occurrence)
  const category = occurrence.activity.category
  const goals = occurrence.activity.goals
  const nextRepeat = isPending ? nextRepeatFor(occurrence) : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={occurrence.effectiveTitle}
      footer={
        <>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
            aria-label="Delete"
            className="mr-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            {deleteMutation.isPending
              ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              : <Trash2 className="h-4 w-4" strokeWidth={2} />}
          </button>
          <ConfirmDialog
            open={confirmDelete}
            onClose={() => setConfirmDelete(false)}
            onConfirm={() => deleteMutation.mutate()}
            loading={deleteMutation.isPending}
            title="Delete occurrence?"
            message={`"${occurrence.effectiveTitle}" will be permanently deleted.`}
          />

          {nextRepeat && (
            <button
              type="button"
              role="checkbox"
              aria-checked={addNext}
              onClick={() => setAddNext((v) => !v)}
              disabled={busy}
              title="Add the next occurrence when this one is done"
              className="flex h-9 min-w-0 items-center gap-1.5 rounded-lg px-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                  addNext ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background'
                }`}
              >
                {addNext && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span className="truncate">Again {formatDay(nextRepeat)}</span>
            </button>
          )}

          <button
            ref={moreButtonRef}
            onClick={openMore}
            disabled={busy}
            aria-label="More actions"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
          </button>
          {moreOpen && createPortal(
            <div
              ref={moreMenuRef}
              style={{ position: 'fixed', bottom: menuPos?.bottom ?? 0, left: menuPos?.left ?? 0, zIndex: 60, visibility: menuPos ? 'visible' : 'hidden' }}
              className="min-w-[160px] rounded-lg border border-border bg-card py-1 shadow-pop"
            >
              <button
                onClick={() => { setMoreOpen(false); onClose(); onEdit(occurrence) }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                Edit
              </button>
              {onEditActivity && occurrence.activity.kind === 'activity' && (
                <button
                  onClick={() => { setMoreOpen(false); onClose(); onEditActivity(occurrence.activity) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <Layers className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  Edit activity
                </button>
              )}
              <button
                onClick={() => { setMoreOpen(false); setHistoryOpen(true) }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
              >
                <History className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                History
              </button>
              {onDuplicate && (
                <button
                  onClick={() => { setMoreOpen(false); onDuplicate(occurrence) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <Copy className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  Duplicate
                </button>
              )}
              {isPending && (occurrence.isPlanned || isFloat) && onSchedule && (
                <button
                  onClick={() => { setMoreOpen(false); onClose(); onSchedule(occurrence) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <CalendarPlus className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  Schedule
                </button>
              )}
              {isPending && occurrence.startAt && !(occurrence.isAllDay && occurrence.isPlanned) && (
                <button
                  onClick={() => { setMoreOpen(false); planMutation.mutate() }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <Pin className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  Plan
                </button>
              )}
              {isPending && (occurrence.startAt || occurrence.isNoDate) && (
                <button
                  onClick={() => { setMoreOpen(false); floatMutation.mutate(false) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <PinOff className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  Float
                </button>
              )}
              {isPending && !occurrence.isNoDate && (
                <button
                  onClick={() => { setMoreOpen(false); floatMutation.mutate(true) }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                >
                  <CalendarOff className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                  No date
                </button>
              )}
            </div>,
            document.body,
          )}

          {isPending ? (
            <>
              <button
                type="button"
                onClick={() => statusMutation.mutate('done')}
                disabled={busy}
                aria-label="Mark done"
                title="Mark done"
                className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted disabled:opacity-50"
              >
                {statusMutation.isPending
                  ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-[5px] border-2 border-border bg-background text-primary transition-colors group-hover:border-primary">
                      <Check className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={3} />
                    </span>
                  )}
              </button>
              {!isFloat && (
                <button
                  type="button"
                  onClick={() => setSkipOpen(true)}
                  disabled={busy}
                  aria-label="Skip"
                  title="Skip"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => statusMutation.mutate('pending')}
              loading={statusMutation.isPending}
              disabled={deleteMutation.isPending}
            >
              Reactivate
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {timeLabel && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>{timeLabel}</span>
          </div>
        )}

        {category && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CategoryIcon icon={category.icon} color={category.color} size={16} strokeWidth={2} />
            {category.name}
          </div>
        )}

        {occurrence.deadline && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Flag className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>
              {occurrence.deadline.effectiveTitle}
              {(occurrence.deadline.startAt ?? occurrence.deadline.endAt) && (
                <> - {new Date((occurrence.deadline.startAt ?? occurrence.deadline.endAt)!).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</>
              )}
            </span>
          </div>
        )}

        {occurrence.linkedDoneCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>
              {occurrence.linkedDoneCount} {occurrence.linkedDoneCount === 1 ? 'session' : 'sessions'} done
              {occurrence.linkedDoneMinutes > 0 && `, ${formatDuration(occurrence.linkedDoneMinutes)}`}
            </span>
          </div>
        )}

        {occurrence.effectiveTags.length > 0 && (
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {occurrence.effectiveTags.map((t) => <span key={t.id}>#{t.name}</span>)}
          </div>
        )}

        {goals.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {goals.map((g) => <GoalBadge key={g.id} goal={g} />)}
          </div>
        )}

        {occurrence.status !== 'pending' && (
          <div className="flex items-center gap-2">
            <Badge tone={occurrence.status === 'done' ? 'green' : 'neutral'}>
              {occurrence.status === 'done' ? 'Completed' : 'Skipped'}
            </Badge>
          </div>
        )}

        {localSubtasks.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Subtasks ({localSubtasks.filter((s) => s.isDone).length}/{localSubtasks.length})
            </span>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {localSubtasks.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                  <button
                    onClick={() => subtaskToggleMutation.mutate(s.id)}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
                      s.isDone
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:border-primary'
                    }`}
                  >
                    {s.isDone && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </button>
                  <span className={`flex-1 text-sm ${s.isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {s.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <OccurrenceNotes key={`notes-${occurrence.id}`} occurrence={occurrence} />

        {occurrence.activity.kind === 'activity' && (
          <TimeSplitEditor key={occurrence.id} occurrence={occurrence} />
        )}
      </div>
    </Modal>
  )
}
