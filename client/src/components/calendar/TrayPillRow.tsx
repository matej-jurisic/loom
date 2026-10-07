import { useEffect, useRef } from 'react'
import type { Occurrence } from '@/lib/types'
import { dueRowRef, eventAllDayColors } from '@/lib/calendarLayout'

export type FloatingDragInfo = { pointerId: number; clientX: number; clientY: number; pointerType: string }

interface TrayPillRowProps {
  label: string
  labelClassName: string
  tasks: Occurrence[]
  onTaskClick: (o: Occurrence) => void
  onDragStart?: (info: FloatingDragInfo, o: Occurrence) => void
  pillText?: (o: Occurrence) => string
  pillMaxWidthClassName?: string
  rowRef?: React.RefObject<HTMLDivElement | null>
  isHighlighted?: boolean
  forceVisible?: boolean
  movingEventId?: string | null
  pendingDragId?: string | null
}

function TrayPillRow({
  label,
  labelClassName,
  tasks,
  onTaskClick,
  onDragStart,
  pillText,
  pillMaxWidthClassName = 'max-w-[180px]',
  rowRef,
  isHighlighted,
  forceVisible,
  movingEventId,
  pendingDragId,
}: TrayPillRowProps) {
  const scrollElRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollElRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      if (!el) return
      const canScrollH = el.scrollWidth > el.clientWidth
      if (!canScrollH) return
      e.preventDefault()
      e.stopPropagation()
      el.scrollLeft += e.deltaY + e.deltaX
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const pendingRef = useRef<{
    timer: ReturnType<typeof setTimeout>
    pointerId: number
    startX: number
    startY: number
    scrollStart: number
    scrolling: boolean
    occ: Occurrence
    pointerType: string
  } | null>(null)

  function cancelPending() {
    if (!pendingRef.current) return
    clearTimeout(pendingRef.current.timer)
    pendingRef.current = null
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>, o: Occurrence) {
    if (e.pointerType === 'mouse') {
      if (e.button !== 0) return
      onDragStart?.({ pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, pointerType: e.pointerType }, o)
      return
    }
    if (!onDragStart) return
    const { pointerId, clientX, clientY, pointerType } = e
    const scrollStart = scrollElRef.current?.scrollLeft ?? 0
    const timer = setTimeout(() => {
      const p = pendingRef.current
      pendingRef.current = null
      if (!p) return
      if (navigator.vibrate) navigator.vibrate(30)
      onDragStart({ pointerId, clientX, clientY, pointerType }, o)
    }, 350)
    pendingRef.current = { timer, pointerId, startX: clientX, startY: clientY, scrollStart, scrolling: false, occ: o, pointerType }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const p = pendingRef.current
    if (!p || e.pointerId !== p.pointerId) return
    const dx = e.clientX - p.startX
    const dy = e.clientY - p.startY
    if (p.scrolling) {
      if (scrollElRef.current) scrollElRef.current.scrollLeft = p.scrollStart - dx
      return
    }
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    if (Math.abs(dx) >= Math.abs(dy)) {
      clearTimeout(p.timer)
      p.scrolling = true
      if (scrollElRef.current) scrollElRef.current.scrollLeft = p.scrollStart - dx
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (pendingRef.current?.pointerId === e.pointerId) cancelPending()
  }

  if (tasks.length === 0 && !forceVisible) return null

  return (
    <div
      ref={rowRef}
      className={`flex transition-colors ${isHighlighted ? 'bg-primary/10' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={cancelPending}
    >
      <div className="w-12 shrink-0 flex items-center justify-end pr-2 py-1">
        <span className={`text-[9px] font-medium uppercase ${labelClassName}`}>{label}</span>
      </div>
      <div ref={scrollElRef} className="flex-1 overflow-x-auto border-l" style={{ scrollbarWidth: 'none', borderColor: 'var(--calendar-line)' }}>
        {tasks.length > 0 ? (
          <div className="flex gap-1 px-1 py-1">
            {tasks.map((o) => {
              const { className, style } = eventAllDayColors(o)
              return (
                <button
                  key={o.id}
                  onPointerDown={(e) => handlePointerDown(e, o)}
                  onClick={() => onTaskClick(o)}
                  className={`shrink-0 ${pillMaxWidthClassName} truncate rounded-[3px] px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-all duration-150 hover:opacity-80 cursor-grab active:cursor-grabbing select-none ${movingEventId === o.id ? 'opacity-20' : pendingDragId === o.id ? 'opacity-50 scale-95' : ''} ${className}`}
                  style={{ touchAction: 'none', ...style }}
                >
                  {pillText ? pillText(o) : o.effectiveTitle}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="h-[26px]" />
        )}
      </div>
    </div>
  )
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type RowProps = Pick<TrayPillRowProps, 'tasks' | 'onTaskClick' | 'onDragStart' | 'movingEventId' | 'pendingDragId'>

export function FloatingTasksRow(
  props: RowProps & Pick<TrayPillRowProps, 'rowRef' | 'isHighlighted' | 'forceVisible'>,
) {
  return (
    <TrayPillRow
      {...props}
      label="Float"
      labelClassName="tracking-wide text-muted-foreground"
      pillMaxWidthClassName="max-w-[160px]"
    />
  )
}

export function DueRow(props: RowProps) {
  return (
    <TrayPillRow
      {...props}
      label="Due"
      labelClassName="tracking-wide text-destructive"
      pillText={(o) => `${o.effectiveTitle} · ${shortDate(dueRowRef(o)!)}`}
    />
  )
}

export function UpcomingRow(props: RowProps) {
  return (
    <TrayPillRow
      {...props}
      label="Soon"
      labelClassName="text-muted-foreground"
      pillText={(o) => `${o.effectiveTitle} · ${shortDate(o.startAt!)}`}
    />
  )
}
