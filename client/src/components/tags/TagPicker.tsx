import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Plus } from 'lucide-react'
import { tagsApi } from '@/lib/api'
import type { Tag } from '@/lib/types'
import { invalidateTags } from '@/lib/invalidate'

interface TagPickerProps {
  tags: Tag[]
  value: string[]
  onChange: (ids: string[]) => void
}

export function TagPicker({ tags, value, onChange }: TagPickerProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')

  const createMutation = useMutation({
    mutationFn: (tagName: string) => tagsApi.create({ name: tagName }),
    onSuccess: (created) => {
      invalidateTags(qc)
      onChange([...value, created.id])
      setName('')
    },
  })

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  }

  function submit() {
    const trimmed = name.trim()
    if (!trimmed || createMutation.isPending) return
    const existing = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    if (existing) {
      if (!value.includes(existing.id)) onChange([...value, existing.id])
      setName('')
      return
    }
    createMutation.mutate(trimmed)
  }

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => {
            const selected = value.includes(t.id)
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(t.id)}
                title={t.name}
                className={`flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                }`}
              >
                {selected && <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />}
                <span className="truncate">{t.name}</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New tag..."
            value={name}
            maxLength={255}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim() || createMutation.isPending}
            aria-label="Add tag"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        {createMutation.error instanceof Error && (
          <p className="text-xs text-destructive">{createMutation.error.message}</p>
        )}
      </div>
    </div>
  )
}
