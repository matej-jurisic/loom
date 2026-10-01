export function durationMinutes(startAt: string | null, endAt: string | null): number {
  if (!startAt || !endAt) return 0
  return Math.max(0, Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000))
}

export function resolveSplit(duration: number, minutes: (number | null)[]): number[] {
  const pinned = minutes.reduce<number>((sum, m) => sum + (m ?? 0), 0)
  const autoCount = minutes.filter((m) => m === null).length
  const pool = Math.max(0, duration - pinned)
  const share = autoCount === 0 ? 0 : Math.floor(pool / autoCount)
  let extra = autoCount === 0 ? 0 : pool % autoCount

  return minutes.map((m) => {
    if (m !== null) return m
    if (extra > 0) {
      extra--
      return share + 1
    }
    return share
  })
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function parseMinutes(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (!t) return null

  const clock = /^(\d+):(\d{1,2})$/.exec(t)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])

  const hours = /^(\d+(?:[.,]\d+)?)\s*h\s*(?:(\d+)\s*(?:m|min)?)?$/.exec(t)
  if (hours) return Math.round(Number(hours[1].replace(',', '.')) * 60) + Number(hours[2] ?? 0)

  const mins = /^(\d+)\s*(?:m|min)?$/.exec(t)
  if (mins) return Number(mins[1])

  return null
}
