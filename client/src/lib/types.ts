export interface User {
  id: string
  username: string
  timezone: string
}

export interface AuthResponse {
  accessToken: string
  user: User
  refreshToken?: string
}

export type EventStatus = 'pending' | 'done' | 'skipped'
export type GoalStatus = 'focus' | 'active' | 'bench' | 'closed'
export type CheckpointStatus = 'pending' | 'reached'
export type CheckpointSize = 'tiny' | 'small' | 'normal' | 'big' | 'huge'
export type ActivityKind = 'activity' | 'event'

export interface GoalSummary {
  id: string
  title: string
  status: GoalStatus
}

export interface Checkpoint {
  id: string
  goalId: string
  title: string
  size: CheckpointSize
  targetDate: string | null
  status: CheckpointStatus
  createdAt: string
}

export interface GoalOccurrenceStats {
  done: number
  skipped: number
  pending: number
}

/** One day of an ongoing goal's history. Days with nothing on them are not sent. */
export interface GoalHeatmapDay {
  date: string // yyyy-MM-dd, in the user's timezone offset by the day boundary
  done: number
  skipped: number
}

export interface GoalHeatmap {
  start: string // yyyy-MM-dd
  end: string   // yyyy-MM-dd, the server's "today"
  days: GoalHeatmapDay[]
}

export interface Goal {
  id: string
  userId: string
  title: string
  description: string | null
  notes: string | null
  status: GoalStatus
  createdAt: string
  checkpoints: Checkpoint[]
  occurrenceStats: GoalOccurrenceStats | null
  lastOccurrenceAt: string | null
  daysSinceLastOccurrence: number | null
  heatmap: GoalHeatmap | null
}

export interface CategorySummary {
  id: string
  name: string
  color: string
  icon: string | null
}

export interface Category {
  id: string
  userId: string
  name: string
  color: string
  icon: string | null
  createdAt: string
}

export interface ActivitySubtask {
  id: string
  activityId: string
  title: string
  createdAt: string
}

export interface OccurrenceSubtask {
  id: string
  occurrenceId: string
  title: string
  isDone: boolean
  createdAt: string
}

export interface ActivityWorkType {
  id: string
  activityId: string
  title: string
  createdAt: string
}

export interface TimeSplitRow {
  id: string
  workTypeId: string
  title: string
  minutes: number
  isPinned: boolean
}

export interface Activity {
  id: string
  userId: string
  title: string
  categoryId: string | null
  kind: ActivityKind
  createdAt: string
  category: CategorySummary | null
  goals: GoalSummary[]
  subtasks: ActivitySubtask[]
  workTypes: ActivityWorkType[]
  /** Occurrences in the last year. Only the list endpoint fills it; single-activity responses send 0. */
  recentOccurrenceCount: number
}

export interface Occurrence {
  id: string
  userId: string
  activityId: string
  title: string | null
  notes: string | null
  effectiveTitle: string
  startAt: string | null
  endAt: string | null
  status: EventStatus
  isAllDay: boolean
  isPlanned: boolean
  createdAt: string
  isOverdue: boolean
  subtasks: OccurrenceSubtask[]
  timeSplit: TimeSplitRow[]
  activity: Activity
  deadlineOccurrenceId: string | null
  deadline: DeadlineRef | null
  linkedDoneCount: number
  linkedDoneMinutes: number
}

export interface DeadlineRef {
  id: string
  effectiveTitle: string
  startAt: string | null
  endAt: string | null
  isAllDay: boolean
  status: EventStatus
}

export interface InsightsWorkType {
  workTypeId: string
  title: string
  timeMinutes: number
}

export interface InsightsActivity {
  activityId: string
  title: string
  categoryColor: string | null
  timeMinutes: number
  count: number
  workTypes: InsightsWorkType[]
}

export interface InsightsCategory {
  categoryId: string | null
  name: string | null
  color: string | null
  icon: string | null
  done: number
  timeMinutes: number
}

export interface Insights {
  activities: InsightsActivity[]
  categories: InsightsCategory[]
}

export interface UserSettings {
  userId: string
  maxFocusGoals: number
  dayBoundaryTime: string // "HH:mm"
  timezone: string // IANA id
}
