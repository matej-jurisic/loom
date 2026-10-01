import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { activityWorkTypesApi, occurrencesApi } from '@/lib/api'
import { durationMinutes, formatMinutes, parseMinutes, resolveSplit } from '@/lib/timeSplit'
import { toastError } from '@/store/toasts'
import type { Occurrence } from '@/lib/types'

interface Row {
  workTypeId: string
  title: string
  minutes: number | null
}

interface WorkType {
  id: string
  title: string
}

const SHADES = [100, 62, 38, 80, 50, 28]
const STEP = 15
const MIN_SEGMENT = 5

function shade(base: string, index: number): string {
  return `color-mix(in srgb, ${base} ${SHADES[index % SHADES.length]}%, var(--background))`
}

function initialTypes(o: Occurrence): WorkType[] {
  const known = o.activity.workTypes.map(({ id, title }) => ({ id, title }))
  const ids = new Set(known.map((t) => t.id))
  const removed = o.timeSplit
    .filter((r) => !ids.has(r.workTypeId))
    .map((r) => ({ id: r.workTypeId, title: r.title }))
  return [...known, ...removed]
}

function initialRows(o: Occurrence): Row[] {
  return o.timeSplit.map((r) => ({
    workTypeId: r.workTypeId,
    title: r.title,
    minutes: r.isPinned ? r.minutes : null,
  }))
}

export function TimeSplitEditor({ occurrence }: { occurrence: Occurrence }) {
  const qc = useQueryClient()
  const duration = durationMinutes(occurrence.startAt, occurrence.endAt)
  const base = occurrence.activity.category?.color ?? 'var(--primary)'

  const [types, setTypes] = useState<WorkType[]>(() => initialTypes(occurrence))
  const [rows, setRows] = useState<Row[]>(() => initialRows(occurrence))
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const savedRef = useRef<Row[]>(rows)
  const dragRef = useRef<Row[] | null>(null)
  const cancelEditRef = useRef(false)
  const barRef = useRef<HTMLDivElement>(null)

  const saveMutation = useMutation({
    mutationFn: (next: Row[]) =>
      occurrencesApi.setTimeSplit(
        occurrence.id,
        next.map((r) => ({ workTypeId: r.workTypeId, minutes: r.minutes })),
      ),
    onSuccess: (updated, next) => {
      savedRef.current = next
      qc.setQueriesData<Occurrence[]>({ queryKey: ['events'] }, (old) =>
        Array.isArray(old) ? old.map((o) => (o.id === updated.id ? updated : o)) : old,
      )
      qc.invalidateQueries({ queryKey: ['events'] })
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
    onError: (err) => {
      setRows(savedRef.current)
      toastError(err, 'Could not save the time split.')
    },
  })

  const createMutation = useMutation({
    mutationFn: (title: string) => activityWorkTypesApi.create(occurrence.activityId, { title }),
    onSuccess: (created) => {
      const type = { id: created.id, title: created.title }
      setTypes((prev) => (prev.some((t) => t.id === type.id) ? prev : [...prev, type]))
      commit([...rows, { workTypeId: type.id, title: type.title, minutes: null }])
      setNewTitle('')
      setAdding(false)
      qc.invalidateQueries({ queryKey: ['activities'] })
    },
    onError: (err) => toastError(err, 'Could not add the work type.'),
  })

  const resolved = resolveSplit(duration, rows.map((r) => r.minutes))

  if (duration === 0 || occurrence.isAllDay) return null

  const allocated = resolved.reduce((sum, m) => sum + m, 0)
  const unallocated = Math.max(0, duration - allocated)
  const hasAuto = rows.some((r) => r.minutes === null)

  function commit(next: Row[]) {
    setRows(next)
    saveMutation.mutate(next)
  }

  function toggle(type: WorkType) {
    commit(
      rows.some((r) => r.workTypeId === type.id)
        ? rows.filter((r) => r.workTypeId !== type.id)
        : [...rows, { workTypeId: type.id, title: type.title, minutes: null }],
    )
  }

  function maxFor(index: number): number {
    return duration - rows.reduce((sum, r, i) => sum + (i === index ? 0 : (r.minutes ?? 0)), 0)
  }

  function pin(index: number, value: number) {
    const max = maxFor(index)
    if (max < 1) return
    const minutes = Math.min(Math.max(1, value), max)
    commit(rows.map((r, i) => (i === index ? { ...r, minutes } : r)))
  }

  function unpin(index: number) {
    commit(rows.map((r, i) => (i === index ? { ...r, minutes: null } : r)))
  }

  function finishEdit(index: number) {
    const draft = editing
    setEditing(null)
    if (cancelEditRef.current) {
      cancelEditRef.current = false
      return
    }
    if (!draft || draft.text.trim() === formatMinutes(resolved[index])) return
    const value = parseMinutes(draft.text)
    if (value === null || value < 1) return
    pin(index, value)
  }

  function submitNew() {
    const title = newTitle.trim()
    if (!title) {
      setAdding(false)
      return
    }
    if (createMutation.isPending) return
    const match = types.find((t) => t.title.toLowerCase() === title.toLowerCase())
    if (!match) {
      createMutation.mutate(title)
      return
    }
    if (!rows.some((r) => r.workTypeId === match.id)) toggle(match)
    setNewTitle('')
    setAdding(false)
  }

  function startDrag(index: number, e: ReactPointerEvent<HTMLDivElement>) {
    const bar = barRef.current
    if (!bar) return
    e.preventDefault()

    const rect = bar.getBoundingClientRect()
    const start = resolved.slice(0, index).reduce((sum, m) => sum + m, 0)
    const hasNext = index < rows.length - 1
    const end = hasNext ? start + resolved[index] + resolved[index + 1] : duration
    const lo = start + MIN_SEGMENT
    const hi = hasNext ? end - MIN_SEGMENT : end
    if (lo > hi) return

    const snap = duration >= 60 ? STEP : MIN_SEGMENT
    const origin = rows

    const move = (ev: PointerEvent) => {
      const raw = ((ev.clientX - rect.left) / rect.width) * duration
      const boundary = Math.min(hi, Math.max(lo, Math.round(raw / snap) * snap))
      const next = origin.map((r, i) => {
        if (i === index) return { ...r, minutes: boundary - start }
        if (hasNext && i === index + 1) return { ...r, minutes: end - boundary }
        return r
      })
      dragRef.current = next
      setRows(next)
    }

    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const next = dragRef.current
      dragRef.current = null
      if (next) saveMutation.mutate(next)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Time split
        </span>
        {rows.length > 0 && unallocated > 0 && (
          <span className="text-xs text-muted-foreground">{formatMinutes(unallocated)} not split</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {types.map((t) => {
          const active = rows.some((r) => r.workTypeId === t.id)
          return (
            <button
              key={t.id}
              onClick={() => toggle(t)}
              aria-pressed={active}
              className={`max-w-full truncate rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.title}
            </button>
          )
        })}
        {adding ? (
          <input
            autoFocus
            type="text"
            value={newTitle}
            maxLength={255}
            enterKeyHint="done"
            placeholder="Work type"
            onChange={(e) => setNewTitle(e.target.value)}
            onBlur={() => { if (!newTitle.trim()) setAdding(false) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitNew()
              }
              if (e.key === 'Escape') {
                e.nativeEvent.stopPropagation()
                setNewTitle('')
                setAdding(false)
              }
            }}
            className="h-6 w-32 rounded-full border border-input bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="h-3 w-3" strokeWidth={2} />
            Work type
          </button>
        )}
      </div>

      {rows.length > 0 && (
        <>
          <div ref={barRef} className="relative h-3">
            <div className="flex h-full overflow-hidden rounded-full bg-muted">
              {rows.map((r, i) => (
                <div
                  key={r.workTypeId}
                  title={`${r.title}, ${formatMinutes(resolved[i])}`}
                  style={{ width: `${(resolved[i] / duration) * 100}%`, backgroundColor: shade(base, i) }}
                />
              ))}
            </div>
            {rows.map((r, i) => {
              if (i === rows.length - 1 && hasAuto) return null
              const edge = resolved.slice(0, i + 1).reduce((sum, m) => sum + m, 0)
              return (
                <div
                  key={r.workTypeId}
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={(e) => startDrag(i, e)}
                  className="absolute -top-1 hidden h-5 w-3 -translate-x-1/2 cursor-col-resize touch-none sm:block"
                  style={{ left: `${(edge / duration) * 100}%` }}
                >
                  <div className="mx-auto h-full w-0.5 rounded-full bg-foreground/50" />
                </div>
              )
            })}
          </div>

          <ul className="flex flex-col">
            {rows.map((r, i) => {
              const pinned = r.minutes !== null
              const isEditing = editing?.id === r.workTypeId
              return (
                <li key={r.workTypeId} className="flex items-center gap-2 py-1">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: shade(base, i) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.title}</span>
                  <button
                    onClick={() => pin(i, resolved[i] - STEP)}
                    disabled={resolved[i] <= STEP}
                    aria-label={`15 minutes less for ${r.title}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 sm:hidden"
                  >
                    <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  <input
                    type="text"
                    value={isEditing ? editing.text : formatMinutes(resolved[i])}
                    aria-label={`Time for ${r.title}`}
                    onFocus={(e) => {
                      setEditing({ id: r.workTypeId, text: formatMinutes(resolved[i]) })
                      e.target.select()
                    }}
                    onChange={(e) => setEditing({ id: r.workTypeId, text: e.target.value })}
                    onBlur={() => finishEdit(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') {
                        e.nativeEvent.stopPropagation()
                        cancelEditRef.current = true
                        e.currentTarget.blur()
                      }
                    }}
                    className={`h-7 w-[4.5rem] shrink-0 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring ${
                      pinned ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  />
                  <button
                    onClick={() => pin(i, resolved[i] + STEP)}
                    disabled={resolved[i] >= maxFor(i)}
                    aria-label={`15 minutes more for ${r.title}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 sm:hidden"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  </button>
                  {pinned ? (
                    <button
                      onClick={() => unpin(i)}
                      title="Share the remaining time"
                      aria-label={`Share the remaining time with ${r.title}`}
                      className="flex h-7 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  ) : (
                    <span className="w-8 shrink-0 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
                      auto
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
