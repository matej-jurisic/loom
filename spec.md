# Loom — Product Spec

A brain space for goals, deadlines and motivation. Built around three primitives: **Goals**,
**Activities**, and **Occurrences**. Single user in practice; the schema, auth layer, and every query
are scoped by `UserId`.

This document describes what the app does today. Visual rules live in `design.md`; code navigation
and conventions live in `CLAUDE.md`.

## What Loom is not

Loom does not ask you to log your life. There is no suggestion engine, no scheduling model, and no
stat that divides by the length of a day - so **sleep, work and commuting do not belong in it** unless
you want them there for your own reasons. Nothing computes a wrong answer because they are missing.

This is a hard product boundary, and the test for any new feature is:

> Does this still produce a correct answer if the user logs only the things they care about?

A feature that needs a complete calendar to be right - free-slot placement, "unaccounted" time,
inferred availability, anything that reads meaning into an empty hour - fails that test and does not
belong here, however useful it looks. Everything that ships today passes it: totals sum what was
logged, cadence looks only at one activity's own completions, and checkpoint progress is entered by
hand.

The calendar is a **visualization and a fast way to add things**, not a planner and not a log.

---

## Timezone & day semantics

All day-bucketing happens **server-side**, in the user's IANA timezone (`User.Timezone`) offset by
the configurable day boundary (`UserSettings.DayBoundaryTime`).

- A **day** runs from the boundary time to the next day's boundary. With a 04:00 boundary, 02:30
  belongs to the previous day.
- An **occurrence belongs to the day it starts on**. Occurrences that cross midnight are not split;
  the calendar draws them on their start day, clamped to it.
- **"Today"** is the day the current instant falls in, by those rules.
- **Overdue** is computed server-side and shipped as `isOverdue` on the occurrence DTO. The client
  never recomputes it. Purely presentational date formatting stays client-side.
- An unknown timezone id resolves to UTC rather than throwing.
- **Daylight saving:** a day is 23 or 25 hours long on a transition day, and consecutive days always tile
  time with no gap or overlap. A boundary that a spring-forward transition skips (02:30 on the night the
  clocks jump 02:00 to 03:00) falls at the first instant that exists, the end of the gap. One that a
  fall-back repeats falls at its second occurrence.

The implementation is `Loom.Core/Common/DayMath.cs`; every feature that reasons about days goes
through it, via a `DayContext` from `UserSettingsService.GetDayContextAsync`.

---

## Activities

An **Activity** is the definition of a piece of work. An **Occurrence** is one instance of it in
time. Activities are managed at `/activities`.

| Field | Notes |
|---|---|
| Title | Required, max 255 characters |
| Goal | Optional, one goal |
| Category | Optional |
| Kind | `activity` or `event`. Internal, never shown. |
| Subtasks | Ordered checklist template, copied onto every new occurrence. |
| Work types | Labels for the kinds of work a session can be split into. Not copied anywhere. |

Deleting an activity cascades to its occurrences. Deleting a goal or category set-nulls the link and
leaves the activity alive.

`GET /api/activities` also returns a derived `recentOccurrenceCount` per activity: its occurrences in
the last 365 days, each counted from its start, falling back to its deadline and then to when it was
created, with no upper bound so something scheduled for tomorrow still counts. Single-activity
responses leave it at 0. It exists to order the activity picker.

### Kinds: activity vs event

- **`activity`** — a reusable definition. It owns many occurrences and is what `/api/activities`
  lists and what the activity picker offers.
- **`event`** — a one-off. `POST /api/occurrences/event` creates a backing activity row and its
  single occurrence together; `PUT /api/occurrences/{id}/event` edits both (the event's title *is*
  the activity's title); deleting the occurrence deletes the backing row. Events are excluded from
  the activity list endpoint, so nothing can pick one, and the UI shows a Title field instead of an
  activity picker.

### Subtasks

Two levels, deliberately separate:

- **Activity subtasks** are the template: title only, in creation order, CRUD at
  `/api/activities/{id}/subtasks`. Edited in the Edit Activity dialog.
- **Occurrence subtasks** are the copy made when the occurrence is created, and carry `IsDone`. They
  can be toggled from the occurrence detail modal, edited individually, or replaced as a full set on
  an occurrence update (id present = keep and rename, id absent = create, missing = delete, whole
  field omitted = leave untouched).

### Work types

A short list of labels on the activity ("Coding", "Report writing", "Meeting" on "Project work"),
CRUD at `/api/activities/{id}/work-types`, edited in the Edit Activity dialog, or created from
an occurrence's time split. Unlike subtasks they are a vocabulary, not a template: nothing is copied
onto an occurrence, and an occurrence only references the ones it actually used.

- Titles are unique per activity, ignoring case; a duplicate is a 409.
- Renaming keeps every logged row pointing at the same type, so history stays in one bucket.
- Removing a type that has time logged against it archives it: it leaves the activity's list and the
  picker, and the rows that used it keep their label and their time. An unused type is deleted
  outright. Creating a type with an archived one's title restores that one.

---

## Occurrences

| Field | Notes |
|---|---|
| Activity | Required. Which activity this is an instance of. |
| Title | Optional, overrides the activity title for this instance. Max 255. |
| Start datetime | Absent for floating; window start when `IsPlanned`. |
| End datetime | Window end when `IsPlanned`; deadline or span end otherwise. Must be after start. |
| Is all day | Marks a date-only occurrence. |
| Is planned | Marks a flexible/windowed occurrence (dashed on the calendar, never overdue). May be set on a floating occurrence. |
| Status | `pending`, `done`, `skipped`. Marking done clears `IsPlanned`. |
| Subtasks | Per-occurrence checklist with `IsDone`, seeded from the activity's template. |
| Time split | Optional rows of work type + time, saying where this occurrence's time went. |
| Deadline | Optional link to a pending event-kind occurrence (`DeadlineOccurrenceId`). Any occurrence may point at one, including another event, so a draft can feed a final. |

**Deadline link.** A "Lab work" session can point at the "Lab 3 report" event it is working toward.
It is a plain optional reference, so nothing depends on it being filled in: an unlinked occurrence
behaves exactly as before and a partly linked history is still correct.

- The target must be the user's own, event-kind, and pending when the link is set. Self-links and
  loops (A to B to A) are rejected. A link set earlier survives its target later being completed.
- Deleting the target clears the link on whatever pointed at it; nothing cascades either way.
- On a partial update, an absent `DeadlineOccurrenceId` leaves the link alone and an explicit null
  removes it. Create takes the id directly.
- The DTO carries `deadline` (title, dates, status of the target) on the session, and on the target
  `linkedDoneCount` / `linkedDoneMinutes`: completed linked sessions and their summed time (elapsed
  between start and end when both are set, else nothing). Skipped and pending sessions
  contribute nothing. There is deliberately no progress percentage or "on track" signal.
- Skip-and-reschedule, move-or-skip and calendar duplicate carry the link onto the new copy while the
  target is still pending.

**Time split.** One block on the calendar can cover several kinds of work. Instead of one occurrence
per kind, the occurrence carries optional rows, each naming one of its activity's work types
(`PUT /api/occurrences/{id}/time-split`, the full ordered set; an empty list clears it).

- A row is **pinned** (it stores minutes) or **auto** (it stores nothing). Auto rows share whatever
  the pinned rows leave of the occurrence's length (end minus start) equally, leftover minutes going
  to the earliest rows. So picking two types with no numbers is an even split, and typing one number
  leaves the rest to the others. The DTO sends each row's resolved `minutes` and `isPinned`.
- Pinned minutes may add up to less than the length. The remainder is simply the activity's own
  time; an occurrence with no rows, or a partly split one, is still correct.
- Pinned minutes may not add up to more than the length: setting such a split is rejected, and so is
  an update that shortens the occurrence below its pinned total. Auto rows follow a resize. An
  occurrence with no measurable length keeps its rows untouched and unchecked.
- A work type appears at most once per occurrence and must belong to the occurrence's activity.
  Re-pointing the occurrence at another activity drops its rows.
- Copies (skip-and-reschedule, duplicate) start with no split: it records what happened, not a plan.

`effectiveTitle` on the DTO is `title ?? activity.title`. The DTO also carries the full activity
(with its category and goal), which is why occurrence lists are invalidated after an activity write. Legacy `windowStart`/`windowEnd`/`windowDurationMinutes` columns remain on the row
and are honoured by range filtering; nothing in the UI writes them.

### Scheduling states

**Scheduled** — a start datetime and `IsPlanned = false`. Participates in overdue detection and is
drawn as a solid calendar block.

**Due pin** — a start with no end. A deadline rather than a commitment to a span: the grid draws it
30 minutes tall and pins it in the calendar's sticky Due row.

**Planned** — `IsPlanned = true`. `StartAt`/`EndAt` act as window bounds when both are present;
`EndAt` alone is a soft due date; `IsAllDay` marks a flexible all-day task. Drawn as a dashed,
diagonally striped block spanning the window and never overdue - the flag says the time is flexible,
not that a commitment is missing. List views group it under "Planned", except the Daily Plan's
agenda, which keeps a planned occurrence with a start time on the day's timeline where its hour puts
it and reserves its Planned section for the ones with no hour at all.

**Floating** — no start, no end, not all-day. This is the "keep it somewhere" state, and the reason
the app can hold an intention without turning it into an appointment. `IsPlanned` splits where it
surfaces: a planned floating occurrence is already committed to and only needs a time, an unplanned
one is not yet.

The calendar's FLOAT row shows both, planned first, and either can be dragged into the grid to give
it a time. The Daily Plan lists unplanned floating occurrences in its "Floating" group on every day,
since they have no day of their own. On the Categories page a planned floating occurrence groups
under "Planned" and an unplanned one under "Floating". Floating occurrences are never overdue. The
`floating=true` list filter also drops occurrences whose activity is on a benched goal.

**All-day planned** is the other holding state: a date with no time, for something that belongs to a
day without belonging to an hour of it.

### Overdue

An occurrence is overdue when it is pending, not planned, has a start, and:

- it has an end datetime that has passed, **or**
- it is all-day and its calendar date is before today, **or**
- it has a start only and its day has ended (the boundary on the following date has passed).

### Creating, editing, scheduling

One modal covers all of it. It creates either an occurrence of an existing activity (activity picker,
with inline quick-create) or a one-off event (title field). The picker is ordered by how many
occurrences each activity has had in the last year, most first, so the things actually being logged
sit at the top; ties and never-used activities fall back to alphabetical. Time mode is a three-way choice - **due**
(end only), **scheduled** (start, optional end), **floating** (neither) - with `all day` and
`planned` as independent flags. Scheduling an occurrence means giving it a start; rescheduling means
changing it. From the calendar, blocks can be dragged to move, dragged from the FLOAT or all-day row
into the grid, and resized.

**Skip with reschedule.** Marking an occurrence skipped opens a modal offering a new date, defaulting
to the day after the occurrence's own. Confirming skips the original and creates a pending copy with
the start/end shifted to the chosen date.

**Duplicate.** The occurrence detail modal duplicates into a pre-filled create modal. No backend
support is needed: it is a create with copied fields.

**Re-pointing.** An occurrence's activity can be changed after creation, from the same picker used to
create it. `activityId` on the update request is optional: omitting it leaves the link alone. Only
valid between activity-kind activities, and enforced on both ends - an event occurrence cannot be
moved onto an activity, and nothing can be created on or moved onto an event's backing row (that
would give it two occurrences, and deleting either would cascade both away). The main use is
correcting history in bulk after splitting one activity into several.

**Edit activity from a block.** The occurrence detail modal opens the parent activity's editor
directly, shown only for activity-kind rows.

---

## Categories

A user-defined label with a colour and an optional icon, for grouping activities that are not tied to
a goal.

| Field | Notes |
|---|---|
| Name | Required |
| Color | Required, `#RRGGBB` |
| Icon | Optional icon key |

Activities carry an optional `CategoryId`; deleting a category set-nulls it. Categories are managed
inline from the sidebar (desktop) or the Categories page's own list view (mobile) - there is no
separate management page. The category's colour drives every occurrence row and calendar block for
its activities.

---

## Goals

A sustained intention with measurable progress.

| Field | Notes |
|---|---|
| Title | Required |
| Description | Optional |
| Notes | Optional free text; edited in the goal dialog, shown on the expanded card |
| Status | `focus`, `active`, `bench`, `closed` |
| Checkpoints | Unordered list of milestones |

### Status

- **Focus** — what you are actually working on. Shown at the top of the Daily Plan.
- **Active** — live, but not the current focus.
- **Bench** — deprioritised. Its activities are hidden from the calendar's float row.
- **Closed** — archived. Shown dimmed in a Closed section.

The number of simultaneous Focus goals is a user setting and a **hard boundary**: promoting a goal
past the limit returns 409 with a message naming it. Goals are listed grouped Focus → Active → Bench
→ Closed, most recently active first within a group (latest completion across its activities; goals with none fall back to creation order, after the active ones). Deleting a goal removes its checkpoints and set-nulls its
activities.

### Checkpoints

| Field | Notes |
|---|---|
| Title | Required |
| Size | `tiny`, `small`, `normal`, `big`, `huge` — relative weight, not a percentage |
| Target date | Optional |
| Status | `pending`, `reached` |

Checkpoints have no required order and can be reached in any sequence. Progress is
`sum(weight of reached) / sum(weight of all)`, with weights tiny=1, small=2, normal=3, big=5,
huge=8, and 0 when there are no checkpoints. It is computed client-side from the checkpoint list.

### Progress signals

- **Checkpoints**: a goal with checkpoints shows a progress ring (a plain status dot otherwise), a
  weight-proportional composition bar (one segment per checkpoint, sized by its weight, filled when
  reached), and the checkpoints themselves as chips on desktop or a checklist on mobile - each
  toggling reached in place. Goals without checkpoints show none of these.
- **Occurrences**: a goal with linked occurrences shows a heatmap: one square per day for the last 280
  days, across every activity linked to the goal, shaded by how many occurrences were completed that day, with a faint red for a
  day that only holds skips. Days are bucketed server-side in the user's timezone and day boundary,
  so the client never decides which day something belongs to. Pending occurrences are not on the
  grid (nothing has happened yet), and a floating occurrence lands on no day at all. Goals with no
  linked occurrence show no grid rather than an empty one.
  Goals also carry `OccurrenceStats` (lifetime done / skipped / pending counts), rendered as a
  proportional bar on the Plan page's goal chip.
- **Every goal** carries `lastOccurrenceAt`, the most recent completion across its activities, and
  `daysSinceLastOccurrence`, the whole days between that completion's day and today in the user's
  timezone and day boundary (`DayMath`, so a session at 23:00 yesterday is "yesterday" at 08:00).
  Rendered as "active today" / "active 3d ago" / "2w since last"; null reads "no activity yet".
  A Focus goal whose last completion is 14 or more days back shows its recency in emphasised text,
  a quiet hint rather than an alert. It is derived only from what was logged.

---

---

## Views

| Route | Purpose |
|---|---|
| `/plan` | Daily Plan: one day's agenda. Index route. |
| `/calendar` | Day / 3-day / week grid. Visualization, and the fastest way to add something. |
| `/categories` | Occurrence lists per category, plus "Active" and "No category". |
| `/goals` | Goal list grouped by status. Focus goals are always expanded and their section shows slots used (`2/3`); Active, Bench and Closed goals are one-line rows that a chevron expands to checkpoints, notes and heatmap (Closed has no heatmap). Tapping a goal opens its History; the menu edits, adds a checkpoint, changes status or deletes. |
| `/activities` | Activity list; clicking a title edits, the row menu opens History. |
| `/insights` | Totals over what was logged. |
| `/settings` | Preferences, data export, sign out. |

`/inbox` redirects to `/categories`.

Navigation: a 240px desktop sidebar (Daily Plan, Calendar, Goals, Activities, Insights, then the
category list with inline add/edit/delete, and Settings pinned at the bottom); on mobile a 5-slot
bottom bar (Plan, Activities, Calendar, Goals) plus a "More" sheet holding Categories, Insights, and
Settings. Nav items are not `end`-matched, so drilling into a goal or activity keeps the parent item
lit.

### Daily Plan

One day, read as a list. There is no score for the day: no completion ring and no done/left counts,
because those rate how much of a day was executed, which is the planner reading this app is not for.

The page opens on the day's own lists - Unfinished, the agenda, Deadlines, Planned, Floating - and closes with
the goal sections, which are standing context rather than something to clear before starting.

- **Unfinished** — on today's view only, every pending occurrence whose date has passed, regardless
  of the day it was scheduled for, with its date, above the agenda and not in it. Wider than the
  overdue rule: planned occurrences are never *overdue*, but a planned one whose date is behind you
  is listed here too, since not being late is no reason to disappear. Undated (floating) occurrences
  are not included - they have no date to be behind. One button moves the whole set to tomorrow,
  preserving each clock time and each occurrence's planned / all-day flags.
- **Timeline agenda** — every dated occurrence on the day as a spine with a time gutter, split by a
  live **now** marker into past and upcoming, with relative labels ("now", "in 40m") on today. Rows
  carry a one-tap done checkbox, a skip action, and an action menu. A planned occurrence with a start
  time belongs here too, not in the Planned section: it is a commitment on this day like any other,
  and the row says which it is with a `~` on the gutter time and a hollow spine dot - the list-view
  echo of the calendar's dashed block.
- **Deadlines** — every pending **Due** occurrence (the modal's Due type: one date, no span) dated
  today or later, soonest first, each with its date and how many days away it is. Shown on every
  day and always counted from today, not from the day being viewed. It is the complete list, so a
  deadline due today appears here and on the agenda; ones already past are in Unfinished instead.
  The section collapses to its header and count, and the choice is remembered on the device.
- **Planned** — the planned occurrences with no hour to place them at: all-day ones, and windows
  whose start was never set. Below Deadlines.
- **Floating** — unplanned occurrences with no date at all, on every day. Below Planned.
- **Focus goals** — one chip per focus goal: title, last-session recency, its checkpoint
  percentage when it has checkpoints, and its occurrence bar when it has linked occurrences.
- **Goal activity** — a heatmap below the focus chips, same shape and shading as a goal's
  own grid, but summed across every occurrence on an activity linked to *any* goal, regardless of
  that goal's status: "did I work toward something today", not one goal's own record. Only
  completed occurrences count here - a skipped one isn't progress, so it puts no day on this grid
  even though it would on a single goal's own heatmap. Hidden when nothing has ever been logged
  toward a goal.
- Day navigation (prev / next / today / date picker) using the same boundary semantics as the
  calendar.

### Calendar

Day, 3-day, and week views (choice persisted), with prev/next, jump-to-today, and a date picker.

The calendar is a **picture of what you have decided**, not a plan the app made and not a record it
expects you to complete. Empty grid means nothing in particular.

- Scheduled occurrences as solid blocks, planned ones dashed and striped. They are packed in one
  pass, so an overlap renders side by side; every block in a cluster of transitively-overlapping
  spans shares one width.
- A sticky header with an **all-day row** and a **FLOAT row**; occurrences can be dragged between
  those rows, from a row into the grid (which gives them a time), and between day columns.
- **Clicking (or tapping) empty grid creates** a 30-minute occurrence at that quarter hour, pre-filled
  in the create modal. Dragging still sets an exact span, and a long press does it on touch - but the
  cheapest gesture now does the most common thing, which is the calendar's whole job here.
- Drag-to-move and resize on existing blocks, snapping to 15 minutes. Clicking a block opens the
  occurrence detail modal. A dragged block is held inside its day **by its end, not by the pointer**:
  it stops when its bottom edge reaches midnight, however deep into the block it was grabbed. So an
  occurrence cannot be dragged across midnight - the model and the grid both still handle ones that
  do, they are just made in the edit modal.
- **Dropping a pending occurrence on a different date asks first**, since that gesture reads two ways:
  *Move* changes the occurrence's date, and *Skip & reschedule* marks the original day skipped and puts
  a new pending copy on the new date. Dismissing the dialog leaves it where it was. A same-day drag is
  only a time change and commits with no prompt, as does moving a done or skipped occurrence - only a
  pending one can be skipped.
- **Holding Ctrl while dropping a mouse drag duplicates** instead of moving: the original stays put and
  a new pending occurrence of the same activity is created at the drop position (grid, all-day or
  FLOAT). No prompt is shown. Not available on touch.
- A sticky **Due** row keeps due pins and overdue items visible while scrolling.
- The header's **DUE** and **SOON** rows are anchored to *today*, not to the view: DUE lists every
  occurrence still pending and dated before today - all-day or timed, planned or not - so nothing
  unfinished can scroll out of reach; SOON lists due pins from today onward. DUE is deliberately not
  the overdue rule: a planned occurrence is never *overdue*, but it is still listed here, because not
  being late is not a reason to become invisible. Both
  drop anything the visible range already draws, so a row only ever adds what is off-screen. Paging
  forward a week therefore does not mark that week's untouched tasks overdue, and paging backwards
  does not hide the ones that really are. Both rows disappear for the length of a drag, since neither
  accepts a drop and their height alone pushes the real targets into the autoscroll zone.
- Adjustable slot height (zoom controls and pinch, persisted).
- **Compact mode** (toolbar toggle, persisted) drops each day's empty stretches entirely rather than
  shrinking them, leaving the day's actual content at the same scale it always had. However long the
  emptiness between two items, it costs no grid at all: the day's events sit in a straight stack,
  each block keeping its real duration-proportional height and sitting directly against the one
  before it. Only events that genuinely overlap or touch keep their relative position within a run.
  The grid draws no hour lines in this mode - there is no continuous axis for them to sit on.
  In a multi-day view **every column collapses its own emptiness**, so hours do not line up across
  columns - two days with nothing in common have nothing to align on, and a shared scale could only
  collapse what every visible day agreed was empty. The **now line is not drawn in compact mode**:
  between two stacked blocks the grid jumps forward by however long the dropped gap was, so a marker
  at "now" would sit at a position that means nothing. Elided time is elided, marker included.
- **Any drag restores the full 0-24 grid** for the length of the gesture, so moving, resizing,
  creating and dropping in from the header rows all address real times. The grid re-collapses on
  release. Whatever was under the pointer holds its position across both switches, and across zoom.
- On touch only a **deliberate tap** counts: short, still, on a grid that is not moving and was not
  gliding when the finger landed. A scrolling finger looks like a tap at several points - stopping
  momentum, resting before a flick - and none of those may create anything.

### Categories

Three kinds of view over the same occurrence list: **Active** (`?all=true`, every pending occurrence
across all categories), **No category** (the default: occurrences whose activity has no category),
and one per category (`?category={id}`). Rows group into Overdue → Today → Planned → Upcoming →
Floating → Completed/Skipped, with overdue winning over the day grouping.

### Activities

One flat list: title search and a grouping toggle over **Goal / Category / None** (persisted in
`localStorage`). Sections collapse and carry counts; rows sort by title within a section.

Each row leads with a tile in its **category's colour and icon** - the same colour that draws its
occurrences everywhere else - then title and a meta line dropping whatever the section header already
says, then an action menu (history, edit, delete). **Multi-select mode** turns the tiles into
checkboxes and the row actions into a bottom bar: assign, delete, with per-section select-all. Bulk
assign sets goal and category across the selection, each field defaulting to "keep current"; it fans
out over the single-item PUT, resending unchanged fields.

**Activity history** opens read-only from a row's action menu: last done, cadence, usual time, usual
length, an eight-week grid of one cell per day laid out as a calendar, and the ten most recent
occurrences. Every figure is derived in the client from that activity's own occurrences, so it stays
correct however little else is logged.

---

## Insights

Read-only totals over **done occurrences**, computed server-side (`GET /api/insights?period=N`; the
page offers 7, 30, 90 and 365 days and defaults to 7) in the user's day context. Occurrences with no `StartAt` are
excluded - they have no day to count on.

| Stat | Rule |
|---|---|
| Time by activity | Per activity over the window: summed minutes and count, from occurrences with both timestamps and positive elapsed time. Sorted by time. Bars in the activity's category colour. |
| Time by work type | Under each activity, its time split summed per work type (resolved minutes, archived types included), largest first, with whatever was not split shown as "Not split". Absent when the activity has no split time in the window. |
| Time by category | Same set grouped by the activity's category; uncategorized completions form a "No category" bucket. |

All are sums over what the user chose to log. **There is deliberately no stat whose denominator is
the length of a day** - no unaccounted time, no gap analysis, no "usually free" profile. Those all
answer "what is missing from the calendar", which is only a meaningful question if the calendar is
supposed to be complete, and here it is not. Today counts like any other day, since nothing is
averaged over days.

---

## Settings

| Setting | Notes |
|---|---|
| Timezone | Captured from the browser on registration; editable here. |
| Day start | The time the day rolls over. |
| Max focus goals | Hard limit on simultaneous Focus goals, 1-20. |
| Theme | Light / dark / system. Client-side preference in `localStorage`, defaults to system. |
| Server URL | Native shells only: where the app points its API calls. |
| Export data | Downloads `loom-export-<date>.json`. |
| Delete history | Confirmed, permanent; the user picks "only the past" (dated before today, by `DayMath`; today, upcoming and undated stay) or "everything" (`DELETE /api/occurrences[?pastOnly=true]`). Deletes occurrences and events; activities, categories, goals and checkpoints are kept, for a fresh start after a break. |
| Account | Username and sign out. |

Settings holds preferences only.

**Data export** (`GET /api/export`) is a single JSON document: user, settings, categories, goals with
checkpoints, activities with subtasks and work types, and flat occurrences (effective title, time split, no nested activity). Good enough to hand to a person or an LLM for analysis; not a
backup format, since there is no import path and the shape may change freely.
