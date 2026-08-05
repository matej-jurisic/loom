## Visual Reference

The target aesthetic is a clean, minimal, flat B2B productivity dashboard — white panels, 1px borders, no drop shadows on internal elements, generous whitespace, strict typographic hierarchy. The reference screenshot is Aloplanner (https://aloplanner.com/todos). Match the *feel* and *design language*, not the content.

---

## Overall Aesthetic

Modern, clean, minimalist web-based dashboard. Spacious, organized, strictly professional. Relies on subtle 1px borders and whitespace. Flat design — no shadows on internal elements. The hierarchy is established through color, weight, and spacing alone.

---

## Color Palette

### Base Colors

- **Canvas (app background):** Light Gray `#F3F4F6`. The outer shell — visible between panels.
- **Panel / Card background:** Pure White `#FFFFFF`. Sidebar, cards.
- **Borders & Dividers:** Very Light Gray `#E5E7EB`. All column separators, card borders, list dividers.

### Text Colors

- **Primary Text:** Dark Charcoal `#111827`. Event titles, goal names, nav labels (active).
- **Secondary / Metadata Text:** Medium Gray `#6B7280`. Datetimes, durations, statuses, nav labels (inactive).

### Accent & Brand Colors

- **Primary Brand:** Slate Blue `#8499B1`. Logo text, active nav icons, primary action buttons, checkboxes (checked state), active progress bars.
- **Goal Status Colors (calendar blocks and tags):**
  - Focus Goals: Primary/blue tones
  - Active Goals: Teal/Light Blue tones
  - Bench Goals: Neutral Gray
- Event blocks use a very light (low-opacity) background of their parent goal's color, with a solid 1px border of the same color. Events without goals use neutral gray.

### Brand Mark

A plain weave: two strands crossing, each alternately over and under the other, drawn as eight
rounded bars on a 24x24 grid (`client/src/components/layout/LoomMark.tsx`). Filled, not stroked -
it reads as a mark, not a UI icon, and stays legible down to a 16px favicon. White on the primary
Slate Blue `#8499B1`, inside an `h-8 w-8 rounded-lg` tile, next to the wordmark in the sidebar and
both auth pages. The same mark backs `public/favicon.svg` and the native app icon/splash sources in
`client/assets/` (`icon-only`, `icon-foreground` + `icon-background` for Android's adaptive icon,
`splash` + `splash-dark`) - one shape everywhere the app identifies itself.

---

## Typography

- **Font Family:** Inter (primary), then `system-ui, sans-serif`.
- **Hierarchy:**
  - Section/Page headers: semibold, 18-20px
  - Nav labels, event titles, goal names: regular weight, 14px
  - Metadata (times, tags, durations): 11-12px, `text-muted-foreground`
- **Strikethrough:** Done/Skipped events show strikethrough with faded `text-muted-foreground`.
- **Do not bold** body text, nav labels (inactive), metadata, or button labels.
- **Active nav label only:** `font-semibold`, `text-foreground`.

---

## Layout & Structure

### Two-Pane Layout

```
[Left Sidebar 240px] | [Right Canvas — fluid]
```

The panes are separated by a 1px `border-[var(--border)]` vertical divider. No gap, no padding between them. The canvas is full width on every page; no view reserves a fixed side panel.

### 1. Left Sidebar (240px fixed)

- White background (`--card`).
- **Top:** Brand mark (see below) + name "Loom" in `text-primary`, semibold. Bottom border.
- **Middle:** Vertical nav. Items: icon + label. Gap `gap-0.5` between items. Padding `px-3 py-4`.
- **Active nav item:** `bg-accent` (gray tint) pill. Icon in `text-primary`. Label in `text-foreground font-semibold`.
- **Inactive nav item:** Icon and label both in `text-muted-foreground`. Hover: `bg-accent`.
- **Bottom (pinned):** Settings item, separated by `border-t`.
- Sidebar is `sticky top-0 h-screen` — does not scroll.

### 2. Right Canvas (fluid)

- White background.
- **Top bar:** Current date, prev/next arrows, view toggle, zoom in/out controls (adjusts pixel-per-hour scale).
- **View toggle, desktop (`sm` and up):** Day / 3 days / Week as three segments in one `h-8 rounded-md border border-border` shell, matching the other header buttons - no track fill, the active segment is just `bg-muted`, which is also the header buttons' hover state. Only colour changes between states - never the font weight, which would resize the segment and shift the whole control on every switch. All three sit on the bar at every width, with full labels, so the current range is readable without opening anything.
- **View toggle, mobile (below `sm`):** three labelled segments don't fit next to the fold toggle and `+` on a phone header, so this is a single dial button instead: a small circular needle icon (pointing up/right/down for Day/3 days/Week, clockwise as the range grows) plus the current range's label as text, in the same `h-8 rounded-md border border-border` shell as the other header buttons. Fixed width (sized to the longest label, "3 days"), for the same reason the desktop segments never change font weight: a button that resizes on every tap is distracting. Tapping steps forward through the three ranges (wrapping from Week back to Day); the needle rotates to its new position with a 200ms transition. One tap target instead of three, and the label still makes the state unambiguous.
- **Floating row:** All-day row pinned above the time grid — shows floating occurrences as compact chips. Overdue occurrences are rendered in a separate sticky band at the top of the scroll container so they stay visible while scrolling.
- **Content:** Time-based vertical grid. Hours listed on the far left. Event blocks placed in their time slots.
- **Event blocks:** Light-tinted background + solid 1px colored left border, matching the event's goal color. Title + time range inside.
- **Clicking empty grid creates** a 30-minute occurrence there, pre-filled in the create modal. The calendar's job is to show what you decided and to make adding something cheap, so the cheapest gesture does the most common thing. A drag still sets an exact span, and a long press does it on touch, for when the length matters.
- Nothing is drawn on empty grid: no availability overlay, no suggested slots. An empty hour means nothing in particular, because the calendar is not assumed to be complete.
- On touch the bar for "a tap" is high, because a scrolling finger keeps producing near-taps: under 250ms, no latched swipe direction, not landed on a still-gliding view, and the scroll position unchanged while it was down. A press that misses any of those does nothing at all - creating something by accident while reading the day is far worse than a tap that does not register.

---

## UI Components

### Nav Items

- 14px text, `gap-3`, `px-3 py-2`, `rounded-[var(--radius-md)]`.
- Active: `bg-accent`, icon `text-primary`, label `text-foreground font-semibold`.
- Inactive: icon + label both `text-muted-foreground`. Hover: `bg-accent`.
- A sidebar item stays active on its sub-routes (an activity, a goal), so drilling in never leaves the sidebar looking like nowhere is selected.

### Buttons

- Primary: `bg-primary text-primary-foreground`, `rounded-[var(--radius-md)]`, no shadow.
- Outlined: `border border-border bg-transparent text-foreground`, hover `bg-accent`.
- Ghost: transparent bg, `hover:bg-accent`.
- Height: `h-9` (md), `h-8` (sm). Font: regular weight (not semibold or bold).
- Border radius: 6-8px.
- **Delete is an icon-only square button**, never a labelled one: `Trash2` in `text-destructive` on a transparent ground, hover `bg-destructive/10`, sized to the row it sits in (`h-9 w-9` beside md buttons, `h-8 w-8` beside sm). It carries the name in `aria-label`, swaps the icon for an inline spinner while the delete is in flight, and always opens a `ConfirmDialog` rather than acting. Where the same footer holds Cancel and Save it gets `mr-auto`, so the full width separates it from the button the user actually meant to press. Used by `EventDetailModal`.
- The `Button` component sets no gap between its children, so **never give a `Button` an icon and a label together** - they render flush and read as one glyph. Icon plus label is a hand-rolled `flex ... gap-1.5` button (see the empty-state "New Activity" button).

### Activity history dialog

- Titled `<activity> - history`, opened from an activity row's action menu. Meta line first (category, goal badge), then four stat tiles, then the day strip, then the recent list. Widest-to-narrowest: the tiles answer the question in one glance, the strip shows the shape, the list is the detail you only sometimes want.
- **Stat tiles:** `grid-cols-2 sm:grid-cols-4`, each `rounded-lg border border-border bg-muted/40 px-2.5 py-2` with a `text-[10px] uppercase tracking-wide` label over a `text-sm` value. A tile with nothing to show reads `Unknown` in muted text rather than vanishing: a missing figure is itself an answer, and four tiles that come and go make the dialog resize between activities.
- **Day strip:** centered, laid out the way a calendar is - seven weekday columns under their `Mon`-`Sun` names, eight week rows, current week last. Eight is two months: enough to read a rhythm, not so much that the grid outweighs the tiles above it. Cells are `h-7 w-7 rounded-[4px]` with `gap-1`, sized so a three-letter weekday fits above the column rather than being abbreviated to an initial. Done is solid `bg-primary`, skipped `bg-muted-foreground/60`, pending an outlined `border-primary/50 bg-primary/10`, an empty day flat `bg-muted`, and a day that has not happened yet nothing at all. Each cell carries its date as a `title`; the legend, also centered, spells out the three fills and the window.
- **Recent list:** the activity detail page's occurrence row, at ten rows: status dot, date with `HH:mm` in mono when the occurrence has a time, status word on the right. The box is a **fixed `h-[11.5rem]`** that scrolls - the row count is the one thing here that varies with the data, so it is the one thing not allowed to set the dialog's height.
- **While loading**, the whole shell renders at its final height: tiles with a pulsing bar where the value goes, the strip empty (its size does not depend on the data), and five placeholder rows filling the recent box. The panel is animating in as the request lands, so it must already be its final height - a shell that grows into the answer reads as a stutter, and the first open is exactly when it happens.
- **Read-only**: the two footer buttons are `Close` and an outlined `Open activity` that leads to the detail page for anything this dialog deliberately leaves out.

### Checkboxes (events)

- Square, `rounded-[4px]`. Unchecked: `border border-border bg-transparent`.
- Checked (done): `bg-primary` fill, white checkmark SVG.
- Skipped: gray outline, gray "×" or dashed style.

### Cards

- `border border-border bg-card rounded-[var(--radius-lg)]`. **No shadow.**
- Internal padding: `px-6 py-6`.

### Badges / Tags

- Small pill: `px-2 py-0.5`, `rounded-full`, `text-xs font-medium`.
- Colors via `color-mix`: soft tinted bg + saturated text. Tones: `neutral | red | blue | amber | green`.

### Modals

- White card, centered overlay, `backdrop-blur-sm` backdrop at `bg-black/40`.
- `shadow-[var(--shadow-pop)]` — the ONE place drop shadows are used.
- `rounded-[var(--radius-xl)]`, `border border-border`.
- Escape closes only the topmost open modal (modal stack in `Modal.tsx`).

### Confirmation dialogs

- Every destructive action (delete occurrence / activity / goal / checkpoint / category) goes through `ConfirmDialog` — a small modal with the item name in the message, a ghost Cancel, and a destructive confirm button. Never inline confirms, never immediate deletes.
- The dialog stays open with a loading state until the mutation succeeds; the caller closes it.

### Toasts

- `Toasts` viewport (bottom-center, above the mobile bottom nav) + `useToastStore` / `toastError` in `store/toasts.ts`.
- Card-style pill: `border border-border bg-card shadow-pop`, tone icon (destructive alert / primary check), auto-dismiss after 5s, manual dismiss X.
- Used for mutation failures that have no inline error display (status toggles, deletes, calendar drag reschedules).

### Dropdown menus

- Row action menus use `ActionMenu`: `MoreHorizontal` trigger, menu rendered in a portal with fixed positioning so it is never clipped by overflow containers; flips above the trigger when there is no room below. Closes on outside press and Escape.

### Shadows — strictly flat

- **No `shadow-card`** on any internal element (cards, list rows, panels, sidebar).
- **Only `shadow-pop`** on floating elements: modals, dropdowns, popovers.
- `shadow-pop: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.06)`.

### Scrollbars

- Internal scroll areas (sidebar category list, calendar grid, the history dialog's recent list) use the `.scroll-slim` utility from `index.css`: a thin scrollbar whose thumb is invisible until the container is hovered, tinted from `--muted-foreground`. Never leave a default OS scrollbar visible inside a panel.

### Sidebar & Panel Animations

The left sidebar and the middle recommendation panel slide in/out with CSS transitions when toggled. Use `transition-all duration-300` (or equivalent) on the width/transform; content fades with it. Never animate the canvas width directly — only the panel element.

---

## Dark Mode

- Toggled by adding `.dark` to `<html>`; all colors flow from the CSS variables in `index.css`.
- User preference (light / dark / system) lives on the Settings page, persisted in localStorage (`loom-theme`), default system. Implementation: `client/src/lib/theme.ts`.
- Never branch on the theme in components — style with semantic tokens only.

---

## Daily Plan Page

The `/plan` view is a single canvas holding (top to bottom):

1. **Day header** — 57px bar: prev/next chevrons, day title (full on `sm+`, compact below), jump-to-today button (only when the viewed day is not today), date input (`sm+` only), and a `+`. Same pattern as the calendar header.
2. **Focus goal chips** — one bordered chip per Focus goal in a 1-up / `sm:`2-up grid: status dot, title, last-session recency, and either the milestone percentage (mono) or the ongoing occurrence bar. **Goals open the day, not metrics.** There is deliberately no completion ring and no done/left/planned stat row: those score how much of a day was executed, which turns the page into a report card for a schedule the app never asked you to keep.
3. **Overdue** — `border-destructive/30 bg-destructive/5` card: the count, a "Move to tomorrow" button (`bg-foreground text-background`), then the rows in a plain card list.
4. **Timeline agenda** — a three-column grid (content-sized time gutter, 0.75rem spine, fluid rows) so every row shares one time column. The spine is a 1px `border` line with a 2px dot per row, ringed in `background`; the current time is a primary label, dot, and hairline splitting past from upcoming. Relative labels ("now", "in 40m") sit under the gutter time. No hour grid: this is a checklist, not a scheduling surface.
5. **Planned** and **Floating** — uppercase section labels over bordered card lists. These are the holding places: something can live here indefinitely without a time, which is the point.

Mobile: single column.

---

## Calendar Grid

The grid runs on its own line colour, `--calendar-line`, lighter than the app's `border` because these
rules sit under content for the whole visible day. Half-hour lines, the column borders and the header's
bottom rule all share it, so the grid reads as two shades and not three; full hours are the second
shade, `muted-foreground` at 30%. The current time is a `destructive` hairline with
a dot in the gutter. Blocks carry their category's colour; the grid itself stays neutral so colour
means category and nothing else.

**Compact mode** drops empty stretches of the day rather than shrinking them: a day's events sit in a
straight stack, each block keeping its real duration-proportional height, with no space at all between
one item and the next. Where the stack actually jumps forward in time - the join between one cluster of
events and the next - gets a plain full-width `border` line, so the seam doesn't read as continuous
elapsed time. Nothing states the size of the gap that was dropped; the point of compact mode is that the
gap isn't shown at all.

Segment edges land on the quarter hour, not the hour, so the hour and half-hour lines within a segment
are drawn at absolute positions rather than stepped from the segment's own start. The rhythm stays on
the clock even though the segments do not.

The left gutter carries the hour labels whenever one scale can speak for the whole grid — always in
day view, and in every view while expanded, since expanded columns share the linear scale. **Only
compact multi-day blanks it**, where each column drops its own empty stretches independently and no
single set of labels would be true. Nothing replaces them there: each block carries its own time, so
per-column hour labels would only be clutter in a narrow column.

The compact toggle sits left of the range switch in the toolbar: `FoldVertical` when the grid is full,
`UnfoldVertical` when it is collapsed, tinted `bg-muted` while active.

---

## Mobile Navigation

- **Bottom tab bar is capped at 5 slots**, icon-only: Plan, Activities, Calendar, Goals, and a "More" button (`Ellipsis` icon). New pages go in the More sheet, never a 6th tab.
- **More sheet:** bottom sheet (same overlay + slide-up animation as mobile modals: `bg-black/40 backdrop-blur-sm`, `rounded-t-2xl`, drag handle) listing secondary destinations — Categories, Insights, Settings — as icon + label rows styled like sidebar nav items. Closes on backdrop tap, Escape, or navigation. The More button shows the active (primary) tint when the current route is one of its items.
- **Categories page on mobile** has no sidebar to lean on, so it is two screens instead of one: bare `/categories` is a full-page list of categories (`Active`, `No category`, then each category as an icon-tile row with an edit/delete `ActionMenu`), with the header `+` creating a category. Tapping a row drills into the same filtered occurrence list the desktop layout shows inline, with the header `+` now creating an occurrence and a `ChevronLeft` back button in place of the (removed) drawer trigger.

---

## Insights Page

One `max-w-2xl` column of sections, each an uppercase label over a bordered card with `divide-y` rows. No chart: every stat here is a duration, and a labelled row with a bar reads better than a column per day.

Everything on this page is a **sum of what was logged**. Nothing is a percentage of a day and nothing counts what is missing, so the page stays honest however sparse the calendar is.

- **Period toggle:** segmented control (7 days / 30 days) on a `bg-muted` track with a `p-0.5` inset; the active option is a raised `bg-card` chip. Sits above the first section, left-aligned.
- **Time by activity / by category:** rows with title (category rows lead with the category icon; never colored text), duration right-aligned (`tabular-nums`), and a 4px proportional bar underneath in the category's own color on a `bg-muted` track. Uncategorized uses `CircleDashed` + muted tones.

---

## Spacing & Sizing

- Border radius: buttons/tags `6px`, cards/modals `8-12px`, avatars fully round.
- Column dividers: `border-r border-[var(--border)]` (1px, `#E5E7EB`).
- Sidebar: `w-60` (240px). Middle column: fixed `w-80` (320px).
- List row hover: `hover:bg-accent` (light gray tint), `rounded-[var(--radius-md)]`.
- Section group labels: `text-xs font-medium text-muted-foreground uppercase tracking-wide`.

---

## Copy

Single-user app: the user designed the domain, so the UI never explains it back to them.

- **No concept explainers.** Empty states are a title and a CTA, never a paragraph defining what an activity, goal, or occurrence is.
- **No restating the controls.** A helper line under a field is only worth its space if it says something the field itself does not.
- **Generated data summaries are fine** (`describeProfile`/`profileHint`: the type's actual numbers), because they show values that are not otherwise on screen. Keep them to one terse line.
- **Field labels are labels, not sentences.** "Assumed cadence", not "Before I've learned from your history, assume this happens".
