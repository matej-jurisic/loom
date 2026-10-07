import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { occurrencesApi } from '@/lib/api'
import { invalidateOccurrences } from '@/lib/invalidate'
import { toastError } from '@/store/toasts'
import type { Occurrence } from '@/lib/types'

const MAX_NOTES_LENGTH = 4000

export function OccurrenceNotes({ occurrence }: { occurrence: Occurrence }) {
  const qc = useQueryClient()
  const [text, setText] = useState(occurrence.notes ?? '')
  const textRef = useRef(text)
  const savedRef = useRef(occurrence.notes ?? '')

  function save() {
    const next = textRef.current.trim()
    const previous = savedRef.current
    if (next === previous) return
    savedRef.current = next
    occurrencesApi
      .patch(occurrence.id, { notes: next || null })
      .then((updated) => {
        qc.setQueriesData<Occurrence[]>({ queryKey: ['events'] }, (old) =>
          Array.isArray(old) ? old.map((o) => (o.id === updated.id ? updated : o)) : old,
        )
        invalidateOccurrences(qc)
      })
      .catch((err) => {
        if (savedRef.current === next) savedRef.current = previous
        toastError(err, 'Could not save the notes.')
      })
  }

  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => () => saveRef.current(), [])

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={`occurrence-notes-${occurrence.id}`}
        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Notes
      </label>
      <textarea
        id={`occurrence-notes-${occurrence.id}`}
        value={text}
        onChange={(e) => {
          textRef.current = e.target.value
          setText(e.target.value)
        }}
        onBlur={save}
        maxLength={MAX_NOTES_LENGTH}
        rows={3}
        className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
      />
    </div>
  )
}
