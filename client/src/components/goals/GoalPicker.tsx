import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface GoalPickerProps {
  goals: { id: string; title: string }[]
  value: string[]
  onChange: (ids: string[]) => void
}

export function GoalPicker({ goals, value, onChange }: GoalPickerProps) {
  const listId = useId()
  const listRef = useRef<HTMLUListElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const selected = value
    .map((id) => goals.find((g) => g.id === id))
    .filter((g): g is { id: string; title: string } => !!g)
  const needle = query.trim().toLowerCase()
  const matches = goals.filter(
    (g) => !value.includes(g.id) && g.title.toLowerCase().includes(needle),
  )
  const remaining = goals.length - selected.length
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0))

  useEffect(() => {
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  function pick(id: string) {
    onChange([...value, id])
    setQuery('')
    setActive(0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else setActive(Math.min(activeIndex + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(activeIndex - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && matches[activeIndex]) pick(matches[activeIndex].id)
    } else if (e.key === 'Escape' && open) {
      e.nativeEvent.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {selected.map((g) => (
              <li key={g.id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={g.title}>
                  {g.title}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== g.id))}
                  aria-label={`Remove ${g.title}`}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {remaining > 0 && (
        <div className="relative">
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label="Add a goal"
            placeholder="Add a goal..."
            value={query}
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {open && (
            <ul
              id={listId}
              ref={listRef}
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-lg"
            >
              {matches.length === 0 ? (
                <li className="px-3 py-2 text-sm text-muted-foreground">No matching goals</li>
              ) : (
                matches.map((g, i) => (
                  <li
                    key={g.id}
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(g.id)}
                    onMouseEnter={() => setActive(i)}
                    className={`cursor-pointer truncate px-3 py-1.5 text-sm text-foreground ${
                      i === activeIndex ? 'bg-muted' : ''
                    }`}
                  >
                    {g.title}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
