import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { occurrencesApi, settingsApi, goalsApi, categoriesApi } from '@/lib/api'
import type { Occurrence } from '@/lib/types'
import { EventModal } from '@/components/events/EventModal'
import { EventDetailModal } from '@/components/events/EventDetailModal'
import { MoveOrSkipModal } from '@/components/events/MoveOrSkipModal'
import type { PendingMove } from '@/components/events/MoveOrSkipModal'
import { ActivityModal } from '@/components/activities/ActivityModal'
import { DAY_MIN, linearScale, compactScale } from '@/lib/timeScale'
import type { TimeScale } from '@/lib/timeScale'
import { DayColumn } from '@/components/calendar/DayColumn'
import { useCalendarModals } from '@/lib/useCalendarModals'
import { useOccurrenceMutations } from '@/lib/useOccurrenceMutations'
import { CalendarHeader } from '@/components/calendar/CalendarHeader'
import { CalendarTray } from '@/components/calendar/CalendarTray'
import type { FloatingDragInfo } from '@/components/calendar/TrayPillRow'
import { VIEW_OPTIONS, addDays, assignAllDayRows, dayHeader, effectiveAllDayEnd, formatDateInput, formatDatetimeLocal, hourLabel, isSameDay, sod, startOfWeek } from '@/lib/calendarDates'
import type { ViewMode } from '@/lib/calendarDates'
import { DUE_SPAN_MINUTES, MIN_EVENT_PX, dragStartFor, duePinHeight, dueRowRef, eventAllDayColors, isDueOccurrence, isEODDue, occursOnDay, snapToGrid, snapToGridDue } from '@/lib/calendarLayout'

const DEFAULT_HOUR_PX = 64
const MIN_HOUR_PX = 32
const MAX_HOUR_PX = 128
// Span given to an occurrence created by a single click or tap on empty grid.
const CLICK_CREATE_MINUTES = 30
const PILL_DROP_MINUTES = 60
// Longest touch that still counts as a tap. A press held past this was going for the long-press
// create and let go early, or was a finger parked on the grid mid-scroll - neither is a create.
// Comfortably under the 350ms the long press itself needs.
const TAP_MAX_MS = 250
// Momentum scrolling is stopped by landing a finger on it, and that lands as a pointerdown with no
// movement - a tap in every respect except intent. A touch this soon after the last scroll event is
// treated as arresting the scroll instead.
const SCROLL_SETTLE_MS = 400
// How long a scroll anchor stays live. One gesture can move the grid across
// several renders a few ms apart, and the anchor has to survive all of them;
// anything arriving later is a different change and gets no say.
const ANCHOR_TTL_MS = 120


// ── CalendarPage ─────────────────────────────────────────────────────────────

export function CalendarPage() {
  const [view, setView] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('loom-calendar-view')
    return saved === 'week' ? 'week' : saved === '3day' ? '3day' : 'day'
  })
  const [datePopOpen, setDatePopOpen] = useState(false)
  const datePopRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(() => {
    const savedView = localStorage.getItem('loom-calendar-view')
    // Session-scoped on purpose: coming back mid-session restores the viewed
    // day, but a fresh launch always starts on today.
    const savedDate = sessionStorage.getItem('loom-calendar-date')
    let d = savedDate ? new Date(savedDate + 'T00:00:00') : new Date()
    if (isNaN(d.getTime())) d = new Date()
    return savedView === 'week' ? startOfWeek(d) : d
  })
  const modals = useCalendarModals()
  const { openCreate, openDetail, openEdit, openEditActivity, openDuplicate, openSchedule } = modals
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timeGridRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    startDayIdx: number
    startClientX: number
    startClientY: number
    startY: number
    /** Where the press landed in time. Survives the switch to the linear scale, which startY does not. */
    startMin: number
    isDrag: boolean
  } | null>(null)
  const pendingTouchRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startDayIdx: number
    startY: number
    startMin: number
    timer: ReturnType<typeof setTimeout>
    /** Pressed on an event's minimum-height overflow zone: the tap belongs to that event, not the grid. */
    startedOnBlock: boolean
    downAt: number
    /** Where the view sat when the finger landed; a change means the grid moved under it. */
    scrollTop: number
    /** Landed on a still-scrolling view, so this press is stopping it rather than pointing at a time. */
    arrestingScroll: boolean
  } | null>(null)
  /** Last scroll of the time grid, in `performance.now()` terms. See SCROLL_SETTLE_MS. */
  const lastScrollAtRef = useRef(0)
  /**
   * Pointer type of the press in progress. A touch is followed by compatibility mouse events, which
   * would otherwise re-enter the mouse handler and open the snapshot past every guard the touch path
   * just applied. Pointerdown always precedes them, so this is set by the time they arrive.
   */
  const lastPointerTypeRef = useRef<string>('mouse')
  const autoScrollRef = useRef<{ rafId: number; clientX: number; clientY: number } | null>(null)
  const [dragOverlays, setDragOverlays] = useState<Map<number, { topPx: number; heightPx: number }>>(
    () => new Map(),
  )
  const eventMoveRef = useRef<{
    event: Occurrence
    durationMs: number
    offsetPx: number
    isDragging: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const [moveOverlay, setMoveOverlay] = useState<{ dayIdx: number; topPx: number; heightPx: number } | null>(null)
  const [movingEventId, setMovingEventId] = useState<string | null>(null)
  const [pendingAllDayDragId, setPendingAllDayDragId] = useState<string | null>(null)
  const [resizingEventId, setResizingEventId] = useState<string | null>(null)
  const [resizeOverlay, setResizeOverlay] = useState<Map<number, { topPx: number; heightPx: number }>>(() => new Map())
  const resizeDragActiveRef = useRef(false)
  const dateInputRef = useRef<HTMLInputElement>(null)
  const resizeStateRef = useRef<{
    origStartMs: number
    origEndMs: number
    side: 'top' | 'bottom'
  } | null>(null)
  const swipeRef = useRef<{ direction: 'horizontal' | 'vertical'; startX: number } | null>(null)
  const [navDir, setNavDir] = useState<'forward' | 'back' | null>(null)
  const [navCount, setNavCount] = useState(0)
  const navDirTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const allDayDragStateRef = useRef<{ curDayIdx: number; isDue: boolean } | null>(null)
  const allDayDragActiveRef = useRef(false)
  const floatRowRef = useRef<HTMLDivElement>(null)
  const allDayRowRef = useRef<HTMLDivElement>(null)
  const dragDropTargetRef = useRef<'float' | 'allday' | null>(null)
  const dragDropDayIdxRef = useRef<number | null>(null)
  const [dragDropTarget, setDragDropTarget] = useState<'float' | 'allday' | null>(null)
  const [dragDropDayIdx, setDragDropDayIdx] = useState<number | null>(null)
  const [isDraggingGridEvent, setIsDraggingGridEvent] = useState(false)
  const [isDraggingPill, setIsDraggingPill] = useState(false)

  const [hourPx, setHourPx] = useState(() => {
    const saved = localStorage.getItem('loom-calendar-zoom')
    const n = saved ? parseInt(saved, 10) : DEFAULT_HOUR_PX
    return isNaN(n) ? DEFAULT_HOUR_PX : Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, n))
  })
  const hourPxRef = useRef(hourPx)
  hourPxRef.current = hourPx
  const pinchActiveRef = useRef(false)

  // Compact mode elides the empty stretches of each day. Any drag suspends it for
  // the duration of the gesture, so dragging always happens on a true 0-24 grid.
  const [compact, setCompact] = useState(() => localStorage.getItem('loom-calendar-compact') === '1')
  const [dragExpanded, setDragExpanded] = useState(false)
  const compactActive = compact && !dragExpanded
  const compactRef = useRef(compact)
  compactRef.current = compact
  const dragExpandedRef = useRef(dragExpanded)
  dragExpandedRef.current = dragExpanded
  const scalesRef = useRef<TimeScale[]>([])
  const gridHeightRef = useRef(0)
  // A minute to hold still at a fixed screen position across a scale change, applied
  // once the new scale has rendered. Every scale change - toggling compact, a drag
  // expanding the grid, zooming - goes through this, so none of them jump the view.
  const anchorRef = useRef<{ dayIdx: number; min: number; viewportY: number; at: number } | null>(null)
  const dragSpacerRef = useRef<HTMLDivElement>(null)


  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
    staleTime: 5 * 60 * 1000,
  })

  // Only the activity editor needs these, and it opens from a menu deep in the detail modal, so
  // they stay off the calendar's own load path.
  const { data: goals = [] } = useQuery({
    queryKey: ['goals'],
    queryFn: () => goalsApi.list(),
    enabled: modals.activityModal.open,
  })

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoriesApi.list(),
    enabled: modals.activityModal.open,
  })

  // Effective "today" respecting the day boundary
  const effectiveToday = useMemo(() => {
    const boundary = settings?.dayBoundaryTime ?? '00:00'
    const now = new Date()
    const [h, m] = boundary.split(':').map(Number)
    const b = new Date(now)
    b.setHours(h, m, 0, 0)
    return now < b ? addDays(sod(now), -1) : sod(now)
  }, [settings?.dayBoundaryTime])

  // Days to render
  const days = useMemo<Date[]>(() => {
    if (view === 'day') return [sod(current)]
    if (view === '3day') return Array.from({ length: 3 }, (_, i) => addDays(sod(current), i))
    return Array.from({ length: 7 }, (_, i) => addDays(sod(current), i))
  }, [view, current])

  const rangeStart = days[0]
  const rangeEnd = addDays(days[days.length - 1], 1)
  const { rescheduleEvent, rescheduleFromAllDay, scheduleFloating, makeEventFloat, makeEventAllDay } = useOccurrenceMutations({
    rangeStart,
    rangeEnd,
    setPendingMove,
  })

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', 'calendar', rangeStart.toISOString(), rangeEnd.toISOString()],
    queryFn: () =>
      occurrencesApi.list({
        startFrom: rangeStart.toISOString(),
        endBefore: rangeEnd.toISOString(),
      }),
    // Keep the previous range on screen while the next one loads, so paging
    // days/weeks never blanks the grid behind the full-page spinner.
    placeholderData: keepPreviousData,
  })

  const { data: rawFloatingTasks = [] } = useQuery({
    queryKey: ['events', 'floating'],
    queryFn: () => occurrencesApi.list({ floating: true, status: 'pending' }),
    staleTime: 30 * 1000,
  })

  // The FLOAT row shows planned floating tasks before unplanned ones.
  const floatingTasks = useMemo(
    () => [...rawFloatingTasks].sort((a, b) => Number(b.isPlanned) - Number(a.isPlanned)),
    [rawFloatingTasks],
  )

  // Both tray rows are measured against *now*, never against the visible range:
  // paging a week forward must not turn this week's untouched tasks into a red Due
  // row, and Soon means "still ahead of you", not "after whatever week you opened".
  const overdueCutoff = effectiveToday.toISOString()

  const { data: rawUpcomingDue = [] } = useQuery({
    queryKey: ['events', 'upcoming', overdueCutoff],
    queryFn: () => occurrencesApi.list({ startFrom: overdueCutoff, status: 'pending' }),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  })

  // Pending due-type (no endAt) occurrences still ahead of today. Ones the current
  // view already draws as pins are dropped, so the row only carries off-screen work.
  const upcomingDueItems = useMemo(
    () =>
      rawUpcomingDue
        .filter((o) => isDueOccurrence(o) && !o.isAllDay && new Date(o.startAt!).getTime() >= effectiveToday.getTime())
        .filter((o) => {
          const t = new Date(o.startAt!).getTime()
          return t < rangeStart.getTime() || t >= rangeEnd.getTime()
        })
        .sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()),
    [rawUpcomingDue, effectiveToday.getTime(), rangeStart.getTime(), rangeEnd.getTime()],
  )

  const { data: rawPastPending = [] } = useQuery({
    queryKey: ['events', 'due-past', overdueCutoff],
    queryFn: () => occurrencesApi.list({ endBefore: overdueCutoff, status: 'pending' }),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  })

  // Everything still pending that is dated before today, whatever its scheduling
  // state: all-day or timed, planned or not. The row's job is that nothing you never
  // finished can fall off the top of the calendar just because you paged forward, so
  // it deliberately does not consult isOverdue (which is false for planned items by
  // design - see DayMath.IsOverdue). Ones the current view already draws are dropped,
  // so the row only ever carries what would otherwise be off-screen.
  const overduePastItems = useMemo(
    () =>
      rawPastPending
        .filter((o) => dueRowRef(o) !== null)
        .filter((o) => {
          const t = new Date(dueRowRef(o)!).getTime()
          return t < rangeStart.getTime() || t >= rangeEnd.getTime()
        })
        .sort((a, b) => new Date(dueRowRef(b)!).getTime() - new Date(dueRowRef(a)!).getTime()),
    [rawPastPending, rangeStart.getTime(), rangeEnd.getTime()],
  )

  // Scroll to current time once the grid first becomes visible. Gated on
  // isLoading rather than mount: on a true first load the scroll container
  // doesn't exist yet (the spinner renders in its place), so a mount-only
  // effect silently no-ops until a later, cache-warm visit.
  const hasScrolledToNowRef = useRef(false)
  useEffect(() => {
    if (hasScrolledToNowRef.current || isLoading || !scrollRef.current) return
    const now = new Date()
    const todayIdx = days.findIndex((d) => isSameDay(d, effectiveToday))
    const px = scaleFor(todayIdx < 0 ? 0 : todayIdx).toPx(now.getHours() * 60 + now.getMinutes())
    const top = Math.max(0, px - 200)
    scrollRef.current.scrollTop = top
    setScrollTop(top)
    hasScrolledToNowRef.current = true
  }, [isLoading])

  useEffect(() => {
    sessionStorage.setItem('loom-calendar-date', formatDateInput(current))
  }, [current])

  useEffect(() => {
    const el = dateInputRef.current
    if (!el) return
    const handler = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  useEffect(() => {
    if (!datePopOpen) return
    function close(e: MouseEvent) {
      if (datePopRef.current && !datePopRef.current.contains(e.target as Node)) setDatePopOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [datePopOpen])

  // A long-press in the Android WebView triggers the native context-menu /
  // text-selection gesture, which steals the pointer (pointercancel) before our
  // long-press timer fires. Suppressing contextmenu inside the calendar area
  // keeps the pointer stream alive so hold-to-resize and hold-to-drag work.
  useEffect(() => {
    function onContextMenu(e: Event) {
      if (scrollRef.current?.contains(e.target as Node)) e.preventDefault()
    }
    document.addEventListener('contextmenu', onContextMenu)
    return () => document.removeEventListener('contextmenu', onContextMenu)
  }, [])

  // Ctrl+wheel zoom (desktop)
  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return
      if (!scrollRef.current?.contains(e.target as Node)) return
      e.preventDefault()
      const old = hourPxRef.current
      const delta = e.deltaY > 0 ? -8 : 8
      const next = Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, old + delta))
      if (next === old) return
      captureAnchor(e.clientX, e.clientY)
      hourPxRef.current = next
      setHourPx(next)
      localStorage.setItem('loom-calendar-zoom', String(next))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // Pinch-to-zoom (mobile)
  useEffect(() => {
    const ptrs = new Map<number, { x: number; y: number }>()
    let lastDist = 0

    function onDown(e: PointerEvent) {
      if (!scrollRef.current?.contains(e.target as Node)) return
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]
        lastDist = Math.hypot(a.x - b.x, a.y - b.y)
        pinchActiveRef.current = true
        swipeRef.current = null
        if (pendingTouchRef.current) {
          clearTimeout(pendingTouchRef.current.timer)
          pendingTouchRef.current = null
        }
      }
    }

    function onMove(e: PointerEvent) {
      if (!ptrs.has(e.pointerId)) return
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (ptrs.size !== 2 || lastDist === 0) return
      const [a, b] = [...ptrs.values()]
      const newDist = Math.hypot(a.x - b.x, a.y - b.y)
      const ratio = newDist / lastDist
      lastDist = newDist
      if (Math.abs(ratio - 1) < 0.005) return
      const old = hourPxRef.current
      const next = Math.min(MAX_HOUR_PX, Math.max(MIN_HOUR_PX, Math.round(old * ratio)))
      if (next === old) return
      const pts = [...ptrs.values()]
      captureAnchor((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2)
      hourPxRef.current = next
      setHourPx(next)
      localStorage.setItem('loom-calendar-zoom', String(next))
    }

    function onUp(e: PointerEvent) {
      ptrs.delete(e.pointerId)
      if (ptrs.size < 2) lastDist = 0
      if (ptrs.size === 0) pinchActiveRef.current = false
    }

    // Capture phase: event blocks and resize handles stopPropagation() on
    // pointerdown for their own drag handling, which silences bubble-phase
    // window listeners — a pinch with a finger starting on an event was never
    // tracked. Capture runs before any of that.
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
    }
  }, [])

  function fireNav(dir: 'forward' | 'back') {
    if (navDirTimerRef.current) clearTimeout(navDirTimerRef.current)
    setNavDir(dir)
    setNavCount((c) => c + 1)
    navDirTimerRef.current = setTimeout(() => setNavDir(null), 400)
  }

  function prev() {
    fireNav('back')
    const step = view === 'day' ? -1 : view === '3day' ? -3 : -7
    setCurrent((d) => addDays(d, step))
  }

  function next() {
    fireNav('forward')
    const step = view === 'day' ? 1 : view === '3day' ? 3 : 7
    setCurrent((d) => addDays(d, step))
  }

  function prevDay() {
    fireNav('back')
    setCurrent((d) => addDays(d, -1))
  }

  function nextDay() {
    fireNav('forward')
    setCurrent((d) => addDays(d, 1))
  }

  function goToday() {
    setCurrent(view === 'week' ? startOfWeek(effectiveToday) : effectiveToday)
  }

  function toggleCompact() {
    // Nothing is under a pointer here, so the anchor falls back to the middle of
    // the visible grid - whatever the user was looking at stays where it was.
    captureAnchor(null, null)
    setCompact((c) => {
      localStorage.setItem('loom-calendar-compact', c ? '0' : '1')
      return !c
    })
  }

  function changeView(v: ViewMode) {
    setView(v)
    localStorage.setItem('loom-calendar-view', v)
    // Week always starts on the week boundary, so switching into it keeps the viewed day on screen.
    if (v === 'week') setCurrent((d) => startOfWeek(d))
  }

  // Mobile dial control: one button steps forward through the three ranges
  // instead of picking directly, so there's only one tap target to place.
  function cycleView() {
    const idx = VIEW_OPTIONS.findIndex((o) => o.value === view)
    changeView(VIEW_OPTIONS[(idx + 1) % VIEW_OPTIONS.length].value)
  }

  // ── Event move drag ──────────────────────────────────────────────────────

  function handleEventMoveStart(e: React.PointerEvent, event: Occurrence, topPx: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!event.startAt) return
    if (pinchActiveRef.current) return
    // Click suppression lasts until the next pointerdown: in the WebView the
    // click can arrive long after the gesture that set the flag (e.g. the finger
    // lifts well after a pointercancel), so a same-tick setTimeout(0) reset
    // would expire before the click it is meant to block.
    suppressClickRef.current = false
    const isDue = isDueOccurrence(event)
    // Short events render with a minimum height that extends the block below
    // the event's true end time. A pointer landing in that overflow zone falls
    // through to the grid (no stopPropagation) so drag-to-create still works in
    // the slot right after the event. Due pins are exempt: their height always
    // matches their 30-minute span exactly, so there is no overflow zone.
    if (!isDue) {
      const block = (e.target as Element).closest('[data-true-end-px]') as HTMLElement | null
      const trueEndPx = block ? parseFloat(block.dataset.trueEndPx ?? '') : NaN
      if (getYInGrid(e.clientY) >= trueEndPx) return
    }
    // Dismiss any active touch resize mode when interacting with an event body
    if (resizingEventId) {
      setResizingEventId(null)
      if (resizingEventId === event.id) {
        suppressClickRef.current = true
        return
      }
    }
    e.stopPropagation()

    const startMs = new Date(event.startAt!).getTime()
    const endMs = event.endAt ? new Date(event.endAt).getTime() : startMs + DUE_SPAN_MINUTES * 60 * 1000
    const durationMs = endMs - startMs
    const isTouch = e.pointerType === 'touch'
    const pointerId = e.pointerId
    const startClientX = e.clientX
    const startClientY = e.clientY
    const gridY = getYInGrid(startClientY)
    const offsetPx = gridY - topPx

    function startDragging(armClientX: number, armClientY: number) {
      eventMoveRef.current = { event, durationMs, offsetPx, isDragging: false }
      // Dim the event immediately on touch to confirm long-press registered
      if (isTouch) setMovingEventId(event.id)
      if (!isTouch) document.body.style.cursor = 'grabbing'

      function onPointerMove(mv: PointerEvent) {
        if (isTouch && mv.pointerId !== pointerId) return
        if (!eventMoveRef.current) return
        // A second finger landed and started a pinch: abandon the move drag
        if (pinchActiveRef.current) {
          cleanup()
          eventMoveRef.current = null
          setMoveOverlay(null)
          setMovingEventId(null)
          return
        }
        if (!eventMoveRef.current.isDragging) {
          // Movement threshold distinguishes click/hold-and-release from a drag.
          // Touch measures from the arm position: fingers jitter a few px during
          // a hold, and without the threshold that jitter marked the gesture as
          // a drag, so releasing never entered resize mode.
          const dx = mv.clientX - armClientX
          const dy = mv.clientY - armClientY
          if (Math.abs(dx) + Math.abs(dy) < 8) return
          if (!isTouch) document.body.style.cursor = 'grabbing'
          // First, before any state is queued: the anchor has to be measured
          // against the grid as it stands now. Once the rows below are queued the
          // grid may already have moved, and in a compacted scale that shift spans
          // hours of compressed time - the captured minute would be far wrong.
          // The grab offset was measured inside the block, so it survives the
          // switch to the linear scale untouched (see the TimeScale notes).
          expandForDrag(mv.clientX, mv.clientY, true)
          eventMoveRef.current.isDragging = true
          setMovingEventId(event.id)
          setIsDraggingGridEvent(true)
        }
        // Check if pointer is hovering over a header drop zone
        const dropTarget = getDropTarget(mv.clientY)
        if (dropTarget !== dragDropTargetRef.current) {
          dragDropTargetRef.current = dropTarget
          setDragDropTarget(dropTarget)
        }
        if (dropTarget === 'allday') {
          const dayIdx = Math.max(0, Math.min(getDayIdxFromX(mv.clientX), days.length - 1))
          if (dayIdx !== dragDropDayIdxRef.current) {
            dragDropDayIdxRef.current = dayIdx
            setDragDropDayIdx(dayIdx)
          }
        }
        if (dropTarget) {
          setMoveOverlay(null)
          return
        }
        const curY = getYInGrid(mv.clientY)
        // Due pins are a single point in time — snap directly to cursor, no grab-offset
        const anchorY = isDue ? curY : Math.max(0, curY - eventMoveRef.current.offsetPx)
        const curDayIdx = Math.max(0, Math.min(getDayIdxFromX(mv.clientX), days.length - 1))
        const sc = scaleFor(curDayIdx)
        const startSnapped = isDue
          ? snapToGridDue(days[curDayIdx], anchorY, sc)
          : dragStartFor(days[curDayIdx], anchorY, sc, eventMoveRef.current.durationMs)
        const startMin = startSnapped.getHours() * 60 + startSnapped.getMinutes()
        const durationMin = eventMoveRef.current.durationMs / 60000
        setMoveOverlay({
          dayIdx: curDayIdx,
          topPx: sc.toPx(startMin),
          heightPx: isDue ? duePinHeight(sc.hourPx) : Math.max((durationMin / 60) * sc.hourPx, MIN_EVENT_PX),
        })
        startAutoScroll(mv.clientX, mv.clientY)
      }

      // Collapsing is a state update, so the grid keeps its expanded geometry for
      // the rest of the handler that called this - the drop still reads true 0-24
      // coordinates.
      function cleanup(cx?: number, cy?: number) {
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
        window.removeEventListener('pointercancel', onPointerCancel)
        dragDropTargetRef.current = null
        dragDropDayIdxRef.current = null
        setDragDropTarget(null)
        setDragDropDayIdx(null)
        setIsDraggingGridEvent(false)
        document.body.style.cursor = ''
        stopAutoScroll()
        collapseAfterDrag(cx, cy, true)
      }

      function onPointerUp(mu: PointerEvent) {
        if (isTouch && mu.pointerId !== pointerId) return
        const capturedDropTarget = dragDropTargetRef.current
        cleanup(mu.clientX, mu.clientY)
        if (!eventMoveRef.current) return
        const { event: ev, durationMs: dur, offsetPx: off, isDragging } = eventMoveRef.current
        eventMoveRef.current = null
        setMoveOverlay(null)
        setMovingEventId(null)
        // A pinch consumed this gesture: don't enter resize mode or reschedule
        if (pinchActiveRef.current) return
        if (!isDragging) {
          // Hold-and-release without drag: enter resize mode (touch only; mouse uses hover handles)
          if (isTouch) {
            suppressClickRef.current = true
            setResizingEventId(ev.id)
          }
          return
        }
        suppressClickRef.current = true
        const copy = mu.ctrlKey && !isTouch
        if (capturedDropTarget === 'float') {
          makeEventFloat(ev, copy)
          return
        }
        if (capturedDropTarget === 'allday') {
          const dropDayIdx = Math.max(0, Math.min(getDayIdxFromX(mu.clientX), days.length - 1))
          makeEventAllDay(ev, days[dropDayIdx], copy)
          return
        }
        const curY = getYInGrid(mu.clientY)
        const anchorY = isDue ? curY : Math.max(0, curY - off)
        const curDayIdx = Math.max(0, Math.min(getDayIdxFromX(mu.clientX), days.length - 1))
        const newStart = isDue
          ? snapToGridDue(days[curDayIdx], anchorY, scaleFor(curDayIdx))
          : dragStartFor(days[curDayIdx], anchorY, scaleFor(curDayIdx), dur)
        const newEnd = new Date(newStart.getTime() + dur)
        const origStartMs = new Date(ev.startAt!).getTime()
        if (newStart.getTime() === origStartMs) return
        rescheduleEvent(ev, newStart, newEnd, copy)
      }

      function onPointerCancel(pc: PointerEvent) {
        if (isTouch && pc.pointerId !== pointerId) return
        // Capture isDragging before nulling the ref — Capacitor/Android can fire
        // pointercancel after the long-press timer (late native gesture recognition).
        // If no movement occurred, treat it the same as onEarlyCancel: enter resize mode.
        const wasDragging = eventMoveRef.current?.isDragging ?? false
        cleanup(pc.clientX, pc.clientY)
        eventMoveRef.current = null
        setMoveOverlay(null)
        setMovingEventId(null)
        if (isTouch && !wasDragging) {
          suppressClickRef.current = true
          setResizingEventId(event.id)
        }
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerCancel)
    }

    if (isTouch) {
      // Long-press (350ms) before drag activates, so normal taps/scrolls still work.
      // 350ms deliberately undercuts the Android WebView's ~400ms native long-press
      // recognizer: in the Capacitor app the native gesture would otherwise steal
      // the pointer (pointercancel) before the timer fires. The grid-level
      // contextmenu suppression (see effect above) blocks most of those takeovers;
      // onEarlyCancel below is the fallback for the ones that still get through.
      let lastClientX = startClientX
      let lastClientY = startClientY
      const pressedAt = Date.now()
      let timer: ReturnType<typeof setTimeout>

      function cancelEarly() {
        clearTimeout(timer)
        window.removeEventListener('pointermove', onEarlyMove)
        window.removeEventListener('pointerup', onEarlyUp)
        window.removeEventListener('pointercancel', onEarlyCancel)
      }

      function onEarlyMove(mv: PointerEvent) {
        if (mv.pointerId !== pointerId) return
        lastClientX = mv.clientX
        lastClientY = mv.clientY
        const dx = mv.clientX - startClientX
        const dy = mv.clientY - startClientY
        // Fingers drift during a hold on a real touchscreen; only movement past
        // 15px counts as scroll/swipe intent and kills the long-press.
        if (Math.sqrt(dx * dx + dy * dy) > 15) {
          cancelEarly()
          if (Math.abs(dx) > Math.abs(dy)) {
            swipeRef.current = { direction: 'horizontal', startX: startClientX }
          }
        }
      }

      function onEarlyUp(up: PointerEvent) {
        if (up.pointerId !== pointerId) return
        cancelEarly()
      }

      function onEarlyCancel(pc: PointerEvent) {
        if (pc.pointerId !== pointerId) return
        cancelEarly()
        // A cancel landing here had under 15px of drift (more already removed
        // this listener), so classify by hold time: the WebView claims a pan-y
        // scroll within its touch slop almost immediately, while its native
        // long-press recognizer cancels only after ~400ms. Treat a late cancel
        // as a successful long-press and enter resize mode directly.
        if (Date.now() - pressedAt < 250) return
        if (navigator.vibrate) navigator.vibrate(30)
        suppressClickRef.current = true
        setResizingEventId(event.id)
      }

      window.addEventListener('pointermove', onEarlyMove)
      window.addEventListener('pointerup', onEarlyUp)
      window.addEventListener('pointercancel', onEarlyCancel)

      timer = setTimeout(() => {
        window.removeEventListener('pointermove', onEarlyMove)
        window.removeEventListener('pointerup', onEarlyUp)
        window.removeEventListener('pointercancel', onEarlyCancel)
        // A second finger started a pinch during the hold: don't arm the drag
        if (pinchActiveRef.current) return
        if (navigator.vibrate) navigator.vibrate(30)
        startDragging(lastClientX, lastClientY)
      }, 350)
    } else {
      startDragging(startClientX, startClientY)
    }
  }

  function getDropTarget(clientY: number): 'float' | 'allday' | null {
    const floatRect = floatRowRef.current?.getBoundingClientRect()
    if (floatRect && clientY >= floatRect.top && clientY <= floatRect.bottom) return 'float'
    const allDayRect = allDayRowRef.current?.getBoundingClientRect()
    if (allDayRect && clientY >= allDayRect.top && clientY <= allDayRect.bottom) return 'allday'
    return null
  }

  function handleAllDayPillMoveStart(e: FloatingDragInfo & { button?: number; stopPropagation?: () => void }, event: Occurrence, onDrop?: (ev: Occurrence, start: Date, end: Date, copy?: boolean) => void) {
    if (e.pointerType === 'mouse' && (e.button ?? 0) !== 0) return
    e.stopPropagation?.()
    suppressClickRef.current = false

    // All-day events also have endAt null, so check isAllDay before treating as a due pin
    const isDue = !event.isAllDay && isDueOccurrence(event)
    const durationMs = PILL_DROP_MINUTES * 60 * 1000
    const pointerId = e.pointerId
    const isTouch = e.pointerType === 'touch'
    const startClientX = e.clientX
    const startClientY = e.clientY
    let isDragging = false
    setPendingAllDayDragId(event.id)

    function isInGrid(clientY: number) {
      if (!gridRef.current) return false
      return clientY >= gridRef.current.getBoundingClientRect().top
    }

    function onPointerMove(mv: PointerEvent) {
      if (isTouch && mv.pointerId !== pointerId) return
      if (!isDragging) {
        const dx = mv.clientX - startClientX
        const dy = mv.clientY - startClientY
        if (Math.abs(dx) + Math.abs(dy) < 8) return
        isDragging = true
        allDayDragActiveRef.current = true
        setMovingEventId(event.id)
        setIsDraggingPill(true)
        if (!isTouch) document.body.style.cursor = 'grabbing'
        expandForDrag(mv.clientX, mv.clientY, true)
      }

      const curDayIdx = Math.max(0, Math.min(getDayIdxFromX(mv.clientX), days.length - 1))
      allDayDragStateRef.current = { curDayIdx, isDue }

      const dropTarget = getDropTarget(mv.clientY)
      if (dropTarget !== dragDropTargetRef.current) {
        dragDropTargetRef.current = dropTarget
        setDragDropTarget(dropTarget)
      }
      if (dropTarget === 'allday') {
        const di = Math.max(0, Math.min(getDayIdxFromX(mv.clientX), days.length - 1))
        if (di !== dragDropDayIdxRef.current) {
          dragDropDayIdxRef.current = di
          setDragDropDayIdx(di)
        }
      }

      if (dropTarget) {
        setMoveOverlay(null)
        stopAutoScroll()
      } else if (isInGrid(mv.clientY)) {
        const curY = getYInGrid(mv.clientY)
        const sc = scaleFor(curDayIdx)
        const startSnapped = isDue
          ? snapToGridDue(days[curDayIdx], curY, sc)
          : dragStartFor(days[curDayIdx], curY, sc, durationMs)
        const startMin = startSnapped.getHours() * 60 + startSnapped.getMinutes()
        setMoveOverlay({
          dayIdx: curDayIdx,
          topPx: sc.toPx(startMin),
          heightPx: isDue ? duePinHeight(sc.hourPx) : Math.max((PILL_DROP_MINUTES / 60) * sc.hourPx, MIN_EVENT_PX),
        })
        startAutoScroll(mv.clientX, mv.clientY)
      } else {
        setMoveOverlay(null)
        stopAutoScroll()
      }
    }

    function cleanup(cx?: number, cy?: number) {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      allDayDragActiveRef.current = false
      allDayDragStateRef.current = null
      document.body.style.cursor = ''
      stopAutoScroll()
      collapseAfterDrag(cx, cy, true)
      setPendingAllDayDragId(null)
      dragDropTargetRef.current = null
      dragDropDayIdxRef.current = null
      setDragDropTarget(null)
      setDragDropDayIdx(null)
      setIsDraggingPill(false)
    }

    function onPointerUp(mu: PointerEvent) {
      if (isTouch && mu.pointerId !== pointerId) return
      const capturedDropTarget = dragDropTargetRef.current
      const capturedDropDayIdx = dragDropDayIdxRef.current
      cleanup(mu.clientX, mu.clientY)
      setMoveOverlay(null)
      setMovingEventId(null)
      if (!isDragging) return
      suppressClickRef.current = true
      const copy = mu.ctrlKey && !isTouch
      if (capturedDropTarget === 'float') {
        makeEventFloat(event, copy)
        return
      }
      if (capturedDropTarget === 'allday') {
        const dropDayIdx = capturedDropDayIdx ?? Math.max(0, Math.min(getDayIdxFromX(mu.clientX), days.length - 1))
        makeEventAllDay(event, days[dropDayIdx], copy)
        return
      }
      if (!isInGrid(mu.clientY)) return
      const curDayIdx = Math.max(0, Math.min(getDayIdxFromX(mu.clientX), days.length - 1))
      const newStart = isDue
        ? snapToGridDue(days[curDayIdx], getYInGrid(mu.clientY), scaleFor(curDayIdx))
        : dragStartFor(days[curDayIdx], getYInGrid(mu.clientY), scaleFor(curDayIdx), durationMs)
      const newEnd = new Date(newStart.getTime() + durationMs)
      ;(onDrop ?? rescheduleFromAllDay)(event, newStart, newEnd, copy)
    }

    function onPointerCancel(pc: PointerEvent) {
      if (isTouch && pc.pointerId !== pointerId) return
      cleanup(pc.clientX, pc.clientY)
      setMoveOverlay(null)
      setMovingEventId(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  // ── Event resize drag ──────────────────────────────────────────────────────

  function handleResizeStart(e: React.PointerEvent, event: Occurrence, side: 'top' | 'bottom') {
    if (!event.startAt) return
    e.stopPropagation()

    const origStartMs = new Date(event.startAt).getTime()
    const origEndMs = event.endAt ? new Date(event.endAt).getTime() : origStartMs + 15 * 60 * 1000

    resizeDragActiveRef.current = true
    resizeStateRef.current = { origStartMs, origEndMs, side }
    document.body.style.cursor = 'ns-resize'
    // Pressing a resize handle is already the commitment - there is no threshold
    // to wait for and no other gesture it could turn into.
    expandForDrag(e.clientX, e.clientY)

    function overlayForPointer(clientX: number, clientY: number): Map<number, { topPx: number; heightPx: number }> {
      const curDayIdx = Math.max(0, Math.min(getDayIdxFromX(clientX), days.length - 1))
      const snappedMs = snapToGrid(days[curDayIdx], getYInGrid(clientY), scaleFor(curDayIdx)).getTime()
      if (side === 'top') {
        return computeResizeOverlays(Math.min(snappedMs, origEndMs - 15 * 60 * 1000), origEndMs)
      } else {
        return computeResizeOverlays(origStartMs, Math.max(snappedMs, origStartMs + 15 * 60 * 1000))
      }
    }

    function onPointerMove(mv: PointerEvent) {
      // A second finger landed and started a pinch: abandon the resize drag
      if (pinchActiveRef.current) {
        cleanup()
        setResizeOverlay(new Map())
        return
      }
      setResizeOverlay(overlayForPointer(mv.clientX, mv.clientY))
      startAutoScroll(mv.clientX, mv.clientY)
    }

    function cleanup(cx?: number, cy?: number) {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      resizeDragActiveRef.current = false
      resizeStateRef.current = null
      document.body.style.cursor = ''
      stopAutoScroll()
      collapseAfterDrag(cx, cy)
    }

    function onPointerUp(mu: PointerEvent) {
      cleanup(mu.clientX, mu.clientY)
      setResizeOverlay(new Map())

      const curDayIdx = Math.max(0, Math.min(getDayIdxFromX(mu.clientX), days.length - 1))
      const curDay = days[curDayIdx]
      const snappedMs = snapToGrid(curDay, getYInGrid(mu.clientY), scaleFor(curDayIdx)).getTime()

      let newStart: Date
      let newEnd: Date

      if (side === 'top') {
        newStart = new Date(Math.min(snappedMs, origEndMs - 15 * 60 * 1000))
        newEnd = new Date(origEndMs)
      } else {
        newStart = new Date(origStartMs)
        newEnd = new Date(Math.max(snappedMs, origStartMs + 15 * 60 * 1000))
      }

      if (newStart.getTime() !== origStartMs || newEnd.getTime() !== origEndMs) {
        rescheduleEvent(event, newStart, newEnd)
      }
    }

    function onPointerCancel() {
      cleanup()
      setResizeOverlay(new Map())
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
  }

  // ── Grid drag helpers ────────────────────────────────────────────────────

  function getDayIdxFromX(clientX: number): number {
    if (!gridRef.current) return 0
    const rect = gridRef.current.getBoundingClientRect()
    const colWidth = rect.width / days.length
    return Math.max(0, Math.min(Math.floor((clientX - rect.left) / colWidth), days.length - 1))
  }

  function getYInGrid(clientY: number): number {
    if (!gridRef.current) return 0
    const rect = gridRef.current.getBoundingClientRect()
    return Math.max(0, Math.min(clientY - rect.top, gridHeightRef.current - 1))
  }

  // ── Scale switching ──────────────────────────────────────────────────────

  function scaleFor(dayIdx: number): TimeScale {
    const scs = scalesRef.current
    if (scs.length === 0) return linearScale(hourPxRef.current)
    return scs[Math.max(0, Math.min(dayIdx, scs.length - 1))]
  }

  /**
   * Column index from an x coordinate, off the refs only. getDayIdxFromX closes
   * over `days`, which goes stale in the mount-once wheel and pinch listeners.
   */
  function dayIdxFromXRef(clientX: number): number {
    const rect = gridRef.current?.getBoundingClientRect()
    const n = scalesRef.current.length
    if (!rect || n === 0) return 0
    return Math.max(0, Math.min(Math.floor((clientX - rect.left) / (rect.width / n)), n - 1))
  }

  /**
   * Records what the view should keep still across the next scale change. A
   * pointer outside the scroll area has no position worth holding - a pill being
   * dragged in from the header row is nowhere near the grid - so the middle of
   * the visible grid stands in for it.
   */
  function captureAnchor(clientX: number | null, clientY: number | null) {
    // Cleared first: a capture that can't measure must not leave an older anchor
    // behind for the next scale change to apply to the wrong thing.
    anchorRef.current = null
    const grid = gridRef.current
    const scroll = scrollRef.current
    if (!grid || !scroll || scalesRef.current.length === 0) return
    const scrollRect = scroll.getBoundingClientRect()
    const viewportY =
      clientY != null && clientY > scrollRect.top && clientY < scrollRect.bottom
        ? clientY
        : (scrollRect.top + scrollRect.bottom) / 2
    const dayIdx = clientX != null ? dayIdxFromXRef(clientX) : 0
    anchorRef.current = {
      dayIdx,
      min: scaleFor(dayIdx).toMin(viewportY - grid.getBoundingClientRect().top),
      viewportY,
      at: performance.now(),
    }
  }

  /**
   * Puts the grid back on the linear 0-24 scale for the duration of a drag.
   * Synchronous: the caller reads grid coordinates on the very next line, so the
   * new layout and the corrected scroll position both have to be in place first.
   */
  /**
   * `revealsRows` is for the gestures that show the FLOAT / all-day rows above the
   * grid - moving a block, dragging a pill. Those shift the grid down by the rows'
   * height on their own, so they need anchoring even when compact is off and the
   * scale is not changing at all. Gestures that change nothing must not anchor:
   * the anchor would sit unconsumed and be applied by some later render instead.
   */
  function expandForDrag(clientX: number | null, clientY: number | null, revealsRows = false) {
    if (!compactRef.current && !revealsRows) return
    captureAnchor(clientX, clientY)
    if (!compactRef.current || dragExpandedRef.current) return
    dragExpandedRef.current = true
    flushSync(() => setDragExpanded(true))
  }

  function collapseAfterDrag(clientX?: number, clientY?: number, revealsRows = false) {
    if (!dragExpandedRef.current && !revealsRows) return
    captureAnchor(clientX ?? null, clientY ?? null)
    if (!dragExpandedRef.current) return
    dragExpandedRef.current = false
    setDragExpanded(false)
  }

  function computeOverlays(
    startDayIdx: number,
    startY: number,
    endDayIdx: number,
    endY: number,
  ): Map<number, { topPx: number; heightPx: number }> {
    const minIdx = Math.min(startDayIdx, endDayIdx)
    const maxIdx = Math.max(startDayIdx, endDayIdx)
    const result = new Map<number, { topPx: number; heightPx: number }>()
    for (let i = minIdx; i <= maxIdx; i++) {
      const sc = scaleFor(i)
      const hp = sc.hourPx
      if (startDayIdx === endDayIdx) {
        const topY = Math.min(startY, endY)
        const botY = Math.max(startY, endY)
        const s = snapToGrid(days[i], topY, sc)
        const en = snapToGrid(days[i], botY, sc)
        const dayStartMs = sod(days[i]).getTime()
        const topPx = sc.toPx((s.getTime() - dayStartMs) / 60000)
        const endPx = sc.toPx((en.getTime() - dayStartMs) / 60000)
        result.set(i, { topPx, heightPx: Math.max(endPx - topPx, hp / 4) })
      } else if (i === minIdx) {
        const anchorY = startDayIdx < endDayIdx ? startY : endY
        const s = snapToGrid(days[i], anchorY, sc)
        const topPx = sc.toPx(s.getHours() * 60 + s.getMinutes())
        result.set(i, { topPx, heightPx: sc.totalPx - topPx })
      } else if (i === maxIdx) {
        const anchorY = startDayIdx > endDayIdx ? startY : endY
        const en = snapToGrid(days[i], anchorY, sc)
        const endPx = sc.toPx(en.getHours() * 60 + en.getMinutes())
        result.set(i, { topPx: 0, heightPx: Math.max(endPx, hp / 4) })
      } else {
        result.set(i, { topPx: 0, heightPx: sc.totalPx })
      }
    }
    return result
  }

  function computeResizeOverlays(startMs: number, endMs: number): Map<number, { topPx: number; heightPx: number }> {
    const result = new Map<number, { topPx: number; heightPx: number }>()
    for (let i = 0; i < days.length; i++) {
      const dayStartMs = sod(days[i]).getTime()
      const dayEndMs = dayStartMs + 86400000
      if (endMs <= dayStartMs || startMs >= dayEndMs) continue
      const segStartMs = Math.max(startMs, dayStartMs)
      const segEndMs = Math.min(endMs, dayEndMs)
      const startMin = (segStartMs - dayStartMs) / 60000
      const endMin = (segEndMs - dayStartMs) / 60000
      const sc = scaleFor(i)
      result.set(i, {
        topPx: sc.toPx(startMin),
        heightPx: Math.max(((endMin - startMin) / 60) * sc.hourPx, MIN_EVENT_PX),
      })
    }
    return result
  }

  function handleGridMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // mousedown bubbles independently of pointerdown, so an event-move or resize
    // that already started via pointerdown would run concurrently. Bail out early.
    if (eventMoveRef.current || resizeDragActiveRef.current || allDayDragActiveRef.current) return
    const startedOnBlock = !!(e.target as Element).closest('button')
    if (startedOnBlock) {
      // Same minimum-height overflow carve-out as handleGridPointerDown: below
      // the event's true end the press belongs to the grid, not the event.
      const block = (e.target as Element).closest('[data-true-end-px]') as HTMLElement | null
      const trueEndPx = block ? parseFloat(block.dataset.trueEndPx ?? '99999') : 99999
      if (getYInGrid(e.clientY) < trueEndPx) return
    }
    if (e.button !== 0) return
    const dayIdx = getDayIdxFromX(e.clientX)
    const y = getYInGrid(e.clientY)
    dragRef.current = {
      startDayIdx: dayIdx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startY: y,
      startMin: scaleFor(dayIdx).toMin(y),
      isDrag: false,
    }

    function onMouseMove(mv: MouseEvent) {
      if (!dragRef.current) return
      const dx = mv.clientX - dragRef.current.startClientX
      const dy = mv.clientY - dragRef.current.startClientY
      if (!dragRef.current.isDrag && Math.abs(dx) + Math.abs(dy) < 8) return
      if (!dragRef.current.isDrag) {
        // Expanding moves the press's own pixel, so re-derive it from the minute.
        // Waiting for the threshold keeps a plain click - which creates in place -
        // from flickering the whole grid open and shut.
        expandForDrag(mv.clientX, mv.clientY)
        dragRef.current.startY = scaleFor(dragRef.current.startDayIdx).toPx(dragRef.current.startMin)
      }
      dragRef.current.isDrag = true
      const endDayIdx = getDayIdxFromX(mv.clientX)
      const endY = getYInGrid(mv.clientY)
      setDragOverlays(computeOverlays(dragRef.current.startDayIdx, dragRef.current.startY, endDayIdx, endY))
    }

    function onMouseUp(mu: MouseEvent) {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (!dragRef.current) return
      const { startDayIdx, startY, isDrag } = dragRef.current
      dragRef.current = null
      setDragOverlays(new Map())
      if (!isDrag) {
        // A press with no drag creates a default-length occurrence there. Skipped on an event's
        // overflow zone, where the browser's click is about to open that event instead, and for a
        // touch, which reaches this handler again as a compatibility mouse event: that press has
        // already been judged, more carefully, in handleGridPointerUp.
        if (!startedOnBlock && lastPointerTypeRef.current === 'mouse') openCreateAt(startDayIdx, startY)
        return
      }
      // Drags can now start on an event's overflow zone; swallow the click the
      // browser fires on the underlying button so the detail modal doesn't open.
      suppressClickRef.current = true

      const endDayIdx = getDayIdxFromX(mu.clientX)
      const endY = getYInGrid(mu.clientY)

      let startDate: Date
      let endDate: Date
      if (startDayIdx < endDayIdx) {
        startDate = snapToGrid(days[startDayIdx], startY, scaleFor(startDayIdx))
        endDate = snapToGrid(days[endDayIdx], endY, scaleFor(endDayIdx))
      } else if (startDayIdx > endDayIdx) {
        startDate = snapToGrid(days[endDayIdx], endY, scaleFor(endDayIdx))
        endDate = snapToGrid(days[startDayIdx], startY, scaleFor(startDayIdx))
      } else {
        const sc = scaleFor(startDayIdx)
        startDate = snapToGrid(days[startDayIdx], Math.min(startY, endY), sc)
        endDate = snapToGrid(days[startDayIdx], Math.max(startY, endY), sc)
      }
      collapseAfterDrag(mu.clientX, mu.clientY)
      if (endDate <= startDate) endDate.setMinutes(endDate.getMinutes() + 15)
      openCreate(formatDatetimeLocal(startDate), formatDatetimeLocal(endDate))
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ── Touch drag via pointer capture ───────────────────────────────────────
  // pointercancel fires when the browser takes over the gesture for scrolling,
  // giving us a reliable signal to abort without false-firing during normal scrolls.

  // Once the long-press arms a drag, native scrolling must be suppressed by
  // preventDefault-ing touchmove from a non-passive listener. Pointer capture and
  // overflow toggles don't stop the browser's pan gesture, and React registers its
  // touch handlers as passive, so this has to be a native listener.
  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (dragRef.current?.isDrag || eventMoveRef.current?.isDragging || resizeDragActiveRef.current || allDayDragActiveRef.current || swipeRef.current?.direction === 'horizontal' || pinchActiveRef.current) e.preventDefault()
    }
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => document.removeEventListener('touchmove', onTouchMove)
  }, [])

  // Dismiss touch resize mode when the user taps outside the event or its handles
  useEffect(() => {
    if (!resizingEventId) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element
      if (
        target.closest('[data-resize-handle]') ||
        target.closest(`[data-event-id="${resizingEventId}"]`)
      ) return
      setResizingEventId(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [resizingEventId])

  function stopAutoScroll() {
    if (autoScrollRef.current) {
      cancelAnimationFrame(autoScrollRef.current.rafId)
      autoScrollRef.current = null
    }
  }

  function startAutoScroll(clientX: number, clientY: number) {
    if (autoScrollRef.current) {
      autoScrollRef.current.clientX = clientX
      autoScrollRef.current.clientY = clientY
      return
    }
    const state = { rafId: 0, clientX, clientY }
    autoScrollRef.current = state
    const ZONE = 80
    const MAX_SPEED = 12
    function tick() {
      if (!autoScrollRef.current || autoScrollRef.current !== state) return
      const anyDragActive = dragRef.current?.isDrag || eventMoveRef.current?.isDragging || resizeDragActiveRef.current || allDayDragActiveRef.current
      if (!anyDragActive || !scrollRef.current) { autoScrollRef.current = null; return }
      const rect = scrollRef.current.getBoundingClientRect()
      const distTop = state.clientY - rect.top
      const distBot = rect.bottom - state.clientY
      let speed = 0
      if (distTop < ZONE && distTop >= 0) speed = -MAX_SPEED * (1 - distTop / ZONE)
      else if (distBot < ZONE && distBot >= 0) speed = MAX_SPEED * (1 - distBot / ZONE)
      if (speed !== 0) {
        scrollRef.current.scrollTop += speed
        if (dragRef.current?.isDrag) {
          const endDayIdx = getDayIdxFromX(state.clientX)
          const endY = getYInGrid(state.clientY)
          setDragOverlays(computeOverlays(dragRef.current.startDayIdx, dragRef.current.startY, endDayIdx, endY))
        } else if (eventMoveRef.current?.isDragging) {
          const curY = getYInGrid(state.clientY)
          const anchorY = Math.max(0, curY - eventMoveRef.current.offsetPx)
          const curDayIdx = Math.max(0, Math.min(getDayIdxFromX(state.clientX), days.length - 1))
          const isEvDue = isDueOccurrence(eventMoveRef.current.event)
          const autoAnchorY = isEvDue ? curY : anchorY
          const sc = scaleFor(curDayIdx)
          const startSnapped = isEvDue
            ? snapToGridDue(days[curDayIdx], autoAnchorY, sc)
            : dragStartFor(days[curDayIdx], anchorY, sc, eventMoveRef.current.durationMs)
          const startMin = startSnapped.getHours() * 60 + startSnapped.getMinutes()
          const durationMin = eventMoveRef.current.durationMs / 60000
          setMoveOverlay({
            dayIdx: curDayIdx,
            topPx: sc.toPx(startMin),
            heightPx: isEvDue ? duePinHeight(sc.hourPx) : Math.max((durationMin / 60) * sc.hourPx, MIN_EVENT_PX),
          })
        } else if (resizeDragActiveRef.current && resizeStateRef.current) {
          const rs = resizeStateRef.current
          const rsDayIdx = Math.max(0, Math.min(getDayIdxFromX(state.clientX), days.length - 1))
          const snappedMs = snapToGrid(days[rsDayIdx], getYInGrid(state.clientY), scaleFor(rsDayIdx)).getTime()
          if (rs.side === 'top') {
            setResizeOverlay(computeResizeOverlays(Math.min(snappedMs, rs.origEndMs - 15 * 60 * 1000), rs.origEndMs))
          } else {
            setResizeOverlay(computeResizeOverlays(rs.origStartMs, Math.max(snappedMs, rs.origStartMs + 15 * 60 * 1000)))
          }
        } else if (allDayDragActiveRef.current && allDayDragStateRef.current) {
          const { curDayIdx, isDue: isPillDue } = allDayDragStateRef.current
          if (gridRef.current && state.clientY >= gridRef.current.getBoundingClientRect().top) {
            const curY = getYInGrid(state.clientY)
            const sc = scaleFor(curDayIdx)
            const startSnapped = isPillDue
              ? snapToGridDue(days[curDayIdx], curY, sc)
              : dragStartFor(days[curDayIdx], curY, sc, PILL_DROP_MINUTES * 60000)
            const startMin = startSnapped.getHours() * 60 + startSnapped.getMinutes()
            setMoveOverlay({ dayIdx: curDayIdx, topPx: sc.toPx(startMin), heightPx: isPillDue ? duePinHeight(sc.hourPx) : Math.max((PILL_DROP_MINUTES / 60) * sc.hourPx, MIN_EVENT_PX) })
          }
        }
      }
      state.rafId = requestAnimationFrame(tick)
    }
    state.rafId = requestAnimationFrame(tick)
  }

  /**
   * Creates at the grid position pressed, snapped to the quarter hour, for a default half hour.
   * Dragging still sets an exact span; this is the cheap gesture for the common case, and the
   * calendar's main job is now to make adding something easy.
   */
  function openCreateAt(dayIdx: number, y: number) {
    // The same press is dismissing an open popover (both close on a document listener), and a click
    // that closes one thing should not open another.
    if (datePopOpen) return
    const start = snapToGrid(days[dayIdx], y, scaleFor(dayIdx))
    openCreate(
      formatDatetimeLocal(start),
      formatDatetimeLocal(new Date(start.getTime() + CLICK_CREATE_MINUTES * 60000)),
    )
  }

  function handleGridPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Recorded for every pointer type, before the touch-only work below.
    lastPointerTypeRef.current = e.pointerType
    if (e.pointerType !== 'touch') return
    if (pinchActiveRef.current) return
    const startClientX = e.clientX
    const startClientY = e.clientY
    const startDayIdx = getDayIdxFromX(startClientX)
    const startY = getYInGrid(startClientY)
    const startMin = scaleFor(startDayIdx).toMin(startY)
    const startedOnBlock = !!(e.target as Element).closest('button')
    if (startedOnBlock) {
      // Allow drag creation in the minimum-height overflow zone below the event's true end time.
      // Short events get a visual minimum height (MIN_EVENT_PX) that extends their button below
      // their actual end time; without this check the next 15-min slot appears unreachable.
      const block = (e.target as Element).closest('[data-true-end-px]') as HTMLElement | null
      const trueEndPx = block ? parseFloat(block.dataset.trueEndPx ?? '99999') : 99999
      if (startY < trueEndPx) return
    }
    const pointerId = e.pointerId
    const timer = setTimeout(() => {
      if (!pendingTouchRef.current) return
      pendingTouchRef.current = null
      swipeRef.current = null
      try {
        gridRef.current?.setPointerCapture(pointerId)
      } catch {
        return
      }
      if (scrollRef.current) scrollRef.current.style.overflowY = 'hidden'
      // The long press is the commitment on touch, so the grid opens up here and
      // the press's pixel is re-derived from the minute it landed on.
      expandForDrag(startClientX, startClientY)
      const armedY = scaleFor(startDayIdx).toPx(startMin)
      dragRef.current = { startDayIdx, startClientX, startClientY, startY: armedY, startMin, isDrag: true }
      setDragOverlays(computeOverlays(startDayIdx, armedY, startDayIdx, armedY))
      startAutoScroll(startClientX, startClientY)
      if (navigator.vibrate) navigator.vibrate(30)
    }, 350)
    pendingTouchRef.current = {
      pointerId, startClientX, startClientY, startDayIdx, startY, startMin, timer, startedOnBlock,
      downAt: performance.now(),
      scrollTop: scrollRef.current?.scrollTop ?? 0,
      arrestingScroll: performance.now() - lastScrollAtRef.current < SCROLL_SETTLE_MS,
    }
  }

  function handleGridPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch') return
    if (pendingTouchRef.current && !dragRef.current) {
      const dx = e.clientX - pendingTouchRef.current.startClientX
      const dy = e.clientY - pendingTouchRef.current.startClientY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (swipeRef.current === null && dist > 5) {
        swipeRef.current = {
          direction: Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical',
          startX: pendingTouchRef.current.startClientX,
        }
      }
      if (dist > 15) {
        clearTimeout(pendingTouchRef.current.timer)
        pendingTouchRef.current = null
      }
      return
    }
    if (!dragRef.current?.isDrag) return
    const endDayIdx = getDayIdxFromX(e.clientX)
    const endY = getYInGrid(e.clientY)
    setDragOverlays(computeOverlays(dragRef.current.startDayIdx, dragRef.current.startY, endDayIdx, endY))
    startAutoScroll(e.clientX, e.clientY)
  }

  function commitTouchDrag(clientX: number, clientY: number) {
    stopAutoScroll()
    if (!dragRef.current) return
    const { startDayIdx, startY } = dragRef.current
    dragRef.current = null
    setDragOverlays(new Map())
    // Drags can now start on an event's overflow zone; swallow the click the
    // browser fires on the underlying button so the detail modal doesn't open.
    suppressClickRef.current = true
    if (scrollRef.current) scrollRef.current.style.overflowY = ''
    const endDayIdx = getDayIdxFromX(clientX)
    const endY = getYInGrid(clientY)
    let startDate: Date
    let endDate: Date
    if (startDayIdx < endDayIdx) {
      startDate = snapToGrid(days[startDayIdx], startY, scaleFor(startDayIdx))
      endDate = snapToGrid(days[endDayIdx], endY, scaleFor(endDayIdx))
    } else if (startDayIdx > endDayIdx) {
      startDate = snapToGrid(days[endDayIdx], endY, scaleFor(endDayIdx))
      endDate = snapToGrid(days[startDayIdx], startY, scaleFor(startDayIdx))
    } else {
      const sc = scaleFor(startDayIdx)
      startDate = snapToGrid(days[startDayIdx], Math.min(startY, endY), sc)
      endDate = snapToGrid(days[startDayIdx], Math.max(startY, endY), sc)
    }
    collapseAfterDrag(clientX, clientY)
    if (endDate <= startDate) endDate.setMinutes(endDate.getMinutes() + 15)
    openCreate(formatDatetimeLocal(startDate), formatDatetimeLocal(endDate))
  }

  function handleGridPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch') return
    // A tap: quick, still, and on nothing. Creating an event needs the hold, so the tap is free to ask
    // what the world looks like there instead - but only when it is unambiguously a tap. Everything a
    // scrolling finger does looks like one at some point: it lands to stop momentum, it rests before
    // flicking, it grazes the glass. Each clause below rules out one of those, and a press that fails
    // any of them simply does nothing, which is what it did before this existed.
    const pending = pendingTouchRef.current
    const wasTap =
      !!pending
      && !dragRef.current                                            // the long press never armed a drag
      && !pending.startedOnBlock                                     // an event's overflow zone, not the grid
      && swipeRef.current === null                                   // never moved far enough to latch a direction
      && !pending.arrestingScroll                                    // landed on a view still gliding
      && performance.now() - pending.downAt < TAP_MAX_MS             // a tap, not a parked finger
      && (scrollRef.current?.scrollTop ?? 0) === pending.scrollTop   // the grid held still underneath it
    if (pending) {
      clearTimeout(pending.timer)
      pendingTouchRef.current = null
    }
    if (wasTap) {
      openCreateAt(pending!.startDayIdx, pending!.startY)
      return
    }
    if (swipeRef.current?.direction === 'horizontal') {
      const dx = e.clientX - swipeRef.current.startX
      if (dx > 40) { fireNav('back'); setCurrent((d) => addDays(d, -1)) }
      else if (dx < -40) { fireNav('forward'); setCurrent((d) => addDays(d, 1)) }
      swipeRef.current = null
      return
    }
    swipeRef.current = null
    commitTouchDrag(e.clientX, e.clientY)
  }

  function handleGridPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'touch') return
    swipeRef.current = null
    stopAutoScroll()
    if (pendingTouchRef.current) {
      clearTimeout(pendingTouchRef.current.timer)
      pendingTouchRef.current = null
    }
    dragRef.current = null
    setDragOverlays(new Map())
    collapseAfterDrag(e.clientX, e.clientY)
    if (scrollRef.current) scrollRef.current.style.overflowY = ''
  }

  const allDayEvents = events.filter((e) => e.isAllDay && e.startAt && e.status !== 'skipped')
  const calendarEvents = events.filter((e) => !e.isAllDay && e.status !== 'skipped')

  // One scale per visible day. Each column collapses its own empty stretches, so
  // in a multi-day view the hours do not line up across columns - two days with
  // nothing in common have nothing to align on, and forcing a shared scale would
  // mean collapsing only what every day happens to agree is empty.
  const eventsKey = calendarEvents.map((e) => `${e.id}:${e.startAt}:${e.endAt}`).join(',')
  const scales = useMemo(() => {
    if (!compactActive) {
      const linear = linearScale(hourPx)
      return days.map(() => linear)
    }
    return days.map((day) => {
      const ds = sod(day).getTime()
      const de = ds + 86400000
      // Segments are exactly the spans handed over - nothing is padded - so a
      // block that draws taller than its own duration (layoutDay's 15-minute
      // floor, then MIN_EVENT_PX) would spill onto the block stacked under it.
      // Hand over what the block will really occupy instead of its raw span.
      const minSpanMin = Math.max(15, (MIN_EVENT_PX / hourPx) * 60)
      const ranges: Array<[number, number]> = []
      for (const e of calendarEvents) {
        if (!occursOnDay(e, ds, de)) continue
        const startMs = new Date(e.startAt!).getTime()
        const endMs = e.endAt ? new Date(e.endAt).getTime() : startMs + DUE_SPAN_MINUTES * 60000
        const startMin = Math.max(0, (startMs - ds) / 60000)
        const endMin = Math.max((endMs - ds) / 60000, startMin + minSpanMin)
        ranges.push([startMin, Math.min(DAY_MIN, endMin)])
      }
      // No anchor for "now": compact mode doesn't draw the now line, so reserving a
      // segment for it would only put a stray segment break in the middle of the
      // stack with nothing to explain it.
      return compactScale(ranges, hourPx)
    })
    // eventsKey stands in for calendarEvents, which is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactActive, hourPx, days, eventsKey])
  scalesRef.current = scales

  const gridHeight = useMemo(() => Math.max(...scales.map((s) => s.totalPx)), [scales])
  gridHeightRef.current = gridHeight

  // Holds the anchored minute at its screen position while the grid's geometry
  // changes. Runs before paint, so no change is seen as a jump.
  //
  // Deliberately NOT one-shot. A single gesture moves the grid in more than one
  // render - the scale switch lands in one, the FLOAT / all-day rows appearing
  // above the grid in another - and which order they arrive in depends on how
  // React batches that particular handler. Re-applying is idempotent (it drives
  // the delta to zero), so the anchor is simply left in place and every render of
  // the cascade converges to the same result, whatever the order.
  //
  // It expires instead: an anchor belongs to the burst of renders it was captured
  // for, and anything later is an unrelated change that must not be yanked to it.
  useLayoutEffect(() => {
    if (!scrollRef.current) return
    // Sized before the scroll below is computed: adding room under the grid does
    // not move the grid, it only lets scrollTop reach far enough to honour the
    // anchor. A viewport's worth is always enough for any minute at any position.
    if (dragSpacerRef.current) {
      dragSpacerRef.current.style.height = dragExpanded ? `${scrollRef.current.clientHeight}px` : '0px'
    }
    const a = anchorRef.current
    if (!a || !gridRef.current) return
    if (performance.now() - a.at > ANCHOR_TTL_MS) {
      anchorRef.current = null
      return
    }
    const sc = scales[Math.min(a.dayIdx, scales.length - 1)]
    if (!sc) return
    const delta = gridRef.current.getBoundingClientRect().top + sc.toPx(a.min) - a.viewportY
    if (Math.abs(delta) < 0.5) return
    const top = Math.max(0, scrollRef.current.scrollTop + delta)
    scrollRef.current.scrollTop = top
    // The browser clamps to the real maximum; mirror what actually took effect
    // rather than what was asked for, or the Due row's fold test goes wrong.
    setScrollTop(scrollRef.current.scrollTop)
  }, [scales, isDraggingGridEvent, isDraggingPill, dragExpanded])
  const dayAllDayEvents = useMemo(() => {
    const ds = sod(days[0]).getTime()
    const de = ds + 86400000
    return allDayEvents.filter((e) => {
      const startMs = new Date(e.startAt!).getTime()
      const endMs = effectiveAllDayEnd(e)
      return startMs < de && endMs > ds
    })
  }, [allDayEvents, days])

  const allDayLayout = useMemo(() => {
    if (view === 'day') return []
    const sorted = [...allDayEvents].sort((a, b) =>
      new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()
    )
    return assignAllDayRows(sorted, days)
  }, [allDayEvents, days, view])

  // A move is in flight: the FLOAT / all-day rows are revealed as drop targets, and
  // the Due and Soon rows are taken away. They list occurrences from outside the
  // visible range and neither accepts a drop, so while dragging they are only height
  // between the pointer and the grid - close enough to the top edge to trip autoscroll
  // over rows that can't accept the thing being dragged.
  const trayDragActive = isDraggingGridEvent || isDraggingPill

  // The tray carries its own closing edge and the gap below it, so it may only be
  // rendered when one of its rows is - otherwise it draws a stray band and a
  // double line under the day headers.
  const showTray =
    (overduePastItems.length > 0 && !trayDragActive) ||
    (upcomingDueItems.length > 0 && !trayDragActive) ||
    floatingTasks.length > 0 ||
    (view === 'day' ? dayAllDayEvents.length > 0 : allDayEvents.length > 0) ||
    trayDragActive

  const duePinsForRow = useMemo(() => {
    const allDue = calendarEvents.filter((e) => isDueOccurrence(e) && e.status === 'pending')
    // EOD pins (23:xx) are always shown in the sticky row
    const eod = allDue.filter(isEODDue)
    // Non-EOD pins only appear in the sticky row when scrolled below the fold
    const scrollRefTop = scrollRef.current?.getBoundingClientRect().top ?? 0
    const gridTop = timeGridRef.current?.getBoundingClientRect().top ?? scrollRefTop
    const gridOffset = gridTop - scrollRefTop + scrollTop
    const visibleBottom = scrollTop + (scrollRef.current?.clientHeight ?? 600)
    const belowFold = allDue.filter((e) => {
      if (isEODDue(e)) return false
      const d = new Date(e.startAt!)
      const di = days.findIndex((day) => isSameDay(day, d))
      const sc = scales[di < 0 ? 0 : di]
      const pinScrollPos = gridOffset + sc.toPx(d.getHours() * 60 + d.getMinutes())
      return pinScrollPos > visibleBottom - duePinHeight(hourPx)
    })
    return [...eod, ...belowFold].sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey, scrollTop, hourPx, days, scales])

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
      {/* Header */}
      <CalendarHeader
        view={view}
        days={days}
        current={current}
        compact={compact}
        datePopOpen={datePopOpen}
        onDatePopOpenChange={setDatePopOpen}
        datePopRef={datePopRef}
        dateInputRef={dateInputRef}
        onPrev={prev}
        onNext={next}
        onPrevDay={prevDay}
        onNextDay={nextDay}
        onToday={goToday}
        onPickDate={(d) => setCurrent(view === 'week' ? startOfWeek(d) : d)}
        onToggleCompact={toggleCompact}
        onChangeView={changeView}
        onCycleView={cycleView}
        onCreate={() => openCreate()}
      />

      {/* Time grid */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div ref={scrollRef} className="scroll-slim flex-1 overflow-y-auto flex flex-col" style={{ WebkitTouchCallout: 'none' }} onScroll={(e) => { lastScrollAtRef.current = performance.now(); setScrollTop(e.currentTarget.scrollTop) }}>
          {/* Multi-day headers + all-day row — sticky, inside scroll container to share column widths */}
          {view !== 'day' && (
            <div className="sticky top-0 z-40 bg-background">
              {/* This border-b doubles as the grid's 00:00 line, which is why the line
                  loop skips m=0 - so it carries the same weight as the rest of them. */}
              <div className="flex border-b" style={{ borderColor: 'var(--calendar-line)' }}>
                <div className="w-12 shrink-0" />
                {days.map((day, dayIdx) => (
                  <div
                    key={day.toISOString()}
                    className={`flex-1 ${dayIdx === 0 ? 'border-l ' : ''}border-r py-2 text-center text-xs ${
                      isSameDay(day, effectiveToday) ? 'font-semibold text-primary' : 'text-muted-foreground'
                    }`}
                    style={{ borderColor: 'var(--calendar-line)' }}
                  >
                    {dayHeader(day)}
                  </div>
                ))}
              </div>
              {showTray && (
                <CalendarTray
                  trayDragActive={trayDragActive}
                  overduePastItems={overduePastItems}
                  upcomingDueItems={upcomingDueItems}
                  floatingTasks={floatingTasks}
                  floatRowRef={floatRowRef}
                  floatHighlighted={dragDropTarget === 'float'}
                  movingEventId={movingEventId}
                  pendingDragId={pendingAllDayDragId}
                  onTaskClick={(o) => { if (!suppressClickRef.current) openDetail(o) }}
                  onRescheduleDragStart={(info, o) => handleAllDayPillMoveStart(info, o, rescheduleEvent)}
                  onFloatDragStart={(info, o) => handleAllDayPillMoveStart(info, o, scheduleFloating)}
                >
                {(allDayEvents.length > 0 || isDraggingGridEvent || isDraggingPill) && (
                  <div ref={allDayRowRef} className="flex">
                    <div className="flex w-12 shrink-0 items-center justify-end pr-2 py-0.5">
                      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Today</span>
                    </div>
                    <div
                      className="relative flex-1"
                      style={{ height: Math.max(26, (allDayLayout.reduce((m, r) => Math.max(m, r.row), -1) + 1) * 24 + 4) }}
                    >
                      <div className="pointer-events-none absolute inset-0 flex">
                        {days.map((day, idx) => (
                          <div
                            key={day.toISOString()}
                            className={`flex-1 transition-colors ${idx === 0 ? 'border-l border-r' : 'border-r'} ${dragDropTarget === 'allday' && dragDropDayIdx === idx ? 'bg-primary/10' : ''}`}
                            style={{ borderColor: 'var(--calendar-line)' }}
                          />
                        ))}
                      </div>
                      {allDayLayout.map(({ id, row, startIdx, endIdx }) => {
                        const e = allDayEvents.find((ev) => ev.id === id)!
                        const n = days.length
                        return (
                          <button
                            key={e.id}
                            onPointerDown={(ev) => handleAllDayPillMoveStart(ev, e)}
                            onClick={() => { if (!suppressClickRef.current) openDetail(e) }}
                            style={{
                              position: 'absolute',
                              left: `calc(${(startIdx / n) * 100}% + 2px)`,
                              width: `calc(${((endIdx - startIdx) / n) * 100}% - 4px)`,
                              top: row * 24 + 2,
                              height: 20,
                              touchAction: 'none',
                              ...eventAllDayColors(e).style,
                            }}
                            className={`truncate rounded-[3px] px-1.5 text-left text-[11px] font-medium leading-tight transition-all duration-150 hover:opacity-80 cursor-grab active:cursor-grabbing select-none ${e.status === 'done' ? 'opacity-50 line-through' : e.status === 'skipped' ? 'opacity-30' : movingEventId === e.id ? 'opacity-20' : pendingAllDayDragId === e.id ? 'opacity-50 scale-95' : ''} ${eventAllDayColors(e).className}`}
                          >
                            {e.effectiveTitle}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                </CalendarTray>
              )}
            </div>
          )}

          {/* Day view all-day row */}
          {view === 'day' && showTray && (
            <div className="sticky top-0 z-40 bg-background">
              <CalendarTray
                trayDragActive={trayDragActive}
                overduePastItems={overduePastItems}
                upcomingDueItems={upcomingDueItems}
                floatingTasks={floatingTasks}
                floatRowRef={floatRowRef}
                floatHighlighted={dragDropTarget === 'float'}
                movingEventId={movingEventId}
                pendingDragId={pendingAllDayDragId}
                onTaskClick={(o) => { if (!suppressClickRef.current) openDetail(o) }}
                onRescheduleDragStart={(info, o) => handleAllDayPillMoveStart(info, o, rescheduleEvent)}
                onFloatDragStart={(info, o) => handleAllDayPillMoveStart(info, o, scheduleFloating)}
              >
                {(dayAllDayEvents.length > 0 || isDraggingGridEvent) && (
                  <div ref={allDayRowRef} className={`flex transition-colors ${dragDropTarget === 'allday' ? 'bg-primary/10' : ''}`}>
                    <div className="w-12 shrink-0 flex items-center justify-end pr-2">
                      <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Today</span>
                    </div>
                    <div className="flex flex-1 flex-col gap-0.5 border-l border-r px-0.5 py-0.5 min-h-[26px]" style={{ borderColor: 'var(--calendar-line)' }}>
                      {dayAllDayEvents.map((e) => (
                        <button key={e.id} onPointerDown={(ev) => handleAllDayPillMoveStart(ev, e)} onClick={() => { if (!suppressClickRef.current) openDetail(e) }} className={`w-full truncate rounded-[3px] px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-all duration-150 hover:opacity-80 cursor-grab active:cursor-grabbing select-none ${e.status !== 'pending' ? 'opacity-50 line-through' : movingEventId === e.id ? 'opacity-20' : pendingAllDayDragId === e.id ? 'opacity-50 scale-95' : ''} ${eventAllDayColors(e).className}`} style={{ touchAction: 'none', ...eventAllDayColors(e).style }}>
                          {e.effectiveTitle}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CalendarTray>
            </div>
          )}

          <div ref={timeGridRef} className="flex flex-1" style={{ minHeight: gridHeight }}>
            {/* Hour labels. One shared gutter can only speak for one scale: with a
                single column that is always true, and expanded every column shares
                the linear scale, so it labels those. Only compact multi-day - where
                each column drops its own empty stretches independently - leaves it
                blank. */}
            <div className="relative w-12 shrink-0">
              {!(compactActive && days.length > 1) && scales[0].segments.flatMap((seg, i) => {
                const out: React.ReactNode[] = []
                for (let m = Math.ceil(seg.startMin / 60) * 60; m <= seg.endMin; m += 60) {
                  if (m === 0 || m === DAY_MIN) continue
                  out.push(
                    <div
                      key={`g${i}-${m}`}
                      className="absolute right-2 select-none text-[10px] leading-none text-muted-foreground"
                      style={{ top: scales[0].toPx(m) - 6 }}
                    >
                      {hourLabel(m / 60)}
                    </div>,
                  )
                }
                return out
              })}
            </div>

            {/* Day columns */}
            <div
              ref={gridRef}
              className="flex flex-1 min-w-0 cursor-crosshair select-none"
              onMouseDown={handleGridMouseDown}
              onPointerDown={handleGridPointerDown}
              onPointerMove={handleGridPointerMove}
              onPointerUp={handleGridPointerUp}
              onPointerCancel={handleGridPointerCancel}
            >
              {days.map((day, idx) => (
                <DayColumn
                  key={day.toISOString()}
                  day={day}
                  allEvents={calendarEvents}
                  onEventClick={openDetail}
                  overlay={dragOverlays.get(idx) ?? null}
                  moveOverlay={moveOverlay?.dayIdx === idx ? { topPx: moveOverlay.topPx, heightPx: moveOverlay.heightPx } : null}
                  resizeOverlay={resizeOverlay.get(idx) ?? null}
                  isToday={isSameDay(day, effectiveToday)}
                  borderLeft={idx === 0}
                  borderRight={true}
                  onEventMoveStart={handleEventMoveStart}
                  onEventResizeStart={handleResizeStart}
                  suppressClickRef={suppressClickRef}
                  movingEventId={movingEventId}
                  resizingEventId={resizingEventId}
                  scale={scales[idx]}
                  gridHeight={gridHeight}
                  animateDir={navDir}
                  navCount={navCount}
                />
              ))}
            </div>
          </div>
          {/* Scroll room for the anchor, only while a drag has the grid expanded.
              Holding a minute at a fixed screen position needs the scroll range to
              reach - and when the compact grid was shorter than the viewport there
              is none to start with, so the browser silently clamps and the whole
              grid lurches by the shortfall. Sized in the anchor's layout effect,
              the only place that knows the viewport height. Ahead of the Due row so
              that stays the last thing in the scroll content. */}
          <div ref={dragSpacerRef} aria-hidden className="shrink-0" style={{ height: 0 }} />
          {duePinsForRow.length > 0 && (
            <div className="sticky bottom-0 z-40 flex border-t bg-background" style={{ borderTopColor: 'var(--calendar-edge)' }}>
              <div className="w-12 shrink-0 flex items-center justify-end pr-2 py-1">
                <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">Due</span>
              </div>
              {days.map((day, idx) => {
                const ds = sod(day).getTime()
                const dayPins = duePinsForRow.filter((o) => {
                  const t = new Date(o.startAt!).getTime()
                  return t >= ds && t < ds + 86400000
                })
                return (
                  <div key={day.toISOString()} className={`flex min-w-0 flex-1 flex-col gap-0.5 overflow-hidden px-0.5 py-0.5 ${idx === 0 ? 'border-l border-r' : 'border-r'}`} style={{ borderColor: 'var(--calendar-line)' }}>
                    {dayPins.map((o) => {
                      const accentColor = o.activity.category?.color ?? 'var(--color-primary)'
                      const leftColor = o.activity.category?.color ?? 'var(--color-border)'
                      const isHex = accentColor.startsWith('#')
                      const bgColor = isHex ? `${accentColor}18` : `color-mix(in srgb, ${accentColor} 9%, transparent)`
                      const time = new Date(o.startAt!).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                      return (
                        <button
                          key={o.id}
                          onPointerDown={(ev) => handleAllDayPillMoveStart(ev, o, rescheduleEvent)}
                          onClick={() => { if (!suppressClickRef.current) openDetail(o) }}
                          className={`flex w-full items-center overflow-hidden rounded-[3px] text-left text-[10px] font-medium leading-tight transition-all duration-150 hover:opacity-80 cursor-grab active:cursor-grabbing select-none ${movingEventId === o.id ? 'opacity-20' : pendingAllDayDragId === o.id ? 'opacity-50 scale-95' : ''}`}
                          style={{ border: `1px solid ${accentColor}`, backgroundColor: bgColor, touchAction: 'none' }}
                        >
                          <div style={{ width: 3, minWidth: 3, alignSelf: 'stretch', background: leftColor }} className="shrink-0" />
                          <div className="flex min-w-0 flex-1 items-center gap-1 px-1.5 py-0.5">
                            <p className="min-w-0 flex-1 truncate" style={{ color: accentColor }}>{o.effectiveTitle}</p>
                            <span className="shrink-0 text-[9px] leading-none opacity-60" style={{ color: accentColor }}>{time}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      </div>

      <EventDetailModal
        open={modals.detail.open}
        onClose={modals.detail.close}
        event={modals.detail.event}
        onEdit={(o) => { modals.detail.close(); openEdit(o) }}
        onSchedule={(o) => { modals.detail.close(); openSchedule(o) }}
        onDuplicate={openDuplicate}
        onEditActivity={openEditActivity}
      />

      <MoveOrSkipModal
        open={pendingMove !== null}
        onClose={() => setPendingMove(null)}
        move={pendingMove}
      />

      <ActivityModal
        key={modals.activityModal.activity?.id ?? 'none'}
        open={modals.activityModal.open}
        onClose={modals.activityModal.close}
        activity={modals.activityModal.activity}
        goals={goals}
        categories={categories}
      />

      <EventModal
        key={`${modals.eventModal.occurrence?.id ?? modals.eventModal.duplicateFrom?.id ?? modals.eventModal.defaultStartAt ?? 'new'}-${modals.eventModal.scheduleOnly}-${modals.eventModal.occurrence?.startAt ?? ''}`}
        open={modals.eventModal.open}
        onClose={modals.eventModal.close}
        occurrence={modals.eventModal.occurrence}
        duplicateFrom={modals.eventModal.duplicateFrom}
        focusStartAt={modals.eventModal.focusStartAt}
        defaultStartAt={modals.eventModal.defaultStartAt}
        defaultEndAt={modals.eventModal.defaultEndAt}
        scheduleOnly={modals.eventModal.scheduleOnly}
      />
    </div>
  )
}
