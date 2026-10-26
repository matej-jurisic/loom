import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronUp } from 'lucide-react'
import type { Occurrence } from '@/lib/types'
import { dueRowRef, eventAllDayColors, calendarTitle, titleWithGoals } from '@/lib/calendarLayout'
import { useCalendarColorBy } from '@/lib/useCalendarColorBy'
import { shortDate } from '@/lib/dates'

export type FloatingDragInfo = { pointerId: number; clientX: number; clientY: number; pointerType: string }

interface TrayPillRowProps {
  label: string
  labelClassName: string
  tasks: Occurrence[]
  onTaskClick: (o: Occurrence) => void
  onDragStart?: (info: FloatingDragInfo, o: Occurrence) => void
  /** Kept whole after the title, which truncates first. */
  pillSuffix?: (o: Occurrence) => string
  pillMaxWidthClassName?: string
  /** Lines shown before the rest fold into a `+N` pill. */
  maxLines?: number
  /** localStorage key remembering whether the row is unfolded. */
  storageKey: string
  rowRef?: React.RefObject<HTMLDivElement | null>
  isHighlighted?: boolean
  /** A drag is in flight: the row shows even when empty, and folds to one line. */
  dragActive?: boolean
  movingEventId?: string | null
  pendingDragId?: string | null
}

const PILL_BASE = 'shrink-0 rounded-[3px] px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight'

function PillLabel({ title, suffix }: { title: string; suffix?: string }) {
  return (
    <span className="flex min-w-0">
      <span className="truncate">{title}</span>
      {suffix && <span className="shrink-0 whitespace-pre">{` · ${suffix}`}</span>}
    </span>
  )
}
const MORE_PILL = `${PILL_BASE} bg-muted text-muted-foreground hover:text-foreground transition-colors`

/**
 * How many pills fit on the first `lines` lines with room left for the `+N` pill
 * after them. Read off a hidden copy of the row that lays out every pill, so the
 * visible row never has to render, measure and re-render itself.
 */
function fitCount(box: HTMLElement, lines: number): number {
  const pills = Array.from(box.children).slice(0, -1) as HTMLElement[]
  const more = box.lastElementChild as HTMLElement
  const tops: number[] = []
  for (const p of pills) if (!tops.some((t) => Math.abs(t - p.offsetTop) < 2)) tops.push(p.offsetTop)
  if (tops.length <= lines) return pills.length
  const lastTop = tops[lines - 1]
  const cs = getComputedStyle(box)
  const right = box.clientWidth - parseFloat(cs.paddingRight)
  const gap = parseFloat(cs.columnGap) || 0
  let v = pills.filter((p) => p.offsetTop < lastTop + 2).length
  while (v > 0) {
    const p = pills[v - 1]
    if (p.offsetTop < lastTop - 2 || p.offsetLeft + p.offsetWidth + gap + more.offsetWidth <= right) break
    v--
  }
  return v
}

function readExpanded(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function TrayPillRow({
  label,
  labelClassName,
  tasks,
  onTaskClick,
  onDragStart,
  pillSuffix,
  pillMaxWidthClassName = 'max-w-[130px]',
  maxLines = 1,
  storageKey,
  rowRef,
  isHighlighted,
  dragActive,
  movingEventId,
  pendingDragId,
}: TrayPillRowProps) {
  const scrollElRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(() => readExpanded(storageKey))
  // Both fits are kept so that starting or ending a drag switches line count in
  // the same render as the drag state, where the scroll anchor accounts for it.
  const [fit, setFit] = useState({ one: tasks.length, folded: tasks.length })

  useLayoutEffect(() => {
    const box = measureRef.current
    if (!box) return
    function measure() {
      if (!box) return
      const one = fitCount(box, 1)
      const folded = fitCount(box, maxLines)
      setFit((f) => (f.one === one && f.folded === folded ? f : { one, folded }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [tasks, maxLines, pillSuffix])

  function toggleExpanded(next: boolean) {
    setExpanded(next)
    try {
      localStorage.setItem(storageKey, next ? '1' : '0')
    } catch {
      // Not remembered; the row still toggles.
    }
  }

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

  const colorBy = useCalendarColorBy()

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
    const scrollStart = scrollElRef.current?.scrollTop ?? 0
    const timer = setTimeout(() => {
      const p = pendingRef.current
      pendingRef.current = null
      if (!p) return
      if (navigator.vibrate) navigator.vibrate(30)
      onDragStart({ pointerId, clientX, clientY, pointerType }, o)
    }, 350)
    pendingRef.current = { timer, pointerId, startX: clientX, startY: clientY, scrollStart, scrolling: false, occ: o, pointerType }
  }

  // Pills are `touch-action: none` so a long-press can turn into a drag, which
  // also stops the browser scrolling an unfolded row; a vertical swipe before the
  // long-press fires scrolls it by hand instead. A horizontal one just cancels.
  function handlePointerMove(e: React.PointerEvent) {
    const p = pendingRef.current
    if (!p || e.pointerId !== p.pointerId) return
    const dx = e.clientX - p.startX
    const dy = e.clientY - p.startY
    if (p.scrolling) {
      if (scrollElRef.current) scrollElRef.current.scrollTop = p.scrollStart - dy
      return
    }
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    if (Math.abs(dx) >= Math.abs(dy)) {
      cancelPending()
      return
    }
    const el = scrollElRef.current
    if (el && el.scrollHeight > el.clientHeight) {
      clearTimeout(p.timer)
      p.scrolling = true
      el.scrollTop = p.scrollStart - dy
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (pendingRef.current?.pointerId === e.pointerId) cancelPending()
  }

  if (tasks.length === 0 && !dragActive) return null

  const open = expanded && !dragActive
  const visible = open ? tasks.length : Math.min(dragActive ? fit.one : fit.folded, tasks.length)
  const hidden = tasks.length - visible
  const title = (o: Occurrence) => (pillSuffix ? titleWithGoals(o) : calendarTitle(o))
  const pillLabel = (o: Occurrence) => <PillLabel title={title(o)} suffix={pillSuffix?.(o)} />

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
      <div className="relative flex-1 min-w-0 border-l" style={{ borderColor: 'var(--calendar-line)' }}>
        {tasks.length > 0 && (
          <div aria-hidden className="invisible pointer-events-none absolute inset-x-0 top-0 h-0 overflow-hidden">
            <div ref={measureRef} className="flex flex-wrap gap-1 px-1 py-1">
              {tasks.map((o) => (
                <button key={o.id} tabIndex={-1} className={`${PILL_BASE} ${pillMaxWidthClassName}`}>
                  {pillLabel(o)}
                </button>
              ))}
              <button tabIndex={-1} className={MORE_PILL}>+{tasks.length}</button>
            </div>
          </div>
        )}
        <div
          ref={scrollElRef}
          className={open ? 'max-h-[40vh] overflow-y-auto overscroll-contain' : 'overflow-hidden'}
          style={{ scrollbarWidth: 'none' }}
        >
          {tasks.length > 0 ? (
            <div className="flex flex-wrap gap-1 px-1 py-1">
              {tasks.slice(0, visible).map((o) => {
                const { className, style } = eventAllDayColors(o, colorBy)
                return (
                  <button
                    key={o.id}
                    onPointerDown={(e) => handlePointerDown(e, o)}
                    onClick={() => onTaskClick(o)}
                    className={`${PILL_BASE} ${pillMaxWidthClassName} transition-all duration-150 hover:opacity-80 cursor-grab active:cursor-grabbing select-none ${movingEventId === o.id ? 'opacity-20' : pendingDragId === o.id ? 'opacity-50 scale-95' : ''} ${className}`}
                    style={{ touchAction: 'none', ...style }}
                    title={title(o)}
                  >
                    {pillLabel(o)}
                  </button>
                )
              })}
              {hidden > 0 && !dragActive && (
                <button className={MORE_PILL} onClick={() => toggleExpanded(true)}>
                  +{hidden}
                </button>
              )}
              {open && fit.folded < tasks.length && (
                <button className={`${MORE_PILL} flex items-center`} onClick={() => toggleExpanded(false)} aria-label="Show less">
                  <ChevronUp className="h-[13px] w-[13px]" />
                </button>
              )}
            </div>
          ) : (
            <div className="h-[26px]" />
          )}
        </div>
      </div>
    </div>
  )
}


type RowProps = Pick<TrayPillRowProps, 'tasks' | 'onTaskClick' | 'onDragStart' | 'movingEventId' | 'pendingDragId'>

function dueSuffix(o: Occurrence) {
  return shortDate(dueRowRef(o)!)
}

function soonSuffix(o: Occurrence) {
  return shortDate(o.startAt!, false)
}

export function FloatingTasksRow(
  props: RowProps & Pick<TrayPillRowProps, 'rowRef' | 'isHighlighted' | 'dragActive'>,
) {
  return (
    <TrayPillRow
      {...props}
      label="Float"
      labelClassName="tracking-wide text-muted-foreground"
      pillMaxWidthClassName="max-w-[110px]"
      maxLines={2}
      storageKey="loom-calendar-float-expanded"
    />
  )
}

export function DueRow(props: RowProps) {
  return (
    <TrayPillRow
      {...props}
      label="Due"
      labelClassName="tracking-wide text-destructive"
      pillSuffix={dueSuffix}
      storageKey="loom-calendar-due-expanded"
    />
  )
}

export function UpcomingRow(props: RowProps) {
  return (
    <TrayPillRow
      {...props}
      label="Soon"
      labelClassName="text-muted-foreground"
      pillSuffix={soonSuffix}
      storageKey="loom-calendar-soon-expanded"
    />
  )
}
