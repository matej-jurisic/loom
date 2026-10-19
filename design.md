# Loom — Design

Visual and UX rules. Behaviour and domain rules live in `spec.md`; code navigation in `CLAUDE.md`.
Colours, spacing and radii come from the semantic tokens in `client/src/index.css`; use them, never raw values.

## Aesthetic

Clean, minimal, flat productivity dashboard: white panels, 1px borders, generous whitespace, strict
typographic hierarchy. Hierarchy comes from colour, weight and spacing alone. **No shadows on internal
elements**; `shadow-pop` is only for floating things (modals, menus, popovers, toasts).

## Colour

- **Canvas** `#F3F4F6`, **panels/cards** white, **borders** `#E5E7EB`. Primary text `#111827`, secondary `#6B7280`.
- **Primary brand:** Slate Blue `#8499B1` for the logo tile, active nav icons, primary buttons, checked
  checkboxes and progress.
- **Goal status tones** (status dot, ring, checkpoints, heatmap): Focus is primary, Active is teal, Bench and
  Closed are neutral gray. A track has no tier and draws in its own colour, or the Active tone without one.
- **Occurrence colour** is the activity's **category** colour by default: a low-opacity fill with a solid left
  border. With the "Calendar colours: Goal" setting it is the goal's colour, falling back to the category when
  the activity's coloured goals don't agree. Neither: neutral gray.
- **Badges:** `rounded-full px-2 py-0.5 text-xs font-medium`, tint and text via `color-mix`; tones
  `neutral | red | blue | amber | green`. Goal badges use the goal's own colour, else their status tone.
- **Dark mode:** `.dark` on `<html>`, preference in `lib/theme.ts`. Style with tokens only; never branch on the theme in components.

### Brand mark

A plain weave: two strands crossing, alternately over and under, as eight rounded bars on a 24x24 grid
(`LoomMark.tsx`). Filled, not stroked, so it stays legible at 16px. White on the primary colour in an
`h-8 w-8 rounded-lg` tile beside the wordmark. The same geometry backs the favicon and native icons.

## Typography

Inter, then `system-ui, sans-serif`. Page headers semibold 18-20px; nav labels, titles and goal names regular
14px; metadata 11-12px `text-muted-foreground`.

- **Do not bold** body text, inactive nav labels, metadata or button labels. Only the active nav label is `font-semibold`.
- Done shows strikethrough and faded text. Skipped never strikes through, so the two read apart.
- Section group labels: `text-xs font-medium uppercase tracking-wide text-muted-foreground`.

## Layout

A 240px sidebar (`w-60`, sticky, white, 1px right border) beside a fluid white canvas. No view reserves a fixed side panel.

- **Sidebar:** brand tile and "Loom" on top; the main page items; then a `border-t` "Lists" section of links, one
  per saved occurrence list (its borrowed icon, lit in its colour when active) that open `/occurrences/lists/<id>`;
  Guide and Settings pinned at the bottom. Navigation only: lists are managed on the Occurrences page.
- **Nav items:** 14px, `gap-3 px-3 py-2`, `rounded-[var(--radius-md)]`. Active is `bg-accent` with a primary icon and
  `font-semibold` label; inactive is all `text-muted-foreground`; hover `bg-accent`. An item stays active on its sub-routes.
- **Mobile:** a bottom bar capped at **5 slots**, icon-only (Plan, Activities, Calendar, Occurrences, More). New pages go in the
  More sheet (bottom sheet, `rounded-t-2xl`, drag handle, closes on backdrop, Escape or navigation), never a 6th tab.
  The More button takes the primary tint when the current route is one of its items.
- **Page header:** a 57px bar with prev/next, title, a jump-to-today button when off today, a date input (`sm+`) and `+`.
  Plan and Calendar share the pattern.

## Components

- **Buttons:** primary (`bg-primary text-primary-foreground`), outlined (`border border-border`, hover `bg-accent`),
  ghost. `h-9` md, `h-8` sm, regular weight, 6-8px radius, no shadow. `Button` sets no gap between children, so **never put an
  icon and a label in one `Button`**; use a hand-rolled `flex gap-1.5` button.
- **Delete** is an icon-only square button (`Trash2`, `text-destructive`, hover `bg-destructive/10`, sized to its row),
  named by `aria-label`, spinner while in flight, always through `ConfirmDialog`. In a footer with Cancel and Save it gets `mr-auto`.
- **Cards:** `border border-border bg-card rounded-[var(--radius-lg)]`, `px-6 py-6`, no shadow.
- **Checkboxes:** square `rounded-[4px]`; checked is `bg-primary` with a white check; skipped is a gray outline with "×".
- **Modals:** centred, `backdrop-blur-sm` over `bg-black/40`, `shadow-pop`, `rounded-[var(--radius-xl)]`. Escape closes only the
  topmost. A create dialog focuses its first text field; an edit dialog focuses nothing (the tag dialog focuses its name, its only field).
- **ConfirmDialog:** item name in the message, ghost Cancel, destructive confirm. Stays open with a loading state until the mutation succeeds.
- **Toasts:** bottom-centre above the mobile bottom nav, card-style pill with a tone icon, auto-dismiss after 5s, X to dismiss. May
  carry **one text action** in `text-primary` (the Undo after completing a repeating activity). Used for failures with no inline display.
- **ActionMenu:** `MoreHorizontal` trigger, portal with fixed positioning, flips above when there is no room. Entry order everywhere:
  view / navigate, then actions (Skip, Schedule, Duplicate, Add), then Edit, then a separator and Delete. Labels are plain "Edit" /
  "Delete" unless a second edit target needs naming.
- **Scrollbars:** internal scroll areas use `.scroll-slim` (thin, invisible until hover). Never leave a default OS scrollbar inside a panel.
- **Failure states:** `ErrorBoundary` ("Something went wrong", Try again, Reload) wraps the routes inside `AppShell` and the whole app;
  `OfflineBanner` is a slim muted strip (offline is a state, not a mistake); `ConnectionLost` is a full-screen retry shown instead of login.
- **Icon picker** (`IconPicker` in `CategoryModal.tsx`): a row of group chips (`ICON_GROUPS`), then the none tile and only the active
  group's icons. Every group is stacked in one grid cell with inactive ones `invisible`, so switching tabs never resizes the modal. New icons go into a group.

## Occurrence presentation

- **Calendar blocks:** solid for scheduled, **dashed and diagonally striped for planned**. Done keeps its category colour, faded, with a struck
  title. Skipped is an empty outline (no fill, no stripe, solid 1px `muted-foreground/40` border), muted title led by `×`, no strikethrough;
  solid rather than dashed because dashed means planned. All-day pills follow the same rules.
- **Deadline link:** quiet metadata, never a badge or progress bar. A linked session's meta line shows a `Flag` icon and the deadline's
  title; the deadline shows "3 sessions, 4h 30m". The "Deadline (optional)" select sits first in "More options".
- **Notes:** a `Notes` section in the detail modal after subtasks, before the time split, as a three-row non-resizable textarea. No
  save button (saves on blur and on close; a failed save keeps the text and toasts). Notes show nowhere else.
- **Tags:** a chip picker in the activity dialog (`rounded-full` toggles, `border-primary bg-primary/10 text-primary` when selected,
  `New tag...` input below). On rows and the detail modal a tag is plain muted `#name` text, so goals stay the only coloured chips. The
  occurrence dialog has the same picker, with the activity's own tags listed beneath as "Also from the activity".
- **Repeat ("do again"):** the activity dialog has "Do again after (optional)", a `w-20` numeric input with a `days` suffix and placeholder `Off`
  (invalid turns the border destructive with an error below), and a "Show as overdue" checkbox. The detail modal footer has an "Again <date>"
  checkbox left of Done, ticked every time it opens. Activity rows show a `Repeat` icon and "again after 7 days".
- **Time split** (bottom of the detail modal): work-type chips (selected `bg-primary`, unselected `bg-muted`, dashed `+ Work type` to create);
  a `h-3` bar with one segment per row in shades of one colour (the category's, else primary), with draggable edge handles from `sm:`
  (15-minute steps, 5 under an hour) that pin both neighbours; rows of shade dot, title and a `tabular-nums` time field accepting `90`,
  `1h 30m`, `1:30` or `1.5h`. Auto rows show a muted share and `AUTO`; pinned rows show `RotateCcw` to hand back. Below `sm` the field gets
  -15 / +15 steppers. The heading says `45m not split` when there is a remainder. No percentages. Every change saves immediately.
- **History dialog** (`OccurrenceHistoryModal`): titled `<name> - history`; widest to narrowest: four stat tiles
  (`grid-cols-2 sm:grid-cols-4`, a missing figure reads `Unknown`), the day strip (seven weekday columns, eight week rows, `h-7 w-7`
  cells: done `bg-primary`, skipped `bg-muted-foreground/60`, pending outlined, empty `bg-muted`, future nothing), "Time by activity", then the
  recent list (`max-h-60`, scrolling). While loading, the shell renders at its final height with pulsing placeholders so it never grows into the answer.
  Read-only: the footer is a single Close.

## Calendar

- **Grid lines:** one flat shade, `--calendar-line`, lighter than `border`, for every rule (half hours, hours, column borders, header bottom).
  Hours are told apart by gutter labels, not line weight. The only exception is `--calendar-edge`, which closes the tray and doubles as the
  00:00 rule. The grid stays neutral so colour means category and nothing else. Now is a `destructive` hairline with a gutter dot.
- **Tray** (`.calendar-tray`): the DUE / SOON / FLOAT / all-day rows as one band on the page surface, each labelled in the gutter, divided by
  `--calendar-line` and closed by `--calendar-edge` at the same hairline width. Rendered only when a row has content or a drag is in progress.
  DUE and SOON are withdrawn during a drag since neither accepts a drop and their height would push real targets into the autoscroll zone.
- **Nothing is drawn on empty grid:** no availability overlay, no suggested slots.
- **View toggle:** from `sm`, Day / 3 days / Week as segments in one `h-8 rounded-md border` shell where only the active segment gets
  `bg-muted`; never change font weight between states. Below `sm`, a single fixed-width dial button (needle icon rotating 200ms plus the
  range label) that steps through the ranges.
- **Compact toggle:** left of the range switch, `FoldVertical` when full and `UnfoldVertical` when collapsed, `bg-muted` while active.
- **Compact mode draws no grid lines, no now line**, and the stack is exactly the blocks with the 2px gutter between them. Hour labels
  show whenever one scale speaks for the whole grid (day view, or any expanded view) and are blank only in compact multi-day.
- **Hover guide:** a `primary` hairline at the quarter hour a click would create, with an `HH:mm` tab (`primary-foreground` on `primary`
  mixed 50% with black, since plain primary is light in dark mode). Hidden over blocks and during move/resize drags, visible while dragging out a new one.
- **Touch** has a high bar for "a tap" (see `CLAUDE.md` Gotchas). A press that misses it does nothing: creating something by accident while reading is worse than a missed tap.

## Pages

- **Daily Plan:** top to bottom: day header; the **Unfinished** card (`border-destructive/30 bg-destructive/5`, count, "Move to tomorrow",
  rows); the timeline agenda; Deadlines; Planned; Floating; No date; then under a `border-t` the focus-goal chips and the Goal activity heatmap.
  The agenda is a three-column grid (content-sized time gutter, 0.75rem spine, fluid rows) with all-day items in a plain bordered list above
  it. The spine is a 1px `border` line with a ringed 2px dot per row; the current time is a primary label, dot and hairline splitting past from
  upcoming; relative labels ("now", "in 40m") sit under the gutter time. A pending **planned** row is soft: `~` on the gutter time and a hollow
  dot. An overdue row today keeps its place with `bg-destructive/10` and a `bg-destructive` dot. Deadlines and No date use a full-width
  header button (label, mono count, `ChevronDown` that rotates when open); Deadlines is open by default, No date collapsed. No urgency colouring:
  nearness is said in words. **There is deliberately no completion ring and no done/left stat row.**
- **Goals:** sections Focus, Active, Bench, Tracks, Closed; the Focus chip reads used/limit. A goal with an icon or colour shows a `GoalTile`
  in place of the status dot (small 24px beside a ring on compact rows). Focus goals are full cards; the rest are compact rows with a chevron
  (none when there is nothing to reveal). A stale Focus goal shows recency in foreground weight, with no colour change. Tapping the title opens History.
- **Categories / Tags:** one screen at every width: a bordered `divide-y` list, each row a `h-8 w-8 rounded-lg` tile (category icon and tint, or `Hash` on
  `bg-muted`), the name over a muted `N activities, M occurrences`, and an `ActionMenu` (View activities, View occurrences, Edit, Delete). The
  Activities page shows the URL filter as a `rounded-full bg-muted` chip with an `X`.
- **Occurrences:** a toolbar outside the scroll area, one row at every width: search and a `Filters` button (`SlidersHorizontal`, primary with a count
  pill when active) that expands `OccurrenceFilterFields` (a `grid-cols-2 sm:grid-cols-3` of `Select`s with leading muted icons, the same ones
  the sidebar uses). Text actions below show only when useful ("Save as list" / "Reset filters"; in a list "Save to list" / "Revert"). Sections
  collapse; an Overdue label is `text-destructive`. A back `ChevronLeft` returns to the Lists screen.
- **Lists screen:** a "Lists" label over a management-style bordered list (`ListTile`, name over a muted filter summary, live match count,
  `ActionMenu`), or a dashed empty card; then a standalone "All occurrences" row.
- **Insights:** one `max-w-2xl` column of uppercase-labelled bordered cards with `divide-y` rows, no chart. Period `Select` on top; three summary
  tiles (Time, Done, Active days) with a muted "+/-x vs previous" line and no good/bad colouring; then rows with title, right-aligned
  `tabular-nums` duration and a 4px bar in the category colour on `bg-muted`. Work-type lines are indented muted footnotes under an activity,
  closing with an italic `Not split`. Everything is a sum of what was logged.

## Copy

The user designed the domain, so the UI never explains it back to them.

- **No concept explainers.** Empty states are a title and a CTA, not a paragraph defining a term.
- **No restating the controls.** A helper line is only worth its space if it says something the field does not.
- **Field labels are labels, not sentences.** "Assumed cadence", not "Before I've learned from your history, assume this happens".
- Generated data summaries are fine when they show numbers not otherwise on screen; one terse line.
- No em dashes, plain sentences, no blame.
