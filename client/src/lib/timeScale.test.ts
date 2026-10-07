import { describe, expect, it } from 'vitest'
import { DAY_MIN, compactScale, linearScale } from './timeScale'

describe('linearScale', () => {
  const scale = linearScale(60)

  it('maps one minute to one pixel at 60 px per hour', () => {
    expect(scale.toPx(90)).toBe(90)
    expect(scale.toMin(90)).toBe(90)
    expect(scale.totalPx).toBe(DAY_MIN)
    expect(scale.isCompact).toBe(false)
  })

  it('clamps outside the day', () => {
    expect(scale.toPx(-30)).toBe(0)
    expect(scale.toPx(DAY_MIN + 30)).toBe(DAY_MIN)
    expect(scale.toMin(-5)).toBe(0)
    expect(scale.toMin(DAY_MIN + 5)).toBe(DAY_MIN)
  })

  it('round-trips minutes through pixels', () => {
    for (const min of [0, 15, 400, 1439, DAY_MIN]) expect(scale.toMin(scale.toPx(min))).toBeCloseTo(min)
  })
})

describe('compactScale', () => {
  it('drops the gap between separate ranges', () => {
    const scale = compactScale([[60, 120], [600, 660]], 60)

    expect(scale.isCompact).toBe(true)
    expect(scale.totalPx).toBe(120)
    expect(scale.segments).toHaveLength(2)
    expect(scale.toPx(60)).toBe(0)
    expect(scale.toPx(120)).toBe(60)
    expect(scale.toPx(600)).toBe(60)
    expect(scale.toPx(660)).toBe(120)
  })

  it('merges ranges that touch or overlap and ignores order', () => {
    const scale = compactScale([[300, 400], [60, 120], [120, 180], [350, 500]], 60)

    expect(scale.segments.map((s) => [s.startMin, s.endMin])).toEqual([[60, 180], [300, 500]])
  })

  it('clips ranges to the day and drops empty ones', () => {
    const scale = compactScale([[-50, 30], [90, 90], [1400, 2000]], 60)

    expect(scale.segments.map((s) => [s.startMin, s.endMin])).toEqual([[0, 30], [1400, DAY_MIN]])
  })

  it('gives an empty day zero height', () => {
    const scale = compactScale([], 60)

    expect(scale.segments).toHaveLength(0)
    expect(scale.totalPx).toBe(0)
    expect(scale.toMin(10)).toBe(DAY_MIN)
  })

  it('maps the shared pixel between two stacked segments back to the first one', () => {
    const scale = compactScale([[60, 180], [600, 720]], 80)

    expect(scale.toPx(180)).toBe(scale.toPx(600))
    expect(scale.toMin(scale.toPx(600))).toBe(180)
  })

  it('round-trips minutes that fall inside a segment', () => {
    const scale = compactScale([[60, 180], [600, 720]], 80)

    for (const min of [60, 100, 179, 601, 650, 720]) expect(scale.toMin(scale.toPx(min))).toBeCloseTo(min)
  })

  it('scales segment height with hourPx', () => {
    expect(compactScale([[0, 60]], 32).totalPx).toBe(32)
    expect(compactScale([[0, 60]], 128).totalPx).toBe(128)
  })
})
