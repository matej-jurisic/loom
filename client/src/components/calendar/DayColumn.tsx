import { useLayoutEffect, useMemo, useRef } from 'react'
import type { Occurrence } from '@/lib/types'
import type { TimeScale } from '@/lib/timeScale'
import { addDays, sod } from '@/lib/calendarDates'
import { layoutDay, occursOnDay } from '@/lib/calendarLayout'
import { EventBlock } from './EventBlock'

export interface DayColumnProps {
  day: Date
  allEvents: Occurrence[]
  onEventClick: (e: Occurrence) => void
  overlay: { topPx: number; heightPx: number } | null
  moveOverlay: { topPx: number; heightPx: number } | null
  resizeOverlay: { topPx: number; heightPx: number } | null
  isToday: boolean
  borderLeft: boolean
  borderRight: boolean
  onEventMoveStart: (e: React.PointerEvent, event: Occurrence, topPx: number) => void
  onEventResizeStart: (e: React.PointerEvent, event: Occurrence, side: 'top' | 'bottom') => void
  suppressClickRef: { current: boolean }
  movingEventId: string | null
  resizingEventId: string | null
  scale: TimeScale
  /** Height of the tallest column, so every column's borders run the full grid. */
  gridHeight: number
  animateDir?: 'forward' | 'back' | null
  navCount: number
}

export function DayColumn({ day, allEvents, onEventClick, overlay, moveOverlay, resizeOverlay, isToday, borderLeft, borderRight, onEventMoveStart, onEventResizeStart, suppressClickRef, movingEventId, resizingEventId, scale, gridHeight, animateDir, navCount }: DayColumnProps) {
  const dayStart = sod(day)
  const dayEnd = addDays(dayStart, 1)

  const dayEvents = useMemo(
    () => allEvents.filter((e) => occursOnDay(e, dayStart.getTime(), dayEnd.getTime())),
    [allEvents, dayStart.getTime(), dayEnd.getTime()],
  )

  const { events: layout } = useMemo(
    () => layoutDay(dayEvents, day, scale),
    [dayEvents, day, scale],
  )

  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const nowPx = scale.toPx(nowMin)

  const eventsLayerRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const el = eventsLayerRef.current
    if (!el || !animateDir) return
    el.style.animation = 'none'
    void el.offsetHeight
    el.style.animation = animateDir === 'forward'
      ? 'cal-slide-in-forward 180ms ease-out forwards'
      : 'cal-slide-in-back 180ms ease-out forwards'
  }, [navCount])

  return (
    <div
      className={`relative flex-1 ${borderLeft ? 'border-l' : ''} ${borderRight ? 'border-r' : ''}`}
      style={{ minHeight: gridHeight, borderColor: 'var(--calendar-line)' }}
    >
      {/* Hour + half-hour lines, all one weight. Stepped from absolute half-hours,
          not from the segment's own start, because segment edges land on quarter
          hours - the rhythm has to stay on the clock. The m=0 line is skipped: the
          sticky header's border-b already provides that separator.
          Compact mode draws none of them, and no segment-break line either: a
          segment is exactly one block's span there, so every line would land on a
          block edge or run straight through the block itself. The stack of blocks
          is the only structure that column needs. */}
      {!scale.isCompact && scale.segments.flatMap((seg, i) => {
        const lines: React.ReactNode[] = []
        for (let m = Math.ceil(seg.startMin / 30) * 30; m <= seg.endMin; m += 30) {
          if (m === 0) continue
          lines.push(
            <div
              key={`l${i}-${m}`}
              className="absolute inset-x-0 border-t"
              style={{
                // Rounded: toPx lands on fractions, and a 1px border smeared across
                // two device pixels reads lighter than one that lands on a pixel.
                top: Math.round(scale.toPx(m)),
                borderTopColor: 'var(--calendar-line)',
              }}
            />,
          )
        }
        return lines
      })}
      {/* Current time indicator. Compact mode has no continuous time axis to place
          it on: between two stacked blocks the grid jumps forward by however long
          the dropped gap was, so a line drawn at "now" would sit at a position that
          means nothing. Elided time is elided, marker included. */}
      {isToday && !scale.isCompact && (
        <div
          className="pointer-events-none absolute inset-x-0 z-[5] flex items-center"
          style={{ top: nowPx }}
        >
          <div className="h-[9px] w-[9px] shrink-0 rounded-full bg-destructive -ml-[5px]" />
          <div className="h-px flex-1 bg-destructive" />
        </div>
      )}
      {/* Drag selection overlay */}
      {overlay && (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 rounded-[4px] bg-primary/20 border border-primary/60"
          style={{ top: overlay.topPx, height: overlay.heightPx }}
        />
      )}
      {/* Event move ghost */}
      {moveOverlay && (
        <div
          className="pointer-events-none absolute inset-x-0 z-30 rounded-[4px] border-2 border-primary bg-primary/20"
          style={{ top: moveOverlay.topPx, height: moveOverlay.heightPx }}
        />
      )}
      {/* Event resize ghost */}
      {resizeOverlay && (
        <div
          className="pointer-events-none absolute inset-x-0 z-30 rounded-[4px] border-2 border-dashed border-primary/80 bg-primary/10"
          style={{ top: resizeOverlay.topPx, height: resizeOverlay.heightPx }}
        />
      )}
      {/* Event blocks — animated layer; pointer-events:none on the wrapper lets
          drag-to-create pass through to the grid; buttons inside override to auto */}
      <div ref={eventsLayerRef} className="absolute inset-0" style={{ pointerEvents: 'none' }}>
        {layout.map((l) => (
          <EventBlock
            key={l.event.id}
            layout={l}
            onClick={onEventClick}
            onMoveStart={(e, topPx) => onEventMoveStart(e, l.event, topPx)}
            onResizeStart={(e, side) => onEventResizeStart(e, l.event, side)}
            suppressClickRef={suppressClickRef}
            dimmed={l.event.id === movingEventId}
            isResizing={l.event.id === resizingEventId}
          />
        ))}
      </div>
    </div>
  )
}
