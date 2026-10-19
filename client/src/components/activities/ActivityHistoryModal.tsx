import { OccurrenceHistoryModal } from '@/components/events/OccurrenceHistoryModal'
import { GoalBadge } from '@/components/goals/GoalBadge'
import { CategoryIcon } from '@/components/categories/categoryIcons'
import { occurrencesApi } from '@/lib/api'
import type { Activity } from '@/lib/types'

export function ActivityHistoryModal({
  open,
  activity,
  onClose,
}: {
  open: boolean
  activity: Activity | null
  onClose: () => void
}) {
  if (!activity) return null
  return (
    <OccurrenceHistoryModal
      open={open}
      title={activity.title}
      queryKey={['events', 'activity', activity.id]}
      queryFn={() => occurrencesApi.list({ activityId: activity.id })}
      color={activity.category?.color}
      onClose={onClose}
      meta={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {activity.category && (
            <span className="flex items-center gap-1.5">
              <CategoryIcon icon={activity.category.icon} color={activity.category.color} size={12} strokeWidth={2} />
              {activity.category.name}
            </span>
          )}
          {activity.goals.map((g) => (
            <GoalBadge key={g.id} goal={g} />
          ))}
        </div>
      }
    />
  )
}
