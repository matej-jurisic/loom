import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { activityWorkTypesApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Activity, ActivityWorkType } from '@/lib/types'
import { invalidateWorkTypes } from '@/lib/invalidate'

export function WorkTypesSection({ activity, inModal = false }: { activity: Activity; inModal?: boolean }) {
  const qc = useQueryClient()
  const [local, setLocal] = useState<ActivityWorkType[] | null>(null)
  const workTypes = local ?? activity.workTypes
  const cancelRenameRef = useRef(false)
  const [newTitle, setNewTitle] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)

  function invalidate() {
    invalidateWorkTypes(qc)
  }

  const addMutation = useMutation({
    mutationFn: (title: string) => activityWorkTypesApi.create(activity.id, { title }),
    onSuccess: (created) => {
      setLocal(workTypes.some((w) => w.id === created.id) ? workTypes : [...workTypes, created])
      setNewTitle('')
      invalidate()
    },
    onError: (err) => toastError(err, 'Could not add the work type.'),
  })

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      activityWorkTypesApi.update(activity.id, id, { title }),
    onSuccess: (updated) => {
      setLocal(workTypes.map((w) => (w.id === updated.id ? updated : w)))
      invalidate()
    },
    onError: (err) => toastError(err, 'Could not rename the work type.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => activityWorkTypesApi.delete(activity.id, id),
    onSuccess: (_, id) => {
      setLocal(workTypes.filter((w) => w.id !== id))
      invalidate()
    },
    onError: (err) => toastError(err, 'Could not remove the work type.'),
  })

  function handleAdd() {
    const title = newTitle.trim()
    if (!title) return
    addMutation.mutate(title)
  }

  function finishRename(workType: ActivityWorkType) {
    const draft = editing
    setEditing(null)
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false
      return
    }
    const title = draft?.text.trim()
    if (!title || title === workType.title) return
    renameMutation.mutate({ id: workType.id, title })
  }

  return (
    <div className={`flex flex-col ${inModal ? 'gap-2' : 'gap-3'}`}>
      {inModal ? (
        <label className="text-sm font-medium text-foreground">Work types</label>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Work types</span>
          <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">{workTypes.length}</span>
        </div>
      )}
      {workTypes.length > 0 && (
        <div className="rounded-lg border border-border">
          <ul className="divide-y divide-border">
            {workTypes.map((w) => (
              <li key={w.id} className="flex items-center gap-3 px-3 py-2.5">
                {editing?.id === w.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editing.text}
                    maxLength={255}
                    aria-label={`Rename ${w.title}`}
                    onChange={(e) => setEditing({ id: w.id, text: e.target.value })}
                    onBlur={() => finishRename(w)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') {
                        e.nativeEvent.stopPropagation()
                        cancelRenameRef.current = true
                        e.currentTarget.blur()
                      }
                    }}
                    className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <button
                    onClick={() => setEditing({ id: w.id, text: w.title })}
                    title="Rename"
                    className="min-w-0 flex-1 truncate text-left text-sm text-foreground"
                  >
                    {w.title}
                  </button>
                )}
                <button
                  onClick={() => deleteMutation.mutate(w.id)}
                  aria-label={`Remove ${w.title}`}
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Add a work type..."
          value={newTitle}
          maxLength={255}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button
          variant="ghost"
          onClick={handleAdd}
          disabled={!newTitle.trim() || addMutation.isPending}
        >
          Add
        </Button>
      </div>
    </div>
  )
}
