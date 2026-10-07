import { useState } from 'react'
import type { Activity, Occurrence } from '@/lib/types'

export function useCalendarModals() {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingOccurrence, setEditingOccurrence] = useState<Occurrence | undefined>()
  const [defaultStartAt, setDefaultStartAt] = useState<string | undefined>()
  const [defaultEndAt, setDefaultEndAt] = useState<string | undefined>()
  const [focusStartAt, setFocusStartAt] = useState(false)
  const [scheduleMode, setScheduleMode] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailEvent, setDetailEvent] = useState<Occurrence | null>(null)
  const [activityModalOpen, setActivityModalOpen] = useState(false)
  const [editingActivity, setEditingActivity] = useState<Activity | undefined>()
  const [duplicateFromOccurrence, setDuplicateFromOccurrence] = useState<Occurrence | undefined>()

  function openCreate(startAt?: string, endAt?: string) {
    setDuplicateFromOccurrence(undefined)
    setEditingOccurrence(undefined)
    setDefaultStartAt(startAt)
    setDefaultEndAt(endAt)
    setFocusStartAt(false)
    setScheduleMode(false)
    setModalOpen(true)
  }

  function openDuplicate(o: Occurrence) {
    setDetailOpen(false)
    setDetailEvent(null)
    setEditingOccurrence(undefined)
    setDefaultStartAt(undefined)
    setDefaultEndAt(undefined)
    setDuplicateFromOccurrence(o)
    setFocusStartAt(false)
    setScheduleMode(false)
    setModalOpen(true)
  }

  function openDetail(o: Occurrence) {
    setDetailEvent(o)
    setDetailOpen(true)
  }

  function openEditActivity(a: Activity) {
    setDetailOpen(false)
    setDetailEvent(null)
    setEditingActivity(a)
    setActivityModalOpen(true)
  }

  function openEdit(o: Occurrence) {
    setDuplicateFromOccurrence(undefined)
    setEditingOccurrence(o)
    setDefaultStartAt(undefined)
    setDefaultEndAt(undefined)
    setFocusStartAt(!o.startAt)
    setScheduleMode(false)
    setModalOpen(true)
  }

  function openSchedule(o: Occurrence) {
    setDuplicateFromOccurrence(undefined)
    setEditingOccurrence(o)
    setDefaultStartAt(undefined)
    setDefaultEndAt(undefined)
    setFocusStartAt(true)
    setScheduleMode(true)
    setModalOpen(true)
  }

  return {
    openCreate,
    openDuplicate,
    openDetail,
    openEditActivity,
    openEdit,
    openSchedule,
    eventModal: {
      open: modalOpen,
      close: () => setModalOpen(false),
      occurrence: editingOccurrence,
      duplicateFrom: duplicateFromOccurrence,
      focusStartAt,
      defaultStartAt,
      defaultEndAt,
      scheduleOnly: scheduleMode,
    },
    detail: {
      open: detailOpen,
      close: () => setDetailOpen(false),
      event: detailEvent,
    },
    activityModal: {
      open: activityModalOpen,
      close: () => setActivityModalOpen(false),
      activity: editingActivity,
    },
  }
}
