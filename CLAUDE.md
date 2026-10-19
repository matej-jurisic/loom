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
record of what it used to do or what is planned. Git history is the changelog.

Keep `CLAUDE.md` small: it is a navigation and convention guide, not a product spec. Say where things live
and what traps exist; behaviour belongs in `spec.md`, visual rules in `design.md`. Don't put Tailwind
classes, endpoint walkthroughs or step-by-step feature behaviour here.

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
series or anything that fills the calendar ahead of time: every occurrence exists because the user put
it there. The one form of repetition is `Activity.RepeatAfterDays`, which only produces a pending copy at
the moment the user completes an occurrence (see "Do again" in `spec.md`). Nothing is generated when the
user does nothing, so there is no backlog. Calendar-anchored rules (weekdays, day of month) stay out.

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

## File map

**Backend (`Loom.Core`)**
- `Entities/` — POCOs; `Guid Id = Guid.NewGuid()` + `DateTimeOffset CreatedAt`, no base class. Enums in
  `Enums/` are stored as strings (`HasConversion<string>`).
- `Data/LoomDbContext.cs` — DbSets + `OnModelCreating`. `Activity.Goals` and `Activity.Tags` are
  many-to-many join tables with no entity class (`ActivityGoals`, `ActivityTags`); `Occurrence.Tags` is a
  third (`OccurrenceTags`). Writers: `ActivityService` (`ResolveGoalsAsync`/`SetGoals`, `ResolveTagsAsync`)
  and `OccurrenceService.ApplyTagsAsync`.
- `Common/Result.cs` — `Result`/`Result<T>` + `Error(ErrorType, msg)`. **Expected failures = Results, not exceptions.**
- `Common/Validators.cs` — shared static validation rules.
- `Common/DayMath.cs` — all "which day / is this overdue?" logic, in the user's IANA timezone offset by
  `DayBoundaryTime`. Get a `DayContext` via `UserSettingsService.GetDayContextAsync`.
- `Common/TimeSplitMath.cs` — the only place resolved time-split minutes are computed server-side.
  `client/src/lib/timeSplit.ts` mirrors it; both run `tests/fixtures/time-split-cases.json`, so drift fails a test.
- `Common/ReminderMath.cs` — reminder anchor and fire times. `Services/NotificationService.cs` sends due
  reminders (driven by `Loom.Api/ReminderScheduler.cs`) through `Notifications/IPushSender` (`FcmSender`; tests fake it).
- `Common/Optional.cs` — `Optional<T>` for partial-update requests (absent vs explicit null).
- `Dtos/Dtos.cs` — request/response records with `FromEntity` static factory. Never leak entities.
- `Services/*Service.cs` — ctor-inject `LoomDbContext`; return `Result`/`Result<T>`. Registered in `AddLoomCore`.
  Domain rules for each live in `spec.md`; the non-obvious ones are noted in Gotchas below.
- `Services/InsightsService.cs` — totals over completed occurrences only. **Never add a stat whose
  denominator is the length of a day.**

**Backend (`Loom.Api`)**
- `Program.cs` — registers core services, JWT + auth policy, rate limiter, security-header middleware, SPA fallback.
- `Endpoints/*Endpoints.cs` — thin: parse → service → `result.ToProblem()`. Auth required on all routes except `/api/auth/*`.
- `Endpoints/ApiResults.cs` — `Error.ToProblem()` + `principal.GetUserId()` (reads `sub` claim).

**Frontend (`client/src`)**
- `App.tsx` — auth-gated routing; index → `/plan`.
- `pages/` — one file per route in `spec.md`'s Views table. `OccurrencesPage.tsx` holds the only occurrence
  list view (`OccurrencesView`, behind `AllOccurrencesPage` and `OccurrenceListPage`); its pure logic is in `lib/occurrenceView.ts`.
- `lib/api.ts` — `request<T>` (bearer + one-shot 401 refresh), one namespace per resource (`activitiesApi`, `occurrencesApi`, ...).
- `lib/types.ts` — mirrors backend DTOs.
- `lib/invalidate.ts` — the query-invalidation helpers; every mutation goes through them.
- `lib/repeat.ts` — `addNextOccurrence` (the "do again" call plus Undo toast), and the repeat-days parse/label helpers.
- `lib/nativePush.ts` — FCM registration and tap routing (native only). A tap lands on `?occurrence=<id>`, which
  `events/OccurrenceLinkModal.tsx` (mounted in `AppShell`) opens on any page. `lib/reminders.ts` + `components/reminders/ReminderPicker.tsx`.
- `lib/goals.ts`, `lib/theme.ts`, `lib/useMediaQuery.ts`, `lib/useOnline.ts` — small shared helpers.
- `store/auth.ts` — Zustand; access token in memory only. `store/toasts.ts` — toast store; `toastError(err)`.
- `components/ui/` — `Button, Badge, Card, Modal, Field, ConfirmDialog, ActionMenu, Toasts`, plus `input.ts` (`inputCls`).
- `components/` is otherwise grouped by area (`events/`, `activities/`, `goals/`, `calendar/`, `categories/`, `tags/`,
  `lists/`, `insights/`, `settings/`, `layout/`). Shared pieces worth knowing: `events/OccurrenceListRow.tsx` (list row
  with optimistic status toggle), `events/OccurrenceHeatmap.tsx` (day grid used by Goals, Plan and the history modals),
  `events/OccurrenceHistoryModal.tsx` (generic read-only history; the activity and goal modals wrap it),
  `goals/GoalPicker.tsx`, `tags/TagPicker.tsx`, `categories/categoryIcons.tsx` (`ICON_GROUPS`).
- `components/layout/LoomMark.tsx` — brand mark; geometry lives once in `lib/brandMark.json`, and
  `npm run gen:brand` regenerates the favicon and native icons from it.
- Calendar: `pages/CalendarPage.tsx` keeps page state and every pointer gesture. Around it: `lib/calendarDates.ts`,
  `lib/calendarLayout.ts` (packing, snapping, `occurrenceColor`), `lib/timeScale.ts` (minute↔pixel map),
  `lib/useOccurrenceMutations.ts`, `lib/useCalendarModals.ts`, `lib/useCalendarColorBy.ts`, and `components/calendar/`.
- `components/settings/SettingSection.tsx` — layout primitives for `SettingsPage`, which holds preferences only.

**Tests**
- `Unit/TestContext.cs` — in-memory SQLite + real services. Naming: `Method_scenario`.
- `Integration/LoomApiFactory.cs` + `HttpHelpers.cs` — `SetupUserAsync`, `LoginAsync`, `UseBearer`, `ReadAsync<T>`. Fresh factory per class (`IDisposable`).

## Conventions — follow these

- **Business logic in `Loom.Core` services.** Endpoints are thin: parse → service → map result.
- **Result pattern, not exceptions.** `Error(ErrorType, msg)` → `error.ToProblem()`
  (Validation→400, NotFound→404, Conflict→409, Unauthorized→401, Forbidden→403).
- **No em dashes in client-facing text.** Use a hyphen, comma, or colon. Code comments are exempt.
- **24h clock everywhere.** Never render AM/PM. Format times as `HH:mm`; native `<input type="time">`
  needs `lang="en-GB"` or the browser falls back to its own locale.
- **DTOs** in `Core/Dtos/Dtos.cs`; map via `FromEntity`. Don't leak entities.
- **Auth model:** JWT access token in response body (~15 min); 6-month refresh token in httpOnly
  `Secure` cookie (path `/api/auth`), rotated on every refresh. Logic in `TokenService.cs`; cookie I/O in `RefreshCookieManager.cs`.
- **Day math is server-side.** The client consumes `occurrence.isOverdue` and `occurrence.isBehind`; it
  never recomputes them. Purely presentational date formatting may stay client-side. (The calendar's DUE
  row is the one exception: `dueRowRef` in the client.)
- **`PATCH /api/occurrences/{id}` is a partial update** via `Optional<T>`: an absent field is kept, an
  explicit `null` clears it. Send only what changes (`occurrencesApi.patch`). The activity `PUT` is a
  full replace: a caller that omits `tagIds`, `repeatAfterDays` or `reminders` clears them. Event-kind edits go
  through `PUT /{id}/event`, also a full replace (send `reminders` every time).
- **Tags on occurrences:** filters, grouping and counts use `effectiveTags`, never `activity.tags`. Any query
  that builds an `ActivityDto` must `.Include(a => a.Tags)`; one that builds an `OccurrenceDto` must
  `.Include(o => o.Tags)` beside the activity's (`WithFullIncludes`).
- **Per-goal figures count an occurrence once per goal; anything summed across goals counts it once.**
- **Destructive actions confirm via `ConfirmDialog`**; mutations without inline error display report
  failures with `toastError`. Row dropdowns use `components/ui/ActionMenu.tsx`.
- **Frontend:** `verbatimModuleSyntax` — use `import type` for type-only imports. TanStack Query for
  server state; Zustand for auth.
- **Query keys:** every occurrence list lives under `['events', ...]`. After any occurrence write invalidate
  `['events']` (a time split write also `['insights']`). After any activity write invalidate `['activities']`
  **and `['events']`** (occurrences embed their activity). After any goal write also invalidate `['goals']`.
  Never call `invalidateQueries` for these directly: use the helpers in `lib/invalidate.ts`.
- **Theming:** semantic CSS variables in `index.css` → Tailwind via `@theme inline`. Never hardcode
  `bg-slate-*` / `text-*-600`. Dark mode = `.dark` on `<html>`, controlled by `lib/theme.ts`. See `design.md`.

## Gotchas

- ⚠️ **A child with a pre-set `Guid Id` added to a *tracked* parent's nav collection is treated as an
  existing row** and issues an UPDATE matching nothing. Use `db.Set<T>().Add(...)` explicitly (see
  `OccurrenceService.ApplySubtasks`). Relationship fixup then also appends it to the parent collection,
  so don't add it twice if you build the response from that collection.
- ⚠️ **SQLite can't `ORDER BY` a `DateTimeOffset` or aggregate a `decimal`** — sort/sum client-side after `ToListAsync`.
  It also **can't translate a `DateTimeOffset` range `WHERE`**, so occurrence date-window filtering runs in
  memory. SQL pre-filters on those queries are limited to null checks.
- ⚠️ **SQLite can't do APPLY**, so a filtered `SelectMany` over `Activity.Goals` fails; use `a.Goals.Any(...)` or
  the join form in `GoalService`.
- ⚠️ **Guids are UPPER-case TEXT in SQLite.** Raw SQL in a migration that mints an id must produce upper-case
  (`hex()` already does; don't `lower()` it), or the row lists fine but matches nothing by key.
  `MigrationTests` guards this.
- ⚠️ **JWT config is read eagerly** in `Program.cs` (`jwt.Validate()` throws at startup for a missing or short
  secret). Both `JwtSecurityTokenHandler.DefaultMapInboundClaims = false` and `options.MapInboundClaims = false`
  must be set. In tests, use `builder.UseSetting("Jwt:Secret", ...)` in `ConfigureWebHost`, not
  `services.Configure<JwtOptions>()`. Tests set `RateLimit:Auth:PermitLimit` high in `LoomApiFactory`.
- ⚠️ **`tryRefresh()` in `lib/api.ts` returns `'ok' | 'denied' | 'unreachable'`, not a boolean.** Only `denied`
  may sign the user out; `unreachable` (no response, or 5xx) must keep the session.
- ⚠️ **Calendar:** plain click / tap on empty grid creates. The touch tap is guarded (`TAP_MAX_MS`,
  `SCROLL_SETTLE_MS`, no latched swipe, unchanged `scrollTop`) and the mouse path also checks
  `lastPointerTypeRef`, because a touch arrives a second time as a compatibility mouse event. Every grid
  coordinate goes through `TimeScale` (`toPx`/`toMin`); any drag expands to the linear scale first
  (`expandForDrag`) and scroll position is held by `captureAnchor` + the anchor layout effect, captured
  *before* any state is queued. The `.calendar-tray` bottom edge doubles as the grid's 00:00 line when the
  tray shows, so restyle it but don't remove it.
- ⚠️ **Android drops a push that arrives while the app is open** unless `capacitor.config.ts` keeps
  `PushNotifications.presentationOptions` with `alert`. Nothing errors; "Send test" from Settings just never shows.
- **`dotnet ef database update` does not touch the app's database.** `LoomDbContextFactory` points
  design-time tooling at `loom-design.db`; `src/Loom.Api/loom.db` is migrated by the API on startup
  (`Database:MigrateOnStartup`), so restart the API to apply a new migration to dev data. If `dotnet ef`
  isn't found: `PATH="$PATH:$HOME/.dotnet/tools"`. SQLite only; no Postgres migration set exists.
- **`Jwt:Secret` ≥32 bytes** (`JWT_SECRET` in `.env`); empty in `appsettings.json` by design. `docker-compose.yml` maps
  `JWT_SECRET`/`COOKIE_SECURE` onto `Jwt__Secret` / `Auth__RefreshCookie__Secure` - a bare `JWT_SECRET` env var is never read by the app.
  `COOKIE_SECURE` must be `false` for plain-HTTP local dev. Behind a reverse proxy set `BEHIND_PROXY=true`; leave it off
  when the port is exposed directly, since forwarded headers are then client-controlled.
- **Dev port:** `dotnet run` uses `launchSettings.json` (port 5200). Published DLL: set `ASPNETCORE_URLS`.
- **`DayMath` is DST-tested** (`Unit/DayMathTests.cs`). Keep `StartOfDay`/`EndOfDay` going through
  `LocalToInstant`; using `GetUtcOffset` directly on a skipped wall-clock time puts the boundary late.
- **Tests:** in-memory SQLite, kept-open connection, `EnsureCreated()` (not Migrate) in factory. Isolated DB per integration test class.

## Git

**Never run `git commit` unless the user explicitly asks.** Make the changes, stop, and wait.

## Verify changes

`dotnet test` for backend; `cd client && npm run build` for frontend. End-to-end: both dev servers or `docker compose up --build`.
