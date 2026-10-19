/** Mirrors ReminderMath.MaxReminders on the server. */
export const MAX_REMINDERS = 5

/** The offsets the picker offers, in minutes before the occurrence. */
export const REMINDER_PRESETS = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080]

export function reminderLabel(minutes: number): string {
  if (minutes === 0) return 'On time'
  if (minutes % 10080 === 0) return minutes === 10080 ? '1 week' : `${minutes / 10080} weeks`
  if (minutes % 1440 === 0) return minutes === 1440 ? '1 day' : `${minutes / 1440} days`
  if (minutes % 60 === 0) return `${minutes / 60} h`
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
  return `${minutes} min`
}

/** Sorted nearest-first and without repeats, the way the server stores them. */
export function toggleReminder(value: number[], minutes: number): number[] {
  const next = value.includes(minutes) ? value.filter((m) => m !== minutes) : [...value, minutes]
  return [...new Set(next)].sort((a, b) => a - b)
}
