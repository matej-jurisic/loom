import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { CategoryIcon } from '@/components/categories/categoryIcons'
import { ActivityHistoryModal } from '@/components/activities/ActivityHistoryModal'
import { activitiesApi } from '@/lib/api'
import type { Activity, Goal } from '@/lib/types'

export function GoalActivitiesModal({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const [historyFor, setHistoryFor] = useState<Activity | null>(null)
  const { data: activities = [], isLoading } = useQuery({
    queryKey: ['activities', 'goal', goal?.id],
    queryFn: () => activitiesApi.list({ goalId: goal!.id }),
    enabled: goal !== null,
  })

  return (
    <>
      <Modal open={goal !== null} onClose={onClose} title={goal ? `${goal.title} - activities` : ''}>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : activities.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No activities linked to this goal.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {activities.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => setHistoryFor(a)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={a.category ? { backgroundColor: `${a.category.color}1f` } : undefined}
                  >
                    <CategoryIcon
                      icon={a.category?.icon}
                      color={a.category?.color ?? 'var(--color-muted-foreground)'}
                      size={15}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{a.title}</span>
                    {a.category && <span className="block truncate text-xs text-muted-foreground">{a.category.name}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      <ActivityHistoryModal open={historyFor !== null} activity={historyFor} onClose={() => setHistoryFor(null)} />
    </>
  )
}
