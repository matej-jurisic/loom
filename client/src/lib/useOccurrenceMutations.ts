import { useQueryClient } from '@tanstack/react-query'
import { occurrencesApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Occurrence } from '@/lib/types'
import type { PendingMove } from '@/components/events/MoveOrSkipModal'
import { isSameDay, sod } from '@/lib/calendarDates'
import { invalidateOccurrences } from '@/lib/invalidate'

export function useOccurrenceMutations({
  rangeStart,
  rangeEnd,
  setPendingMove,
}: {
  rangeStart: Date
  rangeEnd: Date
  setPendingMove: (move: PendingMove | null) => void
}) {
  const queryClient = useQueryClient()

  // A drop that lands on a different date than the occurrence was on is ambiguous:
  // it can mean "this moved" or "this didn't happen, do it later". Ask; a same-day
  // drag is just a time change and commits straight away. Only pending occurrences
  // can be skipped, so a done/skipped one always moves.
  // Only a pending occurrence can be skipped, so a done/skipped one always just moves.
  function movesToAnotherDay(ev: Occurrence, newStart: Date): boolean {
    return ev.status === 'pending' && !!ev.startAt && !isSameDay(new Date(ev.startAt), newStart)
  }

  function duplicateOccurrence(ev: Occurrence, startAt: string | null, endAt: string | null, isAllDay: boolean) {
    occurrencesApi.create({
      activityId: ev.activity.id,
      title: ev.title,
      startAt,
      endAt,
      isAllDay,
      isPlanned: ev.isPlanned,
      deadlineOccurrenceId: ev.deadline?.status === 'pending' ? ev.deadline.id : null,
    }).catch((err) => {
      toastError(err, 'Could not duplicate the occurrence.')
    }).finally(() => {
      invalidateOccurrences(queryClient)
    })
  }

  function rescheduleEvent(ev: Occurrence, newStart: Date, newEnd: Date, copy = false) {
    if (copy) {
      duplicateOccurrence(ev, newStart.toISOString(), ev.endAt ? newEnd.toISOString() : null, ev.isAllDay)
      return
    }
    if (movesToAnotherDay(ev, newStart)) {
      setPendingMove({
        occurrence: ev,
        startAt: newStart.toISOString(),
        endAt: ev.endAt ? newEnd.toISOString() : null,
        isAllDay: ev.isAllDay,
        commit: () => commitReschedule(ev, newStart, newEnd),
      })
      return
    }
    commitReschedule(ev, newStart, newEnd)
  }

  function commitReschedule(ev: Occurrence, newStart: Date, newEnd: Date) {
    const newEndAt = ev.endAt ? newEnd.toISOString() : null
    // Cancel any in-flight refetch so it doesn't overwrite the optimistic update
    // when the user drags multiple times quickly.
    queryClient.cancelQueries({ queryKey: ['events'] })
    queryClient.setQueryData<Occurrence[]>(
      ['events', 'calendar', rangeStart.toISOString(), rangeEnd.toISOString()],
      (old) => old?.map((o) => {
        if (o.id !== ev.id) return o
        return { ...o, startAt: newStart.toISOString(), endAt: newEndAt }
      }),
    )
    occurrencesApi.patch(ev.id, {
      startAt: newStart.toISOString(),
      endAt: newEndAt,
    }).catch((err) => {
      toastError(err, 'Could not reschedule the occurrence.')
    }).finally(() => {
      invalidateOccurrences(queryClient)
    })
  }

  function rescheduleFromAllDay(ev: Occurrence, newStart: Date, newEnd: Date, copy = false) {
    if (copy) {
      duplicateOccurrence(ev, newStart.toISOString(), newEnd.toISOString(), false)
      return
    }
    if (movesToAnotherDay(ev, newStart)) {
      setPendingMove({
        occurrence: ev,
        startAt: newStart.toISOString(),
        endAt: newEnd.toISOString(),
        isAllDay: false,
        commit: () => commitRescheduleFromAllDay(ev, newStart, newEnd),
      })
      return
    }
    commitRescheduleFromAllDay(ev, newStart, newEnd)
  }

  function commitRescheduleFromAllDay(ev: Occurrence, newStart: Date, newEnd: Date) {
    queryClient.cancelQueries({ queryKey: ['events'] })
    queryClient.setQueryData<Occurrence[]>(
      ['events', 'calendar', rangeStart.toISOString(), rangeEnd.toISOString()],
      (old) => old?.map((o) => {
        if (o.id !== ev.id) return o
        return { ...o, startAt: newStart.toISOString(), endAt: newEnd.toISOString(), isAllDay: false }
      }),
    )
    occurrencesApi.patch(ev.id, {
      startAt: newStart.toISOString(),
      endAt: newEnd.toISOString(),
      isAllDay: false,
    }).catch((err) => {
      toastError(err, 'Could not reschedule the occurrence.')
    }).finally(() => {
      invalidateOccurrences(queryClient)
    })
  }

  function scheduleFloating(ev: Occurrence, newStart: Date, newEnd: Date) {
    queryClient.cancelQueries({ queryKey: ['events'] })
    queryClient.setQueryData<Occurrence[]>(
      ['events', 'floating'],
      (old) => old?.filter((o) => o.id !== ev.id),
    )
    queryClient.setQueryData<Occurrence[]>(
      ['events', 'calendar', rangeStart.toISOString(), rangeEnd.toISOString()],
      (old) => [...(old ?? []), { ...ev, startAt: newStart.toISOString(), endAt: newEnd.toISOString() }],
    )
    occurrencesApi.patch(ev.id, {
      startAt: newStart.toISOString(),
      endAt: newEnd.toISOString(),
      isAllDay: false,
    }).catch((err) => {
      toastError(err, 'Could not schedule the task.')
    }).finally(() => {
      invalidateOccurrences(queryClient)
    })
  }

  function makeEventFloat(ev: Occurrence, copy = false) {
    if (copy) {
      duplicateOccurrence(ev, null, null, false)
      return
    }
    queryClient.cancelQueries({ queryKey: ['events'] })
    queryClient.setQueryData<Occurrence[]>(
      ['events', 'calendar', rangeStart.toISOString(), rangeEnd.toISOString()],
      (old) => old?.filter((o) => o.id !== ev.id),
    )
    queryClient.setQueryData<Occurrence[]>(
      ['events', 'floating'],
      (old) => [...(old ?? []), { ...ev, startAt: null, endAt: null, isAllDay: false }],
    )
    occurrencesApi.patch(ev.id, {
      startAt: null,
      endAt: null,
      isAllDay: false,
    }).catch((err) => {
      toastError(err, 'Could not unschedule the event.')
    }).finally(() => {
      invalidateOccurrences(queryClient)
    })
  }

  function makeEventAllDay(ev: Occurrence, day: Date, copy = false) {
    if (copy) {
      const newStart = sod(day)
      duplicateOccurrence(ev, newStart.toISOString(), allDayEndAt(ev, newStart), true)
      return
    }
    if (movesToAnotherDay(ev, sod(day))) {
      const newStart = sod(day)
      setPendingMove({
        occurrence: ev,
        startAt: newStart.toISOString(),
        endAt: allDayEndAt(ev, newStart),
        isAllDay: true,
        commit: () => commitMakeEventAllDay(ev, day),
      })
      return
    }
    commitMakeEventAllDay(ev, day)
  }

  // Preserve span for multi-day all-day events
  function allDayEndAt(ev: Occurrence, newStart: Date): string | null {
    return ev.isAllDay && ev.startAt && ev.endAt
      ? new Date(newStart.getTime() + (new Date(ev.endAt).getTime() - new Date(ev.startAt).getTime())).toISOString()
      : null
  }

  function commitMakeEventAllDay(ev: Occurrence, day: Date) {
    const newStart = sod(day)
    const startAt = newStart.toISOString()
    const endAt = allDayEndAt(ev, newStart)
    queryClient.cancelQueries({ queryKey: ['events'] })
    if (ev.startAt === null) {
      queryClient.setQueryData<Occurrence[]>(
        ['events', 'floating'],
        (old) => old?.filter((o) => o.id !== ev.id),
      )
      queryClient.setQueryData<Occurrence[]>(
        ['events', 'calendar', rangeStart.toISOString(), rangeEnd.toISOString()],
        (old) => [...(old ?? []), { ...ev, startAt, endAt, isAllDay: true }],
      )
    } else {
      queryClient.setQueryData<Occurrence[]>(
        ['events', 'calendar', rangeStart.toISOString(), rangeEnd.toISOString()],
        (old) => old?.map((o) => o.id === ev.id ? { ...o, startAt, endAt, isAllDay: true } : o),
      )
    }
    occurrencesApi.patch(ev.id, {
      startAt,
      endAt,
      isAllDay: true,
    }).catch((err) => {
      toastError(err, 'Could not convert to all-day.')
    }).finally(() => {
      invalidateOccurrences(queryClient)
    })
  }

  return { rescheduleEvent, rescheduleFromAllDay, scheduleFloating, makeEventFloat, makeEventAllDay }
}
