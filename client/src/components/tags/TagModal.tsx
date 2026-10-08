import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { ApiError } from '@/lib/api'
import type { Tag } from '@/lib/types'

interface TagModalProps {
  open: boolean
  onClose: () => void
  tag?: Tag
  onSave: (name: string) => Promise<void>
}

export function TagModal({ open, onClose, tag, onSave }: TagModalProps) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(tag?.name ?? '')
      setError('')
    }
  }, [open, tag])

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return }
    setSaving(true)
    try {
      await onSave(name.trim())
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
      title={tag ? 'Edit Tag' : 'New Tag'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>{tag ? 'Save' : 'Add Tag'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Name</label>
        <input
          autoFocus
          value={name}
          maxLength={255}
          onChange={(e) => { setName(e.target.value); setError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          placeholder="e.g. CS101, Exam prep"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </Modal>
  )
}
