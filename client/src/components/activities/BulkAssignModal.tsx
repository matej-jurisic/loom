import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { activitiesApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Activity, Category, Goal } from '@/lib/types'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { invalidateActivities } from '@/lib/invalidate'
import { GoalPicker } from '@/components/goals/GoalPicker'
import { pickableGoals } from '@/lib/goals'

/** Sentinel select values: empty = leave the field alone, CLEAR = set it to null. */
const KEEP = ''
const CLEAR = '__clear__'

type GoalMode = typeof KEEP | 'add' | 'remove' | 'set'

function nextGoalIds(current: string[], mode: GoalMode, picked: string[]): string[] {
  if (mode === 'add') return [...new Set([...current, ...picked])]
  if (mode === 'remove') return current.filter((id) => !picked.includes(id))
  if (mode === 'set') return picked
  return current
}

interface BulkAssignModalProps {
  open: boolean
  onClose: () => void
  activities: Activity[]
  goals: Goal[]
  categories: Category[]
  onApplied: () => void
}

export function BulkAssignModal({
  open,
  onClose,
  activities,
  goals,
  categories,
  onApplied,
}: BulkAssignModalProps) {
  const qc = useQueryClient()
  const [goalMode, setGoalMode] = useState<GoalMode>(KEEP)
  const [pickedGoalIds, setPickedGoalIds] = useState<string[]>([])
  const [categoryId, setCategoryId] = useState(KEEP)

  const goalsDirty = goalMode === 'set' || (goalMode !== KEEP && pickedGoalIds.length > 0)
  const dirty = goalsDirty || categoryId !== KEEP

  // No bulk endpoint exists; the PUT is a full replace, so unchanged fields are
  // resent from the activity itself.
  const mutation = useMutation({
    mutationFn: () =>
      Promise.all(
        activities.map((a) =>
          activitiesApi.update(a.id, {
            title: a.title,
            goalIds: nextGoalIds(a.goals.map((g) => g.id), goalMode, pickedGoalIds),
            categoryId:
              categoryId === KEEP ? a.categoryId : categoryId === CLEAR ? null : categoryId,
          }),
        ),
      ),
    onSuccess: () => {
      invalidateActivities(qc)
      onApplied()
      onClose()
    },
    onError: (err) => toastError(err, 'Could not update the selected activities.'),
  })

  const goalOptions = pickableGoals(goals, activities.flatMap((a) => a.goals.map((g) => g.id)))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Assign ${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!dirty}>
            Apply
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Goals</label>
        <Select
          value={goalMode}
          onChange={(v) => setGoalMode(v as GoalMode)}
          options={[
            { value: KEEP, label: 'Keep current' },
            { value: 'add', label: 'Add' },
            { value: 'remove', label: 'Remove' },
            { value: 'set', label: 'Replace with' },
          ]}
        />
        {goalMode !== KEEP && (
          <GoalPicker goals={goalOptions} value={pickedGoalIds} onChange={setPickedGoalIds} />
        )}
        {goalMode === 'set' && pickedGoalIds.length === 0 && (
          <p className="text-xs text-muted-foreground">Nothing selected: every goal is removed.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Category</label>
        <Select
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: KEEP, label: 'Keep current' },
            { value: CLEAR, label: 'No category' },
            ...categories.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>
    </Modal>
  )
}
