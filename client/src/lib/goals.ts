export const STALE_DAYS = 14

export function recencyLabel(days: number | null): string {
  if (days === null) return 'no activity yet'
  if (days === 0) return 'active today'
  if (days === 1) return 'active yesterday'
  if (days < 7) return `active ${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w since last`
  return `${Math.floor(days / 30)}mo since last`
}

export function isStale(days: number | null): boolean {
  return days !== null && days >= STALE_DAYS
}
