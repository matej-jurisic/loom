import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Hash, ListTodo, Pencil, Plus, Trash2 } from 'lucide-react'
import { activitiesApi, tagsApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Tag } from '@/lib/types'
import { TagModal } from '@/components/tags/TagModal'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { invalidateTags } from '@/lib/invalidate'

export function TagsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Tag | undefined>()
  const [deleting, setDeleting] = useState<Tag | null>(null)

  const { data: tags = [], isLoading } = useQuery({ queryKey: ['tags'], queryFn: tagsApi.list })
  const { data: activities = [] } = useQuery({ queryKey: ['activities'], queryFn: () => activitiesApi.list() })

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of activities) for (const t of a.tags) map.set(t.id, (map.get(t.id) ?? 0) + 1)
    return map
  }, [activities])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tagsApi.delete(id),
    onSuccess: () => {
      setDeleting(null)
      invalidateTags(qc)
    },
    onError: (err) => toastError(err, 'Could not delete the tag.'),
  })

  async function handleSave(name: string) {
    if (editing) await tagsApi.update(editing.id, { name })
    else await tagsApi.create({ name })
    invalidateTags(qc)
  }

  function openAdd() {
    setEditing(undefined)
    setModalOpen(true)
  }

  function openEdit(tag: Tag) {
    setEditing(tag)
    setModalOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Tags"
        action={
          <button
            onClick={openAdd}
            aria-label="Add tag"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <div className="mx-auto max-w-2xl">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : tags.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Hash className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No tags yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tag activities to group them, for example by course.
                </p>
              </div>
              <button
                onClick={openAdd}
                className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                New Tag
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <ul className="divide-y divide-border">
                {tags.map((tag) => {
                  const count = counts.get(tag.id) ?? 0
                  return (
                    <li key={tag.id} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Hash className="h-[15px] w-[15px] text-muted-foreground" strokeWidth={2} />
                      </span>
                      <button
                        onClick={() => openEdit(tag)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm text-foreground">{tag.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {count} {count === 1 ? 'activity' : 'activities'}
                        </span>
                      </button>
                      <ActionMenu
                        ariaLabel={`Actions for ${tag.name}`}
                        iconClassName="h-3.5 w-3.5"
                        items={[
                          {
                            icon: ListTodo,
                            label: 'View occurrences',
                            onClick: () => navigate(`/occurrences?tag=${tag.id}`),
                          },
                          { icon: Pencil, label: 'Edit', onClick: () => openEdit(tag) },
                          'separator',
                          { icon: Trash2, label: 'Delete', onClick: () => setDeleting(tag), destructive: true },
                        ]}
                      />
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <TagModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        tag={editing}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        loading={deleteMutation.isPending}
        title="Delete tag?"
        message={`"${deleting?.name ?? ''}" is removed from every activity that has it. The activities stay.`}
      />
    </div>
  )
}
