# REFACTOR_LOG.md

Version history for **MGT Staff Scheduling**. Every shipped version gets
an entry. Newest first.

---

## v0.7.0 — Polish (PDF section divider + Operating Hours editor)
**Date:** 2026-05-13
**Behavioural change:** Yes — two small UX additions:
1. Exported PDFs now show a labelled section header band between the
   FoH and Kitchen slot groups (and before the first FoH group), making
   the printout much easier to scan at a glance.
2. Settings tab gains an "Operating hours" card at the top. Values
   persist to `/settings` in Firebase and constrain the shift-template
   start/end times — narrowing the operating window surfaces inline
   errors on any template row that no longer fits, and blocks Save
   until the manager either widens the window or shrinks the row.

**Scope:** Polish pass before the v1.x auto-generator. No new tabs, no
new persistence paths (the `/settings` path was already wired through
`usePersistence.js` but had no consumer). One v0.7.0 release rolls both
items up.

### Files modified
- `src/lib/pdf-export.js` — `buildTableBody` rewritten to track
  section transitions and inject a divider row (`SECTIONS[section].label`,
  `colSpan: 8`, light-grey fill, bold, left-aligned). New
  `sectionDividerRow(sectionKey, totalCols)` helper. Imports `SECTIONS`
  from `lib/constants.js`. No autoTable option changes — relies on
  jspdf-autotable v5's first-class support for per-row `colSpan` cells.
- `src/components/Settings.jsx` — accepts `settings` + `saveSettings`
  props. New `hoursForm` / `hoursDirty` local state seeded from
  `settings` or `OPERATING_HOURS`. New `hoursError(hours)` validator
  + extended `blockError(block, hours)` that enforces template start
  ≥ `operatingStart` and end ≤ `operatingEnd`. New "Operating hours"
  `<Section>` rendered above the FoH card. Save handler routes to
  `saveSettings` and/or `saveShiftTemplate` based on which form is
  dirty. Reset to defaults now resets both forms (with a single
  confirm).
- `src/components/AppShell.jsx` — passes `settings={data.settings}` and
  `saveSettings={actions.saveSettings}` into `<Settings />`.
- `src/App.jsx` — bumped `__APP_SIGNATURE__` to `0.7.0`, sha `polish`,
  build `2026-05-13`.
- `CLAUDE.md` — file-structure block bumped to v0.7.0; `Settings.jsx`
  and `pdf-export.js` annotations updated.

### Locked-decision answers (this session)
| Q | A |
|---|---|
| Divider rendering | jspdf-autotable `colSpan` row (single cell spans all 8 columns). Light-grey fill, bold text, left-aligned. |
| Leading divider before FoH | Yes — symmetry with the Kitchen divider; both sections get a labelled band. Re-evaluate after the first printed rota. |
| Operating-hours data shape | `{ operatingStart: "HH:MM", operatingEnd: "HH:MM" }` at `/settings`. Falls back to `OPERATING_HOURS` constant on first run. |
| Validation strategy | When the operating-hours form itself is invalid, template-row checks skip the operating-window constraint to avoid cascading misleading errors. Manager fixes hours first, then row errors auto-clear. |
| Save UX | One Save button at the bottom of the page. Internally routes to `saveSettings` and/or `saveShiftTemplate` based on per-form dirty flags. Empty writes naturally avoided. |
| Reset behaviour | One Reset button resets both forms in a single confirm prompt. Writes both paths immediately (matches v0.5.0 behaviour). |

### Key design decisions
- **`SECTIONS` is the divider label source.** `pdf-export.js` already
  consumed slot data which carries `section`, but the human label
  (`"Front of House"` / `"Kitchen"`) lives on `SECTIONS[key].label`.
  Importing `SECTIONS` directly keeps the constant the single source
  of truth — rename a section there and the PDF heading follows.
- **Two dirty flags, one Save button.** Operating hours and the shift
  template live at different Firebase paths, but a manager thinks of
  them as one config screen. A single Save call routes to the right
  write helper(s) based on which form was touched. Saves never write
  spurious empty objects because each branch is dirty-gated.
- **Operating-window validation skipped when hours are invalid.**
  Without this, an in-progress edit like `operatingStart=23:00,
  operatingEnd=11:00` would light up every template row with
  "Start cannot be earlier than 23:00", which is noise. Compute
  `hoursError(hoursForm)` first; only pass hours into block validators
  when they're internally consistent.
- **Reset resets both forms.** The v0.5.0 Reset only touched the
  shift template; v0.7.0 broadens it to operating hours too. A single
  confirm dialog covers both — manager intent for "reset to defaults"
  is unambiguous.
- **No new persistence wiring.** `saveSettings` was already in
  `usePersistence`'s `actions` export from v0.3.0 onward, just never
  passed through. Reusing it preserves the write-guard pattern with
  zero new surface area.

### Verification
- [ ] `npm run build` succeeds; main bundle within a few KB of v0.6.0
      (no new top-level dependencies).
- [ ] `npm run dev`; sign in; green DEV banner + blue v0.7.0 banner.
- [ ] Schedule tab: fill every cell in a week → Export PDF. Confirm
      a "Front of House" header row precedes the first FoH slot and
      a "Kitchen" header row precedes the first Kitchen slot.
- [ ] Settings tab: new "Operating hours" card at top with two time
      inputs defaulting to 11:00 / 23:00.
- [ ] Edit operating start to 12:00 → Save → page reload → values
      persist.
- [ ] Set operating start to 14:00 → FoH day row shows
      "Start cannot be earlier than operating start (14:00)." →
      Save button visibly disabled.
- [ ] Revert operating start to 11:00 → errors clear → Save
      re-enables.
- [ ] Reset to defaults → confirm prompt fires → both cards revert.
- [ ] Mobile viewport (< 768px): operating-hours inputs lay out
      two-up; modal not affected.
- [ ] DevTools: `window.__MGT_SCHED_BUILD__.version === "0.7.0"`.

---

## v0.6.0 — PDF export
**Date:** 2026-05-12
**Behavioural change:** Yes — "Export PDF" button lives in the schedule
grid's week-nav bar. Disabled (with a `title` tooltip) until every cell
in the displayed week has an employee assigned. On click, downloads a
landscape-A4 weekly rota.
**Scope:** Locked v1 decision was "PDF in horizontal spreadsheet layout,
available only when the schedule is fully complete (no empty cells)" —
this entry delivers exactly that.

### Files added
- `src/lib/pdf-export.js` — pure (no React, no Firebase). `exportWeekPdf({
  weekStart, slots, weekShifts, employees })` builds a jsPDF document and
  triggers a download. Table head row = day headers (`Mon 12 May` etc.);
  left column = slot label + default times (`FoH Evening 1\n17:00–23:00`);
  data cells = `Name · Role` for evening slots, bare `Name` for day shifts.
  Footer on every page: `Generated YYYY-MM-DD HH:mm`, bottom-right.
- `src/components/ExportButton.jsx` — small button. Calls
  `isWeekComplete(weekShifts, weekStart, slots)` for gating; falls back
  to ghost styling + 0.5 opacity + `cursor: not-allowed` when disabled.

### Files modified
- `src/lib/schedule-logic.js` — added `isWeekComplete(weekShifts,
  weekStartDate, slots)`. Pure helper: iterates dates × slots and
  returns false on the first slot with no matching shift or no
  `employeeId`. Used by ExportButton; could be reused later by the
  auto-generator's "is this week solved?" check.
- `src/components/ScheduleGrid.jsx` — imported ExportButton; right-hand
  group of the nav bar now wraps the week label + button together so the
  layout stays cohesive on narrow viewports.
- `src/App.jsx` — bumped `__APP_SIGNATURE__` to `0.6.0`, sha `pdf-export`.
- `package.json` — `jspdf ^4.2.1` + `jspdf-autotable ^5.0.7`. jsPDF
  ships with html2canvas + DOMPurify baked in (for `doc.html()`, which
  we don't use), so the transitive cost is ~150KB gz. We dodge this by
  **dynamic-importing `pdf-export.js`** inside ExportButton — the main
  bundle stays at 147KB gz (identical to v0.5.0), and the 138KB gz
  pdf-export chunk only loads on first click. Acceptable: a manager
  exports at most once a week.
- `CLAUDE.md` — file-structure section bumped to v0.6.0; `pdf-export.js`
  and `ExportButton.jsx` moved from "target" into current.

### Locked-decision answers (this session)
| Q | A |
|---|---|
| Page orientation | Landscape A4 — matches "horizontal spreadsheet" locked decision. |
| Contact info | Skipped — the employee model doesn't include a phone field. Easy to add later if needed. |
| Requests footer | None. Manager prints the rota; requests live on the Requests tab in-app. |
| "Complete" definition | Every (date, slot) must have a non-null `employeeId`. Empty cells block export. |
| Cell content format | `Name · Role` for evening slots (Bar / Floor / Chef / Plating / Pot). Bare `Name` for day shifts where `role = null` per the v1 model. |
| Filename | `MGT_Week_YYYY-MM-DD_to_YYYY-MM-DD.pdf` (ISO week range). |

### Key design decisions
- **Pure `pdf-export.js`.** The export function takes only data — no
  React, no hooks, no `__APP_SIGNATURE__` import. Trivially unit-
  testable (in principle; we don't have a test suite yet). The single
  side effect is `doc.save()` which triggers the browser download.
- **Completeness check lives in `schedule-logic.js`, not in the button.**
  Keeps the gating logic where the auto-generator (v1.x) can reuse it
  for "is this week solved?". The button just renders the result.
- **`employees` is the full map, not pre-filtered.** Archived employees
  who appear on shifts still render with their name. Strikethrough or
  badging in the PDF would be over-engineering — the printed rota is
  for staff who are working that week.
- **Defensive `if (!emp) return ""`.** A stale `isWeekComplete` call
  against a later-updated shifts map could in theory let an empty cell
  through. Empty string is the cleanest failure mode; nothing crashes.
- **`jspdf-autotable` v5 named-import API.** v5 changed the import shape
  vs. v3 — `import { autoTable } from "jspdf-autotable"; autoTable(doc,
  opts)` rather than the old prototype-patching style. Vite handles
  both, but the named-import form is clearer.
- **Footer stamped on every page** rather than only the last. autoTable
  can paginate if the table overflows; a per-page stamp keeps each sheet
  self-documenting after printing.
- **Dynamic import for code-splitting.** ExportButton's click handler
  calls `import("../lib/pdf-export.js")` rather than top-level importing
  it. Vite/Rollup honors this as a chunk boundary, so the jspdf +
  html2canvas dependency tree only ships when the user actually exports.
  There's a small first-click latency (a few hundred ms) for the chunk
  to fetch; subsequent clicks are instant. Worth it for a feature used
  ~once a week.

### Verification
- [ ] `npm run build` succeeds. Main bundle unchanged at 147KB gz; a new
      `pdf-export-*.js` chunk (138KB gz) is emitted for lazy loading.
- [ ] Export button visible in the Schedule tab's nav bar (right of the
      week label).
- [ ] On a week with any empty cells: button is ghost-styled, disabled,
      tooltip reads "Fill all cells to export". Clicking does nothing.
- [ ] Fill every cell on the week → button becomes primary-styled and
      enabled; tooltip changes to "Download this week as PDF".
- [ ] Click → browser downloads `MGT_Week_2026-05-XX_to_2026-05-XX.pdf`.
- [ ] PDF opens in landscape A4. Title is "Me Gustas Tú — Week of [range]".
- [ ] Table head shows 7 day headers (`Mon 12 May` etc.); body shows
      slot rows with `Name · Role` (evening) or bare `Name` (day).
- [ ] Footer reads `Generated YYYY-MM-DD HH:mm` in bottom-right.
- [ ] Schedule still renders normally; the existing modal flows are
      untouched.
- [ ] DevTools: `window.__MGT_SCHED_BUILD__.version === "0.6.0"`.

---

## v0.5.0 — Settings (shift template editor)
**Date:** 2026-05-12
**Behavioural change:** Yes — Settings tab is live. Manager can edit
counts, start/end times, and FoH evening `secondPersonStart` for the
four template blocks (FoH day, FoH evening, Kitchen day, Kitchen
evening). Writes flow to `/shiftTemplate`; `ScheduleGrid` already reads
from there and falls back to `DEFAULT_SHIFT_TEMPLATE`.
**Scope:** Single screen replaces the placeholder. Two `<Section>` cards
(FoH, Kitchen) × two day-part rows each. Each row: Count, Start, End,
plus a "2nd person starts" select on FoH evening (18:00 / 19:00).
Explicit Save button + Reset to defaults (with confirm).

### Files added
- `src/components/Settings.jsx` — local form state (deep-cloned from
  `shiftTemplate || DEFAULT_SHIFT_TEMPLATE` on mount), per-block
  inline validation (`count >= 1`, `start < end`), dirty flag drives
  the Save button. Reset writes `DEFAULT_SHIFT_TEMPLATE` to Firebase
  via `saveShiftTemplate`. Responsive grid: two-column on mobile,
  side-by-side on desktop.

### Files modified
- `src/components/AppShell.jsx` — imported `Settings`; replaced the
  v0.5.x placeholder with `<Settings shiftTemplate / saveShiftTemplate
  / isMobile />`; refreshed the header comment ("all four tabs are
  functional as of v0.5.0").
- `src/App.jsx` — bumped `__APP_SIGNATURE__` to `0.5.0`, sha `settings`.
- `CLAUDE.md` — file-structure section bumped to v0.5.0; `Settings.jsx`
  moved from "target" into current.

### Locked-decision answers (this session)
| Q | A |
|---|---|
| Per-day-of-week override | Global only for v0.5.0. Per-day override is a meaningful data-model change; deferred to v1.x. |
| Expose `OPERATING_HOURS` | No. It has no consumers in the codebase yet — surface it when something actually depends on it. |
| Count decrease → orphan `/shifts/{id}` | Leave them alone. Records persist; grid simply stops rendering positions ≥ count. Cleanup is a v1.x maintenance pass. |
| Save UX | Explicit Save button (disabled until dirty AND valid). Not auto-save. |

### Key design decisions
- **Local-form / never re-sync from props.** The form is seeded once on
  mount from `shiftTemplate || DEFAULT_SHIFT_TEMPLATE`. We deliberately
  do NOT re-sync if the prop changes mid-edit — manager-only app, single
  editor, and if the prop changes it's because we just saved (form
  already matches). Simpler than building a stale-write reconciliation.
- **Deep-clone on seed.** `DEFAULT_SHIFT_TEMPLATE` is shallow-frozen via
  `Object.freeze` (nested objects are mutable). Cloning via
  `JSON.parse(JSON.stringify(...))` avoids any chance of mutating the
  constant by reference. Same on Reset.
- **String compare for time validation.** `block.start >= block.end` on
  the raw `"HH:MM"` strings works because the format is fixed-width and
  zero-padded — lexicographic compare equals chronological compare.
  Mirrors `schedule-logic.js`'s YYYY-MM-DD trick.
- **No `lib/` helper for validation.** The four blocks share a single
  `blockError()` function inside `Settings.jsx`. Pulling it into
  `schedule-logic.js` would be premature — nothing else needs it yet.
- **Save is optimistic.** `saveShiftTemplate` is fire-and-forget (the
  hook does `.catch(console.warn)`). We flip `dirty` to false on click;
  if the write fails it surfaces via the write-warning banner. Matches
  the rest of the app (EmployeeFormModal, RequestFormModal).
- **Reset writes immediately.** Reset to defaults both updates local
  form state AND calls `saveShiftTemplate(defaults)` — the manager
  expects an instantaneous reset, not a "now press Save". A
  `window.confirm` checkpoint guards against accidental clicks.
- **`SECTIONS.{foh,kitchen}.label` drives card titles.** Renaming a
  section in `constants.js` propagates here automatically.

### Verification
- [ ] Settings tab renders the editor (no more placeholder).
- [ ] First-ever load (no `/shiftTemplate` in Firebase) seeds from
      `DEFAULT_SHIFT_TEMPLATE`; Save button starts disabled.
- [ ] Change a Count to 3 → Save enables → click → Firebase
      `/shiftTemplate` is set → grid re-renders with 3 slots in that
      section/day-part.
- [ ] Set FoH evening "2nd person starts" to 19:00 → schedule grid
      shows the 2nd FoH evening slot starting 19:00.
- [ ] Validation: set Start = End → red helper text → Save disabled.
- [ ] Validation: set Count = 0 → red helper text → Save disabled.
- [ ] Reset to defaults → confirm dialog → on OK, form snaps to
      defaults AND Firebase `/shiftTemplate` is overwritten.
- [ ] Mobile viewport (< 768px): each block's inputs lay out two-up.
- [ ] DevTools: `window.__MGT_SCHED_BUILD__.version === "0.5.0"`.
- [ ] `npm run build` succeeds with no warnings.

---

## v0.4.0 — Requests module + conflict warnings
**Date:** 2026-05-12
**Behavioural change:** Yes — Requests tab is live and the assignment form
warns on conflicts.
**Scope:** Manager-entered day-off / holiday records, with a non-blocking
yellow warning when the assignee on a shift cell has a request that covers
the date.

### Files added
- `src/components/RequestFormModal.jsx` — add/edit form in `<Overlay>`.
  Fields: employee picker (active only), type segmented control
  (Day off / Holiday), `dateFrom` + `dateTo` (both required, `dateTo >=
  dateFrom`), optional notes. Picking a `dateFrom` after the current
  `dateTo` auto-bumps `dateTo` to match — single-day requests stay
  one-click.
- `src/components/RequestsList.jsx` — list view. Header with upcoming /
  past counts + Add button. Upcoming sorted soonest-first; past in a
  collapsible section sorted most-recent-first. Each row clickable.
  Empty-state CTA when zero requests.

### Files modified
- `src/lib/constants.js` — added `REQUEST_TYPES` (array of
  `{ key, label, palette }`). Two entries for v1; structurally extensible.
- `src/lib/schedule-logic.js` — added `findRequestConflict(requests,
  employeeId, dateIso)`. Returns the first request whose
  `dateFrom <= dateIso <= dateTo` (inclusive, lexicographic on YYYY-MM-DD)
  for that employee, or null. Half-day requests are NOT supported in v1.
- `src/components/AppShell.jsx` — wired the Requests tab to
  `<RequestsList />`; passed `data.requests` down to `<ScheduleGrid />`.
- `src/components/ScheduleGrid.jsx` — added `requests` prop, threaded
  through to `<ShiftFormModal />`. Help text updated.
- `src/components/ShiftFormModal.jsx` — added `requests` prop and a
  yellow conflict banner under the assignee picker. Banner appears when
  the currently-picked employee has a matching request; save still
  proceeds (locked decision: warn, do NOT block).
- `src/App.jsx` — bumped `__APP_SIGNATURE__` to `0.4.0`, sha `requests`.

### Locked-decision answers (this session)
| Q | A |
|---|---|
| Request types in v1 | `dayoff` + `holiday` only. Extensible via `REQUEST_TYPES`. |
| Half-day requests | Not supported in v1. Full-day only. |
| Visibility on grid | None. Requests live on the Requests tab. Conflicts surface only inside the assignment form. |

### Key design decisions
- **Conflict UI = banner only, in the modal.** Per Patryk: requests are
  not visible from the schedule grid (no day-header icon, no cell tint).
  The yellow banner appears in `ShiftFormModal` whenever the picked
  assignee has a covering request — including when *opening* an
  existing shift, not just when adding a new one. This catches earlier
  assignments that became conflicts after the request was entered.
- **Date storage as `YYYY-MM-DD` strings.** Same convention as `/shifts/{id}.date`
  — timezone-free, sortable, and lexicographic compare equals chronological
  compare. `findRequestConflict` exploits this for a string-only check.
- **Request "covers" a date inclusively on both ends.** A request
  `2026-05-15 → 2026-05-15` is a single-day request that conflicts on
  the 15th only.
- **Past requests stay in the DB.** Soft-archive via the `dateTo < today`
  partition rather than auto-deletion. Manager keeps audit trail;
  collapsible UI keeps the list short.
- **Picker excludes archived employees.** Same rule as the assignee picker
  in `ShiftFormModal`. If an archived employee has a historical request,
  it still renders in the list with strikethrough — only the *picker* hides
  archived people.

### Verification
- [ ] Requests tab now renders the live list (no more "coming soon"
      placeholder).
- [ ] Add a request — modal opens, employee dropdown shows active
      employees only, Save disabled until employee + dates are set.
- [ ] Single-day request: pick a `dateFrom`, `dateTo` auto-bumps to match.
- [ ] Edit an existing request — fields pre-fill correctly.
- [ ] Delete an existing request — confirm dialog → record disappears.
- [ ] Past requests collapse under "Past (N) · Show".
- [ ] Schedule tab: assign that employee on a date inside the request's
      range — yellow banner appears under the assignee dropdown.
- [ ] Save still proceeds with the conflict (no block).
- [ ] Open the same shift again — the banner is still present (warning
      is computed live from `requests`, not stored on the shift record).
- [ ] Pick a different employee with no conflict — banner disappears.
- [ ] DevTools: `window.__MGT_SCHED_BUILD__.version === "0.4.0"`.
- [ ] `npm run build` succeeds. (Verified — 586ms, 57 modules.)

---

## v0.3.0 — Schedule grid + shift assignment
**Date:** 2026-05-12
**Behavioural change:** Yes — full weekly schedule view with click-to-assign.
**Scope:** The biggest v1 feature. Manager can see a week at a glance, click any cell to assign someone or edit times.

### Files added
- `src/lib/schedule-logic.js` — pure helpers (no React, no Firebase).
  Exports `isoDate`, `parseIsoDate`, `startOfWeek`, `addDays`, `weekDates`,
  `formatDayHeader`, `formatWeekRange`, `slotsForDay(template)`,
  `findShiftForSlot`, `deriveCellState`, `shiftsForWeek`.
- `src/components/ShiftFormModal.jsx` — assign employee, edit role
  (evening only), edit start/end times, reset-to-template button, clear
  button (when an existing shift record is present). Filters the
  assignee dropdown to active employees whose roles intersect the slot's
  eligible roles.
- `src/components/ScheduleGrid.jsx` — Monday-start weekly view. Two
  layouts: desktop = 7-col × N-row grid with section-grouped rows;
  mobile = vertical stack of 7 day-cards. Both call the same `renderCell`
  and open the same `ShiftFormModal`. Week nav: Prev / Today / Next +
  human-readable date range.

### Files modified
- `src/components/AppShell.jsx` — Schedule tab wired up. Initial tab is
  now `schedule` (it's the manager's primary work surface). Card max-width
  widens to 1100px when the Schedule tab is active so the desktop grid
  doesn't squeeze.
- `src/App.jsx` — bumped `__APP_SIGNATURE__` to `0.3.0`, sha `schedule-grid`.

### Data-model decisions
- **Shift records are lazy.** A slot only gets a `/shifts/{id}` record
  when the manager touches it (assigns someone OR edits times/role).
  Untouched slots display template defaults and read as `hasRecord: false`.
- **Slot identity:** `(date, section, dayPart, slotIndex)`. The
  `findShiftForSlot` helper does a linear scan — fine at v1 sizes
  (~49 records per week, ~2500/year).
- **`role: null` for day shifts.** One person covers all section roles
  on day shifts; the modal surfaces "covers Bar + Floor" / "covers
  Chef + Plating + Pot" rather than a role picker.
- **`role` per slot for evening shifts.** Picked from
  `SECTIONS.foh.roles` or `SECTIONS.kitchen.roles`. The modal blocks
  Save if an employee is assigned but no role is picked.
- **Position-2 FoH evening default** = `template.foh.evening.secondPersonStart`
  (18:00 by default). Manager overrides per-day via the start-time field
  in the modal; a `*` marker appears on cells whose times deviate from
  the template.

### UI decisions
- **Status colours from `STATUS_COLORS`:** open cells use the grey palette,
  assigned cells use the blue palette. Future statuses (`confirmed`,
  `cancelled`) are already defined in constants for when they're needed.
- **Archived employees on shifts** show greyed-out + strikethrough — they
  can't be re-assigned (filtered out of the dropdown) but historical
  references stay readable.
- **Conflict warnings deferred.** They depend on data from the Requests
  tab, which doesn't exist yet. Will land in v0.4.x.

### Verification
- [ ] Open Schedule tab — current week renders with all-Open cells.
- [ ] Click a cell — modal opens with the right slot/date label,
      template-default times pre-filled.
- [ ] Pick an employee + (for evening) a role; Save — cell shows the
      assignee + role chip.
- [ ] Reload page — assignment persists.
- [ ] Edit a cell's time (e.g. set FoH Evening 2 to 19:00) — cell
      gets the `*` marker.
- [ ] Clear a cell — record disappears, cell returns to "Open" + defaults.
- [ ] Navigate Prev / Next / Today — week range updates correctly.
- [ ] Mobile viewport — day-card stack renders, modal becomes full-sheet.
- [ ] Add an employee with no relevant role (e.g. Floor-only) — they
      don't appear in the dropdown for Kitchen slots.
- [ ] Archive an assignee — their existing shift cells go grey +
      strikethrough; they no longer appear in the assignee dropdown.

---

## v0.2.0 — Employees CRUD + tab nav
**Date:** 2026-05-12
**Behavioural change:** Yes — first user-visible feature.
**Scope:** Add / edit / archive / delete employees. Tab nav introduced to give the other features room to land.

### Files added
- `src/components/EmployeeFormModal.jsx` — add/edit form in `<Overlay>`.
  Fields: name, roles (multi-select chip group with role colours),
  shift preference (segmented control: Day / Evening / Either), fixed
  working days (toggle + 7 weekday chips when ON), active toggle.
  Save / Cancel / Delete buttons (Delete only in edit mode, with
  `window.confirm`).
- `src/components/EmployeesList.jsx` — roster list. Header with active/archived
  counts + Add button. Active employees sorted alphabetically on top;
  archived employees in a collapsible section. Each row is a button —
  click to edit. Empty-state CTA when zero employees.

### Files modified
- `src/components/AppShell.jsx` — introduced a 4-tab nav (Schedule,
  Employees, Requests, Settings). Only Employees is functional in v0.2.0;
  the others show a "coming in v0.3.x / v0.4.x / v0.5.x" placeholder.
  Initial tab is `employees` so the working feature is visible by default.
  Card max-width widened to 820px to give roster lists more room.
- `src/App.jsx` — bumped `__APP_SIGNATURE__` to `0.2.0`, sha `employees-crud`.

### Key design decisions
- **Validation: name + ≥1 role.** Save button disabled until both pass.
  A role is structurally required for scheduling, so we enforce it here
  rather than blowing up later.
- **Active toggle + hard-delete coexist.** Soft-delete (active=false)
  preserves the employee for historical shift references; hard-delete
  is for typos / wrong-data. `window.confirm` for delete keeps friction
  high enough that mistakes are unlikely.
- **Role chips are buttons.** Multi-select via tap. Chosen state uses
  the role's `ROLE_COLORS` hue as background — fastest visual confirmation
  the choice landed.
- **Fixed days is a toggle, not a free field.** Default OFF means
  "available any day, subject to requests" — exactly the meaning Patryk
  specified. When ON, the 7 weekday chips define which days the employee
  is contractually committed to.
- **Sort: active alphabetical, then archived alphabetical, archived collapsed.**
  Keeps the visible roster short while archived staff remain accessible.

### Verification
- [ ] Sign in → Employees tab opens by default with empty state.
- [ ] Click "Add your first employee" → modal opens with empty form.
- [ ] Save disabled until both name and ≥1 role are present.
- [ ] Add a few employees (different roles, preferences, with/without
      fixed days, some archived).
- [ ] Reload page → all employees persist (Firebase round-trip works).
- [ ] Edit existing employee → form pre-fills correctly.
- [ ] Delete employee → confirm dialog → record disappears.
- [ ] Archive (active=false) → row greys out with strikethrough name and
      moves into the "Archived" section.
- [ ] Schedule / Requests / Settings tabs each show the "coming soon"
      placeholder.

---

## v0.1.2 — Persistence layer
**Date:** 2026-05-12
**Behavioural change:** Yes — app now reads + writes Firebase RTDB for all five data paths.
**Scope:** Foundation only. No feature UI yet. Authenticated users see a stub showing collection counts so we can verify the read path end-to-end.

### Files added
- `src/hooks/usePersistence.js` — single hook covering `/employees`,
  `/shifts`, `/requests` (keyed collections) and `/shiftTemplate`,
  `/settings` (singletons). Returns `{ data, ready, writeWarning,
  clearWriteWarning, actions }`. Actions:
  `upsertEmployee / deleteEmployee / upsertShift / deleteShift /
   upsertRequest / deleteRequest / saveShiftTemplate / saveSettings`.
- `src/components/AppShell.jsx` — new authenticated-UI shell.
  Owns `usePersistence()`. v0.1.2 renders a stub with collection counts,
  template/settings state, sign-out button, and the write-warning banner.
  Feature tabs (Schedule / Employees / Requests / Settings) land here
  in subsequent versions.

### Files modified
- `src/App.jsx` — signed-in branch now mounts `<AppShell />` instead of
  the inline stub. Persistence is intentionally kept OUT of App.jsx so
  the auth gate never subscribes to Firebase data for an unauthenticated
  session. Bumped `__APP_SIGNATURE__` to `0.1.2`, sha `persistence`.
- `CLAUDE.md` — file-structure section refreshed.

### Key design decisions
- **Per-record CRUD only — no full-collection replace.**
  Never call `set("employees", {})` etc. — only
  `set("employees/{id}", record)` and `remove("employees/{id}")`.
  This structurally eliminates the "stale empty array wipes the
  collection" failure mode that hit Bookings.
- **One hook for all five paths.** Matches Bookings' `usePersistence`
  pattern. Consumers get a single `ready` flag instead of juggling five.
- **`push()` IDs for new records.** Firebase-generated time-ordered keys.
  No need for client-side UUIDs.
- **Defaults stay out of the persistence layer.** If `/shiftTemplate`
  is null in DB, `data.shiftTemplate === null`. Consumers fall back to
  `DEFAULT_SHIFT_TEMPLATE`. Preserves "not yet customized" vs
  "customized to default values" distinction.
- **Per-path `loaded` ref guards every write.** MANDATORY write-guard
  pattern from `CLAUDE.md` — each save/delete bails out unless the
  initial `onValue` callback has fired for that path.
- **Empty-object guard on singletons.** `saveShiftTemplate(null)` /
  `saveSettings({})` are refused with a `[SAFE]` console warning +
  user-visible write-warning banner (unless `isSilent=true`).
- **StrictMode-safe mounted ref.** `mounted.current = true` is set
  INSIDE the subscription effect. Same fix as the v0.1.1 useAuth hotfix.

### Patryk-side prerequisites
**Database Rules** must be set in both Firebase projects (DEV + PROD)
or all reads will be denied. Minimum (manager-only auth model):

```json
{
  "rules": {
    ".read":  "auth != null",
    ".write": "auth != null"
  }
}
```

Apply in Firebase Console → Realtime Database → Rules → paste → Publish,
for **both** `megustastu-scheduling-dev` and `megustastu-scheduling`.

### Verification
- [ ] `npm run dev` boots; banners as before.
- [ ] After sign-in: brief "Loading data…" → AppShell renders with all
      counts at 0 and template/settings showing "using defaults."
- [ ] No `[SAFE]` console warnings on clean boot.
- [ ] No PERMISSION_DENIED errors in console (depends on Database Rules).
- [ ] DevTools: `window.__MGT_SCHED_BUILD__.version === "0.1.2"`.

---

## v0.1.1 — Auth gate
**Date:** 2026-05-12
**Behavioural change:** Yes — app now requires sign-in.
**Scope:** Manager-only login wired in; signed-out users see `<LoginScreen />`, signed-in users see the app shell + sign-out button.

### Files added
- `src/hooks/useWinW.js` — viewport-width listener, returns the current
  `window.innerWidth`. `isMobile` threshold is decided at the call site.
- `src/hooks/useAuth.js` — wraps Firebase Auth.
  Exposes `{ user, ready, busy, error, signIn(email, password), signOut() }`.
  `ready` flips on the first `onAuthStateChanged` callback to prevent
  flicker-render of the login screen on a valid persisted session.
  Friendly-message helper for common Firebase Auth error codes.
- `src/components/LoginScreen.jsx` — single-card email/password form.
  Uses `Fld`, `mkInp`, `mkBtn`. Mobile = full-sheet, desktop = centered card.
  No sign-up flow — the one manager account is created via Firebase
  Console (one user per project: DEV + PROD).

### Files modified
- `src/App.jsx` — now branches on `auth.ready` / `auth.user`:
  1. Loading splash while auth resolves.
  2. `<LoginScreen />` when not signed in.
  3. App shell with header + sign-out button when signed in.
  Bumped `__APP_SIGNATURE__.version` to `0.1.1`, sha `auth-gate`.
- `CLAUDE.md` — file-structure section refreshed.

### Key design decisions
- **No role resolution.** Manager-only model means "signed in" === "manager."
- **`ready` guard.** App renders nothing user-facing until the first
  `onAuthStateChanged` callback. Avoids a brief flash of `<LoginScreen />`
  on rehydrate of a valid session.
- **No sign-up flow in the app.** The one account is created in Firebase
  Console (Authentication → Users → Add user) per project. Reduces attack
  surface and removes a code path we'd never use.
- **`mounted` ref in useAuth.** Async setters (signIn/signOut) guard against
  unmount-during-flight. Minor but standard.

### Verification
- [ ] `npm run dev` boots; DEV banner appears.
- [ ] Visiting the app with no session shows `<LoginScreen />` after the
      brief loading splash.
- [ ] Correct email/password (created in Firebase Console → Authentication
      → Users) signs in and shows the app shell + the user email.
- [ ] Wrong password shows the friendly error banner.
- [ ] Sign-out returns to `<LoginScreen />` without page reload.
- [ ] DevTools: `window.__MGT_SCHED_BUILD__.version === "0.1.1"`.

---

## v0.1.0 — Initial scaffold + locked decisions
**Date:** 2026-05-12
**Behavioural change:** N/A (new project).
**Scope:** Session-1 scaffold only. No feature components.

### Files created
- `package.json` — React 19, Vite 6, Firebase 10. No TypeScript, no test framework.
- `vite.config.js` — `@vitejs/plugin-react` for automatic JSX runtime.
- `index.html` — Vite entry, viewport meta, base background.
- `src/main.jsx` — `createRoot` mount of `<App />` in `<StrictMode>`.
- `src/App.jsx` — stub component, `__APP_SIGNATURE__ = { version: "0.1.0", build, sha }`,
  console boot banner, `window.__MGT_SCHED_BUILD__` exposure.
- `src/firebase.js` — dev/prod config switch via `import.meta.env.DEV`,
  coloured PROD/DEV boot banner, blank config objects awaiting Patryk's
  paste from Firebase Console.
- `src/lib/constants.js` — `ROLES`, `SECTIONS`, `DEFAULT_SHIFT_TEMPLATE`,
  `OPERATING_HOURS`, `STATUS_COLORS`, `ROLE_COLORS`, `S`, `BTN`,
  `DAY_PARTS`, `WEEKDAYS`.
- `src/components/atoms.jsx` — `Overlay`, `Fld`, `Section`, `TBadge`,
  `mkInp`, `mkBtn`. JSX literal syntax (NOT `RC`).
- `CLAUDE.md` (repo root) — canonical instructions for future Claude sessions.
- `REFACTOR_LOG.md` (this file).
- `.gitignore` — node_modules, dist, .env, .DS_Store.

### Key design decisions (locked this session)
1. **Auth model: manager-only.** One Firebase Auth account = Patryk.
   No staff portal, no custom claims, no Cloud Function. Simplifies
   Database Rules to "authenticated == Patryk → full access; else → denied."
2. **Operating window: 11:00–23:00.** Evening shifts end at 23:00 to
   cover close + cleanup.
3. **Roles: Bar, Floor, Chef, Plating, Pot.** Hardcoded enum for v1;
   may become editable in a future Settings tab.
4. **Day-shift role coverage:** one person covers all FoH roles or all
   Kitchen roles on day shifts. Stored as `role: null` on those shift
   records.
5. **Work pattern: 5/2 with splittable off-days.** Enforced by the
   auto-generator only — manual edits can override.
6. **Auto-generator deferred to v1.x.** v1.0 = manual scheduling +
   employees + requests + PDF export.
7. **Requests: manager-entered.** No staff-facing submission path.
8. **PDF export gated on completeness.** No empty cells allowed.

### Architectural decisions
- React 19 + Vite (NOT CRA, NOT Next).
- Plain JS only. No TypeScript.
- JSX literal syntax. Vite automatic JSX runtime — NO `import React` at top of files.
- `const`/`let` only — never `var`. Multi-file structure, not monolithic.
- Mandatory Firebase write-guard pattern on every write.
- Mandatory Firebase dev/prod project split from day one.
- ≤4 simultaneous `backdropFilter: blur()` instances — hard limit.

### Verification
- [ ] `npm install` clean (run on Patryk's machine).
- [ ] `npm run dev` boots without parse errors; DEV banner appears in console.
- [ ] `npm run build` succeeds.
- [ ] `npm run preview` shows PROD banner.
- [ ] `window.__MGT_SCHED_BUILD__` reflects `0.1.0` in DevTools.
- [ ] Both Firebase projects (`megustastu-scheduling`,
      `megustastu-scheduling-dev`) created in region `europe-west1`;
      configs pasted into `src/firebase.js`.
- [ ] Repo pushed to `github.com/pzzychowicz-blip/megustastu-scheduling`.
- [ ] Vercel project `megustastu-scheduling` linked; auto-deploy on push
      to `main` produces the stub at
      `https://megustastu-scheduling.vercel.app/`.

### Out of scope for this version
- All feature components (schedule grid, employee form, requests, export).
- Real Firebase reads or writes.
- Auto-generator.
- PDF export.

These land in v0.2.0 onward (session 2 and beyond).

---
