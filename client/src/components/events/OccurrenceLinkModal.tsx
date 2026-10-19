import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { EventModal } from '@/components/events/EventModal'
import { occurrencesApi } from '@/lib/api'
import { toastError } from '@/store/toasts'

const PARAM = 'occurrence'

/** Opens the occurrence named by `?occurrence=<id>` on any page: where a tapped reminder lands. */
export function OccurrenceLinkModal() {
  const [params, setParams] = useSearchParams()
  const id = params.get(PARAM)

  const { data: occurrence, error } = useQuery({
    queryKey: ['events', 'link', id],
    queryFn: () => occurrencesApi.get(id!),
    enabled: Boolean(id),
    retry: false,
  })

  function close() {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete(PARAM)
      return next
    }, { replace: true })
  }

  useEffect(() => {
    if (!error) return
    toastError(error, 'That occurrence no longer exists.')
    close()
    // close only touches the URL; rerunning it per render would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  if (!id || !occurrence || occurrence.id !== id) return null
  return <EventModal key={occurrence.id} open onClose={close} occurrence={occurrence} />
}
