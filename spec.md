# Loom — Product Spec

A brain space for goals, deadlines and motivation, built around **Goals**, **Activities** and
**Occurrences**. Single user in practice; every query is scoped by user.

This document describes what the app does today, as product rules. API shapes live in the code and
tests, visual rules in `design.md`, code navigation in `CLAUDE.md`.

## What Loom is not

Loom does not ask you to log your life. There is no suggestion engine, no scheduling model, and no
stat that divides by the length of a day, so sleep, work and commuting never need entering and
nothing is wrong when they are missing. The test for any new feature:

> Does this still produce a correct answer if the user logs only the things they care about?

Free-slot placement, "unaccounted" time and inferred availability fail it. The calendar is a
**visualization and a fast way to add things**, not a planner and not a log.

---

## Timezone & day semantics

All day logic runs server-side (`DayMath`), in the user's timezone offset by the day boundary setting.

- A **day** runs from the boundary to the next day's boundary (with 04:00, 02:30 belongs to the day before).
- An **occurrence belongs to the day it starts on**; one crossing midnight is drawn on its start day.
- **Overdue** is decided by the server; the client never recomputes it.
- An unknown timezone falls back to UTC.
- **Daylight saving:** transition days are 23 or 25 hours and days always tile with no gap. A boundary
  skipped by spring-forward falls at the end of the gap; one repeated by fall-back, at its second occurrence.

---

## Activities

An **Activity** is the definition of a piece of work; an **Occurrence** is one instance of it in time.

| Field | Notes |
|---|---|
| Title | Required, max 255 |
| Short label | Optional, max 12. Shown beside every occurrence of the activity (after the title on the calendar, as a pill in lists), to tell apart occurrences that share a title under different activities ("Lab 3" deadline vs defence). |
| Goals | Any number. An occurrence counts toward each. |
| Category | Optional |
| Tags | Any number. Free-form labels for grouping and search. |
| Subtasks | Checklist template copied onto every new occurrence. |
| Work types | Labels a session's time can be split into. |
| Repeat after days | Optional, 1-365. See Do again. |
| Reminders | Up to 5 offsets before an occurrence (0 to 30 days), inherited by its occurrences. |
| Show as unfinished when overdue | Default on. Off: its occurrences are never overdue or behind, so they stay out of Unfinished and the Overdue group; a past pending one lands in a neutral Past group on the Occurrences page. |

Deleting an activity deletes its occurrences. Deleting a category, goal or tag only removes the link.

**Goals are many-to-many**, so per-goal figures overlap: an occurrence on an activity with two goals
is in both goals' counts, heatmaps and history, and these are never presented as parts of a total.
Anything summed across goals counts the occurrence once.

**Tags** belong to the user, unique by name ignoring case, with no colour, status or archive. An
occurrence can also carry its own tags, for light variants of one activity ("Remote" / "Office" on
Work). What a thing *is* belongs on the activity: different courses' lectures are separate activities,
not one activity tagged per course. The two layers add up: an occurrence's effective tags are its
activity's plus its own, and every tag filter, grouping and search uses those. A repeat copy keeps
the occurrence's own tags.

The activity picker orders activities by how many occurrences they had in the last year (not counting
"No date" ones), most first, then alphabetically.

### Kinds: activity vs event

- **Activity** — reusable; owns many occurrences; what the activity picker offers.
- **Event** — a one-off: one hidden backing activity with one occurrence, created, edited and deleted
  together. The UI shows a Title field instead of a picker, and nothing can pick an event.
- **Linking an event to an activity.** Edit Event's Activity / Event toggle moves the occurrence onto
  an activity (picked or created there). It keeps dates, status, notes, subtasks, tags, reminders and
  deadline link; the title stays as an override unless it equals the activity's; the activity's
  category and goals take over; the time split is cleared. The reverse is not offered.

### Subtasks

The activity holds the template; each occurrence gets its own copy with done ticks at creation.
Template titles added later can be pushed to pending occurrences that lack them ("Add to N pending
occurrences" in Edit Activity): it only appends missing titles, never renames, removes or unticks,
and leaves done and skipped occurrences alone.

### Work types

A vocabulary on the activity ("Coding", "Report writing"), not a template: an occurrence references
only the ones it used. Titles are unique per activity. Renaming keeps history in one bucket. Removing
a type with logged time archives it (logged rows keep it); an unused one is deleted; re-adding an
archived title restores it.

---

## Occurrences

| Field | Notes |
|---|---|
| Activity | Required |
| Title | Optional override of the activity title, max 255 |
| Notes | Optional, max 4000. Not copied by duplicate or reschedule. |
| Start / End | See Scheduling states. End must be after start. |
| All day | Date only |
| Planned | Flexible: dashed on the calendar, never overdue. Cleared when marked done. |
| No date | A written-down todo. Excludes start, end, all-day and planned. |
| Status | `pending`, `done`, `skipped` |
| Subtasks | Own checklist, seeded from the template |
| Time split | Optional work type + time rows |
| Deadline | Optional link to what this works toward |
| Related to | Optional link to what this follows up on |
| Reminders | Optional override of the activity's; an empty list silences them |
| Sort order | Manual position in lists, set by dragging |

**Deadline link.** A "Lab work" session can point at the "Lab 3 report" it works toward. The target
must be pending when linked and either an event or a Due-shaped occurrence (exactly one of start and
end); no self-links or loops. The link survives the target later being completed. The picker lists
valid targets with their goals and date, those sharing a goal with the occurrence first, then those
sharing its category. The target shows how many linked sessions are done and their summed time; there
is deliberately no progress percentage. Deleting either side only clears the link. Reschedule,
move-or-skip and duplicate carry it while the target is pending.

**Related link.** "L01 - revise" points back at "Lecture 01". It points backward at something usually
done, so it is separate from the deadline link and both can be set. One level only: a follow-up
cannot have follow-ups and cannot be one if it already has them. The source shows how many follow-ups
are done and their summed time. The picker offers occurrences from the last 60 days onward (same
goal-then-category ordering) followed by pending undated ones. "Add related" creates a follow-up with
the link filled in (on a follow-up, linking to its source). Do again, reschedule, move-or-skip and
duplicate keep the link. Deleting the source only clears it.

**See related.** An occurrence with either link, or linked to by one, has a "See related" action listing
its deadline, the sessions working toward it (or toward this), its source, and the follow-ups of that
source (or of this).

**Time split.** One block can cover several kinds of work. Each row names one of the activity's work
types and is either **pinned** (fixed minutes) or **auto** (shares what the pinned rows leave, evenly).
Pinned minutes may total less than the occurrence's length (the rest is unsplit) but never more,
including after a resize. Re-pointing the occurrence drops its split; copies start without one.

### Scheduling states

- **Scheduled** — a start, not planned. Solid block; can be overdue.
- **Due pin** — a start with no end, a deadline rather than a span: drawn as a line over other blocks
  and pinned in the calendar's Due row. (An end with no start is also Due-shaped.)
- **Planned** — window bounds when both start and end are set; end alone is a soft due date; all-day
  marks a flexible day task. Dashed and striped, never overdue, grouped under "Planned" in lists. The
  Daily Plan keeps a planned occurrence with a start time on its timeline.
- **Floating** — no date. Planned floating means committed, just needs a time; unplanned means not yet.
  Shown in the calendar's FLOAT row (planned first) and the Daily Plan's Floating group (unplanned
  only). Never overdue. Hidden from the FLOAT row when every goal of its activity is benched.
- **No date** — a todo and nothing more: lives only on the Occurrences page ("No date" group), never on
  the plan or calendar, never overdue, still counted in history and goal counts. Giving it a date
  ends the state.
- **All-day planned** — belongs to a day but not an hour of it.

### Reminders

A push to the native app some minutes before an occurrence. It creates nothing.

- The activity's list is inherited; an occurrence may override it. Events have only their own.
- **Anchor:** start for a timed occurrence, end for an end-only one, 09:00 local for all-day. Floating,
  no-date, done and skipped never fire. A planned occurrence fires only as a timed Due pin (an
  unconfirmed date); planned windows and all-day ones never do.
- Each fire time sends once, only within 10 minutes after it and not if it predates the occurrence,
  so new items and outages cause no bursts. Moving an occurrence gives new fire times. Reminders due
  together send one push: effective title, time in the user's timezone ("Today, 10:00 - 11:00"),
  tapping opens it on the Daily Plan.
- The app registers its device on sign-in and drops it on sign-out; dead tokens are pruned. Without a
  Firebase credential on the server nothing is sent.

### Daily overdue notification

Optional, at a chosen time (off by default). Once per local day, within an hour of that time, one
push lists what is overdue: the count as title, the first three titles plus "+N more". Nothing is sent
when nothing is overdue, and a missed window is not made up. Tapping opens the Daily Plan.

### Overdue

Pending, not planned, has a start, and: its end has passed; or it is all-day and its date is before
today; or it has a start only and its day has ended.

### Creating, editing, scheduling

One modal creates an occurrence of an activity (picker with quick-create) or a one-off event. Time
mode is **due** (end only), **scheduled** (start, optional end), **floating** or **no date**, with
**all day** and **planned** as flags (not for no date). The detail menu has one-tap **Float** and
**No date**. On the calendar, blocks drag to move, drop in from the FLOAT and all-day rows, and resize.

**Skip with reschedule.** Skipping offers a new date (default: the next day, or the Do-again date).
Confirming skips the original and creates a pending copy on that date.

**Do again.** An activity's repeat gap never creates anything by itself; there is no series and no backlog.

- Completing an occurrence of such an activity adds one pending copy. The detail modal has an
  "Again <date>" checkbox (ticked by default); the list-row checkbox always adds it. A toast names
  the date and offers Undo.
- The date steps N days from the occurrence's own day to the first day after today, so a weekly
  Monday item lands on next Monday however late it is done. Never today or the past. An undated one
  becomes all-day planned on today + N.
- The copy keeps title, reminder override, clock time and length, all-day, the planned flag it had,
  the deadline link while the target is pending, and the related link. Subtasks come fresh from the
  template; notes and time split are not copied.
- Nothing is added if a pending occurrence of the activity already sits on that day. Events never repeat.

**Duplicate** opens a pre-filled create modal.

**Re-pointing.** An occurrence can move to another activity from the same picker, mainly to correct
history after splitting an activity. Never onto or off an event.

---

## Categories

Name, `#RRGGBB` colour, optional icon. The colour draws every row and block of its activities.
Managed on `/categories`.

---

## Goals

| Field | Notes |
|---|---|
| Title | Required |
| Description, Notes | Optional |
| Status | `focus`, `active`, `bench`, `closed` |
| Kind | `goal` (default) or `track` |
| End date | Optional, display only |
| Color, Icon | Optional |
| Checkpoints | Unordered milestones |

**Status.** Focus: what you are working on, shown on the Daily Plan. Active: live. Bench:
deprioritised, its activities leave the FLOAT row. Closed: archived, dimmed. The number of Focus
goals is a hard limit (a setting).

**Tracks** group activities that are not an outcome, like a college course. A track is only active or
closed (never stale, so a semester break isn't neglect), has its own section on the Goals page before
Closed, and does not count as goal work on the Plan page's Goal activity grid.

**End date** shows as "ends in 12 days" / "ends today" / "ended". Past it, a goal sorts last in its
group and is never stale. It never closes the goal by itself.

**Order:** Focus → Active → Bench → Tracks → Closed; within a group, ended goals last, otherwise most
recently active first. Deleting a goal removes its checkpoints and links; activities stay.

### Checkpoints

Title, size (tiny 1, small 2, normal 3, big 5, huge 8), optional target date, pending or reached.
Any order. Progress = weight reached / total weight.

### Progress signals

- **Checkpoints:** progress ring, a bar with one segment per checkpoint by weight, and the checkpoints
  as toggleable chips (desktop) or checklist (mobile). None of this without checkpoints.
- **Heatmap:** the last 280 days across the goal's activities, shaded by completions per day, faint
  red for a day of only skips. Pending and undated occurrences are not on it. No grid without linked
  occurrences. Lifetime done / skipped / pending counts show as a bar on the Plan goal chip.
- **Recency:** days since the last completion, "active today" / "active 3d ago" / "no activity yet".
  A Focus goal 14+ days quiet (and not ended) shows it emphasised, as a hint, not an alert.

---

## Views

| Route | Purpose |
|---|---|
| `/plan` | Daily Plan, the index route. |
| `/calendar` | Day / 3-day / week grid. |
| `/occurrences` | Saved Lists, then "All occurrences". |
| `/occurrences/all` | Every occurrence, filtered and grouped. Clicking a row opens it. |
| `/occurrences/lists/{id}` | The same view from a saved List. |
| `/categories`, `/tags` | Add, rename, recolour, delete. |
| `/goals` | Goals by status, tracks before Closed. Focus goals expanded with slots used (`2/3`); others expand by chevron. Tapping opens History. |
| `/activities` | Activity list; title edits, menu opens History. |
| `/insights` | Totals over what was logged. |
| `/guide` | In-app guide to the concepts. |
| `/settings` | Preferences, export, sign out. |

`/inbox` redirects to `/occurrences`. The Tags page shows, per tag, its activities and the occurrences it reaches.

Navigation: desktop sidebar (the pages, then one link per saved List, Guide and Settings at the
bottom); mobile bottom bar (Plan, Activities, Calendar, Occurrences) plus a More sheet.

### Daily Plan

One day as a list, with no score for the day (no completion ring, no done/left counts).

- **Unfinished** (today only) — every pending occurrence dated before today, planned ones included,
  plus end-only ones whose end has passed. Not floating. One button moves them all to tomorrow, keeping
  times and flags.
- **Agenda** — the day's all-day items, then timed ones on a spine with a live **now** marker and
  relative labels on today. Rows have a done checkbox, skip and a menu. Planned ones show `~` and a hollow dot.
- **Deadlines** — every pending Due occurrence from today on, soonest first, with days remaining,
  counted from today whatever day is viewed and capped by the Deadlines ahead setting. Collapsible.
- **Planned** — planned occurrences with no hour: all-day ones and windows without a start.
- **Floating** — unplanned undated occurrences, on every day.
- **Focus goals** — a chip per focus goal: recency, checkpoint percentage, occurrence bar.
- **Goal activity** — a heatmap of completions on activities linked to any goal-kind goal, each
  counted once; skips don't count. Hidden when nothing was ever logged toward a goal.
- Day navigation: prev / next / today / date picker.

### Calendar

Day, 3-day and week views (remembered), with navigation. A picture of what you decided; an empty grid
means nothing.

- Scheduled blocks solid, planned dashed. Overlaps sit side by side. Due pins take no width from blocks.
- Sticky **all-day** and **FLOAT** rows; items drag between rows, into the grid (gaining a time) and
  across days.
- **Clicking empty grid creates** a 30-minute occurrence there; dragging (long press on touch) sets a span.
  On touch only a deliberate, still tap creates; a tap that stops scrolling does not.
- Blocks move and resize in 15-minute steps and cannot be dragged across midnight. Done and skipped
  stay visible and editable.
- **Dropping a pending occurrence on another date asks**: Move, or Skip & reschedule. Same-day drags
  and done/skipped items move without asking. **Ctrl-drop duplicates** (mouse only).
- Header **DUE** lists everything pending dated before today (planned too); **SOON** lists due pins
  from today on. Both are anchored to today and leave out what the visible range already shows.
- Zoom (buttons and pinch, remembered). **Compact mode** drops empty stretches of each day (no grid
  lines, no now line); any drag restores the full grid for the gesture.

### Occurrences

One list over every occurrence.

- **Filters:** status (All by default), category, tag, goal (each with "No ..." for none) and text
  search. All but search live in the URL, so other pages link to filtered views.
- **Grouping** (remembered): **When** (Overdue → Today → Planned → Upcoming → Floating → No date →
  Completed → Skipped), **Category**, **Tag**, **Goal**, **Activity**, **Related** (a section per
  source with its follow-ups, then "Not linked") or **None**. An occurrence with several tags or goals
  appears under each. Sections collapse and show counts.
- **Manual order:** drag a row by its grip within its section. The order belongs to the occurrence, so
  it holds in every list and grouping; unranked rows follow ranked ones.
- **Lists** are saved filter presets (name, filters, grouping) and create nothing. A list takes its
  goal's or category's icon and colour. `/occurrences` shows each with a live count, in an order set
  by dragging (new lists go last), which the sidebar follows. Inside a list,
  changed filters can be saved back or reverted. A list whose tag, category or goal was deleted
  matches nothing rather than widening to "any".

### Activities

Title search and grouping by Goal / Category / Tag / None (remembered); sections collapse with counts.
An activity with several goals or tags appears under each. Category and tag filters come from links on
those pages. Rows show a category-coloured tile and a menu: history, edit, duplicate (pre-filled create
with the template, work types and settings, no occurrences), delete. **Multi-select** bulk-assigns goals
(add, remove, replace) and category, or deletes.

**Activity history** (read-only): last done, cadence, usual time and length, an eight-week grid, and
dated occurrences newest first (future pending ones left out). Derived from that activity alone.

---

## Insights

Totals over **done, dated occurrences** in a 7 / 30 / 90 / 365-day window (default 7).

| Stat | Rule |
|---|---|
| Summary | Timed minutes, done count, days with something done; time and done also compared to the previous window. |
| By activity | Minutes and count, sorted by time, bars in category colour. |
| By work type | Under each activity, split time per work type plus "Not split". |
| By category | Including "No category". |
| By goal | Once per goal, so rows overlap the total. |
| By tag | By effective tag; overlaps like goals. |

**No stat has the length of a day as its denominator**: no unaccounted time, no gap analysis.

---

## Settings

| Setting | Notes |
|---|---|
| Timezone | From the browser at registration; editable. |
| Day start | When the day rolls over. |
| Max focus goals | 1-20. |
| Theme | Light / dark / system, per device. |
| Calendar colours | By category (default) or goal. By goal, a block takes its goal colour when its coloured goals agree, else the category colour. Calendar only. |
| Deadlines ahead | How far the Plan's Deadlines section looks, 0-365 days; empty = no limit. |
| Daily overdue reminder | Native only: on/off and time. |
| Server URL | Native only. |
| Notifications | Native only: send a test push. |
| Export data | One JSON file of everything, for reading or handing to an LLM; not a backup (no import). |
| Delete history | Confirmed: only the past, or everything. Deletes occurrences and events; keeps activities, categories, goals and checkpoints. |
| Account | Username and sign out. |
