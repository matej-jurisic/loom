import { useEffect, useState } from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ICON_GROUPS } from '@/components/categories/categoryIcons'
import type { Category } from '@/lib/types'
import { ApiError } from '@/lib/api'

export const PALETTE = [
  '#8499B1', '#ef4444', '#f97316', '#f59e0b', '#fbbf24',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#78716c', '#64748b',
]

export function ColorPicker({
  value,
  onChange,
  onClear,
}: {
  value: string | null
  onChange: (c: string) => void
  /** Adds a leading neutral swatch that selects "no colour" (value null). */
  onClear?: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="relative h-7 w-7 rounded-full border border-border bg-muted transition-transform hover:scale-110"
          title="Default"
        >
          {value === null && <Check className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" strokeWidth={3} />}
        </button>
      )}
      {PALETTE.map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          className="relative h-7 w-7 rounded-full transition-transform hover:scale-110"
          style={{ backgroundColor: hex }}
        >
          {value === hex && <Check className="absolute inset-0 m-auto h-4 w-4 text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  )
}

export function IconPicker({
  value,
  color,
  onChange,
  noneIcon: NoneIcon,
}: {
  value: string | null
  color: string
  onChange: (i: string | null) => void
  /** Shown for the null choice when null means a default icon rather than a dot. */
  noneIcon?: LucideIcon
}) {
  // Open on the tab holding the current icon, and follow it when the value changes from outside
  // (the modal reopening on another category); a click inside the picker is already on that tab.
  const [tab, setTab] = useState(() => groupIndexOf(value))
  const [syncedValue, setSyncedValue] = useState(value)
  if (syncedValue !== value) {
    setSyncedValue(value)
    if (value !== null && !(value in ICON_GROUPS[tab].icons)) setTab(groupIndexOf(value))
  }
  const selectedGroup = value === null ? -1 : ICON_GROUPS.findIndex((g) => value in g.icons)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {ICON_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            onClick={() => setTab(i)}
            className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors ${
              tab === i
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {g.label}
            {selectedGroup === i && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />}
          </button>
        ))}
      </div>
      {/* Every group is laid out in the same grid cell and only the active one is visible, so the
          panel is always as tall as the largest group at this width and switching tabs never moves
          what is below it. `invisible` also takes the hidden tiles out of the tab order. */}
      <div className="grid">
        {ICON_GROUPS.map((g, i) => (
          <div
            key={g.label}
            aria-hidden={tab !== i}
            className={`col-start-1 row-start-1 flex flex-wrap content-start gap-1.5 ${tab === i ? '' : 'invisible'}`}
          >
            <button
              type="button"
              onClick={() => onChange(null)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                value === null ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
              }`}
              title={NoneIcon ? 'Default' : 'No icon'}
            >
              {NoneIcon ? (
                <NoneIcon
                  style={{ width: 15, height: 15, color: value === null ? color : 'var(--color-muted-foreground)' }}
                  strokeWidth={2}
                />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: value === null ? color : 'var(--color-muted-foreground)' }} />
              )}
            </button>
            {Object.entries(g.icons).map(([name, Icon]) => {
              const selected = value === name
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange(name)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
                    selected ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                  }`}
                  title={name}
                >
                  <Icon
                    style={{ width: 15, height: 15, color: selected ? color : 'var(--color-muted-foreground)' }}
                    strokeWidth={2}
                  />
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The tab to open on: the group holding `icon`, or the first one. */
function groupIndexOf(icon: string | null): number {
  return Math.max(0, icon === null ? 0 : ICON_GROUPS.findIndex((g) => icon in g.icons))
}

interface CategoryModalProps {
  open: boolean
  onClose: () => void
  category?: Category
  onSave: (name: string, color: string, icon: string | null) => Promise<void>
}

export function CategoryModal({ open, onClose, category, onSave }: CategoryModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PALETTE[6])
  const [icon, setIcon] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '')
      setColor(category?.color ?? PALETTE[6])
      setIcon(category?.icon ?? null)
      setError('')
    }
  }, [open, category])

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    try {
      await onSave(name.trim(), color, icon)
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? 'Edit Category' : 'New Category'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>{category ? 'Save' : 'Add Category'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Name</label>
        <input
          autoFocus={!category}
          value={name}
          onChange={(e) => { setName(e.target.value); setError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          placeholder="e.g. Health, Admin, Learning"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Color</label>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Icon</label>
        <IconPicker value={icon} color={color} onChange={setIcon} />
      </div>
    </Modal>
  )
}
