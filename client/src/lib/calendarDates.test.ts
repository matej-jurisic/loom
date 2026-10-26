import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eodMs, sod, wallMinute } from './calendarDates'

describe('wallMinute on DST switch days', () => {
  let tz: string | undefined
  beforeAll(() => {
    tz = process.env.TZ
    process.env.TZ = 'Europe/Zagreb'
  })
  afterAll(() => {
    process.env.TZ = tz
  })

  it('fall back: a 25-hour day still maps 10:00 to minute 600', () => {
    const ds = sod(new Date(2026, 9, 25, 12)).getTime()
    expect(wallMinute(new Date(2026, 9, 25, 10).getTime(), ds)).toBe(600)
    expect(wallMinute(eodMs(ds), ds)).toBe(1440)
    expect(eodMs(ds) - ds).toBe(25 * 3600000)
  })

  it('spring forward: a 23-hour day still maps 10:00 to minute 600', () => {
    const ds = sod(new Date(2026, 2, 29, 12)).getTime()
    expect(wallMinute(new Date(2026, 2, 29, 10).getTime(), ds)).toBe(600)
    expect(wallMinute(eodMs(ds), ds)).toBe(1440)
  })

  it('ordinary day: wall minutes equal elapsed minutes', () => {
    const ds = sod(new Date(2026, 9, 27, 12)).getTime()
    expect(wallMinute(new Date(2026, 9, 27, 14, 30).getTime(), ds)).toBe(870)
  })
})
