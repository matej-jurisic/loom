import { Check } from 'lucide-react'

interface GoalPickerProps {
  goals: { id: string; title: string }[]
  value: string[]
  onChange: (ids: string[]) => void
}

export function GoalPicker({ goals, value, onChange }: GoalPickerProps) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {goals.map((g) => {
        const selected = value.includes(g.id)
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={selected}
            onClick={() => toggle(g.id)}
            title={g.title}
            className={`flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              selected
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground'
            }`}
          >
            {selected && <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />}
            <span className="truncate">{g.title}</span>
          </button>
        )
      })}
    </div>
  )
}
