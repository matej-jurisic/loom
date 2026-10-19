import { ListFilter } from 'lucide-react'
import { ICON_MAP } from '@/components/categories/categoryIcons'

/**
 * A list's tile, in the look it borrows from its goal or category (`listLook`). The borrowed icon
 * falls back to `ListFilter`, and no colour (or no look at all) gives the muted tile.
 */
export function ListTile({ look }: { look: { icon: string | null; color: string | null } | null }) {
  const color = look?.color ?? null
  const Icon = (look?.icon && ICON_MAP[look.icon]) || ListFilter
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"
      style={color ? { backgroundColor: `${color}1f`, color } : undefined}
    >
      <Icon className={`h-[15px] w-[15px] ${color ? '' : 'text-muted-foreground'}`} strokeWidth={2} />
    </span>
  )
}
