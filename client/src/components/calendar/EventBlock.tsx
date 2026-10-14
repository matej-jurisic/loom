import type { Occurrence } from '@/lib/types'
import { timeLabel } from '@/lib/calendarDates'
import { eventColors, isDueOccurrence } from '@/lib/calendarLayout'
import type { LayoutEvent } from '@/lib/calendarLayout'

export function EventBlock({
  layout,
  onClick,
  onMoveStart,
  onResizeStart,
  suppressClickRef,
  dimmed,
  isResizing,
}: {
  layout: LayoutEvent
  onClick: (e: Occurrence) => void
  onMoveStart?: (e: React.PointerEvent, topPx: number) => void
  onResizeStart?: (e: React.PointerEvent, side: 'top' | 'bottom') => void
  suppressClickRef?: { current: boolean }
  dimmed?: boolean
  isResizing?: boolean
}) {
  const { event, col, totalCols, topPx, heightPx, trueEndPx } = layout
  const { bgClass, bgHex, leftColor, textClass } = eventColors(event)
  const isDone = event.status === 'done'
  const isSkipped = event.status === 'skipped'
  const isPlanned = event.isPlanned
  const isDue = isDueOccurrence(event)
  const accentColor = event.activity.category ? event.activity.category.color : 'var(--color-primary)'
  const isHex = accentColor.startsWith('#')
  const accentFaded = isHex ? `${accentColor}18` : `color-mix(in srgb, ${accentColor} 9%, transparent)`
  const accentMid   = isHex ? `${accentColor}60` : `color-mix(in srgb, ${accentColor} 38%, transparent)`

  const GAP = 2
  const leftPct = (col / totalCols) * 100
  const widthPct = 100 / totalCols

  const timeText = event.startAt && !event.isPlanned
    ? `${timeLabel(event.startAt)}${event.endAt ? ` – ${timeLabel(event.endAt)}` : ''}`
    : ''

  const tagText = event.effectiveTags.map((t) => `#${t.name}`).join(' ')
  const showTags = tagText !== '' && heightPx >= (timeText ? 56 : 32)

  // Handles show always when resizing (touch mode), or on mouse hover via CSS
  const handleVisibility = isResizing ? 'flex' : 'hidden group-hover/calev:flex'

  // Below this height the normal padding + line-height overflow the block, so
  // drop to a single tightly-packed text line.
  const compact = heightPx < 20

  function stopAll(e: React.SyntheticEvent) {
    e.stopPropagation()
  }

  const bodyPointerProps = {
    style: { touchAction: 'pan-y' as const },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      onMoveStart?.(e, topPx)
    },
    onClick: (e: React.MouseEvent) => {
      if (suppressClickRef?.current) return
      e.stopPropagation()
      onClick(event)
    },
  }

  // Skipped: an empty outline where the block was meant to go. No category colour
  // and no strikethrough, so it can't be mistaken for done, and solid rather than
  // dashed, so it can't be mistaken for planned.
  const skippedBody = (
    <button
      className={`absolute inset-0 overflow-hidden rounded-[4px] border border-muted-foreground/40 text-left transition-opacity hover:opacity-80 cursor-grab active:cursor-grabbing ${isResizing ? 'ring-1 ring-primary/40' : ''}`}
      {...bodyPointerProps}
    >
      <div className={`@container min-w-0 px-1.5 ${compact ? 'py-px' : 'py-0.5'}`}>
        <p
          className={`@max-[10px]:hidden overflow-hidden font-medium text-muted-foreground ${
            compact ? 'whitespace-nowrap text-[10px] leading-none' : 'break-all text-[11px] leading-tight'
          }`}
        >
          × {event.effectiveTitle}
        </p>
        {heightPx >= 44 && timeText && (
          <p className="@max-[10px]:hidden overflow-hidden whitespace-nowrap text-[10px] leading-tight text-muted-foreground/70">
            {timeText}
          </p>
        )}
        {showTags && (
          <p className="@max-[10px]:hidden overflow-hidden whitespace-nowrap text-[10px] leading-tight text-muted-foreground/70">
            {tagText}
          </p>
        )}
      </div>
    </button>
  )

  return (
    <div
      className={`absolute group/calev ${dimmed ? 'opacity-20' : ''}`}
      data-event-id={event.id}
      data-true-end-px={trueEndPx}
      style={{
        top: topPx + GAP,
        height: Math.max(heightPx - GAP, 14),
        left: `calc(${leftPct}% + ${GAP}px)`,
        width: `calc(${widthPct}% - ${GAP * 2}px)`,
        zIndex: isResizing ? 25 : undefined,
        pointerEvents: 'auto',
      }}
    >
      {isSkipped && isDue ? (
        skippedBody
      ) : isDue ? (
        /* Due pin — flat deadline marker, no resize handles */
        <button
          className={`absolute inset-0 flex items-start overflow-hidden rounded-[4px] text-left transition-opacity hover:opacity-80 cursor-grab active:cursor-grabbing ${isDone ? 'opacity-40' : ''}`}
          style={{
            border: isPlanned ? `1.5px dashed ${accentColor}` : `1px solid ${accentColor}`,
            // Opaque card base so the likely-free hatch never bleeds through
            background: `linear-gradient(${accentColor}18, ${accentColor}18), var(--color-card)`,
            touchAction: 'pan-y',
          }}
          onPointerDown={bodyPointerProps.onPointerDown}
          onClick={bodyPointerProps.onClick}
        >
          <div style={{ width: 3, minWidth: 3, alignSelf: 'stretch', background: leftColor }} className="shrink-0" />
          <div className="flex min-w-0 flex-1 items-center gap-1 px-1.5 py-0.5">
            <p
              className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap text-[10px] font-medium leading-none ${isDone ? 'line-through text-muted-foreground' : ''}`}
              style={isDone ? undefined : { color: accentColor }}
            >
              {event.effectiveTitle}
            </p>
            <span className="shrink-0 text-[9px] leading-none opacity-60" style={{ color: accentColor }}>
              {timeLabel(event.startAt!)}
            </span>
          </div>
        </button>
      ) : (
        <>
          {/* Top resize handle */}
          <div
            data-resize-handle="true"
            className={`absolute inset-x-0 top-0 z-20 h-2.5 cursor-ns-resize ${handleVisibility} items-center justify-center`}
            style={{ touchAction: 'none' }}
            onMouseDown={stopAll}
            onPointerDown={(e) => { e.stopPropagation(); onResizeStart?.(e, 'top') }}
            onClick={stopAll}
          >
            <div className="h-0.5 w-6 rounded-full bg-primary/70" />
          </div>

          {/* Event body */}
          {isSkipped ? (
            skippedBody
          ) : isPlanned ? (
            <button
              className={`absolute inset-0 overflow-hidden rounded-[4px] text-left transition-opacity hover:opacity-80 cursor-grab active:cursor-grabbing ${isDone ? 'opacity-40' : ''}`}
              style={{
                // Opaque card base so the likely-free hatch (same stripe pattern)
                // never shows through a planned block
                background: `repeating-linear-gradient(135deg, transparent, transparent 4px, ${accentFaded} 4px, ${accentFaded} 8px), var(--color-card)`,
                border: `1.5px dashed ${accentMid}`,
                touchAction: 'pan-y',
              }}
              onPointerDown={bodyPointerProps.onPointerDown}
              onClick={bodyPointerProps.onClick}
            >
              <div className={compact ? 'px-1.5 py-px' : 'px-1.5 py-0.5'}>
                <p
                  className={`overflow-hidden whitespace-nowrap text-[10px] font-medium ${compact ? 'leading-none' : 'leading-tight'}`}
                  style={{ color: accentColor }}
                >
                  {event.effectiveTitle}
                </p>
                {showTags && (
                  <p className="overflow-hidden whitespace-nowrap text-[10px] leading-tight opacity-70" style={{ color: accentColor }}>
                    {tagText}
                  </p>
                )}
              </div>
            </button>
          ) : (
            <button
              className={`absolute inset-0 overflow-hidden rounded-[4px] border bg-card text-left transition-opacity hover:opacity-80 cursor-grab active:cursor-grabbing ${isDone ? 'opacity-50' : ''} ${isResizing ? 'border-primary/60 ring-1 ring-primary/40' : 'border-border/50'}`}
              {...bodyPointerProps}
            >
              <div
                className={`absolute inset-0 ${bgClass}`}
                style={bgHex ? { backgroundColor: bgHex + '22' } : undefined}
              />
              <div className="relative flex h-full">
                <div style={{ width: 3, minWidth: 3, background: leftColor }} className="shrink-0" />
                <div className={`@container min-w-0 flex-1 px-1.5 ${compact ? 'py-px' : 'py-0.5'}`}>
                  <p
                    className={`@max-[10px]:hidden overflow-hidden font-medium ${
                      compact ? 'whitespace-nowrap text-[10px] leading-none' : 'break-all text-[11px] leading-tight'
                    } ${
                      isDone ? 'line-through text-muted-foreground' : textClass
                    }`}
                  >
                    {event.effectiveTitle}
                  </p>
                  {heightPx >= 44 && timeText && (
                    <p className={`@max-[10px]:hidden overflow-hidden whitespace-nowrap text-[10px] leading-tight opacity-70 ${isDone ? 'text-muted-foreground' : textClass}`}>
                      {timeText}
                    </p>
                  )}
                  {showTags && (
                    <p className={`@max-[10px]:hidden overflow-hidden whitespace-nowrap text-[10px] leading-tight opacity-70 ${isDone ? 'text-muted-foreground' : textClass}`}>
                      {tagText}
                    </p>
                  )}
                </div>
              </div>
            </button>
          )}

          {/* Bottom resize handle */}
          <div
            data-resize-handle="true"
            className={`absolute inset-x-0 bottom-0 z-20 h-2.5 cursor-ns-resize ${handleVisibility} items-center justify-center`}
            style={{ touchAction: 'none' }}
            onMouseDown={stopAll}
            onPointerDown={(e) => { e.stopPropagation(); onResizeStart?.(e, 'bottom') }}
            onClick={stopAll}
          >
            <div className="h-0.5 w-6 rounded-full bg-primary/70" />
          </div>
        </>
      )}
    </div>
  )
}
