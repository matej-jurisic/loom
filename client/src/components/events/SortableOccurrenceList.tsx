import type { ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Occurrence } from '@/lib/types'
import type { RowDrag } from '@/components/events/OccurrenceListRow'

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

interface SortableOccurrenceListProps {
  items: Occurrence[]
  /** The section's ids, top to bottom, after a drop that moved something. */
  onReorder: (ids: string[]) => void
  renderRow: (o: Occurrence, drag: RowDrag) => ReactNode
}

/** One list section whose rows can be dragged by their grip. Each section is its own drag scope. */
export function SortableOccurrenceList({ items, onReorder, renderRow }: SortableOccurrenceListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = items.map((o) => o.id)

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalOnly]} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul>
          {items.map((o) => (
            <SortableRow key={o.id} occurrence={o} renderRow={renderRow} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

function SortableRow({ occurrence, renderRow }: { occurrence: Occurrence; renderRow: SortableOccurrenceListProps['renderRow'] }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: occurrence.id,
  })
  return renderRow(occurrence, {
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    handle: { ref: setActivatorNodeRef, ...attributes, ...listeners },
    dragging: isDragging,
  })
}
