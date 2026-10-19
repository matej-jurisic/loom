import { MAX_REMINDERS, REMINDER_PRESETS, reminderLabel, toggleReminder } from '@/lib/reminders'

interface ReminderPickerProps {
  value: number[]
  onChange: (minutes: number[]) => void
}

export function ReminderPicker({ value, onChange }: ReminderPickerProps) {
  // A stored offset that is not a preset still shows, so it can be seen and removed.
  const options = [...new Set([...REMINDER_PRESETS, ...value])].sort((a, b) => a - b)
  const full = value.length >= MAX_REMINDERS

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((m) => {
        const selected = value.includes(m)
        return (
          <button
            key={m}
            type="button"
            aria-pressed={selected}
            disabled={!selected && full}
            onClick={() => onChange(toggleReminder(value, m))}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
              selected
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            }`}
          >
            {reminderLabel(m)}
          </button>
        )
      })}
    </div>
  )
}
