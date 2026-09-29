import type { Recurrence, RecurrenceFrequency } from './types'

export const WEEKDAYS = [
  { iso: 1, short: 'Mon', letter: 'M' },
  { iso: 2, short: 'Tue', letter: 'T' },
  { iso: 3, short: 'Wed', letter: 'W' },
  { iso: 4, short: 'Thu', letter: 'T' },
  { iso: 5, short: 'Fri', letter: 'F' },
  { iso: 6, short: 'Sat', letter: 'S' },
  { iso: 7, short: 'Sun', letter: 'S' },
] as const

export function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

export function describeRecurrence(r: Recurrence): string {
  const n = r.interval
  let text: string
  if (r.frequency === 'daily') {
    text = n === 1 ? 'Every day' : `Every ${n} days`
  } else if (r.frequency === 'weekly') {
    const days = r.weekdays.length > 0 ? r.weekdays : [isoWeekday(parseDateInput(r.startDate))]
    const names = [...days].sort((a, b) => a - b).map((d) => WEEKDAYS[d - 1].short).join(', ')
    text = `${n === 1 ? 'Every week' : `Every ${n} weeks`} on ${names}`
  } else {
    const day = parseDateInput(r.startDate).getDate()
    text = `${n === 1 ? 'Every month' : `Every ${n} months`} on the ${ordinal(day)}`
  }
  if (r.timeOfDay) text += ` at ${r.timeOfDay}`
  if (r.endDate) {
    text += `, until ${parseDateInput(r.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }
  return text
}

export interface RecurrenceDraft {
  enabled: boolean
  frequency: RecurrenceFrequency
  interval: string
  weekdays: number[]
  startDate: string
  endDate: string
  allDay: boolean
  timeOfDay: string
  durationMinutes: string
}

export function toDraft(r: Recurrence | null | undefined): RecurrenceDraft {
  return {
    enabled: r != null,
    frequency: r?.frequency ?? 'daily',
    interval: String(r?.interval ?? 1),
    weekdays: r?.weekdays ?? [],
    startDate: r?.startDate ?? toDateInput(new Date()),
    endDate: r?.endDate ?? '',
    allDay: r ? r.timeOfDay === null : true,
    timeOfDay: r?.timeOfDay ?? '09:00',
    durationMinutes: r?.durationMinutes != null ? String(r.durationMinutes) : '',
  }
}

export function fromDraft(d: RecurrenceDraft): { rule: Recurrence | null; error?: string } {
  if (!d.enabled) return { rule: null }

  const interval = Number(d.interval)
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) return { rule: null, error: 'Repeat interval must be between 1 and 99.' }
  if (!d.startDate) return { rule: null, error: 'Pick a start date for the repeat.' }
  if (d.endDate && d.endDate < d.startDate) return { rule: null, error: 'The repeat cannot end before it starts.' }
  if (!d.allDay && !d.timeOfDay) return { rule: null, error: 'Pick a time, or mark the repeat as all day.' }

  let durationMinutes: number | null = null
  if (d.durationMinutes.trim() !== '') {
    durationMinutes = Number(d.durationMinutes)
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440)
      return { rule: null, error: 'Duration must be between 1 and 1440 minutes.' }
  }

  return {
    rule: {
      frequency: d.frequency,
      interval,
      weekdays: d.frequency === 'weekly' ? [...d.weekdays].sort((a, b) => a - b) : [],
      startDate: d.startDate,
      endDate: d.endDate || null,
      timeOfDay: d.allDay ? null : d.timeOfDay,
      durationMinutes,
    },
  }
}
