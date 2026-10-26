import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Trash2, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Select } from '@/components/ui/Select'
import { DateTimePicker } from '@/components/ui/DateTimePicker'
import { occurrencesApi, activitiesApi, categoriesApi, goalsApi, tagsApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Activity, ActivityKind, Occurrence, OccurrenceRef } from '@/lib/types'
import { invalidateOccurrences } from '@/lib/invalidate'
import { GoalPicker } from '@/components/goals/GoalPicker'
import { TagPicker } from '@/components/tags/TagPicker'
import { ReminderPicker } from '@/components/reminders/ReminderPicker'
import { pickableGoals } from '@/lib/goals'
import { isDue } from '@/lib/calendarLayout'
import { weekdayDate } from '@/lib/dates'

// Draft subtask row: id present = existing subtask, absent = added in this edit session.
interface DraftSubtask {
  id?: string
  title: string
}

interface FormState {
  activityId: string
  title: string
  categoryId: string
  goalIds: string[]
  tagIds: string[]
  startAt: string
  endAt: string
  deadlineId: string
  sourceId: string
}

interface Errors {
  activityId?: string
  title?: string
  endAt?: string
}

type TimeMode = 'due' | 'scheduled' | 'floating' | 'nodate'

// The two modes that carry no date at all.
const isUndated = (mode: TimeMode) => mode === 'floating' || mode === 'nodate'

function validate(form: FormState, kind: ActivityKind, timeMode: TimeMode, isAllDay: boolean): Errors {
  const errs: Errors = {}
  if (kind === 'activity' && !form.activityId) errs.activityId = 'Please select an activity.'
  if (kind === 'event' && !form.title.trim()) errs.title = 'Title is required.'
  if (timeMode === 'scheduled' && !isAllDay && form.startAt && form.endAt && form.endAt <= form.startAt) {
    errs.endAt = 'End time must be after start time.'
  }
  if (timeMode === 'scheduled' && isAllDay && form.startAt && form.endAt && form.endAt.substring(0, 10) < form.startAt.substring(0, 10)) {
    errs.endAt = 'End date must be on or after the start date.'
  }
  return errs
}

function todayLocal(): string {
  const d = new Date()
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T00:00`
}

function toInputValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}

// How far back the "Related to" picker looks, counted from the start of today.
const SOURCE_LOOKBACK_DAYS = 60

function sourceCutoffIso(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - SOURCE_LOOKBACK_DAYS)
  return d.toISOString()
}

// Sublabel for the Deadline and Related pickers. Goals first: several occurrences can share a
// title ("Lab 2") across courses.
function linkSublabel(o: { startAt: string | null; endAt: string | null; activity?: Occurrence['activity'] }) {
  const iso = o.startAt ?? o.endAt
  const parts = [o.activity?.goals.map((g) => g.title).join(', ') ?? '', iso ? weekdayDate(iso) : '']
  return parts.filter(Boolean).join(' · ') || undefined
}

function toIso(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

function addMinutes(dtLocal: string, minutes: number): string {
  if (!dtLocal) return ''
  const d = new Date(dtLocal)
  d.setMinutes(d.getMinutes() + minutes)
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`
}

function addOneHour(dtLocal: string): string {
  return addMinutes(dtLocal, 60)
}

function toAllDayEndInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  d.setDate(d.getDate() - 1)
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
}

function toAllDayExclusiveEndIso(displayDate: string): string {
  const d = new Date(displayDate + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString()
}

interface OccurrenceModalProps {
  open: boolean
  onClose: () => void
  occurrence?: Occurrence
  duplicateFrom?: Occurrence
  focusStartAt?: boolean
  defaultStartAt?: string
  defaultEndAt?: string
  defaultActivity?: Activity
  scheduleOnly?: boolean
  /** Opens a new occurrence that follows up on this one. */
  followUpOf?: OccurrenceRef
}

export function EventModal({ open, onClose, occurrence, duplicateFrom, focusStartAt, defaultStartAt, defaultEndAt, defaultActivity, scheduleOnly, followUpOf }: OccurrenceModalProps) {
  const qc = useQueryClient()
  const isEdit = Boolean(occurrence)

  const source = occurrence ?? duplicateFrom

  const isEventKind = source?.activity.kind === 'event'

  const [kind, setKind] = useState<ActivityKind>(() => isEventKind ? 'event' : 'activity')

  const [form, setForm] = useState<FormState>(() => ({
    activityId: source?.activityId ?? defaultActivity?.id ?? '',
    title: isEventKind ? (source?.activity.title ?? '') : (occurrence?.title ?? duplicateFrom?.title ?? ''),
    categoryId: source?.activity.categoryId ?? '',
    goalIds: source?.activity.goals.map((g) => g.id) ?? [],
    tagIds: source?.tags.map((t) => t.id) ?? [],
    startAt: occurrence ? (toInputValue(occurrence.startAt) || (scheduleOnly ? todayLocal() : '')) : (duplicateFrom ? toInputValue(duplicateFrom.startAt) : (defaultStartAt ?? todayLocal())),
    endAt: source?.isAllDay && source?.endAt
      ? toAllDayEndInput(source.endAt)
      : (occurrence ? toInputValue(occurrence.endAt) : (duplicateFrom ? toInputValue(duplicateFrom.endAt) : (defaultEndAt ?? ''))),
    deadlineId: source?.deadline && (occurrence || source.deadline.status === 'pending') ? source.deadline.id : '',
    sourceId: followUpOf?.id ?? source?.sourceOccurrenceId ?? '',
  }))

  const [errors, setErrors] = useState<Errors>({})
  const [isAllDay, setIsAllDay] = useState(() => source?.isAllDay ?? false)
  const [isPlanned, setIsPlanned] = useState(() => scheduleOnly ? false : (source?.isPlanned ?? false))
  const [timeMode, setTimeMode] = useState<TimeMode>(() => {
    if (scheduleOnly) {
      if (occurrence!.startAt && occurrence!.endAt) return 'scheduled'
      return 'due'
    }
    if (source) {
      if (source.isNoDate) return 'nodate'
      if (!source.startAt && !source.endAt && !source.isAllDay) return 'floating'
      if (source.startAt && source.endAt) return 'scheduled'
      return 'due'
    }
    return defaultEndAt ? 'scheduled' : 'due'
  })

  const [showAdvanced, setShowAdvanced] = useState(() => {
    if (isEdit || scheduleOnly || followUpOf) return true
    if (!source) return false
    if (source.title) return true
    if (source.activity?.categoryId || source.activity?.goals.length) return true
    if (source.deadlineOccurrenceId || source.sourceOccurrenceId) return true
    if (source.tags.length || source.reminders?.length) return true
    return false
  })

  const [showNewActivity, setShowNewActivity] = useState(false)
  const [newActivityTitle, setNewActivityTitle] = useState('')
  const [newActivityCategoryId, setNewActivityCategoryId] = useState('')
  const [newActivityGoalId, setNewActivityGoalId] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [subtasks, setSubtasks] = useState<DraftSubtask[]>(
    () => (occurrence?.subtasks ?? []).map((s) => ({ id: s.id, title: s.title })),
  )
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')
  // null inherits the activity's reminders; a list (even empty) overrides them for this occurrence.
  const [reminders, setReminders] = useState<number[] | null>(() => source?.reminders ?? null)

  useEffect(() => {
    if (open) {
      setSubtasks((occurrence?.subtasks ?? []).map((s) => ({ id: s.id, title: s.title })))
      setNewSubtaskTitle('')
    }
  }, [open, occurrence?.id])

  useEffect(() => {
    if (open) setErrors({})
  }, [open])

  const { data: activities = [] } = useQuery({
    queryKey: ['activities'],
    queryFn: () => activitiesApi.list(),
    enabled: open && kind === 'activity',
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
    enabled: open && (showNewActivity || kind === 'event'),
  })

  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => goalsApi.list(),
    enabled: open && (showNewActivity || kind === 'event'),
  })

  const { data: tags = [] } = useQuery({
    queryKey: ['tags'],
    queryFn: tagsApi.list,
    enabled: open && !scheduleOnly,
  })

  const { data: pendingTargets = [] } = useQuery({
    queryKey: ['events', 'pending-deadlines'],
    queryFn: () => occurrencesApi.list({ status: 'pending' }),
    enabled: open && !scheduleOnly,
  })

  // One level only, so an occurrence that already has follow-ups gets no picker at all.
  const canFollowUp = !scheduleOnly && !(occurrence && occurrence.followUpCount > 0)
  const [sourceCutoff] = useState(sourceCutoffIso)
  const { data: sourceCandidates = [] } = useQuery({
    queryKey: ['events', 'follow-up-sources', sourceCutoff],
    queryFn: () => occurrencesApi.list({ startFrom: sourceCutoff }),
    enabled: open && canFollowUp,
  })
  // Undated todos (a book, a lesson) have no date to fall inside the lookback, so they come separately.
  const { data: undatedSourceCandidates = [] } = useQuery({
    queryKey: ['events', 'follow-up-sources', 'undated'],
    queryFn: () => occurrencesApi.list({ undated: true, status: 'pending' }),
    enabled: open && canFollowUp,
  })

  const createActivityMutation = useMutation({
    mutationFn: ({ title, categoryId, goalIds }: { title: string; categoryId: string | null; goalIds: string[] }) =>
      activitiesApi.create({ title, categoryId, goalIds }),
    onSuccess: (activity) => {
      qc.invalidateQueries({ queryKey: ['activities'] })
      setForm((f) => ({ ...f, activityId: activity.id }))
      setShowNewActivity(false)
      setNewActivityTitle('')
      setNewActivityCategoryId('')
      setNewActivityGoalId('')
    },
  })

  const mutation = useMutation({
    mutationFn: () => {
      const schedulePayload = {
        startAt: isUndated(timeMode) ? null : toIso(form.startAt),
        endAt: isAllDay
          ? (form.endAt ? toAllDayExclusiveEndIso(form.endAt.substring(0, 10)) : null)
          : (timeMode !== 'scheduled' ? null : toIso(form.endAt)),
        isAllDay: isUndated(timeMode) ? false : isAllDay,
        isPlanned: timeMode === 'nodate' ? false : isPlanned,
        // Never sent from the schedule-only form: giving a date is what clears it server-side.
        isNoDate: scheduleOnly ? undefined : timeMode === 'nodate',
        // Subtasks are edited as a draft and applied here; omitted when the section
        // is not shown so the server leaves them untouched.
        subtasks: isEdit && !scheduleOnly
          ? subtasks.map((s) => ({ id: s.id ?? null, title: s.title }))
          : undefined,
      }

      const linkPayload = scheduleOnly
        ? {}
        : {
            tagIds: form.tagIds,
            deadlineOccurrenceId: form.deadlineId || null,
            clearDeadline: isEdit && !form.deadlineId && Boolean(occurrence?.deadlineOccurrenceId),
            // Events only: their PUT is a full replace, so the link goes every time.
            sourceOccurrenceId: form.sourceId || null,
          }

      if (kind === 'event') {
        const eventPayload = {
          title: form.title.trim(),
          categoryId: form.categoryId || null,
          goalIds: form.goalIds,
          ...schedulePayload,
          ...linkPayload,
          reminders,
        }
        return isEdit
          ? occurrencesApi.updateEvent(occurrence!.id, eventPayload)
          : occurrencesApi.createEvent(eventPayload)
      }

      const occurrencePayload = {
        activityId: form.activityId,
        title: form.title.trim() || null,
        ...schedulePayload,
        ...(scheduleOnly ? {} : { deadlineOccurrenceId: form.deadlineId || null, tagIds: form.tagIds, reminders }),
        // Omitted while the picker is hidden, so the patch leaves the link alone.
        ...(canFollowUp ? { sourceOccurrenceId: form.sourceId || null } : {}),
      }
      return isEdit
        ? occurrencesApi.patch(occurrence!.id, occurrencePayload)
        : occurrencesApi.create(occurrencePayload)
    },
    onSuccess: () => {
      invalidateOccurrences(qc)
      onClose()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => occurrencesApi.delete(occurrence!.id),
    onSuccess: () => {
      setConfirmDelete(false)
      invalidateOccurrences(qc)
      onClose()
    },
    onError: (err) => toastError(err, 'Could not delete the occurrence.'),
  })

  function switchKind(next: ActivityKind) {
    setKind(next)
    setErrors({})
    // An edited event's activityId is its backing row, which the picker never offers.
    if (isEdit && isEventKind) setForm((f) => ({ ...f, activityId: next === 'event' ? source!.activityId : '' }))
  }

  function addSubtask() {
    const title = newSubtaskTitle.trim()
    if (!title) return
    setSubtasks((prev) => [...prev, { title }])
    setNewSubtaskTitle('')
  }

  function removeSubtask(index: number) {
    setSubtasks((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit() {
    const errs = validate(form, kind, timeMode, isAllDay)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    mutation.mutate()
  }

  function switchMode(mode: TimeMode) {
    setTimeMode(mode)
    if (isUndated(mode)) {
      setIsAllDay(false)
      if (mode === 'nodate') setIsPlanned(false)
      setForm((f) => ({ ...f, startAt: '', endAt: '' }))
      setErrors({})
    } else if (mode === 'scheduled') {
      if (!form.endAt && form.startAt && !isAllDay) {
        setForm((f) => ({ ...f, endAt: addOneHour(f.startAt) }))
      }
      setErrors({})
    } else {
      setForm((f) => ({ ...f, endAt: '' }))
      setErrors((e) => ({ ...e, endAt: undefined }))
    }
  }

  function toggleAllDay() {
    if (!isAllDay) {
      const dateOnly = form.startAt ? form.startAt.substring(0, 10) : ''
      setForm((f) => ({ ...f, startAt: dateOnly ? dateOnly + 'T00:00' : '', endAt: '' }))
      setErrors((e) => ({ ...e, endAt: undefined }))
    }
    setIsAllDay((v) => !v)
  }

  function setEndOfDay() {
    const existing = form.startAt ? form.startAt.substring(0, 10) : ''
    const d = new Date()
    const z = (n: number) => String(n).padStart(2, '0')
    const today = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`
    const date = existing || today
    setIsAllDay(false)
    setTimeMode('due')
    setForm((f) => ({ ...f, startAt: date + 'T23:59', endAt: '' }))
    setErrors({})
  }

  const selectedActivity = activities.find((a) => a.id === form.activityId) ?? defaultActivity ?? duplicateFrom?.activity ?? null

  const inheritedTags = (selectedActivity?.tags ?? []).filter((t) => !form.tagIds.includes(t.id))

  const effectiveReminders = reminders ?? (kind === 'activity' ? selectedActivity?.reminders ?? [] : [])
  // Planned, floating and no-date occurrences have no time to remind about.
  // Mirrors ReminderMath.Anchor: a planned occurrence fires only as a timed Due pin.
  const isDuePin = timeMode === 'due' || (timeMode === 'scheduled' && !form.endAt)
  const canRemind = !isUndated(timeMode) && (!isPlanned || (isDuePin && !isAllDay))

  // Most-used first (occurrences in the last year, from the server), so the activities the user
  // keeps logging are at the top of the picker. Never-used ones fall to the tail, alphabetically.
  const activityOptions = useMemo(
    () => [...activities]
      .sort((a, b) => (b.recentOccurrenceCount - a.recentOccurrenceCount) || a.title.localeCompare(b.title))
      .map((a) => ({ value: a.id, label: a.title, sublabel: a.goals.map((g) => g.title).join(', ') || undefined })),
    [activities],
  )

  const goalOptions = pickableGoals(goals, source?.activity.goals.map((g) => g.id) ?? [])
  const newActivityGoalOptions = pickableGoals(goals, [])

  // Both link pickers lift the occurrences sharing a goal, then a category, with the one being
  // edited; the sort is stable, so each picker's own order holds within those groups.
  const matchGoalIds = kind === 'event' ? form.goalIds : (selectedActivity?.goals.map((g) => g.id) ?? [])
  const matchCategoryId = kind === 'event' ? form.categoryId : (selectedActivity?.categoryId ?? '')
  const matchGoalKey = matchGoalIds.join(',')
  const byMatch = useMemo(() => {
    const goalIds = matchGoalKey ? matchGoalKey.split(',') : []
    const score = (o: Occurrence) =>
      (o.activity.goals.some((g) => goalIds.includes(g.id)) ? 2 : 0)
      + (matchCategoryId && o.activity.categoryId === matchCategoryId ? 1 : 0)
    return (a: Occurrence, b: Occurrence) => score(b) - score(a)
  }, [matchGoalKey, matchCategoryId])

  const deadlineOptions = useMemo(() => {
    // Pending events of any shape, plus Due-shaped activity occurrences. A link whose target was
    // completed or skipped later is not offered: the field shows empty, but the stored id is sent
    // back unchanged on save, so the link survives unless another option is picked.
    const fromList = pendingTargets
      .filter((o) => (o.activity.kind === 'event' || isDue(o)) && o.id !== occurrence?.id)
      .sort(byMatch)
      .map((o) => ({ value: o.id, label: o.effectiveTitle, sublabel: linkSublabel(o) }))
    return [{ value: '', label: 'No deadline', sublabel: undefined }, ...fromList]
  }, [pendingTargets, occurrence, byMatch])

  const sourceOptions = useMemo(() => {
    // Undated ones sort after the dated, newest first.
    const fromList = [...sourceCandidates, ...undatedSourceCandidates]
      .filter((o) => !o.sourceOccurrenceId && o.id !== occurrence?.id)
      .sort((a, b) => (b.startAt ?? b.endAt ?? '').localeCompare(a.startAt ?? a.endAt ?? ''))
      .sort(byMatch)
      .map((o) => ({ value: o.id, label: o.effectiveTitle, sublabel: linkSublabel(o) }))
    // The current source may sit outside the lookback window; keep it pickable.
    const current = followUpOf ?? source?.source
    if (current && form.sourceId === current.id && !fromList.some((o) => o.value === current.id))
      fromList.unshift({ value: current.id, label: current.effectiveTitle, sublabel: linkSublabel(current) })
    return [{ value: '', label: 'None', sublabel: undefined }, ...fromList]
  }, [sourceCandidates, undatedSourceCandidates, occurrence, followUpOf, source, form.sourceId, byMatch])

  const segmentClass = (active: boolean) =>
    `flex-1 rounded-md py-2 text-xs font-medium transition-colors ${
      active
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'
    }`

  const kindTitle = isEdit
    ? (kind === 'event' ? 'Edit Event' : 'Edit Occurrence')
    : (kind === 'event' ? 'New Event' : 'New Occurrence')

  const allDayButton = (
    <button
      type="button"
      onClick={toggleAllDay}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        isAllDay
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground'
      }`}
    >
      Date only
    </button>
  )

  const endOfDayButton = (
    <button
      type="button"
      onClick={setEndOfDay}
      className="rounded-full border border-border bg-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
    >
      End of day
    </button>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={scheduleOnly ? 'Schedule Occurrence' : kindTitle}
      footer={
        <>
          {isEdit && !scheduleOnly && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={mutation.isPending || deleteMutation.isPending}
              aria-label="Delete"
              className="mr-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} />
            </button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending || deleteMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={mutation.isPending} disabled={deleteMutation.isPending}>
            {isEdit ? 'Save Changes' : 'Create'}
          </Button>
        </>
      }
    >
      {/* Primary field row: activity select or event title, with kind picker on the right */}
      {!scheduleOnly && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-end gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {kind === 'event' ? (
                <>
                  <label className="text-sm font-medium text-foreground">Title</label>
                  <input
                    type="text"
                    placeholder="Event title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                    autoFocus={!isEdit}
                    className={`h-10 rounded-lg border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${errors.title ? 'border-destructive' : 'border-input'}`}
                  />
                </>
              ) : (
                <>
                  <label className="text-sm font-medium text-foreground">Activity</label>
                  <Select
                    value={form.activityId}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, activityId: v }))
                      setShowNewActivity(false)
                    }}
                    options={activityOptions}
                    placeholder="Select an activity..."
                    error={Boolean(errors.activityId)}
                    onCreateNew={!isEdit || isEventKind ? () => setShowNewActivity(true) : undefined}
                    createNewLabel="+ Create new activity"
                  />
                </>
              )}
            </div>

            {/* An event can be linked to an activity later; an activity's occurrence can't become an event. */}
            {(!isEdit || isEventKind) && (
              <div className="flex shrink-0 flex-col gap-1.5">
                <span className="invisible text-sm font-medium">T</span>
                <div className="flex h-10 gap-0.5 rounded-lg border border-border bg-muted p-0.5">
                  <button
                    type="button"
                    onClick={() => switchKind('activity')}
                    className={`flex flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors ${kind === 'activity' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Activity
                  </button>
                  <button
                    type="button"
                    onClick={() => switchKind('event')}
                    className={`flex flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors ${kind === 'event' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Event
                  </button>
                </div>
              </div>
            )}
          </div>

          {kind === 'event' && errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          {kind === 'activity' && errors.activityId && <p className="text-xs text-destructive">{errors.activityId}</p>}

          {kind === 'activity' && showNewActivity && (!isEdit || isEventKind) && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
              <input
                type="text"
                placeholder="Activity name"
                value={newActivityTitle}
                onChange={(e) => setNewActivityTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newActivityTitle.trim()) createActivityMutation.mutate({ title: newActivityTitle.trim(), categoryId: newActivityCategoryId || null, goalIds: newActivityGoalId ? [newActivityGoalId] : [] })
                  if (e.key === 'Escape') { setShowNewActivity(false); setNewActivityTitle(''); setNewActivityCategoryId(''); setNewActivityGoalId('') }
                }}
                autoFocus
                className="h-8 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <Select
                value={newActivityCategoryId}
                onChange={setNewActivityCategoryId}
                options={[
                  { value: '', label: 'No category' },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
              {newActivityGoalOptions.length > 0 && (
                <Select
                  value={newActivityGoalId}
                  onChange={setNewActivityGoalId}
                  options={[
                    { value: '', label: 'No goal' },
                    ...newActivityGoalOptions.map((g) => ({ value: g.id, label: g.title })),
                  ]}
                />
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => { if (newActivityTitle.trim()) createActivityMutation.mutate({ title: newActivityTitle.trim(), categoryId: newActivityCategoryId || null, goalIds: newActivityGoalId ? [newActivityGoalId] : [] }) }}
                  loading={createActivityMutation.isPending}
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => { setShowNewActivity(false); setNewActivityTitle(''); setNewActivityCategoryId(''); setNewActivityGoalId('') }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {kind === 'activity' && selectedActivity && (selectedActivity.goals.length > 0 || selectedActivity.category) && (
            <div className="flex flex-wrap gap-2 px-1">
              {selectedActivity.goals.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {selectedActivity.goals.length === 1 ? 'Goal' : 'Goals'}: {selectedActivity.goals.map((g) => g.title).join(', ')}
                </span>
              )}
              {selectedActivity.category && (
                <span className="text-xs text-muted-foreground">Category: {selectedActivity.category.name}</span>
              )}
            </div>
          )}

          {/* Activity: title override */}
          {kind === 'activity' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                Title <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <input
                type="text"
                placeholder={selectedActivity ? selectedActivity.title : 'Override activity title...'}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
                className="h-11 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}
        </div>
      )}

      {/* Scheduling (When) */}
      {!scheduleOnly && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-0.5 rounded-lg border border-border bg-muted p-0.5">
            <button type="button" onClick={() => switchMode('due')} className={segmentClass(timeMode === 'due')}>Due</button>
            <button type="button" onClick={() => switchMode('scheduled')} className={segmentClass(timeMode === 'scheduled')}>Scheduled</button>
            <button type="button" onClick={() => switchMode('floating')} className={segmentClass(timeMode === 'floating')}>Floating</button>
            <button type="button" onClick={() => switchMode('nodate')} className={segmentClass(timeMode === 'nodate')}>No date</button>
          </div>

          {timeMode === 'due' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Due date</label>
                <div className="flex gap-1.5">{allDayButton}{endOfDayButton}</div>
              </div>
              <DateTimePicker
                value={form.startAt}
                onChange={(v) => setForm((f) => ({ ...f, startAt: v }))}
                mode={isAllDay ? 'date' : 'datetime'}
                autoFocus={focusStartAt}
              />
            </div>
          )}

          {timeMode === 'scheduled' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">{isPlanned ? 'Window start' : 'Start'}</label>
                  {allDayButton}
                </div>
                <DateTimePicker
                  value={form.startAt}
                  onChange={(v) => setForm((f) => ({ ...f, startAt: v }))}
                  mode={isAllDay ? 'date' : 'datetime'}
                  autoFocus={focusStartAt}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">
                  {isAllDay ? 'End date' : (isPlanned ? 'Window end' : 'End')}
                </label>
                <DateTimePicker
                  value={form.endAt}
                  onChange={(v) => setForm((f) => ({ ...f, endAt: v }))}
                  mode={isAllDay ? 'date' : 'datetime'}
                  error={Boolean(errors.endAt)}
                />
                {errors.endAt && <p className="text-xs text-destructive">{errors.endAt}</p>}
              </div>
            </div>
          )}

          {timeMode === 'floating' && (
            <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
              No date - floats freely in your plan
            </p>
          )}

          {timeMode === 'nodate' && (
            <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
              No date - kept on the Occurrences list only, off the plan and the calendar
            </p>
          )}

          {timeMode !== 'nodate' && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isPlanned}
                onChange={(e) => setIsPlanned(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              Planned
            </label>
          )}
        </div>
      )}

      {/* scheduleOnly: full scheduling controls */}
      {scheduleOnly && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-0.5 rounded-lg border border-border bg-muted p-0.5">
            <button type="button" onClick={() => switchMode('due')} className={segmentClass(timeMode === 'due')}>Due</button>
            <button type="button" onClick={() => switchMode('scheduled')} className={segmentClass(timeMode === 'scheduled')}>Scheduled</button>
          </div>

          {timeMode === 'due' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Date</label>
                <div className="flex gap-1.5">{allDayButton}{endOfDayButton}</div>
              </div>
              <DateTimePicker
                value={form.startAt}
                onChange={(v) => setForm((f) => ({ ...f, startAt: v }))}
                mode={isAllDay ? 'date' : 'datetime'}
                autoFocus={focusStartAt}
              />
            </div>
          )}

          {timeMode === 'scheduled' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Window start</label>
                <DateTimePicker
                  value={form.startAt}
                  onChange={(v) => setForm((f) => ({ ...f, startAt: v }))}
                  autoFocus={focusStartAt}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Window end</label>
                <DateTimePicker
                  value={form.endAt}
                  onChange={(v) => setForm((f) => ({ ...f, endAt: v }))}
                  error={Boolean(errors.endAt)}
                />
                {errors.endAt && <p className="text-xs text-destructive">{errors.endAt}</p>}
              </div>
            </div>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={isPlanned}
              onChange={(e) => setIsPlanned(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            Keep as planned
          </label>
        </div>
      )}

      {/* More options: an inset panel whose header row is the toggle */}
      {!scheduleOnly && (
        <div className={`rounded-lg border border-border ${showAdvanced ? 'bg-muted/40' : ''}`}>
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {showAdvanced ? 'Fewer options' : 'More options'}
            <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} strokeWidth={2} />
          </button>
          {showAdvanced && (
            <div className="flex flex-col gap-3 border-t border-border p-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">
                  Deadline <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <Select
                  value={form.deadlineId}
                  onChange={(v) => setForm((f) => ({ ...f, deadlineId: v }))}
                  options={deadlineOptions}
                />
              </div>

              {canFollowUp && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">
                    Related to <span className="font-normal text-muted-foreground">(optional)</span>
                  </label>
                  <Select
                    value={form.sourceId}
                    onChange={(v) => setForm((f) => ({ ...f, sourceId: v }))}
                    options={sourceOptions}
                  />
                </div>
              )}

              {/* Event: category + goals */}
              {kind === 'event' && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium text-foreground">Category</label>
                    <Select
                      value={form.categoryId}
                      onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                      options={[
                        { value: '', label: 'No category' },
                        ...categories.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />
                  </div>
                  {goalOptions.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-foreground">
                        Goals <span className="font-normal text-muted-foreground">(optional)</span>
                      </span>
                      <GoalPicker
                        goals={goalOptions}
                        value={form.goalIds}
                        onChange={(ids) => setForm((f) => ({ ...f, goalIds: ids }))}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  Tags <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <TagPicker
                  tags={tags}
                  value={form.tagIds}
                  onChange={(ids) => setForm((f) => ({ ...f, tagIds: ids }))}
                />
                {kind === 'activity' && inheritedTags.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Also from the activity: {inheritedTags.map((t) => t.name).join(', ')}
                  </p>
                )}
              </div>

              {canRemind && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Reminders <span className="font-normal text-muted-foreground">(optional)</span>
                    </span>
                    {kind === 'activity' && reminders !== null && (
                      <button
                        type="button"
                        onClick={() => setReminders(null)}
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Use activity's
                      </button>
                    )}
                  </div>
                  <ReminderPicker value={effectiveReminders} onChange={setReminders} />
                </div>
              )}

              {isEdit && (
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Subtasks</span>
                  {subtasks.length > 0 && (
                    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                      {subtasks.map((s, i) => (
                        <li key={s.id ?? `new-${i}`} className="flex items-center gap-3 px-3 py-2.5">
                          <span className="flex-1 text-sm text-foreground">{s.title}</span>
                          <button
                            type="button"
                            onClick={() => removeSubtask(i)}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSubtask() } }}
                      placeholder="Add subtask..."
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={addSubtask}
                      disabled={!newSubtaskTitle.trim()}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {mutation.error instanceof Error && (
        <p className="text-sm text-destructive">{mutation.error.message}</p>
      )}

      {isEdit && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => deleteMutation.mutate()}
          loading={deleteMutation.isPending}
          title="Delete occurrence?"
          message={`"${occurrence!.effectiveTitle}" will be permanently deleted.`}
        />
      )}
    </Modal>
  )
}
