import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ListFilter, Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ColorPicker, IconPicker } from '@/components/categories/CategoryModal'
import { OccurrenceFilterFields } from '@/components/events/OccurrenceFilterFields'
import { ApiError, listsApi } from '@/lib/api'
import { invalidateLists } from '@/lib/invalidate'
import { DEFAULT_GROUP, listBody, viewFromList, type OccurrenceView } from '@/lib/occurrenceView'
import type { OccurrenceList } from '@/lib/types'

const EMPTY_VIEW: OccurrenceView = {
  status: 'open',
  category: null,
  tag: null,
  goal: null,
  search: '',
  group: DEFAULT_GROUP,
}

interface ListModalProps {
  open: boolean
  onClose: () => void
  /** Edit this list; omitted creates a new one. */
  list?: OccurrenceList
  /** Starting filters for a new list, e.g. what the page currently shows. */
  initial?: OccurrenceView
  onSaved?: (list: OccurrenceList) => void
}

export function ListModal({ open, onClose, list, initial, onSaved }: ListModalProps) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [view, setView] = useState<OccurrenceView>(EMPTY_VIEW)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(list?.name ?? '')
    setIcon(list?.icon ?? null)
    setColor(list?.color ?? null)
    setView(list ? viewFromList(list) : (initial ?? EMPTY_VIEW))
    setError('')
    // Reinitialise only when the modal opens; `initial` is rebuilt on every page render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list])

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    try {
      const body = listBody({ name, icon, color }, view)
      const saved = list ? await listsApi.update(list.id, body) : await listsApi.create(body)
      invalidateLists(qc)
      onClose()
      onSaved?.(saved)
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
      title={list ? 'Edit List' : 'New List'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>{list ? 'Save' : 'Add List'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Name</label>
          <input
            autoFocus={!list}
            value={name}
            maxLength={255}
            onChange={(e) => { setName(e.target.value); setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
            placeholder="e.g. Errands, Exam prep"
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Filters</label>
          <div className="flex flex-col gap-2">
            <OccurrenceFilterFields value={view} onChange={(patch) => setView((v) => ({ ...v, ...patch }))} />
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                strokeWidth={2}
              />
              <input
                value={view.search}
                maxLength={255}
                onChange={(e) => setView((v) => ({ ...v, search: e.target.value }))}
                placeholder="Search"
                className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Color</label>
          <ColorPicker value={color} onChange={setColor} onClear={() => setColor(null)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Icon</label>
          <IconPicker value={icon} color={color ?? 'var(--color-primary)'} onChange={setIcon} noneIcon={ListFilter} />
        </div>
      </div>
    </Modal>
  )
}
