import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { activitiesApi, activitySubtasksApi } from '@/lib/api'
import type { Activity, Goal, Category } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { WorkTypesSection } from '@/components/activities/WorkTypesSection'
import { GoalPicker } from '@/components/goals/GoalPicker'
import { pickableGoals } from '@/lib/goals'
import { invalidateActivities } from '@/lib/invalidate'
import { MAX_REPEAT_AFTER_DAYS, parseRepeatAfterDays } from '@/lib/repeat'

interface ActivityModalProps {
  open: boolean
  onClose: () => void
  activity?: Activity
  goals: Goal[]
  categories: Category[]
}

export function ActivityModal({ open, onClose, activity, goals, categories }: ActivityModalProps) {
  const qc = useQueryClient()
  const isEdit = Boolean(activity)
  const [title, setTitle] = useState(activity?.title ?? '')
  const [goalIds, setGoalIds] = useState(() => activity?.goals.map((g) => g.id) ?? [])
  const [categoryId, setCategoryId] = useState(activity?.categoryId ?? '')
  const [titleError, setTitleError] = useState('')
  const [repeatDays, setRepeatDays] = useState(activity?.repeatAfterDays?.toString() ?? '')
  const [repeatError, setRepeatError] = useState('')
  const [subtasks, setSubtasks] = useState(activity?.subtasks ?? [])
  const [newSubtask, setNewSubtask] = useState('')
  const newSubtaskRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        goalIds,
        categoryId: categoryId || null,
        repeatAfterDays: parseRepeatAfterDays(repeatDays) ?? null,
      }
      return isEdit ? activitiesApi.update(activity!.id, body) : activitiesApi.create(body)
    },
    onSuccess: () => {
      invalidateActivities(qc)
      onClose()
    },
  })

  const addSubtaskMutation = useMutation({
    mutationFn: (subtaskTitle: string) => activitySubtasksApi.create(activity!.id, { title: subtaskTitle }),
    onSuccess: (created) => { setSubtasks((prev) => [...prev, created]); setNewSubtask('') },
  })

  const deleteSubtaskMutation = useMutation({
    mutationFn: (id: string) => activitySubtasksApi.delete(activity!.id, id),
    onSuccess: (_, id) => { setSubtasks((prev) => prev.filter((s) => s.id !== id)) },
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
    addSubtaskMutation.mutate(t)
  }

  const goalOptions = pickableGoals(goals, activity?.goals.map((g) => g.id) ?? [])

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
          autoFocus
          className={`h-11 rounded-lg border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
            titleError ? 'border-destructive' : 'border-input'
          }`}
        />
        {titleError && <p className="text-xs text-destructive">{titleError}</p>}
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

      {isEdit && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground">Subtasks</label>
          {subtasks.length > 0 && (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {subtasks.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1 text-sm text-foreground">{s.title}</span>
                  <button
                    onClick={() => deleteSubtaskMutation.mutate(s.id)}
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
              ref={newSubtaskRef}
              type="text"
              placeholder="Add a subtask..."
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask() } }}
              className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Button variant="ghost" onClick={handleAddSubtask} disabled={!newSubtask.trim() || addSubtaskMutation.isPending}>
              Add
            </Button>
          </div>
        </div>
      )}

      {isEdit && <WorkTypesSection activity={activity!} inModal />}

      {mutation.error instanceof Error && (
        <p className="text-sm text-destructive">{mutation.error.message}</p>
      )}
    </Modal>
  )
}
