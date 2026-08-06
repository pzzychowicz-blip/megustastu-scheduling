# CLAUDE.md

Instructions for Claude (and Claude Code) when working in this repository.

---

## Project

**Me Gustas Tú (MGT) Staff Scheduling** — private internal web app for a
restaurant in the Canary Islands. Manager submits employees, requests, and
assigns weekly shifts. Sister app to **MGT Bookings** (separate repo,
separate Firebase project, same UI conventions).

- **Owner / sole developer:** Patryk Zychowicz (pz.zychowicz@gmail.com)
- **Stack:** React 19, Vite, Firebase Realtime Database + Auth, deployed on Vercel
- **Repo:** `github.com/pzzychowicz-blip/megustastu-scheduling` *(to be created)*
- **Live:** `https://megustastu-scheduling.vercel.app/` *(to be created)*
- **Current version:** see `src/App.jsx` → `__APP_SIGNATURE__.version` (single source of truth)
- **Sister project for style/pattern reference:** `github.com/pzzychowicz-blip/megustastu-bookings`

---

## Locked v1 decisions (session 1 — 2026-05-12)

### Functional
- **Auth:** Manager-only login. One Firebase Auth account = Patryk. No
  staff portal, no custom claims, no Cloud Function.
- **Operating window:** 11:00–23:00 (evening ends at 23:00 to cover close + cleanup).
- **Default shift template** (editable in-app via Settings):

  | Section | Day shift | Evening shift |
  |---|---|---|
  | Front of House | 1 person, 11:00–17:00 (covers Bar + Floor) | 1st 17:00–23:00, 2nd 18:00 or 19:00 – 23:00 (manager picks per day) |
  | Kitchen | 1 person, 11:00–16:00 (covers Chef + Plating + Pot) | 3 people, 16:00–23:00 (Chef, Plating, Pot — one each) |

- **Roles:** Bar, Floor, Chef, Plating, Pot.
- **Day-shift role coverage:** a single person performs all FoH roles
  (day FoH) or all Kitchen roles (day Kitchen). Evening shifts have one
  specific role per person.
- **Slot display order (v0.8.0):** Kitchen Day → Kitchen Evening →
  Front of House Day → Front of House Evening. Same order in the
  schedule grid (`ScheduleGrid.jsx`) and in the PDF export
  (`pdf-export.js`) — both drive off `slotsForDay()`.
- **Evening default roles (v0.8.0):** FoH Evening slot 0/1 → Bar/Floor;
  Kitchen Evening slot 0/1/2 → Chef/Plating/Pot. Slot index ≥ section's
  role count → `defaultRole: null` (manager picks). Existing shift
  records keep their stored role even if empty — only NEW shifts get
  the prefill.
- **Employee profile fields:** name, roles (multi-select from the 5),
  fixed-days toggle (default OFF; when ON, lists the contractual workdays),
  shift preference (day / evening / either), working days per week
  (v0.12.0; 1..7, default 5).
- **Work pattern:** 5 working days → 2 days off as the default; v0.12.0
  makes this per-employee via `workingDaysPerWeek` (1..7, default 5).
  The off-days CAN be split (e.g. Mon+Tue work, Wed+Thu off, Fri–Sun
  work). Enforced by the generator only — manual edits can override.
- **Requests module:** manager enters all day-off and holiday records on
  staff's behalf (staff communicate via WhatsApp / in person).
- **Export:** PDF in horizontal spreadsheet layout. Available **only when
  the schedule is fully complete** (no empty cells). v0.9.0: evening
  cells render assignee name only (the role is implicit from the row);
  evening row labels show start time only (the end is the close of
  service and was visual noise on the printed sheet). Day rows keep
  the full `start–end` range.
- **Auto-generator (v1.0.0, extended v1.1.0):** **Shipped.** Greedy +
  constraint-aware. Fills empty cells respecting role match, same-day
  strict, workingDaysPerWeek quota, fixedDays gate, opening-days, and
  request conflicts (HARD block). Shift preference is switchable Soft
  (try preferred first, fall back) / Hard (only matching) via the
  Settings → Auto-generator section. Leaves cells empty rather than
  violating rules. **v1.1.0** adds Regenerate mode (smart re-evaluate:
  walks every existing shift, clears any that violate current
  constraints, then runs fill-empty on the survivors). Confirm modal
  exposes both modes side-by-side. Pure algorithm lives in
  `src/lib/generator.js` (no React / Firebase); orchestration in
  `GenerateButton.jsx` + `GenerateConfirmModal.jsx`. Result surfaced
  as an auto-dismissing inline banner above the grid; banner copy
  branches on mode (fill-empty / regenerate / clear).
- **Day-shift required role (v1.1.0):** a section may declare
  `dayRequiredRoles: [role, …]` in `SECTIONS`. When set, an employee
  must hold AT LEAST ONE of those roles to qualify for the section's
  day slot — stricter than the permissive "any of coversRoles" rule.
  `SECTIONS.kitchen.dayRequiredRoles = ["Chef"]`: a Plating-only or
  Pot-only employee cannot lead Kitchen Day. FoH has no
  `dayRequiredRoles` so its day slot keeps the permissive rule (any of
  Bar / Floor). The rule is propagated through `slotsForDay` onto each
  day slot's `requiredRoles` field; both the manual picker
  (ShiftFormModal) and the auto-generator (generator.js → roleMatches)
  read from the slot — single rule, two consumers.
- **Clear-shifts button (v1.1.0):** new `<ClearButton>` in the Schedule
  nav bar between Generate and Export-PDF. Opens
  `ClearConfirmModal.jsx` with a scope picker (Whole week / per-open-
  day buttons, each showing the live shift count). Confirm is a red
  destructive button labelled "Clear N shifts". Closed days don't
  appear as scope options.
- **Prior-week fairness (v1.1.0):** the generator's candidate ranking
  factors in last week's shift counts. Sort key changed from
  "specialists → current-week count → name" to "specialists →
  combined (current + prior week) count → name". An employee who
  worked many shifts last week is picked later this week until their
  two-week totals roughly match peers. ScheduleGrid computes
  `priorWeekShifts = shiftsForWeek(shifts, addDays(weekStart, -7))`
  and threads it through `<GenerateButton>` → `generateWeek({
  priorWeekShifts })`. Empty / missing falls back to zero counts —
  the first week of operation has no fairness effect (correctly).
  History window is intentionally short (7 days) — older data could
  push the generator to overcompensate for runs the manager already
  hand-balanced.
- **Weekly shifts summary footer (v1.2.0):**
  `<WeeklyShiftSummary>` renders below the schedule grid's helper
  caption. One compact pill per active employee
  (plus any archived employee still on the week): "Name · N / quota".
  Sort: under-utilization ratio asc (most-under first), then name.
  Visual cues: zero count → muted; under quota → soft accent tint;
  at/over → neutral. Reads from `employees` + `weekShifts` — no new
  state.
- **Shift-preference request type (v1.2.0, recurring v1.8.2):** new
  entry in `REQUEST_TYPES` (`key: "shift-preference"`). Constrains
  an employee to ONE dayPart (Day or Evening) on the given dates via
  a new `preferredDayPart: "day" | "evening"` field on the request
  record. `findRequestConflict` is now type-guarded to dayoff /
  holiday only; the new `findShiftPreferenceMismatch` handles the
  dayPart-scoped check. Enforcement: **HARD** in the generator
  (mismatched candidates are rejected, reason `"shift-preference"`)
  and in `clearInvalidShifts` for Regenerate. **SOFT** in the manual
  picker (yellow warning banner, manager judgment wins). The form
  modal renders a Day / Evening segmented control conditionally
  when type === `shift-preference`.
  **v1.8.2 recurring extension:** optional `recurringDaysOfWeek`
  array (WEEKDAYS keys, e.g. `["sat","sun"]`) on the request record
  narrows the date range to specific weekdays. Empty / missing list
  preserves pre-v1.8.2 behaviour (every date in range). Non-empty
  list = only dates whose weekday is in the list count — other
  dates in the range are NOT covered by the request. RequestFormModal
  renders a 7-pill multi-select beneath the Day/Evening segmented
  control, only when type === `shift-preference`; the form re-sorts
  the array on every toggle so the stored value stays in Mon..Sun
  order. RequestsList appends the picked weekdays (Mon..Sun order,
  comma-separated) after the existing "Day shifts only" / "Evening
  shifts only" label on each row. Only `shift-preference` requests
  carry the field — `dayoff` / `holiday` remain pure date ranges
  (locked session 14: those are single events, not patterns).
- **At least 2 consecutive days off (v1.2.0, cross-week v1.8.0):** labor
  wellness rule.
  `hasConsecutiveDaysOff(employeeId, weekStart, shiftsMap, n=2, options)`
  in `schedule-logic.js` returns true iff the employee's working pattern
  has a run of ≥ n consecutive off days that *touches* the Mon–Sun focus
  week (closed days count as off). **HARD** in the generator — candidate
  rejected if simulating the assignment would break the rule, reason
  `"no-2-off"`. **SOFT** in the manual picker — yellow warning banner
  if the chosen employee + this cell would break the rule; save still
  works. Swap mechanic skips the check (v1.7.0 decision).
  **v1.8.0 cross-week extension:** the helper now scans a 9-day window
  `[priorSun, Mon..Sun, nextMon]` when callers pass
  `options.priorWeekShifts` + `options.nextWeekShifts`. A run counts only
  if it overlaps indices 1..7 (the focus week) — prior Sat–Sun off with
  the focus week fully worked is correctly dropped (that rest happened
  last week). Missing cross-week maps default the boundary days to
  "worked", which degrades to the pre-v1.8.0 Mon..Sun-only behaviour.
  `ScheduleGrid` memoises `nextWeekShifts` next to the existing
  `priorWeekShifts`; both flow through `<GenerateButton>` (→
  `generateWeek` → `buildCandidates`) and `<ShiftFormModal>` directly.
  Note: v1.7.0 deleted `clearInvalidShifts`, so the previous
  consecutive-off enforcement there no longer exists — Regenerate now
  wipes the week and refills under the new cross-week rule from
  scratch.
- **Max consecutive working days = 5 (v1.8.0 companion rule):** the
  per-calendar-week 2-off rule above can be satisfied by rest at the
  *edges* of two adjacent weeks (e.g. week 1 Mon–Tue off + Wed–Sun
  work, then week 2 Mon–Fri work + Sat–Sun off → 10 days straight,
  each week independently passes). The companion helper
  `withinMaxConsecutiveWorkingDays(empId, weekStart, shiftsMap, max=5,
  options)` in `schedule-logic.js` plugs this gap. It scans a 21-day
  window `[prior week, focus week, next week]`, finds runs of
  consecutive working days, and rejects any run > max that overlaps
  the focus week (indices 7..13). Pre-existing long runs entirely
  outside the focus week aren't this proposal's problem — manager
  state from earlier decisions stays intact. **HARD** in the
  generator (`buildCandidates` step 6.5, reason `"max-consecutive"`).
  **SOFT** in the manual picker — yellow warning banner stacked
  after the 2-off banner. Swap mechanic skips this rule, matching
  the 2-off rule's swap behaviour. Missing prior/next week maps
  default boundary cells to *off* (false) — conservative direction
  here is the OPPOSITE of `hasConsecutiveDaysOff` (avoid
  over-reporting long runs when we lack data).
- **Conflict semantics (revised v0.8.0):**
  - **Same-date double-booking is a HARD block.** A single employee
    cannot hold two shifts on the same date (covers day + evening on
    the same Tuesday). Enforced by both the picker filter (the
    employee is hidden from the dropdown) and the save handler
    (refuses with a red banner if state desyncs).
  - **Day-off / holiday request conflicts hide-by-default.** Anyone
    with a covering request is hidden from the picker. A toggle in
    the modal ("Show staff on day off / holiday") restores them and
    re-surfaces the yellow conflict banner — the manager can then
    deliberately override per the v1 "judgment wins" principle.
  - **Role mismatch is a HARD filter.** Evening picker only shows
    employees who hold the slot's role. Day picker shows anyone
    holding any of the section's roles.
  - **Original v1 banner (v0.4.0):** kept and still fires when the
    show-all toggle reveals a request-conflicted assignee.
- **Settings layout (v0.10.0, expanded v1.0.0, renamed v1.3.0):**
  single-open accordion. Section order is Operating time → Display →
  Auto-generator → FoH → Kitchen. Operating time opens by default.
  Per-section dirty dot in headers for Operating time / FoH / Kitchen.
  Display and Auto-generator sections bypass the Save button — their
  toggles auto-save immediately on change because they have no
  validation and their effect is either instant on the grid (Display)
  or consumed on the next generator click (Auto-generator). Clicking
  Save while errors exist force-opens the first section carrying an
  error. v1.3.0 renamed the top section from "Operating hours" to
  "Operating time" (cosmetic; same `openSection === "hours"` key
  internally).
- **Theming model (v0.11.0):** light + dark themes driven by CSS
  custom properties. `:root` in `index.html` holds light values;
  `[data-theme="dark"]` overrides each value for dark. React writes
  `document.documentElement.dataset.theme = "dark"|"light"`; zero
  re-renders on theme flip. Token shape: `S`, `BTN`, `STATUS_COLORS`,
  `ROLE_COLORS` in `constants.js` reference `var(--…)` strings and
  carry no rgba/hex literals. ROLE_COLORS specifically holds RGB
  channel triplets (`"var(--role-bar-rgb)"`) so callers compose
  alpha via `rgba(${rgb}, 0.2)` at the use site.
- **Theme resolution (v0.11.0):** boolean Toggle in Settings → Display.
  When `settings.darkMode === undefined`, follow `prefers-color-scheme`
  live (the `useThemeMode` hook listens for OS changes). When the
  manager flips the toggle, `darkMode` is saved as an explicit boolean
  to `/settings` — once explicit, system pref is ignored. Initial paint
  before React mounts is handled by an inline script in `index.html`
  reading `prefers-color-scheme` so there's no flash of wrong theme.
- **PDF export (v0.11.0):** the PDF renderer keeps the light palette
  regardless of in-app theme. Printed rotas should be ink-economic
  and legible on paper; dark backgrounds on print would waste toner
  and look wrong. `pdf-export.js` never reads CSS vars.
- **Opening days (v0.12.0, per-day-part since v1.3.0):**
  `/settings.openingDays` is a per-weekday object map where each entry
  carries `{ day: bool, evening: bool }`. A weekday is "closed" iff
  both halves are false; "open" iff either is true. Fully-closed days
  disappear from the grid (desktop columns + mobile day-cards) and
  from the PDF export. Cells whose slot's `dayPart` is closed on that
  date render as inert "Closed" placeholders on the desktop grid, get
  filtered out of the mobile day-card slot list, and render as empty
  cells in the PDF. All consumers normalize the raw `/settings`
  value through `normalizeOpeningDays(raw)` in `schedule-logic.js`,
  which also handles the v0.12.0 legacy boolean shape
  (`true` → `{day:true,evening:true}`, `false` →
  `{day:false,evening:false}`). No Firebase write migration — legacy
  docs upgrade lazily next time the manager saves Operating time.
  `visibleWeekDates(weekStart, openingDays)` returns dates with at
  least one open half; `isSlotOpenOnDate(date, slot, openingDays)`
  is the per-cell gate consumed by the grid, PDF, generator worklist,
  generator's `clearInvalidShifts` (`closed-day-part` reason), and
  `isWeekComplete`. Save validation requires ≥1 day part open across
  the week. PDF zebra-stripe column indices stay absolute (2 / 4 / 6
  in the rendered table) — after a closure they fall on alternating
  visible columns rather than specifically Tue / Thu / Sat.
- **Per-employee work pattern (v0.12.0):**
  `employees/{id}.workingDaysPerWeek` is a number 1..7, default 5.
  Off-days are derived (`7 − N`). v0.12.0 stores + displays the
  pattern (segmented control on the edit form with a live
  "N working / M off" helper; `Pattern: N/M` on the roster row).
  It is NOT consumed by any scheduling logic yet — the auto-generator
  (v1.x) is the primary consumer. Legacy employees without the field
  display the default 5 / 2 on read; no Firebase migration.
- **Scheduling priority (v1.3.0):** `employees/{id}.schedulingPriority`
  is a boolean, default false. When true, the auto-generator picks
  that employee before any non-priority employee — it becomes the
  primary sort key in `rankCandidates` (specialists rule, combined
  load, and name only tiebreak within the priority and non-priority
  groups separately). It does NOT affect eligibility — a priority
  employee still has to satisfy role, request, fixedDays, preference,
  same-day strict, quota, and consecutive-off rules. Toggle lives on
  the employee form ("Auto-generator priority"); roster row carries
  a small "Priority" badge. The manual picker (ShiftFormModal) does
  NOT reorder by priority — the manager picks one cell at a time and
  can see priority directly on the employee badge. Legacy employees
  without the field read as `false` (no migration).
- **Settings accordion persistence (v1.6.0):** the open Settings
  accordion section (`openSection` in `Settings.jsx`) persists across
  refresh / Vite HMR inside the same browser tab via sessionStorage
  under `mgt-sched.settingsSection`. Valid stored values are the
  section keys (`hours`, `display`, `generator`, `foh`, `kitchen`)
  plus the literal string `"null"` for the all-collapsed state.
  Defensive read validates against the known set; anything else falls
  back to `"hours"` (the default). Mirrors the v1.5.0 tab and week
  persistence patterns.
- **Weekly requests preview (v1.6.0):** new `<WeeklyRequestsPreview>`
  component renders below `<WeeklyShiftSummary>` on the Schedule grid.
  Lists every request whose date range overlaps the displayed week,
  sorted by `dateFrom` ascending. Row format: name + colored type
  pill (uses `REQUEST_TYPES[].palette`) + formatted date range.
  Notes are intentionally omitted — manager opens the Requests tab
  for full context. Empty week → component returns null (no chrome).
  Single source for in-grid "who's off / on holiday / preference-
  constrained" context; complements the effective-quota change below.
- **Effective quota on Shifts-assigned pills (v1.6.0):**
  `<WeeklyShiftSummary>` pill format becomes "Name · count /
  effective" where **effective = max(0, workingDaysPerWeek − distinct
  visible-week dates covered by day-off / holiday requests for that
  employee)**. Shift-preference requests do NOT subtract (they
  constrain dayPart, not whether the person works). Closed weekdays
  never count (they're already filtered out of the `dates` array
  passed to the component). The pill shows just the reduced number —
  the "why" lives in `<WeeklyRequestsPreview>` so a glance across
  both panels tells the full story. Effective never exceeds raw
  `workingDaysPerWeek` and floors at 0. Quota=0 employees collapse
  to ratio=1 for the under-utilization sort so they don't dominate
  the leftmost slots.
- **Move / Swap mechanic (v1.7.0):** manual cell edits now have a
  one-flow path for relocating an assignment. Two entry points feed the
  same mechanic:
  - **In-modal "Move / Swap…"** — opens for any filled cell. Closes
    the picker; ScheduleGrid enters `swapMode: "target-select"` with
    the source preloaded.
  - **Nav-bar `<SwapButton>` toggle** — between Generate and Clear.
    Click → "source-select" phase; the first filled cell click becomes
    the source; the next cell click attempts the move/swap.
  Mechanic: target empty → MOVE (`deleteShift(source.id)` +
  `upsertShift(target payload with sourceEmp)`). Target filled →
  SWAP (two `upsertShift` calls switching the employeeIds while the
  cells keep their own role/time identities). Validation is HARD on
  role match (via `roleMatchesSlot` lifted from generator.js to
  schedule-logic.js so all three callers share one rule), request
  conflicts (`findRequestConflict` + `findShiftPreferenceMismatch`),
  and same-day double-booking; refusal surfaces as a red banner +
  exits swap mode. Swap visuals run on the **yellow warning palette**
  (`--bg-warning-tint` / `--border-warning-tint` / `--text-warning`)
  — pulse keyframes, source cell ring, banner, and the SwapButton's
  active state all share that family so swap-mode reads as one
  visual identity, distinct from accent-blue (picker/today) and
  green (pill highlights). Esc cancels swap mode anywhere on the grid.
- **Shifts-assigned pill → cell highlight (v1.7.0):** every pill in
  `<WeeklyShiftSummary>` became a `<button>` with an `onClick` handler.
  State (`highlightedEmployeeId`) lives in ScheduleGrid since it owns
  both the pills and the cells. Clicking a pill toggles the highlight;
  clicking a different pill switches; Esc clears. Visual identity uses
  the **iOS-green** `--bg-active-on` / `--border-active-on` tokens
  (reused from the Toggle atom's "on" state). Highlighted cells get a
  green background, a 2-px green border, and a 3-px green box-shadow
  ring so the lit pattern reads at a glance against neutral / blue /
  yellow surfaces elsewhere on the grid. The selected pill paints in
  the same green so the pill ↔ cells tie is unmistakable. Both
  desktop grid and mobile day-cards participate (shared `renderCell`).
- **Regenerate is wipe-and-refill (v1.7.0, policy-aware v1.8.1):** what
  was "clear-invalid-then-fill" became "wipe-all-then-fill-empty-fresh"
  in v1.7.0. `generateWeek({mode: "regenerate"})` empties
  `workingShifts` via the wipe helper, then proceeds through the
  normal fill-empty loop. The previous `clearInvalidShifts` pre-pass
  is gone (≈190 lines of per-constraint repair logic deleted along
  with its tests-shaped reason codes from `GENERATOR_REASONS`).
  Cleared records all carry the single reason `"regenerated"`.
  **v1.8.1 policy (per-axis):** the wipe is no longer unconditional.
  The GenerateConfirmModal exposes two checkboxes (both default ON):
  `preserveTimes` (keep custom start/end/role) and
  `preserveAssignments` (keep employee). Each axis acts
  **independently** per cell — a cell can have its assignment kept
  while its custom times are reset, or vice versa. The wipe pass
  emits three outputs:
  1. **cleared** — records deleted (cell becomes worklist-fillable);
  2. **modified** — records updated in place (employee kept but times
     reset, or similar partial change). Persistence layer upserts
     them with their existing id;
  3. **pendingOverrides** — when a record is deleted but a time/role
     override was preserved (preserveTimes ON + preserveAssignments
     OFF on an override+employee cell), the saved start/end/role is
     stashed under `${dateIso}|${slotKey}`. Fill-empty's payload
     construction reads this map and applies the override to the new
     record it creates for that cell.
  When both flags are ON, Regenerate degenerates into Fill-empty
  (only truly empty cells get filled) — and the Regenerate button
  switches from `danger` (red) to `primary` (blue) to flag that the
  run is non-destructive. The explainer copy adapts in lockstep —
  four text variants: both ON / time-only / assignments-only / both
  OFF. Rationale: v1.7.0's unconditional wipe was too eager —
  managers who'd hand-tuned start/end times kept losing them on
  Regenerate runs triggered by unrelated requests. The policy
  carves out the common "keep my edits" case without removing the
  full-wipe affordance.
  **v1.9.0 default flip:** `preserveAssignments` defaults to OFF
  (was ON), `preserveTimes` stays default ON. Per-run defaults reset
  on every modal open — closing and re-opening always gives the same
  starting state. Rationale: managers hit Regenerate precisely when
  they want assignments reshuffled (the whole point of "regenerate").
  Defaulting the assignment-preserve to ON meant the action did
  almost nothing on first click (essentially Fill-empty), forcing a
  second click after toggling the flag. The new defaults match
  intent: reshuffle staff, keep manual time edits. Because at least
  one preserve flag is OFF by default, the Regenerate button opens
  in the danger-red variant — making the destructive default
  explicit before any click.

- **Per-slot shift hours (v1.9.0):** the `/shiftTemplate` shape per
  (section, dayPart) block became `{count, times: [{start, end}, ...]}`
  where `times.length === count`. Each shift slot now carries its
  OWN start/end — Kitchen evening's Chef can run 16:00–23:00 while
  Plating runs 16:00–22:00 and Pot runs 17:00–22:30, all stored
  independently on the template. Replaces the single shared
  `{start, end}` per block (legacy v0.5.0–v1.8.x shape) and the
  v0.8.0 `secondPersonStart` field for FoH evening (which was a
  partial per-slot override of just the start time). The Settings
  UI in FoH / Kitchen sections renders `Count` once at the top then
  N labelled per-slot rows below — labelled with the section's role
  (Chef / Plating / Pot / Bar / Floor) for evening slots, or
  "Shift N" for day slots where one person covers all section
  roles. `slotsForDay()` in schedule-logic.js reads `times[i]` when
  present and falls back to the legacy `start`/`end`/
  `secondPersonStart` shape when reading a pre-v1.9.0 saved doc, so
  in-flight reads during a partial upgrade don't break. Settings
  always saves the new shape, so existing docs upgrade lazily on
  the manager's next Save click. No write migration job needed.
  `blockError` and `blockDirty` in Settings.jsx compare the per-slot
  arrays; count changes grow / truncate the `times` array
  (extending with the last entry's times — common case is "add
  another person at the same hours"). The shift records on
  `/shifts/{id}` are unaffected — they already carry their own
  start/end overrides per cell; the template only seeds defaults
  for new cells.
- **Priority badge re-pin (v1.7.0):** the "Priority" `<TBadge>` in
  EmployeesList moved out of the top-right cluster. It now shares the
  bottom row with the Pattern + fixed-days text — the badge anchors
  to the right via flex space-between with `alignItems: flex-end`,
  so the row gains the badge's height only when there's also a
  fixed-days line longer than the badge. No stand-alone row is added.
  Hidden entirely when `emp.schedulingPriority !== true` so the row
  height doesn't shift between priority and non-priority employees.
- **Effective quota in the auto-generator (v1.6.1):** the generator
  now applies the same effective-cap math the v1.6.0 pill displays.
  The shared helper `daysOffInWeekByEmployee(requests, dates)` was
  lifted from `WeeklyShiftSummary.jsx` into `schedule-logic.js` so
  both surfaces read from a single definition. `generateWeek` builds
  the `{ [empId]: count }` map once after computing visible dates,
  then threads it into both `buildCandidates` (the per-candidate
  quota gate) and `clearInvalidShifts` (the Regenerate over-quota
  pass). Effect: a 5-day employee with a 2-day holiday in the
  visible week is now capped at 3 shifts inside the generator
  (matching the UI pill), instead of the raw 5 — frees those cells
  for other employees and keeps generator behaviour in lockstep
  with what the manager sees. Algorithm otherwise unchanged
  (ordering, ranking, request / consecutive-off / preference
  filters are byte-identical). Reason code for over-cap clears
  stays `"over-quota"` — the semantic ("over their cap") is the
  same; only the cap got tighter.
- **Day-OFF is informational, not quota-reducing (v1.9.0):** narrows
  the v1.6.0 / v1.6.1 effective-quota math. Only `holiday` requests
  subtract from `workingDaysPerWeek` on the WeeklyShiftSummary pill
  and in the generator's quota gate; `dayoff` requests no longer
  contribute to that count. Semantic: holiday = "I'm gone, don't
  count me" (subtract from the cap); dayoff = "I'd prefer this
  specific date off" (still HARD-blocks that date via
  `findRequestConflict`, but the employee remains available for
  their full quota across the remaining open dates). The helper
  `daysOffInWeekByEmployee` was renamed in lockstep to
  `holidayDaysInWeekByEmployee` (single-developer codebase, single-
  session rename — safe). Picker hide-by-default behaviour is
  unchanged: Day-OFF employees still hidden behind the existing
  "Show staff on day off / holiday" toggle in `ShiftFormModal`.
  Net visible effect: a 5-day employee with one Day-OFF request in
  the visible week now shows `0/5` on the pill (was `0/4`), and
  the generator can fill them on up to 5 dates that week (the
  Day-OFF date is still skipped via the HARD per-date block at
  step 2 of `buildCandidates`). The WeeklyRequestsPreview panel
  remains the manager's visibility into which dates a Day-OFF
  actually covers.
- **PDF export shows per-cell time overrides + "Closed" placeholder
  (v1.9.0):** `pdf-export.js` `buildTableBody` reworked in two
  places. (a) Cells whose `cell.start / cell.end` differ from the
  slot template defaults — same predicate `ScheduleGrid` uses for
  the `*` marker — render as a two-line `{ content: name +
  "\n" + start–end, styles: { fontSize: 8 } }` autotable cell. The
  row-header keeps the template default, so the printed rota shows
  the reference + the exception together. Slightly smaller font
  signals "secondary info" without losing legibility. (b) Cells
  whose slot's `dayPart` is closed on that date previously rendered
  as empty strings — visually indistinguishable from an unfilled
  open cell. Now render as `{ content: "Closed", styles: {
  fontSize: 8, textColor: [136, 136, 136], fontStyle: "italic" } }`
  — mirrors the in-app `renderClosedCell` intent in print. Literal
  RGB triplet is intentional: `pdf-export.js` never reads CSS vars
  because the printed palette is locked to a light scheme regardless
  of in-app theme (v0.11.0 decision). Role-only changes (different
  evening role with template times) are NOT shown — role identity
  in the PDF is per-row, not per-cell, so the row label already
  tells the reader.
- **Unified hover-scale across interactive surfaces (v1.9.0):**
  every primary interactive surface in the app shares a single CSS
  hover affordance — `.mgt-hover-scale { transition: transform 120ms
  ease } .mgt-hover-scale:hover:not(:disabled) { transform:
  scale(1.08); }` — defined once globally in `index.html` alongside
  the theme tokens. Consumers (cells, pills, nav buttons, row cards,
  tab nav, modals, Settings rows) just add `className="mgt-hover-scale"`.
  The `:not(:disabled)` guard is load-bearing — browsers DO apply
  `:hover` to disabled buttons by default, and Export PDF needs to
  stay flat when the week is incomplete.
  
  **First wave (third v1.9.0 commit):** `WeeklyShiftSummary` pill,
  every schedule grid cell, the Prev/Today/Next nav buttons,
  `<GenerateButton>`, `<SwapButton>`, `<ClearButton>`, `<ExportButton>`
  (gated by `:disabled`), the top tab nav in `<AppShell>` (Schedule
  | Employees | Requests | Settings), employee row cards + Add
  Employee + Show archived in `<EmployeesList>`, request row cards +
  Add Request + Show past in `<RequestsList>`, Save changes + Reset
  to defaults in `<Settings>`, and the v1.9.0 request type pill in
  `<WeeklyRequestsPreview>` (renamed from the local `mgt-req-pill`
  class).
  
  **Second wave (fourth v1.9.0 commit, broader):** Sign out button
  in `<AppShell>`; every clickable element in `<GenerateConfirmModal>`,
  `<ClearConfirmModal>`, `<EmployeeFormModal>`, `<RequestFormModal>`
  (action buttons + segmented controls + pill toggles + multi-select
  pickers + Toggle atoms — broadened from the original "no modal
  buttons" exclusion); inside `<Settings>`: every Collapsible
  section header, every `Fld`-wrapped row, every Toggle, every Open
  days weekday pill, and the Day/Evening buttons inside the Open
  days popover. The atoms `<Fld>`, `<Toggle>`, and `<Collapsible>`
  gained an optional `className` / `headerClassName` prop so callers
  can opt individual rows into the utility without forking the atom.
  
  **Third wave (fifth v1.9.0 commit, ShiftFormModal + section-level
  scaling + overflow fix):** every clickable element inside
  `<ShiftFormModal>` (the cell-edit modal in the Schedule grid) —
  the assignee-related Toggle, each evening-role pill, the
  "Reset times & role" ghost button, Clear (delete), Move/Swap,
  Cancel, and Save; the swap-mode banner's Cancel/× button on the
  Schedule grid. Settings `<Collapsible>` sections now scale as a
  WHOLE when the cursor enters anywhere inside them (via a new
  `className` prop on the atom's wrapper div) and the existing
  per-row scaling on inner Toggles / Flds / pills layers ON TOP,
  giving the manager a clear "section is hot" feedback PLUS a
  finer-grained "this specific row is hot" cue. The Collapsible
  atom's `overflow: hidden` was relaxed to `overflow: visible` so
  scaled inner rows can break out of the section border (matches
  the Schedule grid's clipping fix); side-effect: the body's
  `borderTop` hairline extends to the wrapper's box edge rather
  than the rounded corner — a 1-2 px cosmetic exposure, traded
  for the row-scale visibility.
  
  **Still out of scope** (deliberately): standalone `<input>` /
  `<select>` form controls (they get scaling through their `<Fld>`
  wrapper in Settings, but the input element itself stays still),
  modal close-via-backdrop (no element to scale), banner dismiss
  `×` buttons.
  
  The single magnitude (`1.08`) was picked to match the v1.9.0
  request pill that introduced the pattern; `transform` is
  paint-only so adjacent surfaces don't reflow when a hovered cell
  visually lifts. The schedule grid's outer `overflowX: auto`
  wrapper was given `padding: 8` (with `minWidth` reduced by 16)
  so edge-column cells (Sunday in particular) don't get clipped
  against the wrapper when they scale — browsers force the
  implicit `overflow-y: auto` when `overflow-x` is non-visible, so
  any padding-less scrolling container clips transformed children
  at all four sides.
  
  **Opaque-bg-on-hover (sixth v1.9.0 commit):** the
  `.mgt-hover-scale:hover` rule now also sets
  `background-color: var(--bg-overlay-sheet)` +
  `box-shadow: var(--shadow-soft)` + `position: relative` +
  `z-index: 2`. Surfaces that had no inline `background` (Toggle
  atoms, Collapsible section headers, Fld-wrapped rows in Settings)
  used to read as transparent when scaled — their text "bled" into
  adjacent rows on hover. The new declarations fill that gap.
  Elements WITH an inline `background:` style (mkBtn variant
  buttons, palette pills, schedule cells, row cards) keep their
  existing colours because inline styles beat CSS rules at the
  same level — the new `background-color` only fills in the gap
  for elements that had none, so colour-coded surfaces are
  unaffected. The z-index bump lifts the hovered element above
  its siblings during the hover; combined with the box-shadow,
  the scaled element reads as a card lifting off the surrounding
  surface.

  **Rounded corners + Toggle-container padding (seventh v1.9.0
  commit):** the hover rule additionally sets `border-radius: 12px`
  (matches `S.surfaceSoft` / `S.card` / `BTN.base`) so the new
  hover background paints with rounded corners instead of the
  sharp-cornered look reported in the sixth-commit screenshots.
  Elements with their own inline border-radius (pills at 999,
  cells at 10, etc.) keep their inline value via the
  inline-beats-CSS rule. In parallel, the schedule-grid
  clipping-fix pattern (`padding` on the wrapper to give scaled
  children breathing room) was applied to surfaces that host
  Toggle atoms: the `<Collapsible>` body's horizontal padding
  grew from 14 → 20 (atom-level change → covers every
  Collapsible in Settings) and the `<GenerateConfirmModal>`
  Toggle card's padding grew from "8px 10px" → "12px 16px". When
  a Toggle row scales 1.08 inside a Collapsible body that's
  ALSO scaling 1.08 (compound ≈ 1.166), the extra padding keeps
  the lifted card visually inside the section's wrapper.

  **Field-only scale pattern (eighth v1.9.0 commit):** for any
  field where the manager adjusts a time / date / count value or
  enters notes, the `.mgt-hover-scale` class moves from the
  wrapping `<Fld>` (which scaled the label + input together) to
  the input element itself. Labels stay anchored; only the
  editable surface lifts on hover — the user-visible affordance
  is "the thing you can change is the thing that highlights."
  Applied across:
    - `Settings.jsx` Operating time Start / End (already field-only-
      scale candidates from the start of v1.9.0 — this commit
      moves the existing className from the Fld to the inputs);
    - `Settings.jsx` FoH / Kitchen renderBlock — Count input +
      every per-slot Start / End input. The slot-label column
      ("Chef", "Plating", "Pot", "Bar", "Floor", "Shift N") is
      a static `<div>` and never scaled, so it stays put;
    - `ShiftFormModal.jsx` cell-edit Start / End time inputs;
    - `RequestFormModal.jsx` From / To date inputs + Notes
      textarea.
  The `Toggle` atom's `rowStyle` padding bumped from `"6px 0"` to
  `"10px 12px"` so the hover background (added in the sixth
  v1.9.0 commit) has visible breathing room around the label and
  switch instead of hugging them tight — fixes the "squashed"
  appearance reported in the seventh-commit screenshots.

  **Select dropdowns + modal sheet overflow (ninth v1.9.0
  commit):** the field-only-scale pattern extends to the two
  `<select>` dropdowns flagged in the eighth-commit review —
  `RequestFormModal`'s Employee picker and `ShiftFormModal`'s
  Assignee picker. Both gain `className="mgt-hover-scale"` on
  the `<select>` element so the editable surface lifts when
  hovered, matching the time / date / notes inputs.
  
  In parallel, the `Overlay` atom's desktop sheet `overflow`
  changed from `auto` to `visible` so transform-scaled inputs
  inside any modal (Notes textareas, time / date inputs,
  selects, Toggles) can lift visibly past the sheet's border
  on hover. The previous `overflow: auto` clipped transforms at
  the sheet boundary, which the user reported as "limiting the
  overflow" on the Notes field specifically. Trade-off: long
  modal content (taller than `maxHeight: 80vh`) extends past
  the sheet boundary into the backdrop. Typical form heights
  stay under 80vh (the longest is `RequestFormModal` at ≈620 px
  max in the shift-preference + recurring weekdays + notes
  configuration), so this rarely happens in practice. Mobile
  sheet keeps `overflow: auto` since it fills the full viewport
  and tall content needs internal scrolling there.

- **Requests-this-week type pills preview the request (v1.9.0):**
  in `<WeeklyRequestsPreview>` the colored type pill of each chip
  row became a `<button type="button">` with `className="mgt-req-pill"`.
  An inline `<style>` block at the top of the rendered tree defines
  `.mgt-req-pill { transition: transform 120ms ease; cursor:
  pointer; }` and `.mgt-req-pill:hover { transform: scale(1.08); }`
  — real CSS `:hover` (mirrors the v1.7.0 swap-pulse keyframes
  pattern). The row container itself stays inert: no row-level
  click target, no row-level hover border. Clicking the pill opens
  a NEW `<RequestPreviewModal>` (Overlay-wrapped, read-only)
  showing employee name, type pill, full date range, and — for
  shift-preference requests — the preferred dayPart label
  ("Day shifts only" / "Evening shifts only") + the recurring
  weekday list ("Sat, Sun"), and (when set) the notes field. The
  modal has a single Close button — no Save, no Delete. Edit
  access stays on the Requests tab via the existing
  `<RequestFormModal>` mount in `<RequestsList>`. The preview
  modal's state lives locally inside `<WeeklyRequestsPreview>` —
  `<ScheduleGrid>` is byte-identical to its pre-v1.9.0 state
  (no new state, no new mount, no Esc-handler changes). Rationale:
  this surface is for at-a-glance context only; mixing edit access
  into the Schedule tab risked accidental changes mid-week-review,
  and a whole-row click target broke the visual rhythm of the
  v1.6.0 chip layout. The pill convention also matches the
  WeeklyShiftSummary "Shifts assigned" pills (single-target buttons
  inside an inert row container).
- **Session persistence (v1.5.0):** the open tab (AppShell) and
  displayed week (ScheduleGrid) persist across refresh / Vite HMR
  inside the same browser tab. Storage is `sessionStorage` under the
  `mgt-sched.*` key namespace (`mgt-sched.tab`, `mgt-sched.weekStart`).
  Closing the tab clears the values, so a fresh browser tab / new
  sign-in lands on Schedule + current week as before. The stored tab
  is validated against the live `TABS` array (a stale or hand-edited
  value falls back to `"schedule"`); the stored week is re-normalized
  through `startOfWeek` on read so any drift self-heals. All writes
  are wrapped in try/catch so Safari private mode (where
  sessionStorage throws on `setItem`) degrades gracefully.
- **Generator most-constrained-first ordering (v1.5.0):** the
  worklist's primary sort key is now the size of each cell's eligible
  candidate pool (`buildCandidates(...).eligible.length`), ascending.
  Cells with fewer qualifying employees are processed first, so a
  versatile multi-role employee (e.g. Chef + Bar) is kept available
  for the cell where they're most needed (the Chef slot) rather than
  consumed by the first easy cell (Bar) the worklist happens to hit.
  Existing keys (evening-before-day, role-rarity, date, slot-key)
  remain as deterministic tiebreakers. Counts are computed once at
  worklist-build time against the post-clearance `workingShifts`; we
  do NOT re-rank after each greedy pick (problem size ≤49 cells/week;
  pre-sort captures the bulk of the benefit). `clearInvalidShifts`
  and `rankCandidates` are unchanged.
- **Schedule grid visual polish (v1.4.0, mobile counterpart v1.9.2, mobile Closed v1.9.5):**
  - **Today-column tint (desktop).** A single underlay div with
    `gridColumn: <todayIndex + 2>`, `gridRow: "1 / -1"`,
    `background: var(--accent-tint-soft)`. Translucent cell
    backgrounds let the tint show through. `todayIndex < 0` (today
    outside week / closed) → no underlay.
  - **Today-card tint (mobile, v1.9.2).** Mirror on the mobile
    day-card stack: when `dIso === todayIso`, the whole card's
    background flips to `var(--accent-tint-soft)`, its border to
    `1px solid var(--accent-tint-strong)`, and the date-header
    text inside flips to `var(--accent-on-tint)`. Same three tokens
    the desktop column underlay + desktop date pill use, so the
    visual identity for "today" reads the same across breakpoints.
    No card gets tinted when today is outside the visible week or
    today's weekday is closed (in which case it isn't in `dates`
    via `visibleWeekDates`). Cell-level visuals stack above the
    tinted card (v1.7.0 green pill highlight + yellow swap pulse
    still read correctly inside today's card).
  - **Mobile "Closed" placeholder (v1.9.5).** Mobile day-card slot
    list now renders inert "Closed" placeholders for closed-dayPart
    slots (pre-v1.9.5: filtered out entirely via
    `slots.filter(isSlotOpenOnDate)`). Mirrors the desktop v1.3.0
    pattern through the shared `renderClosedCell` helper; section
    headers iterate over the full `slots` array so partial-closure
    days keep their canonical slot ladder (e.g. "FoH · Day" header
    above a Closed placeholder, then "FoH · Evening" header + cells
    beneath as normal). Fully-closed days are still dropped upstream
    via `visibleWeekDates`, so the day card simply doesn't render
    when nothing is open — only partial closure benefits from the
    new visibility. Brings desktop/mobile/PDF (v1.9.0) to a single
    visual model for closed cells.
- **Generator result details (v1.4.0, jump-to-cell v1.9.3, always-on v1.9.4):** the
  result banner gains a "Details" button. Originally hidden when both
  `unfilledCells` and `clearedReasons` were empty (v1.4.0 minimalism);
  **v1.9.4 makes the button always visible on Generate/Regenerate
  banners** so managers have a stable affordance to inspect any run —
  even a clean one (clicking on a clean run opens the modal with the
  existing "Nothing to report — everything fell within the rules"
  message, which is still useful as confirmation). The predicate
  switched from "either array is non-empty" to "the banner has a
  `mode` field" — Clear results carry no `mode` (their summary is
  `{cleared, kind}`), so Clear banners still skip Details. The
  v1.4.0 hide-when-empty design surfaced as a "disappeared button"
  surprise for managers who'd seen Details on prior runs and didn't
  realise it was conditional.
  Click opens `GenerateResultsModal` listing each unfilled cell and
  (for Regenerate) each cleared shift grouped by reason. Human-
  readable labels live in `GENERATOR_REASONS` in `constants.js` —
  single source of truth keyed by the reason codes the generator
  emits. The banner's 5-second auto-dismiss is held while the modal
  is open so the manager can read at leisure; closing the modal
  resumes the countdown. Dismissing the banner (via ×) also closes
  the modal as a safety against stale-state rendering. Clear-button
  results never show "Details" — they carry no reason metadata.
  Generator's `clearInvalidShifts.clear()` was enriched to capture
  each cleared shift's date/employeeId/section/dayPart/slotIndex/
  slotKey at clear time, so the modal can display "Anna — Tue 19,
  Kitchen Day — archived" rows even after the record has been
  deleted from Firebase.
  **v1.9.3 jump-to-cell:** every reason-row in the modal is now a
  clickable button (uses the shared `.mgt-hover-scale` utility).
  Click fires `onJumpToCell(dateIso, slotKey)` on `ScheduleGrid`,
  which (a) auto-navigates `weekStart` to the week containing the
  date if it's outside the visible range — otherwise the cell can't
  flash because it isn't rendered, (b) closes the results modal,
  and (c) sets a new `highlightedCellKey` state (composite
  `${dateIso}|${slotKey}`). The cell renders with the v1.7.0 green
  highlight palette (same `--bg-active-on` / `--border-active-on`
  tokens the pill-click highlight uses) AND a one-shot
  `@keyframes mgt-jump-pulse` scale-bounce animation (transform-
  only so it composes with the inline box-shadow ring). The cell-
  key state auto-clears 1.7s later via a `useEffect` watcher; the
  animation ends at 1.6s so the cell settles back to base without
  flicker. Esc clears the cell-key highlight too (priority order
  in the keydown handler: swap-mode → jump-target → sticky pill-
  highlight). Pill-highlight and jump-target paint identically at
  rest — the animation is the only distinguishing cue, which keeps
  the visual identity for "this cell is the focus" consistent
  regardless of how the manager got there.
  **v1.9.4 polish:** v1.9.3's row-becomes-button refactor left the
  list bullet on the `<li>` (from `list-style: disc`) — when the
  inner button hover-scaled, the bullet stayed anchored and read as
  visually detached. The bullet is now a `<span aria-hidden="true">`
  rendered INSIDE the button (or inside the flex `<li>` for the
  non-interactive fallback), so the whole row scales as one unit.
  `<ul>` lost `list-style: disc`; padding moved off the `<li>` onto
  the button (`4px 8px`, bumped from v1.9.3's `2px 6px` so the
  hover background reads as a discrete row card). The Close button
  also gained `.mgt-hover-scale` (missed in the v1.9.0 second-wave
  pass). Section blocks now live inside a scrollable inner wrapper
  (`maxHeight: isMobile ? "55vh" : "min(60vh, 480px)"`, `overflowY:
  auto`) so long generator outputs (35+ cleared rows on a
  Regenerate against a busy week) scroll internally instead of
  spilling off the Overlay sheet — the v1.9.0 `overflow: visible`
  fix for the sheet (which lets hover-scale transforms lift past
  the border) had the side effect of making long modal content
  unreachable. Negative horizontal margin + matching padding on
  the scroller gives hover-scaled rows 16px of breathing room
  before the clip kicks in (same pattern as ScheduleGrid's outer
  wrapper). Summary line + Close button stay outside the scroller,
  anchored at the modal bottom.

- **Generator-results banner config (v1.9.4):** the auto-dismiss
  banner that appears above the schedule grid after a Generate /
  Regenerate / Clear run is now configurable in
  Settings → Auto-generator. Two new fields on `/settings`:
  `generatorBannerAutoDismiss` (bool, default true) and
  `generatorBannerDurationSec` (number 1..60, default 5). The
  toggle hides the duration field when off — duration has no
  effect with auto-dismiss disabled. Both knobs auto-save on flip
  / valid edit (same pattern as the existing strict-preference
  toggle); duration onChange ignores empty / NaN / out-of-range
  inputs so the saved value remains the last valid number while
  the manager edits. ScheduleGrid reads both on every render via
  the same defensive-fallback pattern as strict-preference; the
  auto-dismiss `useEffect` re-runs on either value's change.
  When auto-dismiss is OFF the banner stays until the manager
  ×-closes it or another run replaces it — useful for slow-paced
  weekly reviews where the manager may want to inspect results
  longer than the default 5s. Reason for moving from a hard-coded
  5s constant: managers iterating heavily on a busy week's
  schedule kept missing the banner before they could read it, and
  managers on a one-off review wanted it to stay visible while
  they thought.

- **Undo stack for multi-cell mutations (v1.10.0):** every
  Clear / Generate / Move / Swap captures its pre-mutation state
  into a 5-entry FIFO stack so the manager can roll back the most
  recent action(s). Bounded depth means typical "oops, undo that"
  cases work without unbounded growth; oldest drops silently when
  the cap is hit (no UI surface advertises the cap). Lives entirely
  in-memory via React state (`src/hooks/useUndoStack.js`) — survives
  Vite HMR (Fast Refresh preserves useState) but resets on hard
  refresh / tab close. Intentional: undo scopes to "I just did a
  thing, oops," not "roll back yesterday." No sessionStorage
  persistence; restored records use the same ids they had pre-clear
  (Firebase RTDB accepts writes to any key, even one we just
  deleted), so a cross-session undo could resurrect ids that
  another client has since reused. Op shape:
  `{ id, label, timestamp, restoreShifts: [shift], removeIds: [id] }`.
  Apply order is restore-first (re-create deleted records) then
  remove (drop records the original op created); the lists are
  disjoint in every capture site so the order doesn't matter in
  practice but stays deterministic. Capture sites:
  - **ClearButton** snapshots every record about to be deleted into
    `restoreShifts`; `removeIds = []`. Label: `"Clear week"` /
    `"Clear day"`.
  - **GenerateButton** snapshots cleared (deleted by Regenerate)
    and modified (in-place updated by Regenerate's partial-policy
    wipe pass) PRE-mutation records into `restoreShifts`; reads
    each new shift's resolved id off `upsertShift`'s return value
    (already returned by `usePersistence.upsertCollection` since
    v0.6.0 — no usePersistence change needed) into `removeIds`.
    Label: `"Regenerate"` / `"Fill empty"`. Skips pushing an op
    when nothing actually changed (e.g. fill-empty on a full week).
  - **ScheduleGrid `attemptSwap`** snapshots `source.shift` and
    (when present) `target.shift` into `restoreShifts`. Swap
    branch: `removeIds = []` (both ids stayed, only employeeIds
    moved). Move branch when target had no prior record: capture
    `upsertShift`'s return value into `removeIds` so undo deletes
    the freshly-created record. Move branch when target had a
    placeholder: id was reused, `removeIds = []`. Labels: `"Swap"`
    / `"Move"`.
  Apply lives in `ScheduleGrid.handleUndo()` — loops
  `actions.upsertShift` over `restoreShifts`, then
  `actions.deleteShift` over `removeIds`, then sets a result
  banner `{ kind: "undo", label, restored, removed }`. Banner copy:
  `"Undid: <label>."`. Auto-dismiss inherits the v1.9.4 settings
  (`generatorBannerAutoDismiss` / `generatorBannerDurationSec`) —
  one result-banner state owns all four shapes (clear, generate
  fill-empty, generate regenerate, undo) so behaviour stays
  uniform. **UndoButton placement:** Schedule nav-bar between
  SwapButton and ClearButton. Label adapts: `"Undo"` (disabled,
  empty stack) vs `"Undo: {top.label}"` (e.g. `"Undo: Regenerate"`).
  Title tooltip carries the same info for readers who can't see
  the dynamic label.

- **LoginScreen hover-scale (v1.10.0 companion):** the v1.9.0
  `.mgt-hover-scale` utility now also applies to the email input,
  password input, and Sign-in button on the login screen.
  Three-prop addition via `mkInp({ className: "mgt-hover-scale",
  ... })` / `mkBtn({ className: "mgt-hover-scale", ... })` — both
  atoms already pass `className` through via `{...rest}` spread on
  the underlying element. The `:not(:disabled)` guard in the
  global CSS rule correctly suppresses the scale when the Sign-in
  button is disabled (fields empty or busy). Brings the login
  screen in line with every other interactive surface in the app.

- **Eager `/shiftTemplate` migration (v1.10.1):** the v1.9.0 per-slot
  shape change (`{count, start, end, secondPersonStart?}` →
  `{count, times: [{start, end}, ...]}`) was previously migrated
  lazily — Settings.jsx rewrote a legacy doc to the new shape only
  when the manager opened the tab and clicked Save. v1.10.1 promotes
  the migration to "once per session, automatically." `AppShell`
  mounts a ref-guarded `useEffect` that, after `usePersistence`
  reports `ready` and `data.shiftTemplate` is non-null, calls the
  new `isShiftTemplateMigrated(template)` helper; if it returns
  false, the canonical form (built by `materializeShiftTemplate`) is
  written back via `actions.saveShiftTemplate(materialised, true)`
  (`isSilent=true` so a refusal banner can't surface for the
  user — this is an auto-effect, not a manual action). The effect
  also fires when the template is already canonical, but
  short-circuits via `isShiftTemplateMigrated` returning true; the
  ref guard then prevents re-entrancy after the migration write's
  own onValue echo.
  **Helper lift:** `materializeShiftTemplateBlock` (per-block) +
  `materializeShiftTemplate` (whole template) + `isShiftTemplateMigrated`
  (predicate) live in `schedule-logic.js` as the single source of
  truth for shape-knowledge. The pre-v1.10.1 local `materializeBlock`
  in `Settings.jsx` was deleted; Settings now imports the lifted
  helper aliased as `materializeBlock` so internal call sites
  (`cloneTemplate`, `blockDirty`, the `renderBlock` count-onChange
  path) keep their original naming. `cloneTemplate` delegates to
  `materializeShiftTemplate` and falls back to a default-shaped
  object only when the input is null (defensive — pre-v1.10.1
  callers always passed `shiftTemplate || DEFAULT_SHIFT_TEMPLATE`,
  so the fallback path is unreachable in practice).
  **Why not also delete `slotTimeFor`'s legacy fallback?** Belt &
  braces. Eager migration handles every doc that passes through a
  signed-in session, but the fallback covers in-flight reads
  between persistence-ready and the migration write completing,
  AND any future legacy state from manual Firebase console edits or
  backup restores. The fallback is ≈8 lines; removing it is a
  v2.0 cleanup, not a v1.10 win.
  **Idempotency:** `isShiftTemplateMigrated` also flags lingering
  legacy fields (`start`, `end`, `secondPersonStart`) on a block
  whose `times` array is otherwise valid — so a doc that had its
  `times` written by Settings without `start`/`end` being deleted
  (e.g., partial manual edit) still triggers the migration's
  cleanup pass.

- **Configurable scheduling rules (v1.11.0):** three labor-wellness
  / role-policy values that were hard-coded at v1.1.0–v1.8.0 become
  first-class `/settings` knobs in a new "Scheduling rules"
  accordion section (inserted between Display and Auto-generator).
  Each rule affects BOTH the generator HARD filter AND the manual
  picker SOFT warning — they're not generator-only knobs (which is
  why Auto-generator wasn't the right home).
  - **`minConsecutiveDaysOff` (1..3, default 2).** Used to be the
    `n` default inside `hasConsecutiveDaysOff` (`schedule-logic.js`);
    every call site passed `undefined`. v1.11.0 threads the
    configured value into `generator.js`'s step 6 + ShiftFormModal's
    `restWarning`. The picker's yellow banner copy adapts ("less
    than N consecutive day(s) off"). Generator reason code stays
    `"no-2-off"` (the semantic is "rest rule" regardless of N).
  - **`maxConsecutiveWorkingDays` (3..14, default 5).** Used to be
    the `max` default inside `withinMaxConsecutiveWorkingDays`.
    Same `undefined` pattern at the two call sites. v1.11.0 threads
    the configured value into `generator.js`'s step 6.5 +
    ShiftFormModal's `maxConsecutiveWarning`. Picker banner copy
    adapts ("more than N consecutive working days"). Always-on —
    no disable toggle (locked: the cap is the knob, not its
    existence).
  - **`dayRequiredRoles` (object keyed by section, default
    `{foh: [], kitchen: ["Chef"]}`).** Used to be the hard-coded
    `SECTIONS.kitchen.dayRequiredRoles = ["Chef"]` in `constants.js`.
    v1.11.0 adds an optional second arg to
    `slotsForDay(template, dayRequiredRolesOverride)` — when the
    override is supplied and the section's entry is an array, it
    wins over the SECTIONS default (even an explicit empty array
    counts as "permissive"). ScheduleGrid threads the configured
    map into its `slotsForDay` call, so every consumer of
    `slotDef.requiredRoles` (picker filter, generator's
    `roleMatchesSlot`, Swap mechanic) inherits the configuration
    automatically. UX is a per-section pill multi-select (FoH row:
    Bar / Floor; Kitchen row: Chef / Plating / Pot). Empty per
    section = permissive — any of the section's `coversRoles` is
    enough, matching the pre-v1.11.0 FoH legacy behaviour.
  **Migration / idempotency:** pre-v1.11.0 `/settings` docs lack
  all three new fields. ScheduleGrid + Settings + generator all use
  the defensive defensive-fallback pattern (same as v1.0.0
  `generatorStrictPreference` and v1.9.4 banner config), so
  behaviour is byte-identical for legacy docs. No eager migration;
  the first auto-save from the new Settings section writes the
  explicit values. SECTIONS.kitchen.dayRequiredRoles STAYS as the
  system fallback when `slotsForDay` is called bare (tests, future
  callers) — no deletion.
  **Settings UX:** all three rows auto-save on change (no Save
  button), matching the Auto-generator section's pattern. Reset to
  defaults writes the three new defaults alongside the existing
  ones. `openSection` valid set expanded to include `"rules"` so
  sessionStorage persistence (v1.6.0) works for the new section
  too.

- **Past-week lockdown (v1.12.0):** any focus week whose Sunday is
  strictly before today (`isPastWeek(weekStart, todayIso)` in
  `schedule-logic.js`) becomes non-editable. ScheduleGrid derives a
  single `isReadOnly` flag and threads it as `disabled` to
  `<GenerateButton>` / `<SwapButton>` / `<UndoButton>` /
  `<ClearButton>` (every nav-bar mutation entry point) and as
  `readOnly` to `<ShiftFormModal>`. The modal opens normally so
  cell info stays inspectable, but Save / Move-Swap / Clear / Reset
  buttons are hidden, the assignee select + time inputs + role
  pills are disabled, and a single Close button replaces the action
  footer. A muted-amber banner above the grid says "This week is
  in the past. Cells are read-only — switch to the current or a
  future week to make edits." A defensive `useEffect` also drops
  any active swap-mode state when `isReadOnly` flips true (catches
  the "navigate backward mid-swap" edge). `cellClick` short-
  circuits the swap branches when read-only so even stale state
  can't trigger a mutation. Pill-highlight + jump-to-cell stay live
  (read-only by nature). The current week is editable for the full
  Mon..Sun span; the gate flips the first moment the manager moves
  forward into a new week.

- **Auto-generator monthly fairness (v1.12.0):** two independent
  generator changes plus a new visibility surface.
  - **Prior-week HARD deficit cap.** In `buildCandidates` step (5),
    a new `priorActualByEmp` map (built once per `generateWeek` call
    from `priorWeekShifts` via `countAssignedDates`) feeds a
    `priorDeficit = max(0, priorActualCount - workingDaysPerWeek)`
    subtraction. A 5-day employee who actually worked 6 dates last
    week (whether by manager edit or by a relaxed-rules generator
    pass) is capped at 4 this week. Two-week totals even out.
    Reuses the `"over-quota"` reason code.
  - **28-day rolling deficit ranking** in `rankCandidates`. Replaces
    the v1.1.0 combined-load (this week + prior week) tiebreaker
    with hours-deficit-desc (PRIMARY) → shifts-deficit-desc (tie-
    break) → specialists (demoted from #2 → #4) → prevAssigneeId →
    name. Source data is `monthlyAggregates` (pre-built by
    `build28DayAggregates` in `schedule-logic.js`, memoised once
    in `ScheduleGrid` and shared with `<MonthlyFairnessPanel>`).
    Targets: `shiftsTarget = workingDaysPerWeek × 4 −
    holidays(28-day window)`, `hoursTarget = shiftsTarget ×
    avgShiftHours(preference, shiftTemplate)`. "either" preference
    averages day + evening template hours; "day" / "evening"
    average only the matching block side. The v1.1.0 7-day combined
    load is GONE — the 28-day window subsumes it (it was a
    narrower take on the same fairness idea).
  - **`<MonthlyFairnessPanel>`** new component rendered below
    `<WeeklyRequestsPreview>`. One row per active employee: name +
    `count/target` shifts + `Nh/target` hours + centre-anchored
    120-px delta bar (red leftward when under-target, green right-
    ward when over). Always visible (a hard panel — no chrome
    hidden when employees are at target). Same memoised
    `monthlyAggregates` as the generator, so what the panel shows
    is what the generator will act on. Hover-scale via the shared
    `.mgt-hover-scale` utility (v1.9.0 visual identity preserved).

- **Chef pill bug fix (v1.12.0):** `dayRequiredRoles` schema flipped
  from v1.11.0's `{foh: ["Bar"], kitchen: ["Chef"]}` array-of-role-
  names per section to v1.12.0's `{foh: {Bar: false, Floor: false},
  kitchen: {Chef: false, Plating: false, Pot: false}}` per-role
  boolean object. Root cause of the bug: Firebase RTDB strips empty
  arrays to null on write, so saving `kitchen: []` (manager's
  permissive choice) wrote nothing back; the v1.11.0 resolver's
  `Array.isArray(settings.dayRequiredRoles[section])` check failed,
  fell back to `DEFAULT_DAY_REQUIRED_ROLES.kitchen === ["Chef"]`,
  and the Chef pill sprang back into selected state on next render.
  Booleans (`false` included) ARE preserved by Firebase, so the
  configured-but-permissive state now survives a round-trip.
  New lifted helper `resolveDayRequiredRoles(settingsValue,
  sectionKey)` in `schedule-logic.js` accepts either shape (boolean
  object OR legacy array) and returns the canonical role-name
  array — used by both `slotsForDay` (internal) and `Settings.jsx`
  (the pill UI). First pill click after upgrade rewrites the doc
  into the new shape; no eager migration.
  `SECTIONS.kitchen.dayRequiredRoles` was DELETED — the fallback
  path now goes through `DEFAULT_DAY_REQUIRED_ROLES` instead of
  SECTIONS, so the v1.1.0 system fallback field is dead weight.

- **Settings auto-save — Save button removed (v1.12.0):** the
  three explicit-save sections (Operating time, FoH, Kitchen) now
  auto-save on a debounce, matching what Display / Auto-generator /
  Scheduling rules already did since v0.10.0 / v1.0.0 / v1.11.0
  respectively. Two new `useEffect`s in `Settings.jsx`:
  - **Operating time** (hours + opening days): writes a single
    `saveSettings({...settings, operatingStart, operatingEnd,
    openingDays})` 800 ms after the last change. Gated on
    `operatingDirty && opsErr === null && openDaysErr === null` so
    partial inputs ("1" before "11:00") don't fire.
  - **Template** (FoH + Kitchen blocks combined): writes
    `saveShiftTemplate(form)` 800 ms after the last change. Gated
    on `(fohDirty || kitchenDirty) && all four block errors are
    null`. Saving the whole template per call avoids the race
    where an in-flight FoH save and a Kitchen save overwrite each
    other's parts.
  The Save button, `handleSave` function, force-open-first-error-
  section logic, and `saveDisabled` / `anyDirty` / `hasErrors`
  derivations are all gone. Per-section dirty dots stay (they
  surface BOTH the pending-debounce window AND the invalid-state
  window — useful feedback). Inline per-row error captions stay
  (they always rendered; now they're the primary error feedback
  surface, replacing the force-open affordance). Reset to defaults
  stays (single-click action, no validation interdependency).

- **Monthly Fairness Panel polish (v1.13.0):** three coupled improvements
  to the v1.12.0 panel — all stay informational; the generator's
  rankCandidates ordering is unchanged.
  - **Highlight sync.** `<MonthlyFairnessPanel>` is now a second
    consumer of ScheduleGrid's `highlightedEmployeeId` axis (the
    same one wired to `<WeeklyShiftSummary>` since v1.7.0). Clicking
    a "Shifts assigned" pill paints the matching fairness row green
    (iOS-green tokens `--bg-active-on` + `--border-active-on` + a
    2-px box-shadow ring, matching the pill). Clicking a fairness
    row name does the inverse — flips the same axis, lighting up
    the pill and every assigned cell. One state, three surfaces in
    lockstep. No new state in ScheduleGrid; just one prop forwarded.
    The row's name+counts area is a `<button>`; the delta bar
    sits next to it as a sibling button (NOT nested — invalid HTML).
  - **Delta bar overhaul.** Geometry: 120 × 6 px → 160 × 10 px, border-
    radius 3 → 5. Centre divider replaced — was a full-height
    1-px hairline; now a vertically-centred 2-px notch
    (`top: 2 bottom: 2 opacity: 0.55`) that anchors centre without
    visually dominating. Under-fill stays red but gains an inset
    1-px `--btn-danger-fg` micro-border for definition; over-fill
    gains a matching `--border-active-on` inset border. Min-fill
    floor: any non-zero magnitude renders at least 2 px so a small
    deficit can't collapse to "looks at-target." The 160-px width
    bump is absorbed by the row's existing `flexWrap: "wrap"`; the
    `marginLeft: "auto"` right-anchor keeps the bar aligned across
    screen sizes.
  - **Drill-down popover.** Clicking the delta bar opens
    `<EmployeeFairnessModal>` — read-only, informational, three
    Section blocks. (a) 28-day rolling stats (shifts + hours vs
    target, with signed delta + holiday days + window date bounds).
    (b) Calendar month stats for the month containing the focus
    week's Monday — pro-rated target = `workingDaysPerWeek ×
    monthLength / 7 − holidays in month`. (c) Per-week sparkline:
    4 horizontal bars [wk-3, wk-2, wk-1, this wk], each 7 days
    ending at the focus week's Sunday. Bar tint: red under-target,
    neutral at-target, green at-or-over. New helper
    `buildEmployeeFairnessDetail` in `schedule-logic.js` returns
    `{rolling28, calendarMonth, perWeek}` — single employee, computed
    on modal open. Past-week navigation does NOT gate the modal
    (it's informational; doesn't mutate). Modal closes via
    backdrop / Close / Esc.
  - **Per-week sparkline jump-to-week.** Each WeekBar in the modal
    is a `<button>` (when ScheduleGrid provides the `onJumpToWeek`
    prop) that navigates the schedule to that week. The flow:
    bar click → modal's `onJumpToWeek(weekStartIso)` →
    MonthlyFairnessPanel's wrapper (closes the modal locally) →
    ScheduleGrid's `jumpToWeek(weekStartIso)` (parses ISO,
    re-normalizes via `startOfWeek`, sets `weekStart`). The auto-
    close is the load-bearing part — the manager wants to *see*
    the week they picked, and the modal would block visibility.
    Clicking "this wk" is a no-op navigationally (weekStart already
    matches) but still closes the modal — accepted minor cost for
    interaction consistency across all four bars.
  - **Row layout & hover bg (in-DEV review polish, five iteration
    rounds).** Each round fixed a specific concern surfaced by
    looking at the live DEV server:
      - **R1.** Name button → content-sized + 12×14 padding. Row
        read as too tall; green tint too small.
      - **R2.** Wrapper-as-highlight restored (full-row green);
        padding 8×12; `.mgt-hover-soft` variant added (50% mix).
      - **R3.** Padding restored to 6×8; `.mgt-hover-soft` deleted;
        base `.mgt-hover-scale:hover` tuned to 80% color-mix.
      - **R4.** New theme-aware `--bg-hover-card` token (light:
        `#ffffff`, dark: `rgb(50,50,53)`) used DIRECTLY by the
        hover rule — every translucent attempt (50%, 80%, even
        the original 0.92) read as washy on the already-
        translucent `--bg-soft` / `--bg-card` surfaces underneath.
        Name button became content-sized with 4×8 padding so the
        hover card fits snug around name+counts.
      - **R5** dropped wrapper padding to 0 and bumped button
        padding to 4×10 to match the `<WeeklyShiftSummary>` pill
        rhythm — row ended up shorter than the reference visual
        and density still felt off.
      - **R6** reverted the row layout to the first v1.13.0
        commit (wrapper padding 6×8, name button `flex: 1` no
        padding) — but lost the snug-hover behaviour the manager
        had confirmed was correct.
      - **R7 (FINAL).** Combines R4's snug-hover layout (wrapper
        padding 6×8, name button content-sized with 4×8 px inner
        padding, delta bar pushed right via `marginLeft: auto`)
        with the **font-size fix**: `fontSize: 12` + `color:
        var(--text-primary)` restored on `wrapStyle`. The first
        commit's `baseRowStyle` had those; they got lost in the
        intermediate refactors, leaving the name span inheriting
        the body's default 16 px while the shifts/hours spans
        kept their explicit 12 px — the actual visual mismatch
        the manager was flagging. With this restored all three
        columns render at one consistent 12 px size, matching the
        first commit's look exactly.
  - **Active-only fairness rows.** `<MonthlyFairnessPanel>` skips
    `emp.active === false` employees entirely (was: skip-archived-
    with-zero-shifts, which still surfaced orphan shifts on archived
    rows). Orphan-shift visibility lives on `<WeeklyShiftSummary>`
    just above the panel; this surface is for active-roster
    balancing.

- **Calendar-month fairness in the auto-generator (v1.14.0):** the
  generator's `rankCandidates` now sums hours/shifts deficits across
  **two** windows — the existing rolling 28-day aggregates AND a new
  calendar-month aggregate — before applying the deficit DESC sort.
  Sort order unchanged: schedulingPriority → hoursDeficit DESC →
  shiftsDeficit DESC → specialists → prevAssigneeId → name. Combining
  by addition means recent under-utilization weights more heavily
  (the last few days appear in both windows). Under-utilization that
  shows up only at the payroll-month boundary still contributes a
  smaller-but-non-zero signal. Missing calendar-month aggregates on
  any sibling caller → the calendar-month side contributes 0 to the
  rank, so pre-v1.14.0 callers behave byte-identically to v1.13.0.
  New helper `buildCalendarMonthAggregates({shifts, employees,
  weekStart, requests, shiftTemplate})` lives in `schedule-logic.js`
  and mirrors `build28DayAggregates`'s shape. Pro-rated target:
  `wpw × monthLength / 7 − holidays` (same formula
  `buildEmployeeFairnessDetail`'s calendarMonth block already uses,
  so the drill-down modal and the generator stay in lockstep).
  ScheduleGrid memoises the new map next to the existing
  monthlyAggregates memo and forwards it to `<GenerateButton>` only —
  `<MonthlyFairnessPanel>` stays visually 28-day-rolling. Holiday
  handling identical: only `type === "holiday"` requests subtract
  from the target (v1.9.0 rule).

- **Reasoning toggle on `<EmployeeFairnessModal>` (v1.14.0):** the
  drill-down modal gained a left-aligned "Reasoning" button in its
  footer (sibling to the right-aligned Close). Clicking it flips a
  local `view` state from `"data"` (the original three stat
  Sections) to `"reasoning"` (three matching Section blocks with the
  formulas and the employee's actual plugged-in values: shifts target
  = `wpw × 4 − holidays`, hours target = `target × avgShiftHours`,
  etc.). Button label flips in lockstep ("Reasoning" ↔ "Show data")
  so it always names the action, not the current state. Single
  Overlay, single Close — no nested modal, no view-state machine
  beyond the binary toggle. `buildEmployeeFairnessDetail`'s perWeek
  buckets gained a `holidayDays` field so the reasoning view can
  show the per-bucket `wpw − holiday = target` subtraction (the
  shiftsTarget alone is lossy when holidays exceed wpw).

- **Author-rights / IP protection layer (v1.14.0):** mirrors MGT
  Bookings' five-piece deterrent layer.
  - **LICENSE** at repo root — proprietary, "all rights reserved",
    licensed exclusively to the restaurant Me Gustas Tú for internal
    operational use. Verbatim copy of the Bookings LICENSE.
  - **Source-header copyright block** at the top of `src/App.jsx` —
    JSDoc block with copyright, author, contact, LICENSE pointer.
    Survives in any deployed bundle.
  - **`__APP_SIGNATURE__` extension** — added `app` / `author` /
    `contact` / `copyright` / `license` fields alongside the
    existing `version` / `build` / `sha`. Exposed via
    `window.__MGT_SCHED_BUILD__`. Module-level identity record;
    bundler can't tree-shake it because the boot banner references
    it. Forensic evidence in any unauthorised deployment.
  - **Console boot banner** extended with two extra `console.log`
    calls below the existing version banner — one for the copyright
    line, one for the "Unauthorized use, copying, redistribution,
    or modification is prohibited." notice. Visible to anyone who
    opens DevTools.
  - **Visible Settings footer** — centred plain footer below the
    accordion (outside any Collapsible) inside the Settings tab.
    Two lines: `version 1.14.0` + `© 2026 Patryk Zychowicz — MGT
    Staff Scheduling`. Reads from `__APP_SIGNATURE__` so a version
    bump propagates here automatically. Uses `var(--text-muted)`
    (NOT Bookings' hardcoded greys) to respect the v0.11.0 theming
    model — colour adapts to light/dark theme.

- **Holiday-handling audit (v1.14.0):** confirmed consistent across
  every fairness surface. `holidayDaysInWeekByEmployee` and
  `holidayDayCountForEmployeeInRange` both filter `r.type !==
  "holiday"`. Used by `<WeeklyShiftSummary>`'s effective-quota pill,
  `build28DayAggregates`, `buildCalendarMonthAggregates` (new), and
  `buildEmployeeFairnessDetail`'s rolling28 + calendarMonth + perWeek
  paths. `aggregateShiftsInRange` counts actual shifts worked
  without excluding holiday-date shifts on purpose (holiday requests
  HARD-block via `findRequestConflict` upstream; a shift on a
  holiday only exists via deliberate manager override, in which
  case the count should reflect reality). v1.9.0 rule preserved:
  only holiday requests subtract from target; day-OFF requests still
  HARD-block the date at assignment time but the employee remains
  available for the full quota across remaining open dates.

- **Result-banner buttons hover-scale (v1.14.0):** the Generate /
  Regenerate / Clear result banner above the schedule grid renders a
  "Details" button (when the banner has a `mode`) and a dismiss `×`
  button. Both now carry `className="mgt-hover-scale"` matching every
  other interactive surface in the app. Closes a v1.9.0 hover-utility
  gap (the original second/fifth/eighth-wave commits didn't reach
  these two buttons).

- **Per-employee avg-shift-hours for fairness (v1.15.0):**
  `avgShiftHours` signature changed from
  `(preference, shiftTemplate)` to
  `(emp, shiftTemplate, dayRequiredRoles)`. It used to average slot
  durations across every slot in the matching dayParts, regardless
  of which slots the employee could actually fill — so a Bar-only
  evening employee's hours-target counted FoH Evening 1 + 2 AND
  Kitchen Evening Chef / Plating / Pot (none of which they can
  fill), and a Chef-only employee's target was diluted by the
  team-wide average instead of the Chef slot's true hours. Both
  errors fed `hoursDeficit` into the generator's `rankCandidates`
  and distorted fairness. v1.15.0 filters the slot list (via the
  existing `slotsForDay` + `roleMatchesSlot` helpers) to ONLY the
  slots the employee is role-eligible AND preference-eligible for,
  then averages those durations. Returns 0 when no eligible slots
  (correct — no viable assignments → no hours expectation). All
  three fairness aggregate helpers (`build28DayAggregates`,
  `buildCalendarMonthAggregates`, `buildEmployeeFairnessDetail`)
  gained an optional `dayRequiredRoles` arg threaded into
  `avgShiftHours`; ScheduleGrid forwards its settings-derived
  `dayRequiredRoles` into both aggregate memos and down through
  `<MonthlyFairnessPanel>` → `<EmployeeFairnessModal>` so the
  drill-down's inline reasoning matches the generator. Behavioural
  change: generator picks shift for any employee whose role-set is
  narrower than their section's full coverage (most real
  employees). The Reasoning view copy in `<EmployeeFairnessModal>`
  was updated to describe the per-employee eligible-slot scope.
  **2nd commit — opening-day weighting:** `avgShiftHours` gained a
  4th arg `openingDays`, changing the per-employee mean from FLAT to
  WEIGHTED. Each eligible slot's hours are weighted by the number of
  weekdays its day-part is open in the standing `/settings.openingDays`
  schedule (counted via `normalizeOpeningDays` + `WEEKDAY_KEYS`).
  Opening days are per-dayPart (day / evening), not per-section, so
  every day slot shares one weight and every evening slot shares
  another. Rationale: a flat mean treats a shift that runs Mon–Sun
  the same as one that runs Sat–Sun only; the weighted mean reflects
  the hours-per-shift the employee will actually be scheduled for.
  Backward-compat: `openingDays` undefined → `normalizeOpeningDays`
  defaults every weekday to both-open → all weights 7 → identical to
  the flat mean. A fully-closed day-part → weight 0 → its slots drop
  out of the average ("when they are off"); all-zero → returns 0. The
  3 aggregate helpers gained an optional `openingDays` arg threaded
  in; ScheduleGrid forwards `openingDays` into both aggregate memos
  (+ dep arrays) and through `<MonthlyFairnessPanel>` →
  `<EmployeeFairnessModal>`. Reasoning copy notes the weighting.

- **Clear shifts by shift-row (v1.15.0, 2nd commit):**
  `<ClearConfirmModal>` gained a third scope group, "By shift row",
  below the existing "Whole week" + "By day" groups. One button per
  slot in the `slotsForDay` ladder (Kitchen Day, Kitchen Evening 1–3,
  FoH Day, FoH Evening 1–2), each showing the live count of week
  shifts matching that `(section, dayPart, slotIndex)` triple. Picking
  one clears that slot-row across every open day — the transpose of
  the per-day (column) scope. New scope shape `{ kind: "slot",
  section, dayPart, slotIndex, label }`; `shiftsForSlot` count helper
  in the modal; `willClear` extended. `<ClearButton>` gained a `slots`
  prop (forwarded from ScheduleGrid's existing `slots` memo) and a
  `kind === "slot"` branch in the delete-id filter; the undo op label
  is `"Clear " + slot.humanLabel` (e.g. "Clear FoH Evening 1") so the
  Undo button + banner name the row. Reuses the existing `scopeButton`
  helper, undo-op plumbing, and `findShiftForSlot`-style slotIndex
  matching (`s.slotIndex || 0`).

- **EmployeeFairnessModal inner scroll wrapper (v1.15.0):** the
  drill-down modal's body (the data view OR the taller Reasoning
  view) is now wrapped in a `maxHeight` + `overflowY: auto`
  container — `min(60vh, 480px)` desktop, `55vh` mobile — with the
  negative-margin + matching-padding clip-breathing-room trick
  (`margin: 0 -16px; padding: 4px 16px`) so hover-scaled rows don't
  clip. Mirrors the v1.9.4 `<GenerateResultsModal>` fix. Root cause:
  the Overlay desktop sheet uses `overflow: visible` (v1.9.0
  hover-scale fix), so the Reasoning view's multi-line formulas + 4
  per-week rows spilled past the sheet and pushed the "Show data" /
  "Close" footer buttons off the backdrop (reported via screenshot).
  The archived-employee notice, the footer flex row, and the
  trailing footnote stay OUTSIDE the scroller so they stay anchored
  to the visible sheet edges regardless of body height.

- **Versioning scheme change (v15.1.0):** the version jumped from
  1.15.0 → **15.1.0** to realign with the sibling MGT Bookings app's
  versioning pattern (user decision, session 25). Same
  MAJOR.MINOR.PATCH semantics from here on, just on the new number
  line.

- **Effective-dated config revisions (v15.1.0):** opening days +
  shift template become versioned in time so PAST WEEKS KEEP
  RENDERING under the configuration that applied back then. New
  Firebase collection `/configRevisions/{pushId}` →
  `{ effectiveFrom: "YYYY-MM-DD" (ISO Monday), openingDays?: {...},
  shiftTemplate?: {...} }` — **per-axis partial** records (a revision
  may carry one or both axes; partial-by-axis avoids the
  full-snapshot update anomaly where editing one axis freezes a
  stale copy of the other into a later revision). Resolution per
  focus week, per axis independently:
  `resolveConfigForWeek(configRevisions, settings, shiftTemplate,
  weekStart)` in `schedule-logic.js` picks the latest revision with
  `effectiveFrom <= the week's Monday` that carries the axis;
  no match → the live singletons `/settings.openingDays` +
  `/shiftTemplate` act as the **frozen base**. Zero revisions ⇒
  byte-identical to pre-v15.1.0 (no migration). ScheduleGrid
  resolves once per focus week (memo) and everything downstream
  (slots, dates, generator props, ExportButton/PDF, fairness
  aggregates, panels) inherits via existing props. Documented
  simplification: the 28-day / calendar-month aggregates use the
  focus week's resolved config across their whole window (targets
  only — actual hours come from self-contained shift records).
  **(Superseded in v15.4.0 — the aggregate builders now resolve
  config PER WEEK inside their windows via `makeWeekConfigResolver`;
  this simplification no longer applies. See the v15.4.0
  locked-decision entry.)**
  Settings gains a **"Changes take effect from"** picker card ABOVE
  the accordion (date input re-normalized to Monday via
  `startOfWeek`; min/clamp = current Monday — no past-dated
  revisions; default = NEXT Monday, reset on every mount) +
  a **Scheduled changes** list (one row per revision: week range,
  axis badges, Remove button with confirm; the Remove handler
  re-seeds forms from a locally-filtered map so the derived-dirty
  debounce can't resurrect the deleted revision before the Firebase
  echo lands). The openingDays / template forms seed from the config
  resolved AT the picker week and re-seed when it changes (mount-skip
  ref; pending 800 ms debounce timers are cleared by
  `effectiveFromIso` + `configRevisions` sitting in the save
  effects' dep arrays). Dirty baselines compare against the
  resolved-at-picker config, NOT the live singletons. The debounced
  saves write `upsertRevisionAxis(axis, value)` — merge into the
  existing record for that Monday (greatest-push-id tiebreak) or
  push a fresh one; records always carry `effectiveFrom` + ≥1 axis.
  `operatingStart`/`operatingEnd` stay LIVE on /settings (they're a
  validation window, not a rendered surface) — the hours save
  spreads `settings` so the singleton's openingDays is never
  touched again (that's what freezes the base). `saveShiftTemplate`
  remains in use only by Reset-to-defaults and the v1.10.1 eager
  migration (both base-only). **Reset to defaults is a factory
  reset:** it also deletes every configRevision (silent), resets
  `pastWeeksLocked`, and moves the picker back to next Monday —
  leaving revisions would make the reset a visible no-op for weeks
  at/after the earliest revision.

- **Per-open-mode ("solo") shift times (v15.1.0):** a template block
  may carry an optional `soloTimes: [{start,end}, ...]` axis (same
  length as `count`) — the times used on weekdays where the block's
  day-part is the ONLY open one (the sibling day-part is closed in
  the week's resolved openingDays; e.g. evening staff starts earlier
  on evening-only days). Absent/null = feature off; the writer OMITS
  the key entirely (never `[]` — Firebase strips empty arrays;
  v1.12.0 lesson). `slotsForDay` attaches `soloStart`/`soloEnd` per
  slot; the new `slotTimesForDate(slot, date, openingDays)` resolves
  the per-date `{start, end}` (solo iff the date's weekday has the
  slot's dayPart open AND the sibling closed). Consumers:
  - **ScheduleGrid.renderCell** builds an *effective slot*
    (`{...slot, defaultStart/End: per-date}`) used for the cell
    display, the `*` override marker (a solo-day cell at solo times
    is NOT an override), and `cellClick` — so ShiftFormModal's
    initial/reset times and the swap/move payload inherit per-date
    defaults with ZERO modal changes. The desktop left-label chip
    deliberately keeps the flat template times (reference column).
  - **generator.js** new-shift payloads default to
    `slotTimesForDate(...)`; `wipeShiftsWithPolicy` gained an
    `openingDays` param and `hasTimeOrRoleOverride(shift, slot,
    effTimes)` compares against per-date times — "preserve times
    OFF" resets solo cells to solo (not flat) times, and preserve-ON
    no longer false-positive-preserves them.
  - **pdf-export.js** DELIBERATELY keeps the flat-defaults predicate
    — solo-day cells print two-line "Name + actual times" against
    the normal-times row header (a feature; commented in the file).
  - **avgShiftHours** splits each day-part's open-weekday count into
    both-open vs solo weekdays and weights `hNormal×cBoth +
    hSolo×cSolo` per eligible slot — no-solo templates collapse to
    the v1.15.0 math exactly.
  Settings UI: per (section, dayPart) block in FoH / Kitchen, a
  Toggle "Different times on {day|evening}-only days"; ON seeds the
  per-slot solo rows as a copy of the normal times, OFF stores null
  in form state (stripped on save). `blockError` validates solo
  entries with the same rules (+ "Solo shift N:" prefix);
  `blockDirty` compares the solo axis; `onCountChange` grows /
  truncates `soloTimes` in lockstep with `times`. The migration
  helpers learned the axis together (load-bearing pair):
  `materializeShiftTemplateBlock` preserves valid soloTimes
  (length-synced, last-entry-extend) and omits the key otherwise;
  `isBlockMigrated` flags only present-but-malformed soloTimes —
  absent or valid stays migrated, so the v1.10.1 eager migration
  neither strips solo config nor loops.

- **iOS sticky-:hover guard on `.mgt-hover-scale` (v15.1.1):** the
  `.mgt-hover-scale:hover:not(:disabled)` rule in `index.html` is
  wrapped in `@media (hover: hover) and (pointer: fine) { ... }` —
  rule body byte-identical, only the wrapper is new. iOS Safari keeps
  `:hover` applied after a tap ("sticky hover"), so the last-tapped
  element stayed stuck at `scale(1.08)`; full-width form inputs
  visibly overflowed their container on phones. Touch devices now get
  no hover lift at all; mouse / trackpad behaviour unchanged. The base
  `.mgt-hover-scale` transition rule stays unwrapped (inert without
  the `:hover` declarations). Ported from MGT Bookings v15.1.0
  (PR #22) — the `.mgt-hover-scale` contract is SHARED between the
  two apps: improve it in one, port the change to both.

- **Past-week lock toggle (v15.1.0):** `/settings.pastWeeksLocked`
  (boolean; missing → true via `DEFAULT_PAST_WEEKS_LOCKED`). New
  auto-save Toggle "Lock past weeks (read-only)" in Settings →
  Scheduling rules. ScheduleGrid's gate became
  `isReadOnly = pastWeeksLocked && isPastWeek(weekStart, todayIso)`
  — single change point; the banner, all four nav-button disables,
  the cellClick swap short-circuit, and ShiftFormModal's readOnly
  all already key off `isReadOnly`. Default keeps the v1.12.0
  locked behaviour; OFF makes past weeks fully editable (no banner,
  buttons live).

- **Incomplete-schedule export (v15.2.0):**
  `/settings.allowIncompleteExport` (boolean; missing → false via
  `DEFAULT_ALLOW_INCOMPLETE_EXPORT`). Auto-save Toggle "Allow
  exporting incomplete schedules" in Settings → Display. When OFF
  (default) `<ExportButton>` keeps the locked v1 behaviour — disabled
  until `isWeekComplete`. When ON the button stays clickable; a click
  on a complete week exports directly, a click on an incomplete week
  caches `countEmptyCells(...)` and opens `<ExportWarningModal>`
  (Overlay confirm, model on GenerateConfirmModal). "Export anyway"
  runs the existing lazy-loaded `exportWeekPdf` path; the PDF already
  renders empty open cells as blanks (pdf-export.js). ScheduleGrid
  derives the flag (defensive `=== true`) and threads it + `isMobile`
  into `<ExportButton>`.

- **Past-dated config revisions (v15.2.0):** the v15.1.0 "Changes take
  effect from" picker's clamp to the current Monday (and the date
  input's `min`) are removed — any Monday, past or future, is now a
  valid revision target. A past-dated revision retroactively changes
  how earlier weeks render via `resolveConfigForWeek` (which already
  selected the latest `effectiveFrom <= the week's Monday`). This
  deliberately reverses the v15.1.0 guardrail so the manager can fix a
  historical week's configuration; `currentMondayIso` is kept only to
  label past rows in the Scheduled-changes list and to switch the
  picker's helper copy to a "applies retroactively" note.

- **Per-employee tenure dates (v15.2.0):** optional `activeFrom` /
  `activeUntil` ISO-date fields on `/employees/{id}` (null = unbounded
  on that end). An employee is schedulable on a date iff
  `active !== false && (!activeFrom || d >= activeFrom) &&
  (!activeUntil || d <= activeUntil)` — the single predicate
  `isEmployeeActiveOnDate(emp, dateIso)` in schedule-logic.js.
  Consumers: generator `buildCandidates` step 1.5 (HARD filter, reason
  `"out-of-tenure"`); `<ShiftFormModal>` picker filter (a) (HARD hide,
  alongside the archived check); `<WeeklyShiftSummary>` (skips out-of-
  tenure employees with zero shifts that week, mirroring the archived
  rule, via `employeeTenureOverlapsDates`); `<MonthlyFairnessPanel>`
  (skips employees whose tenure doesn't overlap the focus week).
  `<EmployeeFormModal>` adds an "Active dates (optional)" From/Until
  pair (Save blocked when both set and until < from); `<EmployeesList>`
  shows a tenure line per row. Chosen over full effective-dated
  employee revisions to stay small/low-risk; tenure gates ELIGIBILITY +
  VISIBILITY. **(v15.3.0 update:** tenure now ALSO pro-rates the 28-day /
  calendar-month / weekly fairness TARGET math — see "Tenure-aware fairness
  targets (v15.3.0)" below. The original v15.2.0 simplification that left
  targets un-prorated no longer applies.)

- **Keyboard shortcuts (v15.3.0):** single-key, no-modifier shortcuts
  ported from MGT Bookings' pattern. Suppressed when `e.ctrlKey ||
  e.metaKey || e.altKey`, when `isTypingTarget(e.target)` (INPUT /
  TEXTAREA / SELECT / contentEditable), or when any modal is open
  (`isAnyOverlayOpen()` probes for the `data-mgt-overlay` attribute the
  `Overlay` atom now puts on its backdrop). Two handlers, never sharing a
  key:
  - **AppShell** owns a global `keydown`: `1`–`4` → switch tabs
    (`TABS[n-1].key`); `?` → open `<ShortcutsModal>` (a read-only,
    `Overlay`-wrapped cheatsheet using a new `Kbd` keycap atom; it owns
    its own Esc-to-close since the Overlay atom has none).
  - **ScheduleGrid** extends its existing Esc effect: `←`/`→` →
    `goPrev`/`goNext`, `T` → `goToday`; `G`/`S`/`U`/`C`/`E` →
    Generate / Swap / Undo / Clear / Export. The five action keys are
    gated on `!isReadOnly` (Export is read-only-safe, so ungated).
    Generate/Clear/Export are opened via `useImperativeHandle` `open()`
    refs — those three button components became `forwardRef` so the
    shortcut can trigger their internal modal/flow without lifting state.
    Each `open()` respects the button's own disabled gate.
  - **`Enter` confirms the primary action** in modals with a single clear
    primary: `ShiftFormModal`, `EmployeeFormModal`, `RequestFormModal`,
    `ExportWarningModal` (Save / Export anyway). Wired per-modal via the
    shared `useEnterSubmit(open, canSubmit, onSubmit)` hook (document-level
    listener so it fires regardless of focus). `shouldSubmitOnEnter`
    excludes TEXTAREA (newline), BUTTON / SELECT (a focused control owns
    its own Enter), and modifier combos. Each modal passes a `canSubmit`
    that mirrors its Save button's enabled/validation gate (computed
    null-safe so the hook sits above the modal's early return). Explicitly
    NOT wired on `GenerateConfirmModal` (two primaries: Fill-empty vs
    Regenerate) or `ClearConfirmModal` (needs a scope picked first).
  Shared predicates live in `src/lib/keyboard.js` (`isTypingTarget`,
  `isAnyOverlayOpen`, `shouldSubmitOnEnter`) so both handlers + the
  Enter hook read one definition. The `<ShortcutsModal>` section list is
  the single source of truth for the shortcut documentation — adding a
  key means adding a row there AND wiring the handler.

- **Past shifts visible on now-closed day-parts (v15.3.0):** principle —
  **never hide a real shift behind the "Closed" placeholder.** Before, a
  slot whose day-part is closed on a date rendered `renderClosedCell`
  *before* looking up the shift, so a past/orphan assignment vanished
  (and a fully-closed weekday dropped its whole column via
  `visibleWeekDates`). The shift record always survived in Firebase —
  only the render hid it. Root cause is `resolveConfigForWeek` falling
  back to the current `/settings.openingDays` for a past week that has no
  covering config revision; this is a VISIBILITY fix, not a change to
  that resolution. Changes:
  - `schedule-logic.js` + `dateHasAnyShift(weekShifts, dateIso)` (true
    when any shift on the date has a truthy `employeeId`) and
    `weekDatesWithShifts(weekStart, openingDays, weekShifts)` (open days
    PLUS any closed weekday that still carries a shift; collapses to
    `visibleWeekDates` when nothing closed has shifts).
  - `ScheduleGrid`: `weekShifts` memo moved above the `dates` memo;
    `dates` now uses `weekDatesWithShifts`. New `renderClosedSlotCell`
    router — when a closed slot has an assigned shift it calls
    `renderCell(date, slot, /*closedOverride*/ true)`, else
    `renderClosedCell`. Both the desktop gate and mobile day-card gate
    use it. `renderCell`'s new `closedOverride` paints a dashed
    `--border-warning-tint` border + a small amber "closed" tag next to
    the time; the assignee + times stay fully visible. Swap / highlight
    states still win the border.
  - `pdf-export.js`: dates use `weekDatesWithShifts`; the cell builder
    looks the shift up BEFORE the closed check, so only an EMPTY closed
    slot prints the muted-italic "Closed" — a closed slot with a shift
    prints the assignee (two-line when times differ). The flat-template
    two-line predicate (v15.1.0) is unchanged.
  - Applies to all weeks: any cell with a real shift shows it (past /
    present / future); empty closed cells still read "Closed".

- **Tenure-aware fairness targets (v15.3.0):** supersedes the v15.2.0
  simplification (which gated eligibility/visibility but NOT target math).
  Fairness targets now pro-rate by the employee's Active dates (`activeFrom`
  / `activeUntil`). New private helper `activeRangeWithinWindow(emp,
  windowStartIso, windowEndIso)` in `schedule-logic.js` clamps a contiguous
  window to the employee's tenure and returns `{fromIso, toIso, days}`
  (`days === 0` when no overlap; full window when untenured). The three
  aggregate builders apply `shiftsTarget = max(0, round(wpw × activeDays/7)
  − holidays)` with holidays counted ONLY in the active sub-range (via the
  existing `holidayDayCountForEmployeeInRange`, replacing the window-wide
  `holidayDaysInWeekByEmployee` in `build28DayAggregates` /
  `buildCalendarMonthAggregates`):
  - `build28DayAggregates` + `buildCalendarMonthAggregates` — drive the
    generator's `rankCandidates` deficit sort, so the generator inherits the
    pro-rating with NO generator change.
  - `buildEmployeeFairnessDetail` — rolling-28, calendar-month, and each of
    the 4 per-week buckets pro-rate; the returned objects expose `activeDays`
    (+ `windowDays`) so `<EmployeeFairnessModal>`'s Reasoning view shows
    `wpw × activeDays/7 − holidays = target` and a tenure note when the
    window is clipped.
  - `<WeeklyShiftSummary>` pill caps quota at active visible days:
    `quota = max(0, min(rawQuota, activeVisibleDays) − holiday)` (a cap, not
    a pro-rate — a full week with enough active days still shows the full
    `wpw`). Uses the new local `activeVisibleDayCount` + `isEmployeeActiveOnDate`.
  `avgShiftHours` is unchanged (per-shift hours are tenure-independent;
  `hoursTarget` shrinks because `shiftsTarget` does). Untenured employees are
  byte-identical to pre-v15.3.0 (`activeDays` = full window).

- **Global Esc-to-cancel (v15.3.0):** the mirror of the Enter-to-confirm
  work. New shared hook `src/hooks/useEscClose.js` — `useEscClose(open,
  onClose)` attaches a document-level `keydown` while `open` and calls
  `onClose` on a bare Escape (no modifier). Applied to EVERY Overlay modal:
  `ShiftFormModal`, `EmployeeFormModal`, `RequestFormModal`,
  `GenerateConfirmModal`, `ClearConfirmModal`, `ExportWarningModal`,
  `GenerateResultsModal`, `EmployeeFairnessModal`, `RequestPreviewModal`, and
  `ShortcutsModal` (refactored off its bespoke effect). The hook sits above
  each modal's early return (hooks run unconditionally). Destructive confirms
  close too — `onClose` already no-ops while `busy`, so Esc can't dismiss a
  generate/clear mid-run. `<ScheduleGrid>`'s own Esc chain (swap → jump →
  pill highlight) now bails on `isAnyOverlayOpen()` (was the narrower
  `modalCell` check), so a single Esc closes whatever modal is open without
  also cancelling swap or clearing a highlight underneath it; with no modal
  open the chain runs as before. Modals don't stack (one Overlay at a time),
  so the per-modal listeners never compete.

- **Per-week config in fairness + orphan-shift ignore + slotTimeFor cleanup
  (v15.4.0):** three backlog items, all in `schedule-logic.js` + the fairness
  consumers. Shared primitive: `makeWeekConfigResolver(configRevisions,
  settings, baseShiftTemplate)` — a Monday-cached resolver exposing
  `cfgForDate(date)` → `{shiftTemplate, openingDays}` and `isLiveShift(shift)`.
  Empty configRevisions → base config for every week → byte-identical to
  pre-v15.4.0.
  - **#3 — `slotTimeFor` legacy fallback removed.** The pre-v1.9.0 read-side
    fallback (`block.start`/`block.end`/`secondPersonStart`) is dead now that
    the v1.10.1 eager migration canonicalises every doc on load. `slotTimeFor`
    reads only `block.times` and returns `OPERATING_HOURS` defaults if a slot
    entry is somehow missing (an unmigrated doc rendered in the ~1-frame window
    before the eager write lands — unreachable in PROD). `materializeShift
    TemplateBlock` / `isBlockMigrated` STILL read the legacy shape — they ARE
    the migration and must convert it. Scope was strictly `slotTimeFor`.
  - **#1 — orphan shifts ignored in counts (no deletion).** When a slot count
    is decreased, shift records at the dropped index stop rendering but used to
    still inflate fairness counts/hours and the WeeklyShiftSummary pill. With
    effective-dating a shift is an orphan only on dates whose RESOLVED config
    has the lower count, so deletion was rejected (it would fight the
    effective-dated model and the "reappear if count goes back up" semantic).
    Instead the three aggregate builders + `aggregateShiftsInRange` skip
    `!resolver.isLiveShift(s)`, and `WeeklyShiftSummary.buildCountByEmployee`
    skips orphans against the focus-week resolved `template` prop. Records stay
    in Firebase; a count bump-back restores them.
  - **#2 — per-week config inside fairness windows.** Supersedes the v15.1.0
    documented simplification (focus-week config across the whole multi-week
    window). Only `hoursTarget` was affected (`shiftsTarget` is tenure+holidays
    only; actual hours come from self-contained shift records). New private
    `blendedAvgShiftHours(resolver, emp, dayRequiredRoles, fromIso, toIso)`
    weights each week's `avgShiftHours` by the employee's tenure-active days in
    that week ∩ window. `build28DayAggregates` / `buildCalendarMonthAggregates`
    / `buildEmployeeFairnessDetail` switched their `args` from a single
    pre-resolved `shiftTemplate` + `openingDays` to `configRevisions` +
    `settings` + base `shiftTemplate`; the detail builder also exposes
    `rolling28.avgShiftHours` / `calendarMonth.avgShiftHours` so the
    `EmployeeFairnessModal` Reasoning view's "shifts target × avg = hours
    target" stays consistent (the modal reads the per-window value instead of
    recomputing a single average). Generator inherits the fix with NO generator
    change — `rankCandidates` consumes the same maps. Uniform-config windows
    collapse to the old value exactly. Edge: base template AND a week's revision
    both null → resolver falls back to `DEFAULT_SHIFT_TEMPLATE` (matches what
    the grid renders), where the old code yielded 0.
  - **Prop chain:** `ScheduleGrid` passes base `shiftTemplate` + `configRevisions`
    + `settings` into both aggregate memos and down through
    `<MonthlyFairnessPanel>` → `<EmployeeFairnessModal>`; `<WeeklyShiftSummary>`
    gains a `template` prop (focus-week resolved). Verified via a pure Node test
    (orphan count 2→1 with count drop / via revision; blend 5.786 between
    base 6.143 and shorter 4.714 for a 3-base+1-shorter window) plus live DEV
    grid/fairness regression check.

### Architectural
- React 19 + Vite (NOT CRA, NOT Next), Firebase RTDB + Auth, Vercel
  auto-deploy from `main`.
- Plain JavaScript only. No TypeScript.
- JSX literal syntax (NOT `React.createElement` or `RC`). Vite's
  automatic JSX runtime via `@vitejs/plugin-react`.
- No `import React from "react"` — only specific hooks:
  `import { useState, useEffect } from "react"`.
- `const` by default, `let` only when reassignment is needed, NEVER `var`.
- Multi-file structure (hooks/, components/, lib/) — not a monolithic file.
- Mandatory Firebase **write-guard pattern** on every write (see below).
- Mandatory Firebase **dev/prod project split** from day one (see below).
- ≤4 simultaneous `backdropFilter: blur()` instances — hard limit.

---

## File structure

Run `find src -type f` for the current layout — it is authoritative and
never goes stale. Per-file version history lives in `REFACTOR_LOG.md`.

Placement rules (these are NOT derivable from the tree):

- `src/hooks/` — one hook per file, filename matches the export
  (`useXxx.{js,jsx}`).
- `src/components/` — one component per file, PascalCase filename matches
  the export. `atoms.jsx` is the deliberate exception: it exports several
  tightly-coupled primitives together (`Overlay`, `Fld`, `Section`,
  `Collapsible`, `Toggle`, `TBadge`, `Kbd`, `mkInp`, `mkBtn`).
- `src/lib/` — pure JS only. No React, no Firebase imports.
- Any file containing JSX must use the `.jsx` extension — Vite/oxc rejects
  JSX in `.js` files at startup.

---

## Data model (drafted; refine as features land)

```
/employees/{employeeId}
  → { name, roles: [Role], fixedDays?: {mon,tue,wed,thu,fri,sat,sun},
      preference: "day"|"evening"|"either",
      workingDaysPerWeek?: number,  // v0.12.0 — 1..7, default 5; off = 7 − N
      schedulingPriority?: boolean, // v1.3.0 — true → auto-generator picks
                                     // this employee before non-priority ones
      activeFrom?: "YYYY-MM-DD",    // v15.2.0 — tenure start (null = unbounded)
      activeUntil?: "YYYY-MM-DD",   // v15.2.0 — tenure end   (null = unbounded)
      active }
   // v15.2.0: activeFrom / activeUntil bracket the employment window.
   // isEmployeeActiveOnDate(emp, dateIso) (schedule-logic.js) gates both
   // the generator's candidate filter and the manual picker; the week-
   // level employeeTenureOverlapsDates drives the WeeklyShiftSummary +
   // MonthlyFairnessPanel visibility skips.
   // v15.3.0: tenure ALSO pro-rates the 28-day / calendar-month / weekly
   // fairness TARGET math (activeRangeWithinWindow) — the original v15.2.0
   // "does NOT pro-rate" simplification no longer applies. v15.4.0: the
   // aggregate windows resolve config per-week, so the v15.1.0
   // focus-week-config shortcut it referenced is gone too.

/shiftTemplate                                              // v1.9.0 shape
  → { foh:     { day:     { count, times: [{start,end},...],
                            soloTimes?: [{start,end},...] },   // v15.1.0
                 evening: { count, times: [...], soloTimes?: [...] } },
      kitchen: { day:     { count, times: [...], soloTimes?: [...] },
                 evening: { count, times: [...], soloTimes?: [...] } } }
   // Per-slot times — each shift in a section/dayPart has its own
   // start/end. `times.length === count`. Pre-v1.9.0 docs with the
   // legacy `{start,end,count,secondPersonStart?}` shape still read
   // correctly via the slotsForDay fallback; Settings rewrites to the
   // new shape on the next Save.
   // v15.1.0: optional soloTimes (same length as count) — alternate
   // times used on weekdays where this day-part is the ONLY open one.
   // Absent = feature off (the writer omits the key; never []).
   // v15.1.0: this singleton is the FROZEN BASE — edits in Settings
   // write /configRevisions records instead. Only Reset-to-defaults
   // and the v1.10.1 eager migration still write here.

/configRevisions/{revisionId}                                // v15.1.0
  → { effectiveFrom: "YYYY-MM-DD",       // ISO Monday (normalized via
                                          // startOfWeek on write)
      openingDays?: { mon: {day,evening}, ... },  // axis 1 (optional)
      shiftTemplate?: { foh: {...}, kitchen: {...} } } // axis 2 (optional)
   // PER-AXIS PARTIAL revisions — a record carries one or both axes,
   // always ≥1. Resolution per focus week, per axis independently:
   // latest effectiveFrom <= the week's Monday wins; no match → the
   // live singletons act as the frozen base (zero revisions =
   // pre-v15.1.0 behaviour). See resolveConfigForWeek in
   // schedule-logic.js. One record per Monday (Settings merges).

/shifts/{shiftId}
  → { date, section: "foh"|"kitchen", dayPart: "day"|"evening",
      role: Role|null, start, end, employeeId: string|null }
   // role=null for day shifts (one person covers all section roles)

/requests/{requestId}
  → { employeeId, type: "dayoff"|"holiday"|"shift-preference",
      dateFrom, dateTo,
      preferredDayPart?: "day"|"evening",  // v1.2.0 — only for
                                            // shift-preference type
      recurringDaysOfWeek?: string[] | null, // v1.8.2 — only for
                                              // shift-preference. WEEKDAYS
                                              // keys, e.g. ["sat","sun"].
                                              // Empty / null = every date
                                              // in [dateFrom..dateTo].
      notes? }

/settings
  → { operatingStart: "11:00", operatingEnd: "23:00",
      openingDays?: {                              // v0.12.0; per-day-part v1.3.0
        mon: {day: bool, evening: bool},
        tue: {day: bool, evening: bool},
        ...                                         // legacy boolean shape still
                                                     // accepted via
                                                     // normalizeOpeningDays
      },
      showRolePills?: boolean,
      darkMode?: boolean,
      generatorStrictPreference?: boolean,           // v1.0.0 — true = Hard
                                                     // preference matching;
                                                     // default false (Soft)
      generatorBannerAutoDismiss?: boolean,          // v1.9.4 — default true.
                                                     // When false, the result
                                                     // banner stays until the
                                                     // manager dismisses it.
      generatorBannerDurationSec?: number,           // v1.9.4 — 1..60; default 5.
                                                     // Only consulted when
                                                     // auto-dismiss is on.
      minConsecutiveDaysOff?: number,                // v1.11.0 — 1..3; default 2.
                                                     // Min consecutive off-days
                                                     // touching the focus week.
                                                     // HARD in generator, SOFT
                                                     // in manual picker.
      maxConsecutiveWorkingDays?: number,            // v1.11.0 — 3..14; default 5.
                                                     // Max consecutive working
                                                     // days across the 21-day
                                                     // [prior, focus, next]
                                                     // window. HARD + SOFT.
      dayRequiredRoles?: {                           // v1.12.0 shape —
        foh:     { Bar: bool, Floor: bool },          // per-section per-role
        kitchen: { Chef: bool, Plating: bool,         // boolean object.
                   Pot: bool }                        // Default: {foh: {Bar:
      },                                             //  false, Floor: false},
                                                     //  kitchen: {Chef: true,
                                                     //  Plating: false, Pot:
                                                     //  false}}. Firebase
                                                     // preserves false (unlike
                                                     // empty arrays) so the
                                                     // "configured permissive"
                                                     // state survives a round-
                                                     // trip — fixes the v1.11.0
                                                     // Chef-pill bug. Legacy
                                                     // v1.11.0 array shape
                                                     // still readable via
                                                     // resolveDayRequiredRoles.
      pastWeeksLocked?: boolean,                     // v15.1.0 — default true.
                                                     // When false, past weeks
                                                     // stay fully editable on
                                                     // the Schedule tab (the
                                                     // v1.12.0 read-only gate
                                                     // is bypassed).
      allowIncompleteExport?: boolean }              // v15.2.0 — default false.
                                                     // When true, Export PDF
                                                     // works on a week with
                                                     // empty cells (warning
                                                     // modal first). Toggle in
                                                     // Settings → Display.
   // v15.1.0: settings.openingDays is the FROZEN BASE for the
   // /configRevisions resolution — Settings edits write revisions,
   // not this field. operatingStart/End + every other field above
   // remain live.
```

---

## Code conventions

### Modern declarations
- Use `const` by default; `let` only when reassignment is needed.
- **Never `var`.** (Bookings project converted 380 vars in a single
  refactor phase; do not repeat that history here — start modern.)

### JSX, not RC
- All JSX uses literal JSX syntax (`<div>...</div>`).
- Do **not** add `import React from "react"` — Vite's automatic JSX
  runtime handles this.
- Import only specific hooks: `import { useState, useEffect } from "react"`.

### Filename rules (hard)
- Any file containing JSX must use the `.jsx` extension.
- Pure-logic hooks/libs use `.js`.
- Vite/oxc rejects JSX in `.js` files at startup. Verify via `npm run build`.

### One unit per file
- One hook per file in `src/hooks/`. Filename matches export (`useXxx.{js,jsx}`).
- One component per file in `src/components/`. PascalCase filename matches export.
- Exception: `atoms.jsx` exports several tightly-coupled primitives together.

### Conditional rendering
- Prefer ternaries: `cond ? <X /> : null`.
- Avoid `cond && <X />` — historical convention from Bookings; reduces a
  class of falsy-render bugs (e.g., `0 && <X />` rendering `0`).

### Boolean controls (locked v0.10.1)
- **Prefer the `Toggle` atom over `<input type="checkbox">`** for any
  boolean setting. The Toggle is iOS-style, the whole row is tappable,
  and it composes its label + helper text consistently.
- Exceptions (where a native checkbox is still fine):
  - Multi-select grids where the manager picks several items at once
    (e.g., role pickers, weekday pickers).
  - Any future native `<form>` integration that submits checkbox
    values.
- When in doubt, default to `Toggle`. The visual language is more
  consistent with the rest of the app and matches the design
  direction (iOS-inspired translucent surfaces).

### Comments
- Heavy commenting is expected — single-developer codebase with long
  context gaps between sessions.
- Section headers use `// ── Name ──...` for grep-ability.
- Phase notes use `// Phase X (vY.Y.Y): ...` at the top of moved blocks.

### Style tokens
- All colours, spacing, button styles, badge styles flow through
  `src/lib/constants.js` exports (`S`, `BTN`, `STATUS_COLORS`, `ROLE_COLORS`).
- Reusable JSX atoms in `src/components/atoms.jsx`: `Overlay`, `Fld`,
  `Section`, `Collapsible` (v0.10.0), `Toggle` (v0.10.0), `TBadge`,
  `mkInp`, `mkBtn`.
- New UI **composes from atoms**, not redefines them.

---

## UI style — matches MGT Bookings

### Aesthetic
- Translucent / glass surfaces, iOS-inspired.
- Card background: `rgba(255,255,255,0.45)`.
- Borders: `rgba(255,255,255,0.35)`.
- Accent: `#007AFF` (iOS blue).
- Rounded corners: `borderRadius: 12` on inputs / buttons / cards.
- Inset shadows on inputs for depth.

### Layout
- Mobile = full-screen sheet, desktop = centered card for modals.
- Use the `Overlay` atom for every modal — it owns the canonical blur and
  the mobile-vs-desktop branching.

### Performance gotcha — backdrop-filter blur
- `backdropFilter: blur(...)` is expensive. **Hard limit: ≤4 simultaneous
  blur instances visible at once.** The Bookings app had a production
  bug with 51 instances; do not reintroduce. Reuse `Overlay` (which has
  the canonical blur) rather than adding new blurred surfaces.

---

## Critical patterns

### Firebase write-guard pattern — MANDATORY

Every Firebase write must be guarded by a `dataLoaded` ref that flips
`true` only after the initial `onValue` callback returns. Without this,
an effect that fires before Firebase loads can save `[]` over real data.

```js
const shiftsLoaded = useRef(false);

function saveShifts(next, isSilent) {
  if (!shiftsLoaded.current) {
    console.warn("[SAFE] Refused to write — initial read has not completed.");
    if (!isSilent) setWriteWarning("...");
    return;
  }
  if (Array.isArray(next) && next.length === 0
      && firstLoadCount.current !== null && firstLoadCount.current > 0) {
    console.warn("[SAFE] Refused to write empty array.");
    if (!isSilent) setWriteWarning("...");
    return;
  }
  set(ref(db, "shifts"), next).catch(function () {});
}
```

Apply to **every** Firebase write: `shifts`, `employees`, `requests`,
`settings`, `shiftTemplate`. Auto-effects (anything that writes without
direct user action) must pass `isSilent=true` to suppress the
user-facing banner on refusal.

**Origin:** post-v13-deploy data-loss incident in MGT Bookings. The
auto-extend effect fired `saveBookings([])` on mount before `onValue`
returned. Do **not** repeat. Build this pattern in from the first commit.

### Dev/prod Firebase split — from day one

`src/firebase.js` switches configs based on `import.meta.env.DEV`:

- `npm run dev` → DEV project (safe to experiment).
- `npm run build` → PROD project (Vercel uses this).

Both configs are hardcoded in `firebase.js`. Firebase web API keys are
NOT secrets — Database Rules are the actual security layer.

### Single central save path
- Any code path that modifies shifts should pass through a single helper
  (e.g., `shiftsAfterAction(shifts, savedId, isNew)`) so future
  conflict-detection / re-derivation logic has one place to hook into.

---

## Workflow

### Versioning
- Source of truth: `src/App.jsx` → `__APP_SIGNATURE__.version`.
- Propagates to: console boot banner, `window.__MGT_SCHED_BUILD__`,
  Settings → General label.
- Every meaningful change bumps the patch version.
- Schema: `MAJOR.MINOR.PATCH`. Major/minor only on user-visible feature
  shifts; structural refactors bump patch.

### REFACTOR_LOG.md discipline
- Every version that ships gets an entry in `REFACTOR_LOG.md` at repo root.
- Entries include: date, files changed, behavioural-change status, line
  delta, scope, key design decisions, verification results.

### Trigger phrases (in chat)
- **"give me the deployment version"** — produce a production-ready file
  with Firebase integration, auth, cleanup logic, logout.
- **"give me changelog"** — generate a PDF changelog.
- **"sum up this thread"** — produce a markdown thread summary suitable
  for attaching to the next thread.

### Local preview server — MANDATORY (locked 2026-05-16, sharpened v1.5.0)

**For any session that touches visual code** (styling, layout, UI tokens,
PDF export, component structure), **start a local dev server at the
beginning of the session and keep it running throughout.** Patryk reviews
changes against the running URL after each iteration; without it, every
tweak has to be re-explained from a code diff instead of seen.

**Absolute rule (locked v1.5.0): Claude Code NEVER runs `npm run preview`.**
Only `npm run dev`. Patryk opens the localhost URL in his own browser.
Even prod-build verification is deferred to Patryk — Claude does not
need to load the production app, ever.

Default flow:
1. `npm run dev` (in the background) — Vite dev server on
   `http://localhost:5173/` (or 5174 if 5173 is in use). Hot-reloads on
   every save, so Patryk sees changes immediately without rebuilds.
   **Hits the DEV Firebase project** (`megustastu-bookings-dev`) — the
   safe sandbox.
2. Tell Patryk the URL whenever you start the server. Vite's HMR means
   no manual rebuild after edits — most changes appear in <1s.
3. If a change doesn't appear, suggest a hard-refresh (⌘⇧R).

Why DEV, not PROD:
- DEV is the sandbox by design. PROD writes during inspection are
  dangerous — one accidental Save click could mutate live employee /
  request / shift data.
- DEV has its own Auth user pool. The DEV user (Authentication →
  Users in the `megustastu-bookings-dev` Firebase Console) MUST be
  set up before any visual session, with Email/Password sign-in
  enabled under Authentication → Sign-in method. If sign-in returns
  `auth/invalid-credential`, fix the DEV project before proceeding —
  do NOT pivot to PROD as a shortcut.

When to skip the server entirely:
- Pure logic / hook changes with no visual surface (e.g., editing
  schedule-logic.js helpers, pdf-export.js internals that don't
  change output, persistence write-guards).
- Doc-only commits (CLAUDE.md, REFACTOR_LOG.md).
- Session begins with a planning / exploration question — start the
  server once code edits begin.

PDF export caveat: PDF generation runs entirely in the browser
(jsPDF), so it works the same on DEV as on PROD. The schedule data
will be DEV data (sparse / empty unless seeded), so a complete-week
test export may require seeding employees + shifts in DEV first.

### Deployment

**Rule (locked 2026-05-14): one version per branch.** Every version bump
ships as its own branch with its own PR — never bundle multiple
versions on a single branch. If a previous PR is still open when work
on the next version is ready to start, wait for it to merge first.

The mechanical sequence (branch naming, the 13-step build/commit/PR flow,
post-merge folder sync, preview-file naming, `gh` path) lives in the
`deploy` skill — invoke it when shipping a version.

---

## Stability rule

If Patryk requests something that leads to future instability or bad
architecture, **push back and suggest a better approach**. Do not blindly
follow instructions. Patryk is a self-taught beginner and explicitly
expects this kind of pushback.

## Clarifications

If anything is unclear, **ask before implementing**. Do not assume
missing details.

## Conversation budget

After ~25 messages in a single chat, remind Patryk to start a new
conversation. Carry context forward via a `"sum up this thread"` summary
attached to the next thread.

---

## Gotchas and constraints

| Issue | Constraint |
|---|---|
| Backdrop-filter performance | ≤4 simultaneous `backdropFilter: blur()` instances |
| Empty-array writes | Refused by save guards if `firstLoadCount > 0`; design around this |
| `formRef.current` vs `form` | Event handlers read the ref; renders read the state |
| Firebase free plan | No automatic backups. Don't rely on Firebase rollback. |
| DEV writes to PROD | Prevented by the `firebase.js` env switch — never bypass it |
| Day-shift role storage | `role: null` on day-shift slots; one person covers all section roles |
| PDF export gating | Only enabled when every cell in the week is filled |

---

## Out of scope (v1)

- **Staff portal / per-staff logins** — manager-only auth.
- **Multi-tenancy** — single-restaurant app; no plans to generalise.
- **Native mobile app** — web-only; mobile handled by responsive layout.
- **Time tracking / clock in–out** — separate concern.
- **Payroll** — separate concern.
- **Shift swaps between staff** — manager edits manually for v1.
- **Booking-volume-aware staffing** — future integration with MGT
  Bookings, not v1.
- **Notifications (email / SMS / push)** — future.
- **Tests** — no test suite; verification is via manual QA + AST audits.
- **TypeScript** — plain JavaScript only.
