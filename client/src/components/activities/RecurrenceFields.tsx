import { WEEKDAYS, describeRecurrence, fromDraft, type RecurrenceDraft } from '@/lib/recurrence'
import type { RecurrenceFrequency } from '@/lib/types'
import { inputCls } from '@/components/ui/input'

interface RecurrenceFieldsProps {
  value: RecurrenceDraft
  onChange: (next: RecurrenceDraft) => void
}

const UNITS: Record<RecurrenceFrequency, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
}

export function RecurrenceFields({ value, onChange }: RecurrenceFieldsProps) {
  const set = (patch: Partial<RecurrenceDraft>) => onChange({ ...value, ...patch })
  const [unit, units] = UNITS[value.frequency]
  const { rule } = fromDraft(value)

  function toggleWeekday(iso: number) {
    set({ weekdays: value.weekdays.includes(iso) ? value.weekdays.filter((d) => d !== iso) : [...value.weekdays, iso] })
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className="h-4 w-4 rounded border-input accent-[var(--color-primary)]"
        />
        Repeats
      </label>

      {value.enabled && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span>Every</span>
            <input
              type="number"
              min={1}
              max={99}
              value={value.interval}
              onChange={(e) => set({ interval: e.target.value })}
              aria-label="Repeat interval"
              className={`${inputCls} w-16 text-center`}
            />
            <select
              value={value.frequency}
              onChange={(e) => set({ frequency: e.target.value as RecurrenceFrequency })}
              aria-label="Repeat frequency"
              className={inputCls}
            >
              {(Object.keys(UNITS) as RecurrenceFrequency[]).map((f) => (
                <option key={f} value={f}>{Number(value.interval) === 1 ? UNITS[f][0] : UNITS[f][1]}</option>
              ))}
            </select>
          </div>

          {value.frequency === 'weekly' && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">On (none selected: the start date's weekday)</span>
              <div className="flex gap-1">
                {WEEKDAYS.map((d) => {
                  const on = value.weekdays.includes(d.iso)
                  return (
                    <button
                      key={d.iso}
                      type="button"
                      onClick={() => toggleWeekday(d.iso)}
                      aria-pressed={on}
                      aria-label={d.short}
                      title={d.short}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-medium transition-colors ${
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {d.letter}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Starts
              <input
                type="date"
                value={value.startDate}
                onChange={(e) => set({ startDate: e.target.value })}
                className={`${inputCls} text-foreground`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Ends (optional)
              <input
                type="date"
                value={value.endDate}
                min={value.startDate}
                onChange={(e) => set({ endDate: e.target.value })}
                className={`${inputCls} text-foreground`}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={value.allDay}
                onChange={(e) => set({ allDay: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-[var(--color-primary)]"
              />
              All day
            </label>
            {!value.allDay && (
              <input
                type="time"
                lang="en-GB"
                value={value.timeOfDay}
                onChange={(e) => set({ timeOfDay: e.target.value })}
                aria-label="Time of day"
                className={inputCls}
              />
            )}
            <label className="flex items-center gap-2 text-sm text-foreground">
              Lasts
              <input
                type="number"
                min={1}
                max={1440}
                placeholder="-"
                value={value.durationMinutes}
                onChange={(e) => set({ durationMinutes: e.target.value })}
                aria-label="Duration in minutes"
                className={`${inputCls} w-20 text-center`}
              />
              <span className="text-muted-foreground">min</span>
            </label>
          </div>

          <p className="text-xs text-muted-foreground">
            {rule
              ? describeRecurrence(rule)
              : `Every ${Number(value.interval) === 1 ? unit : `${value.interval} ${units}`}`}
          </p>
        </div>
      )}
    </div>
  )
}
