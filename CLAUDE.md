# CLAUDE.md

Working guide for the Loom repository.
- **`README.md`** — setup, Docker deployment, env vars, config keys. Update it when a config key or deploy step changes.
- **`spec.md`** — product spec: what the app does, domain rules, data model fields.
- **`design.md`** — visual/UX spec.

## Doc sync rule

**After every feature or meaningful change, update the docs before closing the task.**

- `CLAUDE.md` — update the file map or conventions if the codebase structure changed.
- `spec.md` — update if product behaviour, domain rules, or the data model changed.
- `design.md` — update if the UI or visual language changed.

There is no build-history doc: `spec.md` describes the app as it is now, in the present tense, with no
record of what it used to do or what is planned. Git history is the changelog. Reasoning worth keeping
belongs in a code comment next to the thing it explains, not in a doc of past decisions.

Keep `CLAUDE.md` small: it is a navigation and convention guide, not a product spec. Domain rules belong in `spec.md`; visual rules belong in `design.md`.

## What this is

A brain space for goals, deadlines and motivation, built around **Goals**, **Activities** and
**Occurrences**. Single-user initially; schema and auth are multi-user-ready from day one.

**The app does not ask the user to log their life.** No suggestion engine, no scheduling model, no
stat with a 24-hour denominator - so sleep, work and commuting need never be entered, and nothing
computes a wrong answer when they are missing. Before adding anything, apply the test in `spec.md`:
*does this still produce a correct answer if the user logs only what they care about?* Free-slot
placement, availability inference, and "unaccounted time" all fail it. The calendar is a
visualization and a fast way to add things, not a planner.

**No occurrence is created without a user action.** Do not add recurring occurrences, repeat rules,
series or anything that fills the calendar ahead of time. They decouple the user from the app state:
occurrences would be created and changed automatically, without the user having done anything, and
that does not fit the model, where every occurrence exists because the user put it there. The one
form of repetition is `Activity.RepeatAfterDays`: an optional gap in days that only ever produces an
pending copy at the moment the user completes an occurrence (a default-on checkbox beside Done, or the
one-tap row checkbox, undoable from the toast), and the skip modal's default date. Nothing is generated when the user does nothing,
so there is no backlog. Calendar-anchored rules (weekdays, day of month) stay out.

## Stack & layout

- **Backend:** ASP.NET Core (.NET 10) minimal APIs, EF Core, SQLite. Solution: `Loom.slnx`.
- **Frontend:** React 19 + Vite + TypeScript, Tailwind CSS v4, TanStack Query, React Router.
- **Tests:** xUnit (unit + `WebApplicationFactory` integration); vitest for client `lib/` helpers (`*.test.ts`, excluded from `tsc -b`).

```
src/Loom.Core    Entities, EF DbContext, business services. No web dependencies.
src/Loom.Api     ASP.NET Core host: endpoints, auth wiring, serves the SPA.
tests/Loom.Tests Unit/ and Integration/ folders.
client/            React frontend (path alias `@` → `client/src`).
```

## Commands

```bash
dotnet build
dotnet test                                 # all tests (keep them green)
dotnet run --project src/Loom.Api         # backend on :5200
cd client && npm install && npm run dev     # frontend on :5173, proxies /api → :5200
cd client && npm run build                  # tsc -b + production build
cd client && npm test                       # vitest (pure lib helpers)
cd client && npm run gen:brand              # regenerate favicon + native icon SVGs

# EF migration:
dotnet ef migrations add <Name> --project src/Loom.Core --startup-project src/Loom.Api --output-dir Migrations

# Docker:
cp .env.example .env && docker compose up --build   # http://localhost:8080

# Release (homeserver): signed APK built in Docker -> /data/loom/releases, then web redeploy
./loom-build.sh [--no-web | --web-only]   # keystore + password live in ~/.loom (back it up)
```

## Architecture reference (file map)

**Backend (`Loom.Core`)**
- `Entities/` — POCOs; `Guid Id = Guid.NewGuid()` + `DateTimeOffset CreatedAt`, no base class.
  Entities: `User, Activity, Occurrence, Goal, Checkpoint, Category, Tag, UserSettings, ActivitySubtask,
  OccurrenceSubtask, ActivityWorkType, OccurrenceTimeSplit` (subtasks are two levels:
  `ActivitySubtask` is the title-only template, copied into `OccurrenceSubtask` rows — which carry
  `IsDone` — when an occurrence is created. Work types are **not** copied: `ActivityWorkType` is a
  label list on the activity, and an `OccurrenceTimeSplit` row references one, with `Minutes` null
  meaning "auto").
- `Enums/` — stored as strings (`HasConversion<string>`).
- `Data/LoomDbContext.cs` — DbSets + `OnModelCreating`. `Occurrence → Activity` cascade delete; `Activity → Category` set-null.
  `Activity.Goals` is many-to-many through the `ActivityGoals` join table (no entity class, cascade on
  both sides). `ActivityService.ResolveGoalsAsync` / `SetGoals` are the only writers, shared with the
  event paths in `OccurrenceService`. Query it with `a.Goals.Any(...)`; a filtered `SelectMany` over it
  needs SQL APPLY, which SQLite lacks (see `GoalService` for the join form that translates).
  **Per-goal figures count an occurrence once per goal; anything summed across goals counts it once.**
  `Activity.Tags` is the same shape through `ActivityTags`, written only by `ActivityService`
  (`ResolveTagsAsync`); every query that builds an `ActivityDto` must `.Include(a => a.Tags)`.
  The activity PUT is a full replace, so a caller that omits `tagIds` clears the tags.
- `Common/Result.cs` — `Result`/`Result<T>` + `Error(ErrorType, msg)`. **Expected failures = Results, not exceptions.**
- `Common/Validators.cs` — shared static validation rules.
- `Common/DayMath.cs` — all "which day / is this overdue?" logic goes through here, in the user's IANA
  timezone offset by `DayBoundaryTime`. Get a `DayContext` via `UserSettingsService.GetDayContextAsync`.
  Key methods: `OccurrenceDay(Occurrence, DayContext)`, `IsOverdue(Occurrence, DayContext, DateTimeOffset)`.
- `Common/TimeSplitMath.cs` — `Resolve(duration, minutes)`: auto rows share what pinned rows leave.
  The only place resolved minutes are computed server-side (`TimeSplitDto.FromOccurrence`, which the
  occurrence DTO, export and `InsightsService` all go through); `client/src/lib/timeSplit.ts` mirrors
  it for live editing; both run the cases in `tests/fixtures/time-split-cases.json`, so a drift fails a test.
- `Dtos/Dtos.cs` — request/response records with `FromEntity` static factory. Never leak entities.
  Key DTOs: `ActivityDto` (has `Kind` — internal activity/event split — and `RecentOccurrenceCount`,
  filled only by `ActivityService.ListAsync`, which orders the new-occurrence modal's picker), `OccurrenceDto` (has
  `EffectiveTitle = title ?? activity.title`, `IsPlanned`),
  `CategoryDto`/`CategorySummaryDto`, `CheckpointDto` (has `Size` enum — not numeric progress).
  `GoalHeatmap`/`GoalHeatmapDay` are shared by a single goal's `GoalDto.Heatmap` (built for every goal with linked occurrences,
  by `GoalService.GetProgressAsync`, includes skipped days) and
  `GoalService.GetAggregateHeatmapAsync` (every goal-linked activity summed together, any
  status, `done` occurrences only — skipped ones aren't progress and put no day on the grid — behind
  `GET /api/goals/heatmap`, the Daily Plan's "Goal activity" strip).
- `Services/*Service.cs` — ctor-inject `LoomDbContext`; return `Result`/`Result<T>`. Registered in `AddLoomCore`.
- `Services/InsightsService.cs` — totals over completed occurrences only. **Never add a stat whose
  denominator is the length of a day**; see the boundary above.
- `Occurrence.DeadlineOccurrenceId` — self-reference (set-null) to a pending event-kind occurrence.
  `OccurrenceService.ValidateDeadlineAsync` owns the rules (own user, event kind, pending unless
  unchanged, no self/loop); `WithLinksAsync` fills `OccurrenceDto.Deadline` and the target's
  `LinkedDoneCount`/`LinkedDoneMinutes` on every list and single read. On `PATCH`, an absent id
  leaves the link alone and an explicit null removes it.
- `OccurrenceService.RepeatAsync` (`POST /api/occurrences/{id}/repeat`) — the "do again" copy made on
  completion: a pending copy of a **done** occurrence of an activity with `RepeatAfterDays`, placed
  on the first day after today reached by stepping N days from the source's own day (so a weekly task
  stays on its weekday however late it is done; a floating source has no day and gets today + N as
  all-day planned). `DayMath.AddLocalDays` keeps the clock time; all-day moves by calendar date.
  `nextRepeatDate` in `client/src/lib/repeat.ts` mirrors the stepping for the checkbox label and the skip
  modal's default, which are presentational: the server decides the real date. Goes through `CreateAsync`, so subtasks come from the
  activity template. The request carries `IsPlanned` because marking done clears the flag on the source. A pending
  occurrence of the same activity already on the target day makes it a 409, so toggling done, pending,
  done adds only one; the client swallows that status.
- `OccurrenceService.SetTimeSplitAsync` — full-set replace of an occurrence's split, keyed by work
  type. `ValidateTimeSplitFits` runs in both update paths so shortening an occurrence below its
  pinned total is rejected; re-pointing to another activity drops the rows.
  `ActivityWorkTypeService.DeleteAsync` archives a type that has rows instead of deleting it.
- ⚠️ **A child with a pre-set `Guid Id` added to a *tracked* parent's nav collection is treated as an
  existing row** (change detection sees a non-default key) and issues an UPDATE matching nothing. Use
  `db.Set<T>().Add(...)` explicitly — see `OccurrenceService.ApplySubtasks`. Relationship fixup then also appends it to the parent collection,
  so guard against adding it twice if you build the response from that collection.
- ⚠️ **SQLite can't `ORDER BY` a `DateTimeOffset` or aggregate a `decimal`** — sort/sum client-side after `ToListAsync`.
  It also **can't translate a `DateTimeOffset` range `WHERE`** (EF throws at execution — stored as offset-bearing
  text, no instant-correct comparison), so occurrence date-window filtering runs in memory too. SQL pre-filters on
  those queries are limited to null checks (e.g. excluding fully-floating rows).

**Backend (`Loom.Api`)**
- `Program.cs` — registers core services, JWT + auth policy, rate limiter, security-header middleware, SPA
  fallback. JWT config is read **eagerly** from `builder.Configuration`:
  `var jwt = builder.Configuration.GetSection(...).Get<JwtOptions>()`, then `jwt.Validate()` throws at
  startup for a missing or short secret. Login/register carry `.RequireRateLimiting(AuthEndpoints.RateLimitPolicy)`;
  tests set `RateLimit:Auth:PermitLimit` high in `LoomApiFactory` (override `AuthPermitLimit` to test the limit).
  Both `JwtSecurityTokenHandler.DefaultMapInboundClaims = false` and `options.MapInboundClaims = false`
  must be set — the static property alone is not enough.
- `Endpoints/*Endpoints.cs` — thin: parse → service → `result.ToProblem()`. Auth required on all routes except `/api/auth/*`.
  Key endpoint files: `ActivityEndpoints.cs` (`/api/activities`), `OccurrenceEndpoints.cs` (`/api/occurrences`),
  `SettingsEndpoints.cs` (`/api/settings`), `InsightsEndpoints.cs` (`/api/insights`).
- `Endpoints/ApiResults.cs` — `Error.ToProblem()` + `principal.GetUserId()` (reads `sub` claim).

**Frontend (`client/src`)**
- `App.tsx` — auth-gated routing; index → `/plan`.
- `pages/` — `PlanPage` (**this is `/plan`**), `CalendarPage`, `OccurrencesPage`, `CategoriesPage`, `TagsPage`,
  `GoalsPage` (**this is `/goals`**), `ActivitiesPage`,
  `InsightsPage`, `SettingsPage`.
- `pages/OccurrencesPage.tsx` — **the only occurrence list view** (`/occurrences`). Status, category, tag
  and goal filters live in the URL; the grouping (`when` / category / tag / goal / activity / none) in
  `localStorage`. Everything runs in the client over `['events', 'all']`; `lib/occurrenceView.ts` holds the
  pure parts (`filterOccurrences`, `groupOccurrences`, `classify`, `formatOccurrenceDate`) and has the
  vitest cases. `pages/CategoriesPage.tsx` and `pages/TagsPage.tsx` are management lists only and link
  to it with `?category=` / `?tag=`.
- `lib/api.ts` — `request<T>` (bearer + one-shot 401 refresh). Key namespaces: `activitiesApi`, `occurrencesApi`, `categoriesApi`, `goalsApi`, `checkpointsApi`, `insightsApi`.
- `lib/types.ts` — mirrors backend DTOs. Key types: `Activity`, `Occurrence` (has `effectiveTitle`), `Goal`, `Category`, `Insights`.
- `lib/goals.ts` — `recencyLabel`/`isStale` over the server's `daysSinceLastOccurrence` (Goals page and Plan chips); `lib/useMediaQuery.ts` — `matchMedia` as a hook.
- `lib/invalidate.ts` — the query-invalidation helpers; every mutation goes through them.
- `lib/repeat.ts` — `addNextOccurrence(qc, source)`: after a status change to `done`, calls
  `occurrencesApi.repeat` and confirms with a toast carrying `Undo` (deletes the copy). Both completion
  paths call it with the occurrence captured in `onMutate`, before `isPlanned` is cleared:
  `OccurrenceListRow` always, `EventDetailModal` only while its "Again <date>" checkbox is ticked.
  Also `parseRepeatAfterDays` / `daysLabel` for the `ActivityModal` field and the activity row.
- `lib/theme.ts` — light/dark/system preference (localStorage `loom-theme`).
- `store/auth.ts` — Zustand; access token in memory only.
- `store/toasts.ts` — Zustand toast store; `toastError(err)` for mutation failures without inline error display.
  `push` takes an optional `action` (one button, dismisses the toast when pressed) and `durationMs`.
- `components/ui/` — `Button, Badge, Card(+Header/Title/Content), Modal, Field, ConfirmDialog, ActionMenu, Toasts`,
  plus `input.ts` (`inputCls`, the bare input/select treatment; `SettingSection` re-exports it).
- `components/events/OccurrenceListRow.tsx` — shared occurrence list row (Plan + Categories): optimistic status toggle, action menu, confirmed delete.
- `components/activities/ActivityListRow.tsx` — activity list row: leading tile in the **category's**
  colour and icon (via `CategoryIcon`), meta line, action menu (history / edit / delete).
  In multi-select mode the tile becomes a checkbox and the row selects instead of navigating.
  `hideCategory`/`hiddenGoalId` drop whatever the current grouping already says in the section header
  (an activity's other goals still show).
- `components/activities/BulkAssignModal.tsx` — adds / removes / replaces goals and sets category on a multi-select. No bulk endpoint exists:
  it fans out over `PUT /api/activities/{id}`, resending unchanged fields from each activity (the PUT is a full replace,
  `repeatAfterDays` included, which is why `activitiesApi.update` requires it).
- `components/tags/TagPicker.tsx` — toggle chips plus a create-on-Enter input; used by `ActivityModal`.
  `TagModal.tsx` adds / renames from the Tags page. `BulkAssignModal` resends each
  activity's `tagIds` (the PUT would otherwise wipe them).
- `components/goals/GoalPicker.tsx` — toggle chips for an activity's goal set, used by `ActivityModal`,
  `BulkAssignModal` and `EventModal`. Options come from `pickableGoals` (`lib/goals.ts`): closed goals are
  offered only when already linked, so an edit never drops one silently.
- `components/events/TimeSplitEditor.tsx` — the time split section of `EventDetailModal` (chips,
  proportional bar with draggable edges, per-row time field). Keyed by occurrence id and owns its rows
  after mount: every change saves through `occurrencesApi.setTimeSplit` and a failure restores the
  last saved set. Renders nothing for all-day occurrences or ones without a start and end.
  `components/activities/WorkTypesSection.tsx` is the editable list of the same types, used by `ActivityModal` (edit mode).
- `components/events/OccurrenceNotes.tsx` — the notes field of `EventDetailModal`. Keyed by occurrence id
  and owns its text after mount; saves through `occurrencesApi.patch` on blur and on unmount (closing
  the modal with Escape never blurs the field).
- `components/events/SkipRescheduleModal.tsx` — opened after skipping; lets user pick a date and creates a new pending copy on that date.
- `components/events/MoveOrSkipModal.tsx` — asks Move vs Skip & reschedule when a calendar
  drag lands a **pending** occurrence on another date. The page passes a `PendingMove` carrying the
  resolved target *and* a `commit` callback, so each drop kind (`rescheduleEvent`,
  `rescheduleFromAllDay`, `makeEventAllDay`) keeps its own optimistic update; the modal only owns the
  skip-and-create path. Nothing is written until the user picks, so a cancelled drop just snaps back.
- `components/goals/OccurrenceBar.tsx` — done/skipped/pending counts bar for goals with linked occurrences; data from
  `GoalDto.OccurrenceStats`. Used by the Plan page's goal chip; the Goals page uses the heatmap instead.
- `components/events/OccurrenceHeatmap.tsx` — GitHub-style day grid, generic over any `HeatmapWindow`
  (a 280-day window of per-day done/skipped counts, days with nothing omitted; `GoalHeatmap` is
  assignable to it, and the activity history modal builds the same shape client-side with a `pending`
  field goals don't use). The server sends `start`/`end` as day-boundary days, so the client never
  decides what "today" is; it only lays out Monday-first columns and picks the fill. The grid has no
  max width: cell size falls out of `weeks`, so each caller renders it twice (15 weeks on mobile, 37
  from `sm:`, except the narrower activity history modal) with counts picked to fill its container at
  a ~14px square. Both draw a suffix of the same payload, and the payload's day count must stay ≥ the
  widest column count plus its part-week. Consumers: `GoalsPage` (one grid per goal with occurrences,
  tier-coloured), `PlanPage`'s "Goal activity" section (`goalsApi.heatmap()`, one grid summed
  across every goal-linked activity, `--color-primary`), `OccurrenceHistoryModal` (per-activity and per-goal,
  adds `pending`).
- `components/ErrorBoundary.tsx` — class boundary with `resetKey` (cleared on navigation) and a
  `fullScreen` mode. One wraps the routes inside `AppShell` (nav stays usable), one wraps the app in `main.tsx`.
- `components/layout/OfflineBanner.tsx` + `lib/useOnline.ts` — banner driven by `navigator.onLine`.
  `components/ConnectionLost.tsx` — the startup screen for an unreachable server.
- `lib/api.ts` — ⚠️ `tryRefresh()` returns `'ok' | 'denied' | 'unreachable'`, **not a boolean**. Only `denied`
  may sign the user out; `unreachable` (no response, or 5xx) must keep the session. `request` turns a
  network failure into `ApiError(0, ...)`.
- `components/layout/Sidebar.tsx` — desktop nav: eight page items (including Categories and Tags), a "By category" list of links to
  `/occurrences?category=<id>` (read-only; management is `CategoriesPage`), and Settings pinned at the bottom.
- `components/layout/BottomNav.tsx` — mobile nav: 4 tabs (Plan, Activities, Calendar, Occurrences) + "More"
  bottom sheet (Goals, Categories, Tags, Insights, Settings). Max 5 slots; new pages go in the sheet.
- `components/layout/LoomMark.tsx` — the brand mark (fill-based weave glyph, not a stroked lucide
  icon), used in `Sidebar.tsx` and both auth pages. The geometry lives once in `lib/brandMark.json`;
  `npm run gen:brand` (`client/scripts/gen-brand.mjs`) regenerates `public/favicon.svg` and
  `client/assets/*.svg` from it, so change the mark there and rerun the script.
- `components/events/OccurrenceHistoryModal.tsx` — read-only "have I been doing this", generic over a
  query key + fetcher. `activities/ActivityHistoryModal.tsx` (activity row menu; `['events', 'activity', id]`)
  and `goals/GoalHistoryModal.tsx` (goal card menu; `['events', 'goal', id]`) are thin wrappers. **Every
  figure is derived in the component** from the occurrences it fetches (`summarise`): last done, median
  gap between completion *days*, modal quarter-hour start, median measured length, and a "Time by activity"
  section (`insights/TimeByActivityList.tsx`, shared with `InsightsPage`; `activitiesFromOccurrences` mirrors
  `InsightsService` over all fetched occurrences, no window). No figure needs a
  complete calendar to be right.
- Calendar split: `pages/CalendarPage.tsx` keeps the page state, scroll anchoring and every pointer gesture
  (they share refs, so they stay together). Around it: `lib/calendarDates.ts` (date/label helpers,
  `ViewMode`), `lib/calendarLayout.ts` (column packing, `layoutDay`, snapping, `occursOnDay`, due helpers,
  colours), `lib/useOccurrenceMutations.ts` (optimistic reschedule / float / all-day commits and the
  Move-or-Skip hand-off), `lib/useCalendarModals.ts` (modal state and openers), and
  `components/calendar/` (`EventBlock`, `DayColumn`, `CalendarHeader`, `CalendarTray` over `TrayPillRow`'s
  Float / Due / Soon rows). The pure `lib/` parts have vitest tests.
- `pages/CalendarPage.tsx` — ⚠️ **plain click / tap on empty grid creates** (`openCreateAt`,
  `CLICK_CREATE_MINUTES`), reached from the mouse no-drag path and the touch tap in
  `handleGridPointerUp`. Drag still sets an exact span; long press does it on touch.
  The touch tap is guarded by four clauses (`TAP_MAX_MS`, `SCROLL_SETTLE_MS`, no latched swipe,
  unchanged `scrollTop`) because a scrolling finger produces near-taps constantly, and the mouse path
  additionally requires `lastPointerTypeRef.current === 'mouse'`: a touch reaches it a second time as a
  compatibility mouse event, which would otherwise walk straight past all four.
  The `DueRow` / `UpcomingRow` / `FloatingTasksRow` / all-day rows are wrapped in one `.calendar-tray`
  div (`index.css`, gated by `showTray`) that owns the hairlines *between* them and the heavy edge
  closing the band, so those rows carry no borders of their own. That edge is also **the grid's 00:00
  line** when the tray is shown (the hour loop skips `m=0`, and the day header's border serves it
  otherwise), so it can be restyled but not removed. `DueRow` / `UpcomingRow` are anchored to
  `effectiveToday`, not to `rangeStart`/`rangeEnd` — each queries once against today's start and then
  drops whatever the visible range already draws, so paging weeks changes neither row's contents.
  `DueRow` carries **everything pending dated before today** (`overduePastItems`), not just what
  `isOverdue` says: planned occurrences are never overdue by design (`DayMath.IsOverdue` returns early
  on `IsPlanned`), and the row exists so that rule doesn't make them invisible. It keys off
  `dueRowRef(o)` (`startAt ?? endAt`) so deadline-only occurrences are carried too.
  `trayDragActive` (`isDraggingGridEvent || isDraggingPill`) both reveals the FLOAT / all-day rows and
  **hides `DueRow` and `UpcomingRow`** — neither accepts a drop, and their height alone pushed the
  real targets into the autoscroll zone. Safe to unmount mid-gesture:
  pill drags listen on `window`, not the source element, and the anchor absorbs the geometry change.
- `lib/timeScale.ts` — the grid's minute↔pixel map, one `TimeScale` per visible day. `linearScale` is
  the plain 0-24 map; `compactScale` drops empty stretches entirely, stacking a day's events directly
  against one another (each block keeps its real duration-proportional height; only the gap between
  blocks disappears). **Every grid coordinate goes through `toPx`/`toMin`** — event tops, hour lines,
  overlays, snapping (`snapToGrid` takes the scale, not `hourPx`). The now line is the one thing
  compact mode drops rather than places (`isToday && !scale.isCompact` in `DayColumn`): a collapsed
  gap makes the axis discontinuous, so there is no honest pixel for "now". Two invariants the
  calendar leans on:
  1. **Any drag expands first.** `expandForDrag` swaps in the linear scale via `flushSync` before the
     gesture reads a coordinate, so no drag code reasons about the stack; `collapseAfterDrag` in each
     gesture's `cleanup` restores it. Collapsing is a plain `setState`, so the drop still reads
     expanded geometry. Expansion fires at each gesture's *commit* point (mouse drag threshold, touch
     long press, resize-handle press), never on pointerdown — that would flicker on every click.
  2. **An event's own span always sits inside one expanded segment**, so pixel offsets measured within
     a block (grab offset, block height) survive the switch untouched. Only absolute tops are
     re-derived, from `startMin`, which is why `dragRef` carries it.
  ⚠️ Scroll position is corrected by `captureAnchor` + the anchor `useLayoutEffect`, not by the
  caller: record the minute to hold still *before* any state is queued, apply it after layout. Zoom
  and the compact toggle use it too. Three things about it are load-bearing:
  - **Capture before queueing state.** It converts a pixel to a minute through the *current* scale,
    and a compact scale can pack hours of real time into a very short run of pixels — measuring after
    the grid has moved (the FLOAT / all-day rows appear on drag start) turns a small pixel shift into
    a several-hour error.
  - **The anchor is not one-shot.** One gesture moves the grid across more than one render, and which
    render gets what depends on React's batching. Re-applying drives the delta to zero, so it is left
    in place and every render converges. It expires after `ANCHOR_TTL_MS` instead of being consumed.
  - **`dragSpacerRef`.** Holding a minute in place needs the scroll range to reach it; with the
    compact grid shorter than the viewport there is none, so the browser clamps and the grid lurches
    by the shortfall. The spacer adds a viewport of room under the grid while `dragExpanded`.
- `components/settings/SettingSection.tsx` — `SettingSection`/`SettingRow`/`SectionFooter`, the layout
  primitives `SettingsPage` is built from. Settings holds preferences only.

**Tests**
- `Unit/TestContext.cs` — in-memory SQLite + real services. Naming: `Method_scenario`.
- `Integration/LoomApiFactory.cs` + `HttpHelpers.cs` — `SetupUserAsync`, `LoginAsync`, `UseBearer`, `ReadAsync<T>`. Fresh factory per class (`IDisposable`).
  ⚠️ **JWT secret in tests:** use `builder.UseSetting("Jwt:Secret", testSecret)` in `ConfigureWebHost` — not `services.Configure<JwtOptions>()`, the eager read already happened.

**EF migrations:** prefix `PATH="$PATH:$HOME/.dotnet/tools"` if `dotnet ef` not found. SQLite only.

## Conventions — follow these

- **Business logic in `Loom.Core` services.** Endpoints are thin: parse → service → map result.
- **Result pattern, not exceptions.** `Error(ErrorType, msg)` → `error.ToProblem()`
  (Validation→400, NotFound→404, Conflict→409, Unauthorized→401, Forbidden→403).
- **No em dashes in client-facing text.** Use a hyphen, comma, or colon. Code comments are exempt.
- **24h clock everywhere.** Never render AM/PM. Format times as `HH:mm`; native `<input type="time">`
  needs `lang="en-GB"` or the browser falls back to its own locale.
- **Shared validation** in `Common/Validators.cs`. Cross-field rules live in the service.
- **DTOs** in `Core/Dtos/Dtos.cs`; map via `FromEntity`. Don't leak entities.
- **Auth model:** JWT access token in response body (~15 min); 6-month refresh token in httpOnly
  `Secure` cookie (path `/api/auth`), rotated on every refresh. Read user id from `sub` claim
  (`principal.GetUserId()`). Logic in `TokenService.cs`; cookie I/O in `RefreshCookieManager.cs`.
- **Enums as strings** in DB and on the frontend.
- **Theming:** semantic CSS variables in `index.css` → Tailwind via `@theme inline`. Never hardcode
  `bg-slate-*` / `text-*-600`. Dark mode = `.dark` on `<html>`, controlled by `lib/theme.ts`.
- **Day math is server-side.** The client consumes `occurrence.isOverdue` and `occurrence.isBehind`; it
  never recomputes them locally. Purely presentational date formatting may stay client-side.
  **"Behind you"** (`DayMath.IsBehind`) is pending and dated before today, plus a deadline-only
  occurrence whose end has passed. It differs from `isOverdue`: `DayMath.IsOverdue` is `false` for
  anything `IsPlanned`, and something overdue earlier today is not behind you. It backs the Plan
  page's Unfinished section, so a planned occurrence that slipped stays visible without being styled
  as late. The calendar's DUE row still computes its own client-side version (`dueRowRef`).
- **`PATCH /api/occurrences/{id}` is a partial update**: `PatchOccurrenceRequest` fields are
  `Optional<T>` (`Common/Optional.cs`), so a field absent from the JSON is kept and an explicit `null`
  clears it (title, notes, start, end, deadline). `ActivityId` re-points and cannot be cleared; `IsAllDay` and
  `IsPlanned` reject null; `Subtasks` null leaves the subtasks alone (`ApplySubtasks`). Send only
  what changes (`occurrencesApi.patch`). Event-kind edits still go through `PUT /{id}/event`, which is a full replace.
- **Destructive actions confirm via `ConfirmDialog`** (never inline or immediate); mutations without
  inline error display report failures with `toastError` from `store/toasts.ts`. Row dropdowns use
  `components/ui/ActionMenu.tsx` (portal + flip), not hand-rolled absolute menus.
- **Frontend:** `verbatimModuleSyntax` — use `import type` for type-only imports. TanStack Query for
  server state; Zustand for auth (access token in memory).
- **Query keys:** every occurrence list lives under `['events', ...]` (`['events', 'all']` for the Occurrences page, `['events', 'calendar', ...]` for calendar ranges, `['events', 'activity', id]` for one activity's history).
  After any occurrence write invalidate `['events']` (a time split write also `['insights']`). After any activity write invalidate `['activities']`
  **and `['events']`** (occurrences embed their activity: its title feeds `effectiveTitle` and its category
  feeds every row and calendar block's colour). After any goal write also invalidate `['goals']`.
  Never call `invalidateQueries` for these directly: use the helpers in `lib/invalidate.ts`
  (`invalidateOccurrences`, `invalidateActivities`, `invalidateWorkTypes`, `invalidateGoals`, `invalidateTags`, `invalidateAll`).
- **Design:** see `design.md`. Use semantic color tokens, not hardcoded values.

## Gotchas

- **SQLite migrations only.** No Postgres migration set exists.
- ⚠️ **Guids are UPPER-case TEXT in SQLite.** Microsoft.Data.Sqlite binds a `Guid` parameter as
  upper-case text and SQLite compares text case-sensitively, so raw SQL in a migration that mints an
  id must produce upper-case (`hex()` already does; don't `lower()` it). A lower-case id lists fine -
  `Guid.Parse` ignores case - but matches nothing by key, so update, delete and FK lookups all 404.
  `MigrationTests` guards this by querying seeded rows by id, not just listing them.
- **`dotnet ef database update` does not touch the app's database.** `LoomDbContextFactory` points
  design-time tooling at `loom-design.db`; `src/Loom.Api/loom.db` is migrated by the API on
  startup (`Database:MigrateOnStartup`), so restart the API to apply a new migration to dev data.
- **`Jwt:Secret` ≥32 bytes** (`JWT_SECRET` in `.env`); empty in `appsettings.json` by design, and the API
  refuses to start without it. `docker-compose.yml` maps `JWT_SECRET`/`COOKIE_SECURE` onto the real config keys
  `Jwt__Secret` / `Auth__RefreshCookie__Secure` - a bare `JWT_SECRET` env var is never read by the app.
- **`COOKIE_SECURE`** must be `false` for plain-HTTP local dev; `true` in production.
- **Behind a reverse proxy set `BEHIND_PROXY=true`** (`ASPNETCORE_FORWARDEDHEADERS_ENABLED`), otherwise the
  auth rate limit sees every client as the proxy's IP. Leave it off when the port is exposed directly:
  forwarded headers are then client-controlled and would let anyone dodge the limit.
- **Dev port:** `dotnet run` uses `launchSettings.json` (port 5200). Published DLL: set `ASPNETCORE_URLS`.
- **`DayMath` is DST-tested** (`Unit/DayMathTests.cs` sweeps Zagreb and New York across every 2026 transition,
  including a boundary inside the gap). Keep `StartOfDay`/`EndOfDay` going through `LocalToInstant`; using
  `GetUtcOffset` directly on a skipped wall-clock time puts the boundary late and `DayOf` then disagrees.
- **Tests:** in-memory SQLite, kept-open connection, `EnsureCreated()` (not Migrate) in factory. Isolated DB per integration test class.

## Git

**Never run `git commit` unless the user explicitly asks.** Make the changes, stop, and wait.

## Verify changes

`dotnet test` for backend; `cd client && npm run build` for frontend. End-to-end: both dev servers or `docker compose up --build`.
