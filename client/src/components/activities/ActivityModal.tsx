import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { activitiesApi, activitySubtasksApi } from '@/lib/api'
import type { Activity, Goal, Category, Tag } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { WorkTypesSection } from '@/components/activities/WorkTypesSection'
import { GoalPicker } from '@/components/goals/GoalPicker'
import { TagPicker } from '@/components/tags/TagPicker'
import { ReminderPicker } from '@/components/reminders/ReminderPicker'
import { pickableGoals } from '@/lib/goals'
import { invalidateActivities, invalidateOccurrences } from '@/lib/invalidate'
import { toastError } from '@/store/toasts'
import { MAX_REPEAT_AFTER_DAYS, parseRepeatAfterDays } from '@/lib/repeat'

/** Mirrors Validators.MaxShortLabelLength. */
const MAX_SHORT_LABEL_LENGTH = 12

interface ActivityModalProps {
  open: boolean
  onClose: () => void
  activity?: Activity
  /** Pre-fills a create from this activity; nothing is saved until Create. */
  duplicateFrom?: Activity
  goals: Goal[]
  categories: Category[]
  tags: Tag[]
}

export function ActivityModal({ open, onClose, activity, duplicateFrom, goals, categories, tags }: ActivityModalProps) {
  const qc = useQueryClient()
  const isEdit = Boolean(activity)
  const source = activity ?? duplicateFrom
  const [title, setTitle] = useState(source?.title ?? '')
  const [shortLabel, setShortLabel] = useState(source?.shortLabel ?? '')
  const [goalIds, setGoalIds] = useState(() => source?.goals.map((g) => g.id) ?? [])
  const [tagIds, setTagIds] = useState(() => source?.tags.map((t) => t.id) ?? [])
  const [categoryId, setCategoryId] = useState(source?.categoryId ?? '')
  const [titleError, setTitleError] = useState('')
  const [repeatDays, setRepeatDays] = useState(source?.repeatAfterDays?.toString() ?? '')
  const [repeatError, setRepeatError] = useState('')
  const [showAsOverdue, setShowAsOverdue] = useState(source?.showAsOverdue ?? true)
  const [reminders, setReminders] = useState(source?.reminders ?? [])
  const [subtasks, setSubtasks] = useState(activity?.subtasks ?? [])
  const [newSubtask, setNewSubtask] = useState('')
  // Before the activity exists, subtasks and work types are drafts sent with the create.
  const [draftSubtasks, setDraftSubtasks] = useState(() => duplicateFrom?.subtasks.map((s) => s.title) ?? [])
  const [draftWorkTypes, setDraftWorkTypes] = useState(() => duplicateFrom?.workTypes.map((w) => w.title) ?? [])
  const [newWorkType, setNewWorkType] = useState('')

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        shortLabel: shortLabel.trim() || null,
        goalIds,
        tagIds,
        categoryId: categoryId || null,
        repeatAfterDays: parseRepeatAfterDays(repeatDays) ?? null,
        showAsOverdue,
        reminders,
      }
      return isEdit
        ? activitiesApi.update(activity!.id, body)
        : activitiesApi.create({ ...body, subtasks: draftSubtasks, workTypes: draftWorkTypes })
    },
    onSuccess: () => {
      invalidateActivities(qc)
      onClose()
    },
  })

  // Under ['events'] because the count depends on the activity's occurrences too.
  const applicableQuery = useQuery({
    queryKey: ['events', 'subtask-apply', activity?.id],
    queryFn: () => activitySubtasksApi.applicable(activity!.id),
    enabled: isEdit && subtasks.length > 0,
  })
  const applicableCount = subtasks.length > 0 ? applicableQuery.data?.occurrenceCount ?? 0 : 0

  const addSubtaskMutation = useMutation({
    mutationFn: (subtaskTitle: string) => activitySubtasksApi.create(activity!.id, { title: subtaskTitle }),
    onSuccess: (created) => { setSubtasks((prev) => [...prev, created]); setNewSubtask(''); applicableQuery.refetch() },
  })

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id: string) => activitySubtasksApi.delete(activity!.id, id),
    onSuccess: (_, id) => { setSubtasks((prev) => prev.filter((s) => s.id !== id)); applicableQuery.refetch() },
  })

  const applySubtasksMutation = useMutation({
    mutationFn: () => activitySubtasksApi.apply(activity!.id),
    onSuccess: () => invalidateOccurrences(qc),
    onError: (err) => toastError(err),
  })

  function handleSubmit() {
    if (!title.trim()) { setTitleError('Title is required.'); return }
    if (title.length > 255) { setTitleError('Title cannot exceed 255 characters.'); return }
    setTitleError('')
    if (parseRepeatAfterDays(repeatDays) === undefined) {
      setRepeatError(`Enter a whole number of days from 1 to ${MAX_REPEAT_AFTER_DAYS}, or leave it empty.`)
      return
    }
    setRepeatError('')
    mutation.mutate()
  }

  function handleAddSubtask() {
    const t = newSubtask.trim()
    if (!t) return
    if (isEdit) { addSubtaskMutation.mutate(t); return }
    setDraftSubtasks((prev) => [...prev, t])
    setNewSubtask('')
  }

  function handleAddWorkType() {
    const t = newWorkType.trim()
    if (!t) return
    if (!draftWorkTypes.some((w) => w.toLowerCase() === t.toLowerCase())) setDraftWorkTypes((prev) => [...prev, t])
    setNewWorkType('')
  }

  const goalOptions = pickableGoals(goals, source?.goals.map((g) => g.id) ?? [])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Activity' : 'New Activity'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} loading={mutation.isPending}>{isEdit ? 'Save Changes' : 'Create'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Title</label>
        <input
          type="text"
          placeholder="e.g. Morning run, Deep work session"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          autoFocus={!isEdit}
          className={`h-11 rounded-lg border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
            titleError ? 'border-destructive' : 'border-input'
          }`}
        />
        {titleError && <p className="text-xs text-destructive">{titleError}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="activity-short-label" className="text-sm font-medium text-foreground">
          Short label <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id="activity-short-label"
          type="text"
          placeholder="e.g. DL"
          maxLength={MAX_SHORT_LABEL_LENGTH}
          value={shortLabel}
          onChange={(e) => setShortLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          className="h-10 w-32 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {goalOptions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">
            Goals <span className="font-normal text-muted-foreground">(optional)</span>
          </span>
          <GoalPicker goals={goalOptions} value={goalIds} onChange={setGoalIds} />
        </div>
      )}

      {categories.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">
            Category <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          Tags <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <TagPicker tags={tags} value={tagIds} onChange={setTagIds} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="activity-repeat-days" className="text-sm font-medium text-foreground">
          Do again after <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            id="activity-repeat-days"
            type="text"
            inputMode="numeric"
            placeholder="Off"
            value={repeatDays}
            onChange={(e) => setRepeatDays(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            className={`h-10 w-20 rounded-lg border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
              repeatError ? 'border-destructive' : 'border-input'
            }`}
          />
          <span className="text-sm text-muted-foreground">days</span>
        </div>
        {repeatError && <p className="text-xs text-destructive">{repeatError}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          Reminders <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <ReminderPicker value={reminders} onChange={setReminders} />
      </div>

      <label className="flex items-center gap-2.5 text-sm text-foreground">
        <input
          type="checkbox"
          checked={showAsOverdue}
          onChange={(e) => setShowAsOverdue(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Show as unfinished when overdue
      </label>

      <EditableList
        label="Subtasks"
        placeholder="Add a subtask..."
        items={isEdit
          ? subtasks.map((s) => ({ key: s.id, title: s.title, onRemove: () => deleteSubtaskMutation.mutate(s.id) }))
          : draftSubtasks.map((t, i) => ({ key: `${i}`, title: t, onRemove: () => setDraftSubtasks((prev) => prev.filter((_, j) => j !== i)) }))}
        value={newSubtask}
        onChange={setNewSubtask}
        onAdd={handleAddSubtask}
        addDisabled={addSubtaskMutation.isPending}
      >
        {applicableCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => applySubtasksMutation.mutate()}
            loading={applySubtasksMutation.isPending}
          >
            Add to {applicableCount} pending {applicableCount === 1 ? 'occurrence' : 'occurrences'}
          </Button>
        )}
      </EditableList>

      {isEdit ? <WorkTypesSection activity={activity!} inModal /> : (
        <EditableList
          label="Work types"
          placeholder="Add a work type..."
          items={draftWorkTypes.map((t, i) => ({ key: `${i}`, title: t, onRemove: () => setDraftWorkTypes((prev) => prev.filter((_, j) => j !== i)) }))}
          value={newWorkType}
          onChange={setNewWorkType}
          onAdd={handleAddWorkType}
        />
      )}

      {mutation.error instanceof Error && (
        <p className="text-sm text-destructive">{mutation.error.message}</p>
      )}
    </Modal>
  )
}

interface EditableListProps {
  label: string
  placeholder: string
  items: { key: string; title: string; onRemove: () => void }[]
  value: string
  onChange: (value: string) => void
  onAdd: () => void
  addDisabled?: boolean
  children?: ReactNode
}

function EditableList({ label, placeholder, items, value, onChange, onAdd, addDisabled, children }: EditableListProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {items.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 px-3 py-2">
              <span className="flex-1 text-sm text-foreground">{item.title}</span>
              <button
                onClick={item.onRemove}
                aria-label={`Remove ${item.title}`}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          maxLength={255}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button variant="ghost" onClick={onAdd} disabled={!value.trim() || addDisabled}>
          Add
        </Button>
      </div>
      {children}
    </div>
  )
}
