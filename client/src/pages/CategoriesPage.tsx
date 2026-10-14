import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ListTodo, Pencil, Plus, Shapes, Trash2 } from 'lucide-react'
import { activitiesApi, categoriesApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Category } from '@/lib/types'
import { CategoryIcon } from '@/components/categories/categoryIcons'
import { CategoryModal } from '@/components/categories/CategoryModal'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PageHeader } from '@/components/layout/PageHeader'
import { invalidateOccurrences } from '@/lib/invalidate'

export function CategoriesPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | undefined>()
  const [deleting, setDeleting] = useState<Category | null>(null)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: categoriesApi.list,
  })
  const { data: activities = [] } = useQuery({ queryKey: ['activities'], queryFn: () => activitiesApi.list() })

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of activities) if (a.categoryId) map.set(a.categoryId, (map.get(a.categoryId) ?? 0) + 1)
    return map
  }, [activities])

  const deleteMutation = useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => {
      setDeleting(null)
      qc.invalidateQueries({ queryKey: ['categories'] })
      qc.invalidateQueries({ queryKey: ['activities'] })
      invalidateOccurrences(qc)
    },
    onError: (err) => toastError(err, 'Could not delete the category.'),
  })

  async function handleSave(name: string, color: string, icon: string | null) {
    if (editing) await categoriesApi.update(editing.id, { name, color, icon })
    else await categoriesApi.create({ name, color, icon })
    qc.invalidateQueries({ queryKey: ['categories'] })
    qc.invalidateQueries({ queryKey: ['activities'] })
    invalidateOccurrences(qc)
  }

  function openAdd() {
    setEditing(undefined)
    setModalOpen(true)
  }

  function openEdit(cat: Category) {
    setEditing(cat)
    setModalOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Categories"
        action={
          <button
            onClick={openAdd}
            aria-label="Add category"
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
          ) : categories.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Shapes className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No categories yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  A category gives its activities a colour and an icon everywhere they appear.
                </p>
              </div>
              <button
                onClick={openAdd}
                className="flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                New Category
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <ul className="divide-y divide-border">
                {categories.map((cat) => {
                  const count = counts.get(cat.id) ?? 0
                  return (
                    <li key={cat.id} className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted"
                        style={{ backgroundColor: `${cat.color}1f` }}
                      >
                        <CategoryIcon icon={cat.icon} color={cat.color} size={15} strokeWidth={2} />
                      </span>
                      <button onClick={() => openEdit(cat)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-sm text-foreground">{cat.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {count} {count === 1 ? 'activity' : 'activities'}
                        </span>
                      </button>
                      <ActionMenu
                        ariaLabel={`Actions for ${cat.name}`}
                        iconClassName="h-3.5 w-3.5"
                        items={[
                          {
                            icon: ListTodo,
                            label: 'View occurrences',
                            onClick: () => navigate(`/occurrences/all?category=${cat.id}`),
                          },
                          { icon: Pencil, label: 'Edit', onClick: () => openEdit(cat) },
                          'separator',
                          { icon: Trash2, label: 'Delete', onClick: () => setDeleting(cat), destructive: true },
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

      <CategoryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        category={editing}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        loading={deleteMutation.isPending}
        title="Delete category?"
        message={`"${deleting?.name ?? ''}" will be deleted. Activities in this category will be kept without a category.`}
      />
    </div>
  )
}
