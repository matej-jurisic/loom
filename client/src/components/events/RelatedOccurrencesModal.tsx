import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EventModal } from '@/components/events/EventModal'
import { OccurrenceListRow } from '@/components/events/OccurrenceListRow'
import { occurrencesApi } from '@/lib/api'
import { formatOccurrenceDate, relatedSections } from '@/lib/occurrenceView'
import { toastError } from '@/store/toasts'
import type { Occurrence } from '@/lib/types'

/** Every occurrence linked to this one by a deadline or related link, a section per role. */
export function RelatedOccurrencesModal({
  open,
  occurrence,
  onClose,
}: {
  open: boolean
  occurrence: Occurrence
  onClose: () => void
}) {
  const [editing, setEditing] = useState<Occurrence | undefined>()

  // The Occurrences page's own query, so the two share one cache entry.
  const { data: all, isError, error } = useQuery({
    queryKey: ['events', 'all'],
    queryFn: () => occurrencesApi.list(),
    enabled: open,
  })

  useEffect(() => {
    if (open && isError) {
      toastError(error)
      onClose()
    }
  }, [open, isError, error, onClose])

  const sections = useMemo(() => relatedSections(all ?? [], occurrence), [all, occurrence])

  return (
    <>
      <Modal
        open={open && !!all}
        onClose={onClose}
        title={`${occurrence.effectiveTitle} - related`}
        footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
      >
        {sections.length === 0 ? (
          <p className="flex h-24 items-center justify-center rounded-lg border border-border px-3 text-center text-sm text-muted-foreground">
            Nothing linked.
          </p>
        ) : (
          sections.map((s) => (
            <div key={s.key} className="flex flex-col gap-2">
              <h3 className="flex items-baseline gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {s.label}
                <span className="font-normal opacity-60">{s.items.length}</span>
              </h3>
              <ul className="rounded-lg border border-border">
                {s.items.map((o) => (
                  <OccurrenceListRow
                    key={o.id}
                    occurrence={o}
                    timeText={formatOccurrenceDate(o) || null}
                    onEdit={setEditing}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </Modal>
      <EventModal
        key={editing?.id ?? 'none'}
        open={editing !== undefined}
        onClose={() => setEditing(undefined)}
        occurrence={editing}
      />
    </>
  )
}
