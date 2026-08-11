import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, SkipForward } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { occurrencesApi } from '@/lib/api'
import { toastError } from '@/store/toasts'
import type { Occurrence } from '@/lib/types'

// A drop that landed on a different date than the occurrence was on. The page hands
// the resolved target over instead of committing, because the two readings of that
// gesture ("it moved" vs "it didn't happen, do it later") are both plausible and only
// the user knows which. `commit` is the page's own move, kept as a callback so each
// drop kind (grid drag, all-day pill, timed to all-day) applies its own optimistic update.
export interface PendingMove {
  occurrence: Occurrence
  startAt: string
  endAt: string | null
  isAllDay: boolean
  commit: () => void
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

interface MoveOrSkipModalProps {
  open: boolean
  onClose: () => void
  move: PendingMove | null
}

export function MoveOrSkipModal({ open, onClose, move }: MoveOrSkipModalProps) {
  const qc = useQueryClient()
  const [pending, setPending] = useState(false)

  if (!move) return null

  const { occurrence, startAt, endAt, isAllDay } = move

  async function skipAndReschedule() {
    setPending(true)
    try {
      await occurrencesApi.setStatus(occurrence.id, 'skipped')
      await occurrencesApi.create({
        activityId: occurrence.activityId,
        title: occurrence.title,
        startAt,
        endAt,
        isAllDay,
        isPlanned: occurrence.isPlanned,
        durationMinutes: occurrence.durationMinutes,
      })
      qc.invalidateQueries({ queryKey: ['events'] })
      onClose()
    } catch (err) {
      toastError(err, 'Could not skip and reschedule the occurrence.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Move to ${formatDay(startAt)}?`}
    >
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => { move!.commit(); onClose() }}
          className="flex items-center gap-3 rounded-lg border border-border p-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
          Move
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={skipAndReschedule}
          className="flex items-center gap-3 rounded-lg border border-border p-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <SkipForward className="h-4 w-4 shrink-0 text-primary" />
          Skip &amp; reschedule
        </button>
      </div>
    </Modal>
  )
}
