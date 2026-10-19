import { describe, expect, it } from 'vitest'
import { reminderLabel, toggleReminder } from './reminders'

describe('reminderLabel', () => {
  it('names each unit', () => {
    expect(reminderLabel(0)).toBe('On time')
    expect(reminderLabel(15)).toBe('15 min')
    expect(reminderLabel(120)).toBe('2 h')
    expect(reminderLabel(90)).toBe('1 h 30 min')
    expect(reminderLabel(1440)).toBe('1 day')
    expect(reminderLabel(2880)).toBe('2 days')
    expect(reminderLabel(10080)).toBe('1 week')
  })
})

describe('toggleReminder', () => {
  it('adds in order and removes', () => {
    expect(toggleReminder([60], 15)).toEqual([15, 60])
    expect(toggleReminder([15, 60], 15)).toEqual([60])
  })
})
