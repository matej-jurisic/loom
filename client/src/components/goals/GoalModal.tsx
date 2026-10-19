import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { ColorPicker, IconPicker } from '@/components/categories/CategoryModal'
import { inputCls } from '@/components/ui/input'
import { goalsApi, ApiError } from '@/lib/api'
import type { Goal, GoalKind } from '@/lib/types'
import { invalidateGoals } from '@/lib/invalidate'
import { GOAL_DEFAULT_ICON } from './GoalIcon'

interface FormState {
  title: string
  description: string
  notes: string
  kind: GoalKind
  endDate: string
  color: string | null
  icon: string | null
}

const KIND_OPTIONS: { value: GoalKind; label: string }[] = [
  { value: 'goal', label: 'Goal' },
  { value: 'track', label: 'Track' },
]

interface Errors {
  title?: string
}

function validate(form: FormState): Errors {
  const errs: Errors = {}
  if (!form.title.trim()) errs.title = 'Title is required.'
  if (form.title.length > 255) errs.title = 'Title cannot exceed 255 characters.'
  return errs
}

interface GoalModalProps {
  open: boolean
  onClose: () => void
  goal?: Goal
}

export function GoalModal({ open, onClose, goal }: GoalModalProps) {
  const qc = useQueryClient()
  const isEdit = Boolean(goal)

  const [form, setForm] = useState<FormState>({ title: '', description: '', notes: '', kind: 'goal', endDate: '', color: null, icon: null })
  const [errors, setErrors] = useState<Errors>({})
  const [apiError, setApiError] = useState('')

  useEffect(() => {
    if (open) {
      setForm({
        title: goal?.title ?? '',
        description: goal?.description ?? '',
        notes: goal?.notes ?? '',
        kind: goal?.kind ?? 'goal',
        endDate: goal?.endDate ?? '',
        color: goal?.color ?? null,
        icon: goal?.icon ?? null,
      })
      setErrors({})
      setApiError('')
    }
  }, [open, goal])

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        notes: form.notes.trim() || null,
        kind: form.kind,
        endDate: form.endDate || null,
        color: form.color,
        icon: form.icon,
      }
      return isEdit ? goalsApi.update(goal!.id, payload) : goalsApi.create(payload)
    },
    onSuccess: () => {
      invalidateGoals(qc)
      onClose()
    },
    onError: (err) => {
      setApiError(err instanceof ApiError ? err.message : 'Something went wrong.')
    },
  })

  function handleSubmit() {
    const errs = validate(form)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setApiError('')
    mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Goal' : 'New Goal'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} loading={mutation.isPending}>
            {isEdit ? 'Save Changes' : 'Create Goal'}
          </Button>
        </>
      }
    >
      <Field
        label="Title"
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        placeholder="What are you working towards?"
        error={errors.title}
        autoFocus={!isEdit}
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Kind</label>
          <div className="flex overflow-hidden rounded-md border border-border">
            {KIND_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, kind: value }))}
                className={`border-l border-border px-3 py-1.5 text-xs font-medium transition-colors first:border-l-0 ${
                  form.kind === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">End date</label>
          <input
            type="date"
            lang="en-GB"
            value={form.endDate}
            onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Optional: describe the goal and what success looks like."
          rows={3}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Optional: plans, links, reminders."
          rows={4}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Color</label>
        <ColorPicker value={form.color} onChange={(color) => setForm((f) => ({ ...f, color }))} onClear={() => setForm((f) => ({ ...f, color: null }))} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">Icon</label>
        <IconPicker
          value={form.icon}
          color={form.color ?? 'var(--color-primary)'}
          onChange={(icon) => setForm((f) => ({ ...f, icon }))}
          noneIcon={GOAL_DEFAULT_ICON}
        />
      </div>
      {apiError && <p className="text-sm text-destructive">{apiError}</p>}
    </Modal>
  )
}
