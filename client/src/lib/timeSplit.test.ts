import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { durationMinutes, resolveSplit } from './timeSplit'

interface Fixture {
  resolve: { name: string; duration: number; minutes: (number | null)[]; expected: number[] }[]
  duration: { name: string; startAt: string | null; endAt: string | null; expected: number }[]
}

const fixture: Fixture = JSON.parse(
  readFileSync(new URL('../../../tests/fixtures/time-split-cases.json', import.meta.url), 'utf-8'),
)

describe('resolveSplit', () => {
  it.each(fixture.resolve)('$name', ({ duration, minutes, expected }) => {
    expect(resolveSplit(duration, minutes)).toEqual(expected)
  })
})

describe('durationMinutes', () => {
  it.each(fixture.duration)('$name', ({ startAt, endAt, expected }) => {
    expect(durationMinutes(startAt, endAt)).toBe(expected)
  })

  it('treats an unparseable date as no duration', () => {
    expect(durationMinutes('nonsense', '2026-07-07T15:00:00+00:00')).toBe(0)
  })
})
