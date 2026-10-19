import { useQuery } from '@tanstack/react-query'
import { settingsApi } from '@/lib/api'
import type { CalendarColorBy } from '@/lib/types'

/** The user's calendar colour source, defaulting to category while settings load. */
export function useCalendarColorBy(): CalendarColorBy {
  const { data } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get, staleTime: 5 * 60 * 1000 })
  return data?.calendarColorBy ?? 'category'
}
