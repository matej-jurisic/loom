import { Badge } from '@/components/ui/Badge'
import type { GoalSummary } from '@/lib/types'

const GOAL_TONE: Record<string, 'focus' | 'active' | 'bench' | 'neutral'> = {
  focus: 'focus',
  active: 'active',
  bench: 'bench',
}

export function GoalBadge({ goal }: { goal: GoalSummary }) {
  return (
    <Badge
      tone={GOAL_TONE[goal.status] ?? 'neutral'}
      style={goal.color ? { color: goal.color, borderColor: goal.color, backgroundColor: `${goal.color}1a` } : undefined}
    >
      {goal.title}
    </Badge>
  )
}
