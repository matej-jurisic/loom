export const STALE_DAYS = 14

export function recencyLabel(days: number | null): string {
  if (days === null) return 'no activity yet'
  if (days === 0) return 'active today'
  if (days === 1) return 'active yesterday'
  if (days < 7) return `active ${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w since last`
  return `${Math.floor(days / 30)}mo since last`
}

export function pickableGoals<T extends { id: string; status: string }>(goals: T[], linkedIds: string[]): T[] {
  return goals.filter((g) => g.status !== 'closed' || linkedIds.includes(g.id))
}

/** The end-date note on a goal card, from the server's `daysUntilEnd`. */
export function endLabel(daysUntilEnd: number | null): string | null {
  if (daysUntilEnd === null) return null
  if (daysUntilEnd < 0) return 'ended'
  if (daysUntilEnd === 0) return 'ends today'
  if (daysUntilEnd === 1) return 'ends tomorrow'
  return `ends in ${daysUntilEnd} days`
}

export function isStale(days: number | null): boolean {
  return days !== null && days >= STALE_DAYS
}
