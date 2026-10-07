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
  children,
}: CalendarTrayProps) {
  return (
    <div className="calendar-tray">
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
        forceVisible={trayDragActive}
        movingEventId={movingEventId}
        pendingDragId={pendingDragId}
      />
      {children}
    </div>
  )
}
