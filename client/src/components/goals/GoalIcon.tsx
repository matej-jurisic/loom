import { Target } from 'lucide-react'
import { ICON_MAP } from '@/components/categories/categoryIcons'

export const GOAL_DEFAULT_ICON = Target

/** A goal's icon tile in its own colour. Renders nothing for a goal with neither, so the tier dot or ring stands alone. */
export function GoalTile({ icon, color, size = 'md' }: { icon: string | null; color: string | null; size?: 'sm' | 'md' }) {
  if (!icon && !color) return null
  const Icon = (icon && ICON_MAP[icon]) || GOAL_DEFAULT_ICON
  const box = size === 'sm' ? 'h-6 w-6 rounded-md' : 'h-8 w-8 rounded-lg'
  const glyph = size === 'sm' ? 'h-3.5 w-3.5' : 'h-[15px] w-[15px]'
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-muted ${box}`}
      style={color ? { backgroundColor: `${color}1f`, color } : undefined}
    >
      <Icon className={`${glyph} ${color ? '' : 'text-muted-foreground'}`} strokeWidth={2} />
    </span>
  )
}
