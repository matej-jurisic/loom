import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, CalendarRange, CalendarDays, ChartColumn, Hash, Layers, ListFilter, ListTodo, Settings, Shapes, Target } from 'lucide-react'
import { categoriesApi, goalsApi, listsApi } from '@/lib/api'
import { ICON_MAP } from '@/components/categories/categoryIcons'
import { listLook } from '@/lib/occurrenceView'
import { LoomMark } from './LoomMark'

function NavItem({
  to,
  label,
  Icon,
  isActive: forcedActive,
}: {
  to: string
  label: string
  Icon: typeof CalendarRange
  isActive?: boolean
}) {
  return (
    <NavLink to={to} className="block">
      {({ isActive: routerActive }) => {
        const isActive = forcedActive ?? routerActive
        return (
        <span
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive
              ? 'bg-muted font-semibold text-foreground'
              : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          <Icon
            className={`h-[18px] w-[18px] shrink-0 ${isActive ? 'text-primary' : ''}`}
            strokeWidth={2}
          />
          {label}
        </span>
        )
      }}
    </NavLink>
  )
}

function ListLink({
  to,
  label,
  active,
  children,
}: {
  to: string
  label: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <NavLink to={to} className="block">
      <span
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
          active
            ? 'bg-muted font-semibold text-foreground'
            : 'font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground'
        }`}
      >
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">{children}</span>
        <span className="truncate">{label}</span>
      </span>
    </NavLink>
  )
}

export function Sidebar() {
  const location = useLocation()
  const onOccurrences = location.pathname.startsWith('/occurrences')
  const activeListId = location.pathname.match(/^\/occurrences\/lists\/([^/]+)/)?.[1] ?? null

  const { data: lists = [] } = useQuery({ queryKey: ['lists'], queryFn: listsApi.list })
  const { data: goals = [] } = useQuery({ queryKey: ['goals'], queryFn: () => goalsApi.list() })
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })

  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-background">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <LoomMark className="h-4 w-4" />
        </div>
        <span className="text-base font-semibold tracking-tight text-foreground">Loom</span>
      </div>

      <nav className="flex-1 min-h-0 flex flex-col px-3 py-1">
        <ul className="flex flex-col gap-0.5 shrink-0">
          <li><NavItem to="/plan"        label="Daily Plan"  Icon={CalendarRange} /></li>
          <li><NavItem to="/calendar"    label="Calendar"    Icon={CalendarDays} /></li>
          <li><NavItem to="/occurrences" label="Occurrences" Icon={ListTodo} isActive={onOccurrences && !activeListId} /></li>
          <li><NavItem to="/goals"       label="Goals"       Icon={Target} /></li>
          <li><NavItem to="/activities"  label="Activities"  Icon={Layers} /></li>
          <li><NavItem to="/categories"  label="Categories"  Icon={Shapes} /></li>
          <li><NavItem to="/tags"        label="Tags"        Icon={Hash} /></li>
          <li><NavItem to="/insights"    label="Insights"    Icon={ChartColumn} /></li>
        </ul>

        {lists.length > 0 && (
          <>
            <div className="my-2 border-t border-border shrink-0" />

            <p className="shrink-0 px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Lists
            </p>
            <ul className="scroll-slim flex min-h-0 flex-col gap-0.5 overflow-y-auto">
              {lists.map((l) => {
                const look = listLook(l, goals, categories)
                const active = activeListId === l.id
                const Icon = (look?.icon && ICON_MAP[look.icon]) || ListFilter
                return (
                  <li key={l.id}>
                    <ListLink to={`/occurrences/lists/${l.id}`} label={l.name} active={active}>
                      <Icon
                        className="h-[15px] w-[15px]"
                        strokeWidth={2}
                        style={active && look?.color ? { color: look.color } : undefined}
                      />
                    </ListLink>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </nav>

      <div className="flex flex-col gap-0.5 border-t border-border px-3 py-4">
        <NavItem to="/guide" label="Guide" Icon={BookOpen} />
        <NavItem to="/settings" label="Settings" Icon={Settings} />
      </div>
    </aside>
  )
}
