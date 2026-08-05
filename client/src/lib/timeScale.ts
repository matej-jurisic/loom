/**
 * The calendar grid maps minutes-past-midnight to pixels. Expanded, that map is
 * the obvious linear one. Compact mode drops any stretch of the day with nothing
 * in it entirely rather than reserving room for it: a day's events sit in a
 * straight stack, each keeping its own real, duration-proportional height, with
 * no space at all between one item and the next.
 *
 * Every position on the grid goes through toPx/toMin - event tops, hour lines,
 * drag overlays, the now line, snapping. Two invariants keep the calendar honest:
 *
 *   1. Any drag switches the whole grid back to the linear map before it reads a
 *      coordinate (see expandForDrag in CalendarPage), so no gesture code has to
 *      reason about the stack.
 *   2. An event's own span always falls inside one segment, because segments are
 *      built from those spans (padded, then merged wherever two of them touch or
 *      overlap). So a pixel offset measured *within* a block - a grab offset, a
 *      block's height - means the same thing in both modes and survives the
 *      switch untouched.
 */

export const DAY_MIN = 24 * 60
/**
 * Kept either side of an event when deciding what counts as occupied, so two
 * unrelated items in the stack still get a sliver of daylight between them
 * instead of sitting flush against each other.
 */
export const OCCUPIED_PAD_MIN = 15
/**
 * Occupied ranges snap outwards to this, matching the quarter-hour the rest of
 * the calendar snaps to.
 */
export const SNAP_MIN = 15

export interface ScaleSegment {
  startMin: number
  endMin: number
  topPx: number
  px: number
}

export interface TimeScale {
  segments: ScaleSegment[]
  totalPx: number
  hourPx: number
  isCompact: boolean
  /** Minutes past midnight → pixels from the top of the column. */
  toPx: (min: number) => number
  /** Pixels from the top of the column → minutes past midnight. */
  toMin: (px: number) => number
}

function buildScale(
  parts: Array<{ startMin: number; endMin: number }>,
  hourPx: number,
  isCompact: boolean,
): TimeScale {
  const segments: ScaleSegment[] = []
  let top = 0
  for (const p of parts) {
    const px = ((p.endMin - p.startMin) / 60) * hourPx
    segments.push({ ...p, topPx: top, px })
    top += px
  }
  const totalPx = top

  return {
    segments,
    totalPx,
    hourPx,
    isCompact,
    toPx(min) {
      const m = Math.max(0, Math.min(min, DAY_MIN))
      for (const s of segments) {
        if (m <= s.endMin) return s.topPx + ((m - s.startMin) / (s.endMin - s.startMin)) * s.px
      }
      return totalPx
    },
    toMin(px) {
      const y = Math.max(0, Math.min(px, totalPx))
      for (const s of segments) {
        if (y <= s.topPx + s.px) return s.startMin + ((y - s.topPx) / s.px) * (s.endMin - s.startMin)
      }
      return DAY_MIN
    },
  }
}

export function linearScale(hourPx: number): TimeScale {
  return buildScale([{ startMin: 0, endMin: DAY_MIN }], hourPx, false)
}

/**
 * Builds the piecewise scale for one day from the spans it has to show. Ranges
 * are minutes past midnight and need not be sorted, disjoint, or non-empty. A
 * day with nothing in it produces zero segments (and so a zero-height column) -
 * there is no placeholder band, the point of compact mode is that empty time
 * simply isn't drawn.
 */
export function compactScale(
  ranges: Array<[number, number]>,
  hourPx: number,
  anchorMin?: number,
): TimeScale {
  const padded = ranges
    .map(([s, e]) => [
      Math.max(0, Math.floor((s - OCCUPIED_PAD_MIN) / SNAP_MIN) * SNAP_MIN),
      Math.min(DAY_MIN, Math.ceil((e + OCCUPIED_PAD_MIN) / SNAP_MIN) * SNAP_MIN),
    ] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0])

  // Merge only where padded ranges actually touch or overlap, so simultaneous
  // events keep their real relative position within one segment. Everything else
  // becomes its own segment and stacks directly under the one before it - the
  // gap between them is dropped, not drawn, regardless of how big it is.
  const merged: Array<[number, number]> = []
  for (const [s, e] of padded) {
    const last = merged[merged.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else merged.push([s, e])
  }

  // The now line needs a segment to land on even when "now" sits in a gap with
  // nothing scheduled nearby. Giving it the same OCCUPIED_PAD_MIN treatment as a
  // real event would reserve up to an hour of blank grid just to hold a 1px
  // line, so if it isn't already covered by an event's segment it gets a
  // hairline of its own instead - just enough width for buildScale's
  // start/end interpolation to be well-defined.
  if (anchorMin != null && !merged.some(([s, e]) => anchorMin >= s && anchorMin <= e)) {
    const s = Math.max(0, anchorMin - 1)
    const e = Math.min(DAY_MIN, anchorMin + 1)
    const idx = merged.findIndex(([ms]) => ms > s)
    if (idx === -1) merged.push([s, e])
    else merged.splice(idx, 0, [s, e])
  }

  const parts = merged.map(([startMin, endMin]) => ({ startMin, endMin }))
  return buildScale(parts, hourPx, true)
}
