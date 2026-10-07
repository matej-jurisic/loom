import type { QueryClient } from '@tanstack/react-query'
import { ApiError, occurrencesApi } from '@/lib/api'
import { invalidateOccurrences } from '@/lib/invalidate'
import { toastError, useToastStore } from '@/store/toasts'
import type { Occurrence } from '@/lib/types'

export const MAX_REPEAT_AFTER_DAYS = 365

export function daysLabel(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

export function parseRepeatAfterDays(input: string): number | null | undefined {
  const text = input.trim()
  if (!text) return null
  if (!/^\d+$/.test(text)) return undefined
  const days = Number(text)
  return days >= 1 && days <= MAX_REPEAT_AFTER_DAYS ? days : undefined
}

export function nextRepeatDate(from: Date | null, days: number, today: Date): Date {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!from) return new Date(start.getFullYear(), start.getMonth(), start.getDate() + days)
  const origin = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const elapsed = Math.round((start.getTime() - origin.getTime()) / 86400000)
  const steps = Math.max(1, Math.trunc(elapsed / days) + 1)
  return new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + steps * days)
}

export function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function repeatsOnDone(occurrence: Occurrence): boolean {
  return occurrence.activity.kind === 'activity' && !!occurrence.activity.repeatAfterDays
}

export function nextRepeatFor(occurrence: Occurrence): Date | null {
  const days = occurrence.activity.repeatAfterDays
  if (!repeatsOnDone(occurrence) || !days) return null
  const at = occurrence.startAt ?? occurrence.endAt
  return nextRepeatDate(at ? new Date(at) : null, days, new Date())
}

export function addNextOccurrence(qc: QueryClient, source: Occurrence) {
  if (!repeatsOnDone(source)) return

  const { push } = useToastStore.getState()
  occurrencesApi
    .repeat(source.id, source.isPlanned)
    .then((created) => {
      invalidateOccurrences(qc)
      const at = created.startAt ?? created.endAt
      push(at ? `Next one added for ${formatDay(new Date(at))}.` : 'Next one added.', 'success', {
        action: {
          label: 'Undo',
          onClick: () => {
            occurrencesApi
              .delete(created.id)
              .then(() => invalidateOccurrences(qc))
              .catch((err) => toastError(err, 'Could not remove the next occurrence.'))
          },
        },
      })
    })
    .catch((err) => {
      if (err instanceof ApiError && err.status === 409) return
      toastError(err, 'Could not add the next occurrence.')
    })
}
