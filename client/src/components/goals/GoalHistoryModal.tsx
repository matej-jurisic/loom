import { OccurrenceHistoryModal } from '@/components/events/OccurrenceHistoryModal'
import { occurrencesApi } from '@/lib/api'
import type { Goal } from '@/lib/types'

export function GoalHistoryModal({
  open,
  goal,
  color,
  onClose,
}: {
  open: boolean
  goal: Goal | null
  color?: string
  onClose: () => void
}) {
  if (!goal) return null
  return (
    <OccurrenceHistoryModal
      open={open}
      title={goal.title}
      queryKey={['events', 'goal', goal.id]}
      queryFn={() => occurrencesApi.list({ goalId: goal.id })}
      color={color}
      onClose={onClose}
    />
  )
}
