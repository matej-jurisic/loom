import { useLayoutEffect, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import type { Occurrence } from '@/lib/types'
import { DueRow, FloatingTasksRow, UpcomingRow } from './TrayPillRow'
import type { FloatingDragInfo } from './TrayPillRow'

interface CalendarTrayProps {
  trayDragActive: boolean
  overduePastItems: Occurrence[]
  upcomingDueItems: Occurrence[]
  floatingTasks: Occurrence[]
  floatRowRef: RefObject<HTMLDivElement | null>
  floatHighlighted: boolean
  movingEventId: string | null
  pendingDragId: string | null
  onTaskClick: (o: Occurrence) => void
  onRescheduleDragStart: (info: FloatingDragInfo, o: Occurrence) => void
  onFloatDragStart: (info: FloatingDragInfo, o: Occurrence) => void
  /** Fed the tray's height as it changes, and 0 once it is gone. */
  onHeightChange?: (px: number) => void
  children?: ReactNode
}

export function CalendarTray({
  trayDragActive,
  overduePastItems,
  upcomingDueItems,
  floatingTasks,
  floatRowRef,
  floatHighlighted,
  movingEventId,
  pendingDragId,
  onTaskClick,
  onRescheduleDragStart,
  onFloatDragStart,
  onHeightChange,
  children,
}: CalendarTrayProps) {
  const trayRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = trayRef.current
    if (!el || !onHeightChange) return
    const ro = new ResizeObserver(() => onHeightChange(el.offsetHeight))
    ro.observe(el)
    return () => {
      ro.disconnect()
      onHeightChange(0)
    }
  }, [onHeightChange])

  return (
    <div ref={trayRef} className="calendar-tray">
      {!trayDragActive && (
        <DueRow
          tasks={overduePastItems}
          onTaskClick={onTaskClick}
          onDragStart={onRescheduleDragStart}
          movingEventId={movingEventId}
          pendingDragId={pendingDragId}
        />
      )}
      {!trayDragActive && (
        <UpcomingRow
          tasks={upcomingDueItems}
          onTaskClick={onTaskClick}
          onDragStart={onRescheduleDragStart}
          movingEventId={movingEventId}
          pendingDragId={pendingDragId}
        />
      )}
      <FloatingTasksRow
        tasks={floatingTasks}
        onTaskClick={onTaskClick}
        onDragStart={onFloatDragStart}
        rowRef={floatRowRef}
        isHighlighted={floatHighlighted}
        dragActive={trayDragActive}
        movingEventId={movingEventId}
        pendingDragId={pendingDragId}
      />
      {children}
    </div>
  )
}
