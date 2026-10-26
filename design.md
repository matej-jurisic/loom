# Loom — Design

Visual and UX rules. Behaviour lives in `spec.md`, code navigation in `CLAUDE.md`. Colours, spacing and
radii come from the semantic tokens in `client/src/index.css`; never raw values.

## Aesthetic

Clean, flat productivity dashboard: white panels, 1px borders, generous whitespace. Hierarchy comes from
colour, weight and spacing alone. **No shadows on internal elements**; `shadow-pop` is only for floating
things (modals, menus, popovers, toasts).

## Colour

- Canvas `#F3F4F6`, panels white, borders `#E5E7EB`, text `#111827` / secondary `#6B7280`.
- **Primary:** Slate Blue `#8499B1` (logo tile, active nav icons, primary buttons, checked boxes, progress).
- **Goal status tones:** Focus primary, Active teal, Bench and Closed gray. A track uses its own colour, else the Active tone.
- **Occurrences** take the category colour (or goal colour per the setting): low-opacity fill, solid left border. Neither: gray.
- **Badges:** `rounded-full px-2 py-0.5 text-xs font-medium`, tinted via `color-mix`; goal badges in the goal's colour, else its status tone.
- **Dark mode:** `.dark` on `<html>`. Tokens only; never branch on the theme in components.
- **Brand mark:** a plain weave of eight rounded filled bars on a 24x24 grid, white on primary in an `h-8 w-8 rounded-lg` tile.

## Typography

Inter, then `system-ui`. Page headers semibold 18-20px; titles 14px regular; metadata 11-12px muted.

- **Never bold** body text, metadata, buttons or inactive nav; only the active nav label is `font-semibold`.
- Done: strikethrough and faded. Skipped: never struck through.
- Section labels: `text-xs font-medium uppercase tracking-wide text-muted-foreground`.

## Layout

- **Sidebar:** 240px, sticky, white, right border. Brand, page items, a `border-t` "Lists" section (each in its borrowed
  icon, lit in its colour when active), Guide and Settings at the bottom. Nav items 14px `gap-3 px-3 py-2`; active is
  `bg-accent` with a primary icon; inactive muted. Active on sub-routes too.
- **Mobile:** icon-only bottom bar, **max 5 slots** (Plan, Activities, Calendar, Occurrences, More). New pages go in the
  More sheet, never a 6th tab. More takes the primary tint when its page is active.
- **Page header:** 57px bar with prev/next, title, jump-to-today when off today, a date input (`sm+`) and `+`.
- No view reserves a fixed side panel.

## Components

- **Buttons:** primary, outlined, ghost; `h-9` / `h-8`, regular weight, no shadow. `Button` has no gap, so **never put an
  icon and a label in one `Button`**; hand-roll a `flex gap-1.5` button.
- **Delete:** icon-only `Trash2` square in `text-destructive`, `aria-label`, always through `ConfirmDialog`; `mr-auto` in a footer.
- **Cards:** `border bg-card rounded-[var(--radius-lg)] px-6 py-6`, no shadow.
- **Checkboxes:** square; checked `bg-primary` with white check; skipped a gray outline with "×".
- **Modals:** centred over `bg-black/40 backdrop-blur-sm`, `shadow-pop`. Escape closes the topmost only. Create dialogs focus
  the first field; edit dialogs focus nothing.
- **ConfirmDialog:** names the item; ghost Cancel, destructive confirm; stays open loading until success.
- **Toasts:** bottom-centre above the mobile nav, auto-dismiss 5s, at most one text action (Undo).
- **ActionMenu:** `MoreHorizontal` trigger, flips above when needed. Order: view, actions (Skip, Schedule, Duplicate, Add),
  Edit, separator, Delete.
- **Select:** an option's sublabel sits muted on the right (list and closed field) and is searchable.
- **Chip toggles** (tags, reminders): `rounded-full`, selected `border-primary bg-primary/10 text-primary`.
- **Scroll areas** use `.scroll-slim`; never a default OS scrollbar inside a panel.
- **Failure states:** `ErrorBoundary` with Try again / Reload; a slim muted `OfflineBanner`; full-screen `ConnectionLost` retry.
- **Icon picker:** group chips, then the active group's icons; all groups share one grid cell so switching never resizes the modal.

## Occurrence presentation

- **Calendar blocks:** solid scheduled, **dashed and striped planned**. Done keeps its colour, faded, struck title. Skipped is
  an empty solid outline with a muted `×` title (solid, because dashed means planned). Titles are followed by the short
  label as plain text, then muted goals ("Lab 2 DL · ARH2").
- **List rows:** short label as a solid `bg-muted` pill after the title; planned as a dashed muted `PLAN` badge after the goals.
  Tags are plain muted `#name` text, so goals stay the only coloured chips.
- **Deadline and Related links** are quiet metadata, never badges or progress bars: `Flag` / `CornerDownRight` plus the
  target's title on the meta line; the target shows "3 sessions, 4h 30m" / "1/3 related". Their pickers label options
  with goals and date ("ARH2 · Mon 27/10").
- **Occurrence dialog:** activity (or title), title override and When always visible; the rest under an inset "More options"
  panel in order Deadline, Related to, Category and Goals (events), Tags, Reminders, Subtasks. Open by default when editing.
  Reminders show only for occurrences that can fire.
- **Detail modal footer:** Delete, the "Again <date>" checkbox, `...`, a round filled primary Done, a round bordered skip `X`.
- **Notes:** a three-row textarea in the detail modal, saving on blur and close. Shown nowhere else.
- **Time split:** work-type chips, an `h-3` bar in shades of one colour with draggable handles (`sm+`), rows with a time
  field accepting `90`, `1h 30m`, `1:30`, `1.5h`. Auto rows show `AUTO`. "45m not split" when there is a remainder. No percentages.
- **History dialog:** four stat tiles, an eight-week day strip, then a scrolling recent list. Renders at final height with
  placeholders while loading. Read-only.
- **Related dialog:** small-caps section headings with counts (Deadline, Sessions, Related to, Related), each over the
  standard occurrence list rows, which keep their checkbox and menu.

## Calendar

- **Grid lines:** one flat `--calendar-line` shade for every rule; hours are told apart by labels, not weight.
  `--calendar-edge` closes the tray and doubles as the 00:00 rule. Now is a `destructive` hairline with a gutter dot.
- **Tray:** DUE / SOON / FLOAT / all-day rows as one band, gutter-labelled. Shown only with content or during a drag; DUE and
  SOON hide during a drag. Pill rows wrap (DUE, SOON one line, FLOAT two) and fold the rest into a `+N` pill that expands in place.
- **Due pins:** a 1px line across the column (dashed planned, gray skipped, faded done) with a small tinted pill at its right end
  showing title and `HH:mm`. Above blocks; only the pill takes pointers.
- **Nothing is drawn on empty grid**: no availability, no suggested slots.
- **View toggle:** segments from `sm` (active gets `bg-muted`, never a weight change); below `sm`, a single dial button.
- **Compact mode** (`FoldVertical` / `UnfoldVertical`): no grid lines, no now line; hour labels only where one scale fits all columns.
- **Hover guide:** a primary hairline with an `HH:mm` tab at the quarter hour a click would create.

## Pages

- **Daily Plan:** Unfinished card (`border-destructive/30 bg-destructive/5`), agenda (time gutter, 1px spine with dots, primary
  now line), Deadlines, Planned, Floating, then under a `border-t` focus chips and the heatmap. Planned rows: `~` and a hollow
  dot. An overdue row today gets `bg-destructive/10`. No urgency colours; nearness is said in words. **No completion ring or done/left stats.**
- **Goals:** Focus as full cards, others compact rows with a chevron. A goal with an icon or colour shows a `GoalTile`.
  Stale shows as foreground weight, no colour change.
- **Categories / Tags:** one bordered `divide-y` list at every width: tile, name over muted counts, `ActionMenu`.
- **Occurrences:** toolbar of search and a `Filters` button (count pill when active) expanding a grid of `Select`s. Rows have a
  `GripVertical` handle (hover-only on pointer screens); a dragged row lifts with `shadow-lg` and stays in its section.
  Saved List rows on `/occurrences` use the same handle.
- **Insights:** one `max-w-2xl` column of bordered cards, no charts. Summary tiles with a muted "vs previous" line and no
  good/bad colouring; rows with right-aligned `tabular-nums` duration and a 4px bar in the category colour.

## Copy

The user designed the domain, so the UI never explains it back.

- **No concept explainers**; an empty state is a title and a CTA.
- **No restating the controls**; labels are labels, not sentences.
- One terse line of generated summary is fine when it shows numbers not otherwise on screen.
- No em dashes, plain sentences, no blame.
- **Dates:** day first, numeric month (`Sat 24/10`, `24/10`); the year only outside the current year, except the calendar title.
  Times 24-hour `HH:mm`.
