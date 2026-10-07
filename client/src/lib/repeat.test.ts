import { describe, expect, it } from 'vitest'
import { daysLabel, nextRepeatDate, parseRepeatAfterDays } from './repeat'

describe('daysLabel', () => {
  it('uses the singular for one day', () => {
    expect(daysLabel(1)).toBe('1 day')
    expect(daysLabel(7)).toBe('7 days')
  })
})

describe('nextRepeatDate', () => {
  const today = new Date(2026, 9, 7, 15, 30)
  const day = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()]

  it('counts from today when the occurrence has no date', () => {
    expect(day(nextRepeatDate(null, 7, today))).toEqual([2026, 10, 14])
  })

  it('steps from the occurrence date to the first day after today', () => {
    expect(day(nextRepeatDate(new Date(2026, 8, 27, 9), 7, today))).toEqual([2026, 10, 11])
    expect(day(nextRepeatDate(new Date(2026, 8, 30, 9), 7, today))).toEqual([2026, 10, 14])
    expect(day(nextRepeatDate(new Date(2026, 9, 6, 23), 7, today))).toEqual([2026, 10, 13])
    expect(day(nextRepeatDate(new Date(2026, 9, 7, 8), 7, today))).toEqual([2026, 10, 14])
  })

  it('takes one step from an occurrence that is still ahead', () => {
    expect(day(nextRepeatDate(new Date(2026, 9, 9, 9), 7, today))).toEqual([2026, 10, 16])
  })
})

describe('parseRepeatAfterDays', () => {
  it('reads an empty field as off', () => {
    expect(parseRepeatAfterDays('')).toBeNull()
    expect(parseRepeatAfterDays('   ')).toBeNull()
  })

  it('accepts whole days within the range', () => {
    expect(parseRepeatAfterDays('1')).toBe(1)
    expect(parseRepeatAfterDays(' 14 ')).toBe(14)
    expect(parseRepeatAfterDays('365')).toBe(365)
  })

  it('rejects anything else', () => {
    expect(parseRepeatAfterDays('0')).toBeUndefined()
    expect(parseRepeatAfterDays('366')).toBeUndefined()
    expect(parseRepeatAfterDays('1.5')).toBeUndefined()
    expect(parseRepeatAfterDays('-2')).toBeUndefined()
    expect(parseRepeatAfterDays('weekly')).toBeUndefined()
  })
})
