// Every displayed date goes through here: day first, numeric month ("Sat 24/10"). The year is shown
// only when it isn't the current one, unless the caller asks for it.

type DateInput = Date | string | number

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function toDate(d: DateInput): Date {
  return d instanceof Date ? d : new Date(d)
}

export function weekdayName(d: DateInput, long = false): string {
  const name = WEEKDAYS[toDate(d).getDay()]
  return long ? name : name.slice(0, 3)
}

/** "24/10", or "24/10/2027" outside the current year. */
export function shortDate(d: DateInput, withYear?: boolean): string {
  const x = toDate(d)
  const year = withYear ?? x.getFullYear() !== new Date().getFullYear()
  return `${x.getDate()}/${x.getMonth() + 1}${year ? `/${x.getFullYear()}` : ''}`
}

/** "Sat 24/10"; `long` gives "Saturday 24/10". */
export function weekdayDate(d: DateInput, long = false, withYear?: boolean): string {
  return `${weekdayName(d, long)} ${shortDate(d, withYear)}`
}
