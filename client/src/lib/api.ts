import { useAuthStore } from '@/store/auth'
import { getServerUrl, isNative, getNativeRefreshToken, setNativeRefreshToken } from './server-config'
import type { AuthResponse, User, Goal, GoalStatus, GoalHeatmap, Checkpoint, CheckpointStatus, UserSettings, Category, Tag, Activity, ActivitySubtask, ActivityWorkType, Occurrence, Insights } from './types'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// ok: signed in again. denied: the server rejected the session, so the user must log in.
// unreachable: no answer (offline, server down, proxy error), so the session may still be good.
export type RefreshOutcome = 'ok' | 'denied' | 'unreachable'

const UNREACHABLE_MESSAGE = 'Cannot reach the server. Check your connection.'

let refreshPromise: Promise<RefreshOutcome> | null = null

export async function tryRefresh(): Promise<RefreshOutcome> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async (): Promise<RefreshOutcome> => {
    try {
      const headers: Record<string, string> = {}
      if (isNative()) {
        const stored = getNativeRefreshToken()
        if (!stored) return 'denied'
        headers['X-Refresh-Token'] = stored
      }
      const res = await fetch(getServerUrl() + '/api/auth/refresh', { method: 'POST', credentials: 'include', headers })
      if (res.status >= 500) return 'unreachable'
      if (!res.ok) return 'denied'
      const data = (await res.json()) as AuthResponse
      useAuthStore.getState().setAuth(data.accessToken, data.user)
      if (isNative() && data.refreshToken) setNativeRefreshToken(data.refreshToken)
      return 'ok'
    } catch {
      return 'unreachable'
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = useAuthStore.getState().accessToken
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')

  let res: Response
  try {
    res = await fetch(getServerUrl() + path, { ...init, headers, credentials: 'include' })
  } catch {
    // fetch only rejects when no response arrived at all.
    throw new ApiError(0, UNREACHABLE_MESSAGE)
  }

  if (res.status === 401 && retry) {
    const outcome = await tryRefresh()
    if (outcome === 'ok') return request<T>(path, init, false)
    // An unreachable server says nothing about the session, so keep it rather than logging out.
    if (outcome === 'unreachable') throw new ApiError(0, UNREACHABLE_MESSAGE)
    if (isNative()) setNativeRefreshToken(null)
    useAuthStore.getState().clear()
    throw new ApiError(401, 'Session expired')
  }

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    const message = (body as { detail?: string; title?: string }).detail
      ?? (body as { title?: string }).title
      ?? res.statusText
    throw new ApiError(res.status, message)
  }

  return body as T
}

export const activitiesApi = {
  get: (id: string) => request<Activity>(`/api/activities/${id}`),

  list: (params?: { goalId?: string; tagId?: string }) => {
    const q = new URLSearchParams()
    if (params?.goalId) q.set('goalId', params.goalId)
    if (params?.tagId) q.set('tagId', params.tagId)
    return request<Activity[]>(`/api/activities${q.size ? `?${q}` : ''}`)
  },

  create: (body: { title: string; categoryId?: string | null; goalIds?: string[]; tagIds?: string[]; repeatAfterDays?: number | null }) =>
    request<Activity>('/api/activities', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: { title: string; categoryId?: string | null; goalIds?: string[]; tagIds: string[]; repeatAfterDays: number | null }) =>
    request<Activity>(`/api/activities/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (id: string) => request<void>(`/api/activities/${id}`, { method: 'DELETE' }),
}

export const activitySubtasksApi = {
  create: (activityId: string, body: { title: string }) =>
    request<ActivitySubtask>(`/api/activities/${activityId}/subtasks`, { method: 'POST', body: JSON.stringify(body) }),

  update: (activityId: string, id: string, body: { title: string }) =>
    request<ActivitySubtask>(`/api/activities/${activityId}/subtasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (activityId: string, id: string) =>
    request<void>(`/api/activities/${activityId}/subtasks/${id}`, { method: 'DELETE' }),
}

export const activityWorkTypesApi = {
  create: (activityId: string, body: { title: string }) =>
    request<ActivityWorkType>(`/api/activities/${activityId}/work-types`, { method: 'POST', body: JSON.stringify(body) }),

  update: (activityId: string, id: string, body: { title: string }) =>
    request<ActivityWorkType>(`/api/activities/${activityId}/work-types/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (activityId: string, id: string) =>
    request<void>(`/api/activities/${activityId}/work-types/${id}`, { method: 'DELETE' }),
}

export interface TimeSplitInput {
  workTypeId: string
  minutes: number | null
}

export const occurrenceSubtasksApi = {
  create: (occurrenceId: string, body: { title: string }) =>
    request<Occurrence>(`/api/occurrences/${occurrenceId}/subtasks`, { method: 'POST', body: JSON.stringify(body) }),

  update: (occurrenceId: string, id: string, body: { title: string }) =>
    request<Occurrence>(`/api/occurrences/${occurrenceId}/subtasks/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (occurrenceId: string, id: string) =>
    request<Occurrence>(`/api/occurrences/${occurrenceId}/subtasks/${id}`, { method: 'DELETE' }),
}

// Full subtask set for occurrence updates: id set = keep existing, id null = create new.
// Existing subtasks missing from the list are deleted. Omit the field to leave subtasks untouched.
export interface SubtaskInput {
  id?: string | null
  title: string
}

export const occurrencesApi = {
  list: (params?: { status?: string; startFrom?: string; endBefore?: string; floating?: boolean; goalId?: string; activityId?: string }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    if (params?.startFrom) q.set('startFrom', params.startFrom)
    if (params?.endBefore) q.set('endBefore', params.endBefore)
    if (params?.floating) q.set('floating', 'true')
    if (params?.goalId) q.set('goalId', params.goalId)
    if (params?.activityId) q.set('activityId', params.activityId)
    return request<Occurrence[]>(`/api/occurrences${q.size ? `?${q}` : ''}`)
  },

  get: (id: string) => request<Occurrence>(`/api/occurrences/${id}`),

  create: (body: { activityId: string; title?: string | null; startAt?: string | null; endAt?: string | null; isAllDay?: boolean; isPlanned?: boolean; deadlineOccurrenceId?: string | null }) =>
    request<Occurrence>('/api/occurrences', { method: 'POST', body: JSON.stringify(body) }),

  patch: (id: string, body: { activityId?: string; title?: string | null; startAt?: string | null; endAt?: string | null; isAllDay?: boolean; isPlanned?: boolean; subtasks?: SubtaskInput[]; deadlineOccurrenceId?: string | null; notes?: string | null }) =>
    request<Occurrence>(`/api/occurrences/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: (id: string) => request<void>(`/api/occurrences/${id}`, { method: 'DELETE' }),

  // Wipes occurrences (and events); activities, categories and goals stay. pastOnly keeps today onward.
  clearAll: (pastOnly = false) =>
    request<void>(`/api/occurrences${pastOnly ? '?pastOnly=true' : ''}`, { method: 'DELETE' }),

  setStatus: (id: string, status: import('./types').EventStatus) =>
    request<Occurrence>(`/api/occurrences/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  repeat: (id: string, isPlanned: boolean) =>
    request<Occurrence>(`/api/occurrences/${id}/repeat`, { method: 'POST', body: JSON.stringify({ isPlanned }) }),

  toggleSubtask: (id: string, subtaskId: string) =>
    request<Occurrence>(`/api/occurrences/${id}/subtasks/${subtaskId}/toggle`, { method: 'POST' }),

  setTimeSplit: (id: string, rows: TimeSplitInput[]) =>
    request<Occurrence>(`/api/occurrences/${id}/time-split`, { method: 'PUT', body: JSON.stringify({ rows }) }),

  createEvent: (body: { title: string; categoryId?: string | null; goalIds?: string[]; startAt?: string | null; endAt?: string | null; isAllDay?: boolean; isPlanned?: boolean; deadlineOccurrenceId?: string | null }) =>
    request<Occurrence>('/api/occurrences/event', { method: 'POST', body: JSON.stringify(body) }),

  updateEvent: (id: string, body: { title: string; categoryId?: string | null; goalIds?: string[]; startAt?: string | null; endAt?: string | null; isAllDay?: boolean; isPlanned?: boolean; subtasks?: SubtaskInput[]; deadlineOccurrenceId?: string | null; clearDeadline?: boolean }) =>
    request<Occurrence>(`/api/occurrences/${id}/event`, { method: 'PUT', body: JSON.stringify(body) }),
}

export const goalsApi = {
  list: (params?: { status?: string }) => {
    const q = new URLSearchParams()
    if (params?.status) q.set('status', params.status)
    return request<Goal[]>(`/api/goals${q.size ? `?${q}` : ''}`)
  },

  get: (id: string) => request<Goal>(`/api/goals/${id}`),

  create: (body: { title: string; description?: string | null; notes?: string | null }) =>
    request<Goal>('/api/goals', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: { title: string; description?: string | null; notes?: string | null }) =>
    request<Goal>(`/api/goals/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (id: string) => request<void>(`/api/goals/${id}`, { method: 'DELETE' }),

  setStatus: (id: string, status: GoalStatus) =>
    request<Goal>(`/api/goals/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  // Combined heatmap across every goal-linked activity, regardless of goal status.
  heatmap: () => request<GoalHeatmap>('/api/goals/heatmap'),
}

export const checkpointsApi = {
  create: (goalId: string, body: { title: string; size: string; targetDate?: string | null }) =>
    request<Checkpoint>(`/api/goals/${goalId}/checkpoints`, { method: 'POST', body: JSON.stringify(body) }),

  update: (goalId: string, id: string, body: { title: string; size: string; targetDate?: string | null }) =>
    request<Checkpoint>(`/api/goals/${goalId}/checkpoints/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  delete: (goalId: string, id: string) =>
    request<void>(`/api/goals/${goalId}/checkpoints/${id}`, { method: 'DELETE' }),

  setStatus: (goalId: string, id: string, status: CheckpointStatus) =>
    request<Checkpoint>(`/api/goals/${goalId}/checkpoints/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
}

export const settingsApi = {
  get: () => request<UserSettings>('/api/settings'),
  update: (body: { maxFocusGoals: number; dayBoundaryTime: string; timezone: string }) =>
    request<UserSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
}

export const categoriesApi = {
  list: () => request<Category[]>('/api/categories'),
  create: (body: { name: string; color: string; icon?: string | null }) =>
    request<Category>('/api/categories', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name: string; color: string; icon?: string | null }) =>
    request<Category>(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/api/categories/${id}`, { method: 'DELETE' }),
}

export const tagsApi = {
  list: () => request<Tag[]>('/api/tags'),
  create: (body: { name: string }) =>
    request<Tag>('/api/tags', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: { name: string }) =>
    request<Tag>(`/api/tags/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => request<void>(`/api/tags/${id}`, { method: 'DELETE' }),
}

export const insightsApi = {
  get: (period: number = 30) => request<Insights>(`/api/insights?period=${period}`),
}

// Full data snapshot for external analysis; shape mirrors ExportDto and is not pinned in types.ts.
export const exportApi = {
  get: () => request<Record<string, unknown>>('/api/export'),
}

export const authApi = {
  register: (username: string, password: string, timezone: string) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, timezone }),
    }, false),

  login: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }, false),

  refresh: () =>
    request<AuthResponse>('/api/auth/refresh', { method: 'POST' }, false),

  logout: () => {
    const headers: Record<string, string> = {}
    if (isNative()) {
      const stored = getNativeRefreshToken()
      if (stored) headers['X-Refresh-Token'] = stored
      setNativeRefreshToken(null)
    }
    return request<void>('/api/auth/logout', { method: 'POST', headers })
  },

  me: () =>
    request<User>('/api/auth/me'),
}
