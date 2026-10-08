import type { QueryClient } from '@tanstack/react-query'

export function invalidateOccurrences(qc: QueryClient, opts?: { split?: boolean }) {
  qc.invalidateQueries({ queryKey: ['events'] })
  if (opts?.split) qc.invalidateQueries({ queryKey: ['insights'] })
}

export function invalidateActivities(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['activities'] })
  qc.invalidateQueries({ queryKey: ['events'] })
}

export function invalidateWorkTypes(qc: QueryClient) {
  invalidateActivities(qc)
  qc.invalidateQueries({ queryKey: ['insights'] })
}

export function invalidateGoals(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['goals'] })
  qc.invalidateQueries({ queryKey: ['events'] })
}

export function invalidateTags(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['tags'] })
  invalidateActivities(qc)
}

export function invalidateAll(qc: QueryClient) {
  invalidateWorkTypes(qc)
  qc.invalidateQueries({ queryKey: ['goals'] })
  qc.invalidateQueries({ queryKey: ['tags'] })
}
