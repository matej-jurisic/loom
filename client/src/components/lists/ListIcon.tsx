import { ListFilter } from 'lucide-react'
import { ICON_MAP } from '@/components/categories/categoryIcons'

/** A list's own icon, or `ListFilter` when it has none (or a name the icon set no longer has). */
export function ListIcon({ icon, className }: { icon: string | null; className?: string }) {
  const Icon = (icon && ICON_MAP[icon]) || ListFilter
  return <Icon className={className} strokeWidth={2} />
}

/** The list's icon on its tile: tinted in the list's colour like a category tile, or muted when it has none. */
export function ListTile({ icon, color }: { icon: string | null; color: string | null }) {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"
      style={color ? { backgroundColor: `${color}1f`, color } : undefined}
    >
      <ListIcon icon={icon} className={`h-[15px] w-[15px] ${color ? '' : 'text-muted-foreground'}`} />
    </span>
  )
}
