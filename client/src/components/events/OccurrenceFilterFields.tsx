import { useQuery } from '@tanstack/react-query'
import { CircleCheck, Hash, Layers, Shapes, Target } from 'lucide-react'
import { categoriesApi, goalsApi, tagsApi } from '@/lib/api'
import {
  GROUP_OPTIONS,
  NONE_FILTER,
  STATUS_OPTIONS,
  type OccurrenceGroupBy,
  type OccurrenceView,
  type StatusFilter,
} from '@/lib/occurrenceView'
import { Select } from '@/components/ui/Select'

interface OccurrenceFilterFieldsProps {
  value: Omit<OccurrenceView, 'search'>
  onChange: (patch: Partial<OccurrenceView>) => void
}

/** The status / category / tag / goal / grouping selects, shared by the Occurrences page and the list modal. */
export function OccurrenceFilterFields({ value, onChange }: OccurrenceFilterFieldsProps) {
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list })
  const { data: tags = [] } = useQuery({ queryKey: ['tags'], queryFn: tagsApi.list })
  const { data: goals = [] } = useQuery({ queryKey: ['goals'], queryFn: () => goalsApi.list() })

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Select
        icon={<CircleCheck className="h-4 w-4" strokeWidth={2} />}
        value={value.status}
        onChange={(v) => onChange({ status: v as StatusFilter })}
        options={STATUS_OPTIONS}
      />
      <Select
        // Five selects in two columns leave one alone: category takes the last row whole on mobile.
        className="order-last col-span-2 sm:order-none sm:col-span-1"
        icon={<Shapes className="h-4 w-4" strokeWidth={2} />}
        value={value.category ?? ''}
        onChange={(v) => onChange({ category: v || null })}
        options={[
          { value: '', label: 'Any category' },
          { value: NONE_FILTER, label: 'No category' },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />
      <Select
        icon={<Hash className="h-4 w-4" strokeWidth={2} />}
        value={value.tag ?? ''}
        onChange={(v) => onChange({ tag: v || null })}
        options={[
          { value: '', label: 'Any tag' },
          { value: NONE_FILTER, label: 'No tag' },
          ...tags.map((t) => ({ value: t.id, label: t.name })),
        ]}
      />
      <Select
        icon={<Target className="h-4 w-4" strokeWidth={2} />}
        value={value.goal ?? ''}
        onChange={(v) => onChange({ goal: v || null })}
        options={[
          { value: '', label: 'Any goal' },
          { value: NONE_FILTER, label: 'No goal' },
          ...goals.map((g) => ({ value: g.id, label: g.title })),
        ]}
      />
      <Select
        icon={<Layers className="h-4 w-4" strokeWidth={2} />}
        value={value.group}
        onChange={(v) => onChange({ group: v as OccurrenceGroupBy })}
        options={GROUP_OPTIONS.map((g) => ({ value: g.value, label: `Group: ${g.label}` }))}
      />
    </div>
  )
}
