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

## File structure (current — v1.11.0)

```
megustastu-scheduling/
├── CLAUDE.md                       this file
├── REFACTOR_LOG.md                 version history + decisions
├── package.json                    React 19, Vite, Firebase, jsPDF
├── vite.config.js                  @vitejs/plugin-react (automatic JSX)
├── index.html                      Vite entry. v0.11.0: hosts the
│                                   theme token block — `:root` defines
│                                   light values, `[data-theme="dark"]`
│                                   overrides for dark mode. Also has an
│                                   inline no-flash script that paints
│                                   the right theme before React mounts.
└── src/
    ├── main.jsx                    mounts <App />
    ├── App.jsx                     orchestration: auth-gate → AppShell.
    │                                 v1.5.0: __APP_SIGNATURE__ → 1.5.0,
    │                                 sha "session-persistence-
    │                                 most-constrained".
    │                                 v1.6.0: → 1.6.0, sha
    │                                 "weekly-requests-effective-
    │                                 quota-settings-section".
    │                                 v1.6.1: → 1.6.1, sha
    │                                 "generator-effective-quota".
    │                                 v1.7.0: → 1.7.0, sha
    │                                 "swap-highlight-regen-priority".
    │                                 v1.8.0: → 1.8.0, sha
    │                                 "cross-week-consec-and-max-cap".
    │                                 v1.8.1: → 1.8.1, sha
    │                                 "preserve-overrides-on-regenerate".
    │                                 v1.8.2: → 1.8.2, sha
    │                                 "recurring-shift-preference".
    │                                 v1.9.0: → 1.9.0, sha
    │                                 "selects-scale-modal-overflow".
    │                                 v1.9.1: → 1.9.1, sha
    │                                 "force-prod-build-env" (hotfix —
    │                                 pinned NODE_ENV=production in the
    │                                 npm build script so Vercel's
    │                                 NODE_ENV defaulting can't flip the
    │                                 bundle back to DEV Firebase).
    │                                 v1.9.2: → 1.9.2, sha
    │                                 "mobile-today-card-tint".
    │                                 v1.9.3: → 1.9.3, sha
    │                                 "jump-to-cell-from-results".
    │                                 v1.9.4: → 1.9.4, sha
    │                                 "details-bullet-scroll-banner-config".
    │                                 v1.9.5: → 1.9.5, sha
    │                                 "mobile-closed-placeholder".
    │                                 v1.10.0: → 1.10.0, sha
    │                                 "undo-stack-and-login-hover-scale".
    │                                 v1.10.1: → 1.10.1, sha
    │                                 "eager-shift-template-migration".
    │                                 v1.11.0: → 1.11.0, sha
    │                                 "configurable-scheduling-rules".
    ├── firebase.js                 dev/prod switch + coloured boot banner
    ├── hooks/
    │   ├── useAuth.js              Firebase Auth state + signIn / signOut
    │   ├── usePersistence.js       Firebase RTDB reads + write-guarded CRUD
    │   ├── useThemeMode.js         v0.11.0: dark/light resolver. Takes
    │   │                           explicit boolean (or undefined → follow
    │   │                           system pref live). Writes
    │   │                           `data-theme` on <html>; returns isDark.
    │   ├── useUndoStack.js         v1.10.0: bounded FIFO undo stack
    │   │                           (depth 5). { stack, push, pop, clear }.
    │   │                           In-memory only — survives Vite HMR,
    │   │                           resets on hard refresh / tab close.
    │   │                           Stores op shape { id, label,
    │   │                           timestamp, restoreShifts, removeIds }
    │   │                           captured by ClearButton, GenerateButton,
    │   │                           and ScheduleGrid's swap/move handler.
    │   └── useWinW.js              viewport-width listener
    ├── lib/
    │   ├── constants.js            S, BTN, ROLES, SECTIONS, STATUS_COLORS,
    │   │                           ROLE_COLORS, REQUEST_TYPES,
    │   │                           DEFAULT_SHIFT_TEMPLATE,
    │   │                           OPERATING_HOURS, WEEKDAYS, DAY_PARTS.
    │   │                           v0.10.2: S.surfaceSoft strengthened
    │   │                           (0.78 white, dark hairline border,
    │   │                           soft elevation shadow) — cascades to
    │   │                           Collapsible / Section / mobile day-cards.
    │   │                           v0.11.0: every visual token now reads
    │   │                           from a CSS var defined in index.html
    │   │                           (`:root` light / `[data-theme="dark"]`
    │   │                           dark). ROLE_COLORS entries became
    │   │                           `var(--role-x-rgb)` RGB triplets —
    │   │                           callers compose alpha at use site via
    │   │                           rgba(`${rgb}`, 0.2). Zero rgba/hex
    │   │                           literals remain in JS.
    │   │                           v0.12.0: + DEFAULT_OPENING_DAYS (all
    │   │                           seven weekdays true) — fallback for
    │   │                           /settings.openingDays. + DEFAULT_WORKING_DAYS
    │   │                           = 5 — fallback for employee
    │   │                           .workingDaysPerWeek.
    │   │                           v1.0.0: + DEFAULT_GENERATOR_STRICT_PREFERENCE
    │   │                           = false — fallback for
    │   │                           /settings.generatorStrictPreference.
    │   │                           v1.1.0: + SECTIONS.kitchen.dayRequiredRoles
    │   │                           = ["Chef"]. Optional field; FoH has
    │   │                           none. slotsForDay copies it onto each
    │   │                           day slot's `requiredRoles`.
    │   │                           v1.2.0: + REQUEST_TYPES gets a third
    │   │                           entry "shift-preference" with a
    │   │                           dayPart sub-choice on the request
    │   │                           record (preferredDayPart).
    │   │                           v1.3.0: DEFAULT_OPENING_DAYS shape
    │   │                           switched from `{mon: bool, …}` to
    │   │                           `{mon: {day: bool, evening: bool}, …}`.
    │   │                           Legacy boolean docs auto-migrate via
    │   │                           normalizeOpeningDays in schedule-logic.
    │   │                           v1.4.0: + GENERATOR_REASONS map —
    │   │                           reason-code → human-readable label
    │   │                           lookup consumed by the new
    │   │                           GenerateResultsModal.
    │   │                           v1.7.0: GENERATOR_REASONS audit —
    │   │                           Regenerate became wipe-and-refill,
    │   │                           so the clearInvalidShifts-only
    │   │                           codes (closed-day, closed-day-part,
    │   │                           unassigned, slot-removed, no-employee,
    │   │                           archived, on-request, shift-preference,
    │   │                           fixed-days, same-day-dup, over-quota)
    │   │                           were removed. + "regenerated" entry
    │   │                           labelled "Cleared for regeneration".
    │   │                           v1.8.0: + "max-consecutive" entry
    │   │                           emitted when every candidate would
    │   │                           exceed the 5-day cap of the new
    │   │                           withinMaxConsecutiveWorkingDays
    │   │                           filter at buildCandidates step 6.5.
    │   │                           v1.9.4: + DEFAULT_GENERATOR_BANNER_AUTO_DISMISS
    │   │                           (true) + DEFAULT_GENERATOR_BANNER_DURATION_SEC
    │   │                           (5) + GENERATOR_BANNER_DURATION_MIN/MAX
    │   │                           (1/60). Drive the result-banner
    │   │                           configurability in Settings → Auto-
    │   │                           generator and ScheduleGrid's auto-
    │   │                           dismiss effect.
    │   │                           v1.11.0: + DEFAULT_MIN_CONSECUTIVE_DAYS_OFF
    │   │                           (2) + MIN_CONSECUTIVE_DAYS_OFF_MIN/MAX (1/3).
    │   │                           + DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS (5)
    │   │                           + MAX_CONSECUTIVE_WORKING_DAYS_MIN/MAX (3/14).
    │   │                           + DEFAULT_DAY_REQUIRED_ROLES =
    │   │                           Object.freeze({foh: [], kitchen: ["Chef"]})
    │   │                           — per-section override. SECTIONS.kitchen.
    │   │                           dayRequiredRoles STAYS as system fallback
    │   │                           when slotsForDay is called bare (tests,
    │   │                           future call sites). All three drive
    │   │                           Settings → "Scheduling rules" accordion
    │   │                           section + ScheduleGrid defensive reads +
    │   │                           generator thread-through.
    │   ├── schedule-logic.js       week math + slot enumeration (Kitchen
    │   │                           first since v0.8.0) + cell-state
    │   │                           derivation + findRequestConflict +
    │   │                           findSameDayShift + isWeekComplete.
    │   │                           Pure JS, no React.
    │   │                           v0.12.0: + weekdayKeyForDate(date) and
    │   │                           visibleWeekDates(weekStart, openingDays)
    │   │                           — filters out closed days. isWeekComplete
    │   │                           now takes openingDays and skips closed
    │   │                           days (returns false when none open).
    │   │                           v1.2.0: findRequestConflict guarded to
    │   │                           dayoff/holiday types only. New
    │   │                           findShiftPreferenceMismatch(...,
    │   │                           dayPart) and hasConsecutiveDaysOff(...,
    │   │                           weekStart, shiftsMap, minN=2).
    │   │                           v1.3.0: + normalizeOpeningDays(raw),
    │   │                           + isDateOpen(openingDays, date),
    │   │                           + isSlotOpenOnDate(date, slot,
    │   │                           openingDays). visibleWeekDates +
    │   │                           isWeekComplete now go through the
    │   │                           per-day-part path (legacy boolean
    │   │                           openingDays still accepted).
    │   │                           v1.6.1: + daysOffInWeekByEmployee(
    │   │                           requestsMap, dates) →
    │   │                           {[empId]: count}. Lifted from
    │   │                           WeeklyShiftSummary's local helper so
    │   │                           the v1.6.0 effective-quota math is
    │   │                           shared with the auto-generator's
    │   │                           quota gate.
    │   │                           v1.7.0: + roleMatchesSlot(emp, slot)
    │   │                           lifted from generator.js. Day slots
    │   │                           honour requiredRoles / coversRoles;
    │   │                           evening slots honour defaultRole /
    │   │                           eligibleRoles. Shared by the
    │   │                           generator's eligibility filter and
    │   │                           the v1.7.0 Swap mechanic in
    │   │                           ScheduleGrid.
    │   │                           v1.8.0: hasConsecutiveDaysOff gains
    │   │                           a 5th `options` argument
    │   │                           {priorWeekShifts, nextWeekShifts}.
    │   │                           Internal window grows from 7 cells
    │   │                           (Mon..Sun) to 9 cells
    │   │                           ([priorSun, Mon..Sun, nextMon]);
    │   │                           runs only count if they overlap
    │   │                           indices 1..7 (the focus week).
    │   │                           Missing options default the
    │   │                           boundary days to "worked" — safe
    │   │                           fallback that degrades to the
    │   │                           pre-v1.8.0 Mon..Sun-only scan.
    │   │                           v1.8.0 (companion):
    │   │                           + withinMaxConsecutiveWorkingDays(
    │   │                           empId, weekStart, shiftsMap, max=5,
    │   │                           options). Scans a 21-day window
    │   │                           [prior, focus, next]; rejects when
    │   │                           any run of working days > max
    │   │                           overlaps the focus week. Missing
    │   │                           prior/next maps default to OFF
    │   │                           (false) — opposite conservative
    │   │                           direction from
    │   │                           hasConsecutiveDaysOff.
    │   │                           v1.8.2: findShiftPreferenceMismatch
    │   │                           reads request.recurringDaysOfWeek
    │   │                           when present. Non-empty array
    │   │                           narrows the date range to specific
    │   │                           weekdays (weekdayKeyForDate +
    │   │                           parseIsoDate, lazy lookup). Empty /
    │   │                           missing list keeps pre-v1.8.2
    │   │                           "every date in range" behaviour.
    │   │                           Signature unchanged. Both the
    │   │                           generator HARD filter and the
    │   │                           picker SOFT warning inherit the
    │   │                           new check automatically.
    │   │                           v1.9.0: daysOffInWeekByEmployee
    │   │                           renamed to holidayDaysInWeekByEmployee
    │   │                           and the type filter narrowed from
    │   │                           "dayoff OR holiday" to "holiday only".
    │   │                           Day-OFF requests no longer contribute
    │   │                           to the effective-quota subtraction in
    │   │                           WeeklyShiftSummary's pill OR in the
    │   │                           generator's quota gate. HARD per-date
    │   │                           blocking for dayoff is unchanged
    │   │                           (findRequestConflict still includes
    │   │                           both types in BLOCKING_REQUEST_TYPES).
    │   │                           v1.10.1: + materializeShiftTemplateBlock
    │   │                           (per-block) + materializeShiftTemplate
    │   │                           (whole template) + isShiftTemplateMigrated
    │   │                           (predicate). Lifted from Settings.jsx's
    │   │                           local materializeBlock so the new
    │   │                           AppShell eager-migration effect and
    │   │                           Settings can share one shape source. The
    │   │                           predicate also flags lingering legacy
    │   │                           fields (start/end/secondPersonStart) on
    │   │                           an otherwise-valid block so partial
    │   │                           docs still trigger cleanup. Imports
    │   │                           OPERATING_HOURS for the per-block
    │   │                           defaults.
    │   │                           v1.11.0: slotsForDay gains an optional
    │   │                           2nd arg `dayRequiredRolesOverride` —
    │   │                           per-section map `{foh: [...], kitchen:
    │   │                           [...]}` that wins over SECTIONS defaults
    │   │                           when supplied (even an explicit empty
    │   │                           array; that's a manager-set "permissive"
    │   │                           choice). Bare-call behaviour preserved
    │   │                           — falls back to SECTIONS[section].
    │   │                           dayRequiredRoles when override missing.
    │   │                           hasConsecutiveDaysOff +
    │   │                           withinMaxConsecutiveWorkingDays bodies
    │   │                           unchanged — they already took n/max as
    │   │                           positional args with defaults; v1.11.0
    │   │                           just stops passing `undefined` at the
    │   │                           call sites in generator.js and
    │   │                           ShiftFormModal.jsx.
    │   ├── pdf-export.js           landscape-A4 weekly rota → file download
    │   │                           via jsPDF + jspdf-autotable. Pure JS.
    │   │                           FoH/Kitchen section divider rows.
    │   │                           v0.9.0: evening cells = name only,
    │   │                           evening row labels = start time only.
    │   │                           v0.12.0: accepts openingDays; uses
    │   │                           visibleWeekDates so closed days drop
    │   │                           out of the table head + body. Filename
    │   │                           date range uses first / last visible
    │   │                           date (no longer dates[6]).
    │   │                           v1.3.0: cells where the slot's dayPart
    │   │                           is closed on that date render as empty
    │   │                           strings via isSlotOpenOnDate (legacy
    │   │                           boolean openingDays still accepted).
    │   │                           v1.9.0: closed-cell empty string
    │   │                           replaced by a muted-italic "Closed"
    │   │                           placeholder (literal RGB triplet
    │   │                           [136,136,136] + fontStyle italic +
    │   │                           fontSize 8). Filled cells whose
    │   │                           start/end differs from the slot
    │   │                           template defaults render two-line —
    │   │                           name on top, override range below
    │   │                           in fontSize 8 — so the printed rota
    │   │                           shows both the template reference
    │   │                           (left column) and the per-cell
    │   │                           exception. Same predicate
    │   │                           ScheduleGrid uses for the "*" marker.
    │   └── generator.js            v1.0.0: NEW. Pure greedy auto-generator.
    │                               generateWeek({weekStart, weekShifts,
    │                               employees, requests, shiftTemplate,
    │                               openingDays, strictPreference}) →
    │                               {newShifts: [...], summary: {filled,
    │                               unfilled, total, unfilledCells}}.
    │                               No React, no Firebase — caller loops
    │                               upsertShift. Constraint chain mirrors
    │                               ShiftFormModal's picker.
    │                               v1.1.0: + `mode: "fill-empty" |
    │                               "regenerate"`. Regenerate runs a
    │                               pre-pass (clearInvalidShifts) that
    │                               clears stale assignments (failed role
    │                               match, new request, fixedDays change,
    │                               quota over-cap, etc.), returning
    │                               clearedShiftIds. roleMatches now
    │                               honours slotDef.requiredRoles. +
    │                               `priorWeekShifts` arg: rankCandidates
    │                               uses combined (current+prior) load
    │                               for fairness across weeks.
    │                               v1.2.0: + HARD shift-preference
    │                               filter (uses
    │                               findShiftPreferenceMismatch) and
    │                               consecutive-2-off filter (uses
    │                               hasConsecutiveDaysOff). Both extend
    │                               clearInvalidShifts so Regenerate
    │                               clears stale shifts that violate the
    │                               new rules.
    │                               v1.3.0: rankCandidates gains a new
    │                               primary sort key (schedulingPriority
    │                               true → wins). Worklist build skips
    │                               cells where the slot's dayPart is
    │                               closed on that date (via
    │                               isSlotOpenOnDate). clearInvalidShifts
    │                               gains a closed-day-part pass
    │                               (reason "closed-day-part").
    │                               v1.4.0: clearInvalidShifts.clear(id,
    │                               reason) enriched — each cleared
    │                               record now captures date, employeeId,
    │                               section, dayPart, slotIndex, slotKey
    │                               from the pre-clear shift. Consumed
    │                               by the new GenerateResultsModal so
    │                               cleared rows can display the
    │                               employee name and date/slot even
    │                               after the record is gone from
    │                               Firebase. Pure data enrichment;
    │                               algorithm unchanged.
    │                               v1.5.0: worklist primary sort key
    │                               switched from static role-rarity to
    │                               eligible-candidate-count ascending
    │                               (most-constrained-cell first). Each
    │                               worklist entry now carries
    │                               `eligibleCount` from a one-time
    │                               buildCandidates() call at build
    │                               time. compareWorklistEntries
    │                               documents the new ordering;
    │                               role-rarity stays as a stable
    │                               tiebreak. clearInvalidShifts and
    │                               rankCandidates are unchanged.
    │                               v1.6.1: + daysOffByEmp arg threaded
    │                               into buildCandidates and
    │                               clearInvalidShifts. generateWeek
    │                               builds the per-employee dayoff/
    │                               holiday count once (via the lifted
    │                               daysOffInWeekByEmployee helper) and
    │                               passes it down. Step (5) of
    │                               buildCandidates and step 10 of
    │                               clearInvalidShifts now use the
    │                               effective cap
    │                               max(0, workingDaysPerWeek - off)
    │                               — same cap the v1.6.0 UI pill
    │                               advertises. Reason code stays
    │                               "over-quota"; algorithm otherwise
    │                               byte-identical to v1.6.0.
    │                               v1.7.0: Regenerate became
    │                               wipe-and-refill. clearInvalidShifts
    │                               (≈190 lines of per-constraint
    │                               repair logic) deleted entirely; the
    │                               new wipeAllShifts helper empties
    │                               every record with reason
    │                               "regenerated" before the fill-empty
    │                               pass runs. Local `roleMatches` was
    │                               lifted into schedule-logic.js as
    │                               `roleMatchesSlot` (shared with the
    │                               Swap mechanic in ScheduleGrid).
    │                               Imports of parseIsoDate and the
    │                               now-unused slotsByKey /
    │                               visibleDateSet locals were pruned.
    │                               v1.8.0: + nextWeekShifts arg on
    │                               generateWeek (parallel to
    │                               priorWeekShifts). Both are bundled
    │                               into a `crossWeekShifts` bag
    │                               threaded into buildCandidates and
    │                               forwarded to hasConsecutiveDaysOff
    │                               at step (6). The consecutive-off
    │                               filter now sees prior Sun + next
    │                               Mon so Sun ↔ next-Mon straddles
    │                               count as 2-off. Algorithm
    │                               otherwise byte-identical;
    │                               buildCandidates gains one positional
    │                               arg at the tail.
    │                               v1.8.0 (companion): + new step 6.5
    │                               filter calling
    │                               withinMaxConsecutiveWorkingDays
    │                               with the same crossWeekShifts bag.
    │                               Reason code "max-consecutive" for
    │                               cells where every candidate would
    │                               exceed the 5-day cap. Step 7's
    │                               preference filter now reads from
    │                               cappedOk (the new gate's output)
    │                               instead of restedOk.
    │                               v1.8.1: wipeAllShifts replaced
    │                               with wipeShiftsWithPolicy(working,
    │                               slotsByKey, policy). Policy ={
    │                               preserveTimes, preserveAssignments}.
    │                               Per-axis: a cell's assignment can
    │                               stay while its times reset, or
    │                               vice versa. Returns {cleared,
    │                               modified, pendingOverrides}.
    │                               + helpers hasTimeOrRoleOverride
    │                               and buildClearedRecord.
    │                               generateWeek accepts preserveTimes
    │                               + preserveAssignments (both
    │                               default true), builds slotsByKey
    │                               up-front, threads pendingOverrides
    │                               into the fill-empty payload (so
    │                               re-filled cells inherit any
    │                               preserved time/role override), and
    │                               returns modifiedShifts in the
    │                               result for GenerateButton to
    │                               upsert.
    │                               v1.9.0: daysOffByEmp renamed
    │                               holidayDaysByEmp; import switched
    │                               to holidayDaysInWeekByEmployee
    │                               from schedule-logic. Step (5) of
    │                               buildCandidates now subtracts only
    │                               holiday days from the cap (was
    │                               dayoff + holiday). Algorithm
    │                               otherwise byte-identical; reason
    │                               codes unchanged. Net effect: a
    │                               5-day employee with one Day-OFF
    │                               in the week can be assigned to up
    │                               to 5 OTHER dates (the Day-OFF
    │                               date is still skipped at step (2)
    │                               via findRequestConflict).
    │                               v1.11.0: + three new generateWeek
    │                               args — `minConsecutiveDaysOff`
    │                               (1..3, default 2),
    │                               `maxConsecutiveWorkingDays` (3..14,
    │                               default 5), `dayRequiredRoles` (per-
    │                               section map). All extracted with
    │                               `Number.isFinite ? value : default`
    │                               guards so legacy callers get
    │                               pre-v1.11.0 behaviour byte-identical.
    │                               buildCandidates signature grew two
    │                               trailing positional args
    │                               (minConsecutiveDaysOff +
    │                               maxConsecutiveWorkingDays) — passed
    │                               into hasConsecutiveDaysOff (step 6,
    │                               was `undefined`) and
    │                               withinMaxConsecutiveWorkingDays
    │                               (step 6.5, was `undefined`).
    │                               Internal slotsForDay call now passes
    │                               `dayRequiredRoles` so slotDef.
    │                               requiredRoles reflects the per-
    │                               section configuration; roleMatchesSlot
    │                               (step 1) needed no change because it
    │                               reads requiredRoles off the slotDef.
    └── components/
        ├── atoms.jsx               Overlay, Fld, Section, Collapsible (v0.10.0),
        │                           Toggle (v0.10.0), TBadge, mkInp, mkBtn
        ├── LoginScreen.jsx         email/password sign-in form.
        │                           v1.10.0: email + password mkInp calls
        │                           and the Sign-in mkBtn call all carry
        │                           `className: "mgt-hover-scale"` so the
        │                           login surface matches the in-app hover
        │                           treatment (1.08 scale + opaque bg +
        │                           soft shadow + 12px border-radius). The
        │                           global rule's `:not(:disabled)` guard
        │                           keeps the Sign-in button flat when
        │                           required fields are empty or auth is
        │                           busy. Both atoms already pass
        │                           `className` through via {...rest}.
        ├── AppShell.jsx            authenticated shell + tab nav.
        │                           v1.5.0: tab state persists across
        │                           refresh / Vite HMR within the same
        │                           browser tab via sessionStorage
        │                           (key "mgt-sched.tab"). Lazy
        │                           useState initializer reads + validates
        │                           against TABS; useEffect writes on
        │                           change. Closing the tab clears it.
        │                           try/catch around storage calls so
        │                           Safari private mode degrades
        │                           gracefully.
        │                           v1.10.1: + eager-migration useEffect
        │                           for /shiftTemplate. Ref-guarded
        │                           (migrationAttemptedRef) so it fires
        │                           once per session. Runs when ready &&
        │                           data.shiftTemplate is non-null; if
        │                           isShiftTemplateMigrated returns false,
        │                           materializeShiftTemplate's canonical
        │                           output is written back via
        │                           actions.saveShiftTemplate(_, true).
        │                           Logs a coloured "[shiftTemplate]
        │                           Eager migration writing canonical
        │                           per-slot shape." banner on the
        │                           migration path so the user can see in
        │                           DevTools that the upgrade ran. The
        │                           isSilent=true flag suppresses any
        │                           refusal banner (this is an auto-
        │                           effect, not user-initiated).
        ├── EmployeesList.jsx       roster list + Add button.
        │                           v0.12.0: each row shows
        │                           "Pattern: N/M" below the role chips
        │                           (N = workingDaysPerWeek, M = 7 − N).
        │                           v1.3.0: + small "Priority" badge
        │                           alongside the role chips when
        │                           emp.schedulingPriority === true.
        │                           v1.7.0: Priority badge moved out of
        │                           the top-right cluster into its own
        │                           bottom-right sibling row at the foot
        │                           of each roster row. Hidden entirely
        │                           when schedulingPriority is false so
        │                           the row height doesn't shift.
        ├── EmployeeFormModal.jsx   add/edit employee modal.
        │                           v0.12.0: + "Working days per week"
        │                           segmented control (1..7) with live
        │                           "N working / M off" helper. Stored
        │                           on /employees/{id}.workingDaysPerWeek.
        │                           Legacy / out-of-range values clamp to
        │                           the default (5) on read.
        │                           v1.3.0: + "Auto-generator priority"
        │                           pill (schedulingPriority bool).
        │                           Default false. Helper text explains
        │                           the generator behaviour.
        ├── RequestsList.jsx        upcoming/past requests + Add button.
        │                           v1.2.0: row renders a secondary line
        │                           "Day shifts only" / "Evening shifts
        │                           only" for shift-preference requests.
        │                           v1.8.2: when a shift-preference row
        │                           has a non-empty recurringDaysOfWeek,
        │                           the secondary line appends "· Sat,
        │                           Sun" (or whichever days, in WEEKDAYS
        │                           source order, comma-separated).
        │                           Legacy rows without the field render
        │                           unchanged.
        ├── RequestFormModal.jsx    add/edit day-off / holiday modal.
        │                           v1.2.0: + Day/Evening segmented
        │                           sub-choice (preferredDayPart) when
        │                           type === "shift-preference".
        │                           Validation requires a dayPart for
        │                           the new type. Other types ignore
        │                           the field on save.
        │                           v1.8.2: + "Repeat on weekdays
        │                           (optional)" 7-pill multi-select
        │                           rendered conditionally beneath the
        │                           Day/Evening control, only for
        │                           type === "shift-preference". State
        │                           tracks recurringDaysOfWeek as an
        │                           array; toggle handler re-sorts to
        │                           WEEKDAYS source order on every flip
        │                           so the stored value is canonical
        │                           Mon..Sun. Save: empty list → field
        │                           saved as null (Firebase removes it);
        │                           non-empty → filtered array. Only
        │                           shift-preference carries the field
        │                           on save; other types drop it.
        ├── ScheduleGrid.jsx        weekly grid (desktop) / day-card stack (mobile).
        │                           v0.10.2: date pill row (today
        │                           highlighted), centred banded section
        │                           headers spanning all columns with
        │                           marginTop split between groups,
        │                           label-cell chips in the left column;
        │                           mobile sub-headers reshaped to match.
        │                           v0.12.0: reads settings.openingDays;
        │                           uses visibleWeekDates so closed days
        │                           drop out. Desktop gridTemplateColumns
        │                           + minWidth derive from dates.length.
        │                           Defensive empty-state when zero days
        │                           open. Forwards openingDays to
        │                           ExportButton.
        │                           v1.0.0: + GenerateButton in nav bar
        │                           (between week-range and Export). +
        │                           auto-dismissing result banner above
        │                           the grid showing "Filled X, Y left
        │                           empty" after a generator run.
        │                           v1.1.0: + ClearButton in nav bar
        │                           (between Generate and Export).
        │                           Unified result-banner state handles
        │                           generator + clear summaries; copy
        │                           branches on shape ({mode}=generator,
        │                           {kind}=clear). + priorWeekShifts
        │                           memo (shiftsForWeek of the prior 7
        │                           days) threaded into GenerateButton
        │                           for cross-week fairness.
        │                           v1.2.0: + WeeklyShiftSummary rendered
        │                           under the helper caption, showing
        │                           "Name · N / quota" pills per active
        │                           employee.
        │                           v1.3.0: cells whose slot's dayPart is
        │                           closed on that date render as an
        │                           inert "Closed" placeholder on desktop
        │                           and are filtered out of the mobile
        │                           day-card slot list. Empty-state
        │                           pointer updated to "Settings →
        │                           Operating time".
        │                           v1.4.0: + today-column tint underlay
        │                           (single absolutely-positioned div
        │                           at gridColumn todayIndex+2, top/bottom
        │                           0, accent-tint-soft; pointerEvents
        │                           none; under section banner via
        │                           zIndex stacking). + slotsByKey memo
        │                           + showResultsModal state + "Details"
        │                           button on the result banner +
        │                           GenerateResultsModal mount. Banner
        │                           auto-dismiss now holds while the
        │                           details modal is open.
        │                           v1.5.0: weekStart state persists
        │                           across refresh / Vite HMR within the
        │                           same browser tab via sessionStorage
        │                           (key "mgt-sched.weekStart", stored
        │                           as ISO Monday date). Lazy useState
        │                           initializer reads + re-normalizes
        │                           through startOfWeek so drift
        │                           self-heals. useEffect writes on
        │                           change. Closing the tab clears it.
        │                           parseIsoDate added to the import
        │                           list.
        │                           v1.6.0: + WeeklyRequestsPreview
        │                           mounted directly below
        │                           WeeklyShiftSummary, both fed from
        │                           the displayed-week `dates` array.
        │                           WeeklyShiftSummary now also receives
        │                           `requests` for the effective-quota
        │                           computation.
        │                           v1.7.0: + swapMode +
        │                           highlightedEmployeeId state +
        │                           cellClick router. + SwapButton
        │                           mount between Generate and Clear in
        │                           the nav bar. + inline @keyframes
        │                           mgt-swap-pulse style block for the
        │                           source-cell animation. + swapBanner
        │                           (info / success / error) above the
        │                           grid. + Esc keydown handler
        │                           (cancels swap mode first, then
        │                           clears the pill highlight). Cells
        │                           paint with accent-tint background
        │                           when their assignee matches the lit
        │                           pill. enterSwapTargetFromModal
        │                           forwarded to ShiftFormModal as
        │                           onStartSwap.
        │                           v1.8.0: + nextWeekShifts memo via
        │                           shiftsForWeek(shifts, addDays(
        │                           weekStart, 7)), mirroring the
        │                           existing priorWeekShifts memo.
        │                           Both flow into <GenerateButton>
        │                           (→ generateWeek's cross-week
        │                           consecutive-off filter) and into
        │                           <ShiftFormModal> (→ the manual
        │                           picker's yellow rest-warning).
        │                           v1.9.2: mobile counterpart to the
        │                           v1.4.0 desktop today-column tint.
        │                           Inside the mobileStack day-card loop,
        │                           an isToday boolean derived from
        │                           todayIso (existing line-118 memo)
        │                           drives a conditional override on the
        │                           card style: background flips to
        │                           var(--accent-tint-soft) + border to
        │                           1px solid var(--accent-tint-strong)
        │                           when isToday. The inline date-header
        │                           div's color token flips to
        │                           var(--accent-on-tint). Same three
        │                           tokens the desktop column underlay
        │                           + desktop date pill already use, so
        │                           the "today" visual identity reads
        │                           the same across breakpoints. No new
        │                           state, no new memo, no layout change
        │                           — just the inline style overrides.
        │                           v1.9.3: + highlightedCellKey state
        │                           (composite "${dateIso}|${slotKey}").
        │                           Auto-clears 1.7s after set via a
        │                           useEffect watcher. Esc handler
        │                           priority extended: swap-mode →
        │                           jump-target → pill-highlight. + new
        │                           jumpToCell(dateIso, slotKey) helper:
        │                           navigates weekStart if the target
        │                           date isn't visible, closes the
        │                           results modal, sets the cell-key
        │                           highlight. Threaded into
        │                           GenerateResultsModal as onJumpToCell.
        │                           renderCell gains an isJumpTarget
        │                           check; isAnyHighlight (isHighlighted
        │                           || isJumpTarget) drives the shared
        │                           green ring tokens. cellAnimation
        │                           gains the one-shot
        │                           "mgt-jump-pulse 1.6s ease-out 1"
        │                           branch (transform scale bounce, runs
        │                           once). Inline <style> block at the
        │                           component root extended with
        │                           @keyframes mgt-jump-pulse.
        │                           v1.9.4: result-banner auto-dismiss
        │                           effect now reads
        │                           settings.generatorBannerAutoDismiss
        │                           (when false, no setTimeout — banner
        │                           stays) and
        │                           settings.generatorBannerDurationSec
        │                           (clamped to GENERATOR_BANNER_DURATION_
        │                           MIN/MAX; multiplied by 1000 at the
        │                           setTimeout call). Both values read
        │                           via the existing defensive-fallback
        │                           pattern; effect deps array grew to
        │                           include both.
        │                           v1.9.5: mobile day-card slot list
        │                           switched from filter to render-as-
        │                           Closed conditional. mobileStack's
        │                           `slots.map((slot,i) => ...)` no
        │                           longer pre-filters via
        │                           `slots.filter(isSlotOpenOnDate)`;
        │                           per-slot it checks `slotOpen` and
        │                           renders either `renderCell(d,slot)`
        │                           or the shared `renderClosedCell(d,
        │                           slot)`. Section-header logic
        │                           (`prev = slots[i-1]`, `showHeader`)
        │                           reads from the full slots array so
        │                           partial-closure days keep the
        │                           canonical section ladder above
        │                           Closed placeholders. Symmetric with
        │                           the desktop pattern at lines
        │                           899–906 and the PDF export (v1.9.0).
        │                           v1.10.0: + useUndoStack mount at
        │                           the top of the component. The hook
        │                           returns { stack, push, pop, clear };
        │                           push is exposed to ClearButton +
        │                           GenerateButton via a recordUndoableOp
        │                           wrapper passed as onUndoableOp.
        │                           attemptSwap captures pre-mutation
        │                           snapshots of source.shift and (when
        │                           present) target.shift via JSON deep-
        │                           clone before each commit branch
        │                           fires, then pushes a { label: "Swap"
        │                           | "Move", restoreShifts, removeIds }
        │                           op directly. Move branch with no
        │                           prior target record captures the
        │                           freshly-minted id from upsertShift's
        │                           return into removeIds; placeholder-
        │                           or-swap paths leave removeIds empty
        │                           (ids stay the same). + handleUndo
        │                           helper that pops the latest op,
        │                           loops actions.upsertShift over
        │                           restoreShifts, then actions.deleteShift
        │                           over removeIds, then sets a result
        │                           banner { kind: "undo", label,
        │                           restored, removed }. + UndoButton
        │                           mount in the schedule nav-bar
        │                           between SwapButton and ClearButton.
        │                           Result-banner copy gained an "undo"
        │                           kind that reads "Undid: <label>.";
        │                           the existing v1.9.4 auto-dismiss /
        │                           duration settings apply to it for
        │                           uniformity.
        │                           v1.11.0: + three new derived consts
        │                           (minConsecutiveDaysOff,
        │                           maxConsecutiveWorkingDays,
        │                           dayRequiredRoles) using the same
        │                           defensive-read + clamp pattern as the
        │                           v1.9.4 banner config. slotsForDay
        │                           memo now receives dayRequiredRoles
        │                           as its 2nd arg and includes it in
        │                           the dep array — slot definitions
        │                           rebuild when the manager changes the
        │                           per-section required-role list, so
        │                           the picker dropdown updates
        │                           immediately. All three new values
        │                           thread into <GenerateButton> via
        │                           new props; minConsecutiveDaysOff +
        │                           maxConsecutiveWorkingDays also pass
        │                           to <ShiftFormModal> (dayRequiredRoles
        │                           flows in through slotDef so the
        │                           modal needs no prop for it).
        ├── ShiftFormModal.jsx      assign employee + edit slot time / role.
        │                           v0.8.0 picker filters: role match,
        │                           STRICT same-date exclusion, request
        │                           hide-by-default (with show-all toggle
        │                           + yellow banner). Save-time same-day
        │                           guard. Evening slots prefill default
        │                           role (Bar/Floor, Chef/Plating/Pot).
        │                           v0.9.0: picker sorts specialists
        │                           first (role-count asc, then name).
        │                           v0.10.1: "Show staff on day off /
        │                           holiday" control converted from a
        │                           checkbox to the Toggle atom; hidden-
        │                           count surfaces in the Toggle's
        │                           `helper` slot.
        │                           v1.1.0: picker honours
        │                           slotDef.requiredRoles for day slots
        │                           — when set, employee must hold AT
        │                           LEAST ONE required role. Empty list
        │                           falls back to the permissive "any of
        │                           coversRoles" rule.
        │                           v1.2.0: warning banner now also fires
        │                           on shift-preference mismatch (yellow,
        │                           non-blocking) and on a
        │                           consecutive-2-off rule break for the
        │                           proposed assignment. Banners stack.
        │                           v1.7.0: + "Move / Swap…" secondary
        │                           button rendered only when the cell
        │                           has an assignment. Click fires the
        │                           new onStartSwap prop with the source
        │                           shape; ScheduleGrid closes the modal
        │                           and enters swap-target-select mode.
        │                           v1.8.0: + priorWeekShifts +
        │                           nextWeekShifts props (optional).
        │                           Passed into hasConsecutiveDaysOff
        │                           via the v1.8.0 options bag so the
        │                           yellow rest-warning fires/clears on
        │                           cross-week 2-off straddles
        │                           (Sun ↔ next-Mon). + companion
        │                           maxConsecutiveBanner — yellow
        │                           warning stacked after the 2-off
        │                           banner when the proposed assignment
        │                           would create > 5 consecutive
        │                           working days (across the 21-day
        │                           [prior, focus, next] window).
        │                           v1.11.0: + minConsecutiveDaysOff +
        │                           maxConsecutiveWorkingDays props
        │                           (both optional; fall back to the
        │                           helper defaults — 2 and 5 — when
        │                           missing so pre-v1.11.0 callers
        │                           behave identically). Both are
        │                           passed into hasConsecutiveDaysOff
        │                           + withinMaxConsecutiveWorkingDays
        │                           respectively (replacing the
        │                           `undefined` 4th arg the calls used
        │                           before). Yellow restWarningBanner +
        │                           maxConsecutiveBanner copy adapts to
        │                           the configured value ("less than N
        │                           consecutive day(s) off", "more than
        │                           N consecutive working days") via
        │                           inline minOffForCopy /
        │                           maxConsecForCopy fallbacks. The
        │                           picker's role-match filter at lines
        │                           142–156 needed no change because it
        │                           already reads slotDef.requiredRoles
        │                           — per-section required-role config
        │                           flows in through slotsForDay's new
        │                           override arg (handled by
        │                           ScheduleGrid).
        ├── Settings.jsx            operating-hours editor + shift template
        │                           editor (counts, times, FoH evening
        │                           secondPersonStart). Template times
        │                           validated against operating window.
        │                           v0.9.0: + Display card with
        │                           showRolePills toggle.
        │                           v0.10.0: single-open accordion
        │                           (Operating Hours, Display, FoH,
        │                           Kitchen). Per-section dirty dot in
        │                           Collapsible headers. Display section
        │                           uses Toggle atom and auto-saves on
        │                           change (no Save click). Save click
        │                           force-opens the first error section.
        │                           v0.11.0: + Dark mode Toggle in Display.
        │                           Receives `isDark` (resolved) from
        │                           AppShell. Helper line says "Following
        │                           your system preference. Tap to
        │                           override." while settings.darkMode is
        │                           undefined; collapses to null once an
        │                           explicit boolean is saved.
        │                           v0.12.0: + Open days picker inside the
        │                           Operating Hours section (weekday pill
        │                           row). Validation requires ≥1 open
        │                           day; error force-opens Hours. Dirty
        │                           tracking combines hours + open-days
        │                           into operatingDirty for the section
        │                           header dot.
        │                           v1.0.0: + Auto-generator accordion
        │                           section (between Display and FoH).
        │                           Single Toggle for "Strict
        │                           shift-preference matching" — auto-
        │                           saves on flip (no Save click). Reset
        │                           to defaults clears it back to false.
        │                           v1.3.0: top section renamed "Operating
        │                           hours" → "Operating time". Open-days
        │                           picker now stores per-day-part
        │                           `{day,evening}`; each weekday pill
        │                           shows a state indicator (D·E / D / E
        │                           / —) and opens a small inline popover
        │                           with two Toggle rows. Validation
        │                           requires ≥1 day part open across the
        │                           week. Legacy boolean docs auto-migrate
        │                           through normalizeOpeningDays.
        │                           v1.6.0: openSection state persists
        │                           across refresh / Vite HMR within the
        │                           same browser tab via sessionStorage
        │                           ("mgt-sched.settingsSection"). Stores
        │                           the section key or the literal "null"
        │                           for all-collapsed. Defensive read
        │                           validates against the known section
        │                           set; falls back to "hours".
        │                           v1.9.4: Auto-generator section gains
        │                           a second Toggle ("Auto-dismiss
        │                           results banner") and a conditional
        │                           Fld-wrapped number input ("Banner
        │                           duration (1–60 seconds)"). Both
        │                           auto-save on flip / valid edit;
        │                           duration onChange ignores empty /
        │                           NaN / out-of-range so the saved
        │                           value remains the last valid number
        │                           while the manager edits. Reset to
        │                           defaults now includes
        │                           generatorBannerAutoDismiss (true)
        │                           and generatorBannerDurationSec (5).
        │                           v1.10.1: local materializeBlock
        │                           deleted; the function was lifted into
        │                           schedule-logic.js as
        │                           materializeShiftTemplateBlock so the
        │                           new AppShell eager-migration effect
        │                           can share the same shape logic.
        │                           Settings imports it aliased as
        │                           materializeBlock (so internal call
        │                           sites — cloneTemplate, blockDirty,
        │                           the renderBlock count-onChange path
        │                           — keep their pre-v1.10.1 naming).
        │                           cloneTemplate now delegates to
        │                           materializeShiftTemplate with a
        │                           defensive default-shape fallback for
        │                           null input.
        │                           v1.11.0: + new "Scheduling rules"
        │                           Collapsible accordion section
        │                           inserted between Display and
        │                           Auto-generator. Three rows:
        │                           (1) segmented 1/2/3 for
        │                           minConsecutiveDaysOff, (2) number
        │                           input 3..14 for
        │                           maxConsecutiveWorkingDays, (3) per-
        │                           section pill multi-select (FoH:
        │                           Bar/Floor; Kitchen: Chef/Plating/Pot)
        │                           for dayRequiredRoles. All auto-save
        │                           on change — no Save button, matching
        │                           the Auto-generator section's pattern.
        │                           The required-role pill writer
        │                           always builds the full per-section
        │                           dayRequiredRoles object (both
        │                           sections) before saving, even when
        │                           the manager only touched one section
        │                           — keeps the doc canonical. Empty per-
        │                           section list = "permissive — any
        │                           role in {section}", with a muted
        │                           helper line confirming that. Reset
        │                           to defaults writes the three new
        │                           defaults alongside the existing
        │                           ones (deep-cloned so the saved doc
        │                           isn't a frozen object). openSection
        │                           valid set in the sessionStorage
        │                           read (v1.6.0) expanded with
        │                           "rules" so the new section's
        │                           open/closed state persists across
        │                           refresh.
        ├── ExportButton.jsx        Export-PDF button in the week-nav bar;
        │                           disabled until every cell on every
        │                           open day is filled.
        │                           v0.12.0: + openingDays prop, forwarded
        │                           to isWeekComplete + pdf-export.
        ├── GenerateButton.jsx      v1.0.0: NEW. Schedule-grid entry point
        │                           for the auto-generator. Owns the
        │                           confirm modal + the upsertShift loop.
        │                           Disabled when shiftTemplate is null
        │                           or there are zero employees. Fires
        │                           onResult(summary) so the parent grid
        │                           can render the inline result banner.
        │                           v1.1.0: handleConfirm now takes
        │                           mode ("fill-empty" | "regenerate").
        │                           Regenerate mode also runs a
        │                           deleteShift loop for clearedShiftIds
        │                           before upserting new shifts.
        │                           v1.8.0: + nextWeekShifts prop,
        │                           forwarded into generateWeek
        │                           alongside priorWeekShifts. Drives
        │                           the cross-week consecutive-off
        │                           filter inside buildCandidates.
        │                           v1.8.1: handleConfirm signature
        │                           grows a second `policy` arg
        │                           ({preserveTimes, preserveAssignments}).
        │                           Forwarded into generateWeek({
        │                           preserveTimes, preserveAssignments}).
        │                           Persistence loop expanded — now
        │                           also iterates result.modifiedShifts
        │                           and upserts each (records that the
        │                           wipe-pass partially updated, e.g.
        │                           employee kept while times reset).
        │                           Order: delete cleared → upsert
        │                           modified → upsert newShifts.
        │                           v1.10.0: + optional onUndoableOp
        │                           prop. handleConfirm snapshots cleared
        │                           (deletion targets) and modified
        │                           (partial-update targets) PRE-mutation
        │                           records from weekShifts via JSON
        │                           deep-clone BEFORE the three mutation
        │                           loops. Each new shift's resolved id
        │                           is captured off `upsertShift`'s
        │                           return value (already returned by
        │                           usePersistence since v0.6.0; no
        │                           change needed there). After the
        │                           loops, fires onUndoableOp({ label:
        │                           "Regenerate" | "Fill empty",
        │                           restoreShifts: cleared+modified,
        │                           removeIds: newIds }). Skips firing
        │                           on zero-delta runs (e.g. fill-empty
        │                           on a full week). Fill-
        │                           empty mode ignores the policy
        │                           (only Regenerate consults it).
        │                           v1.11.0: + three new props
        │                           (minConsecutiveDaysOff,
        │                           maxConsecutiveWorkingDays,
        │                           dayRequiredRoles) forwarded
        │                           verbatim into the generateWeek({...})
        │                           call. All three are optional in
        │                           generateWeek — when ScheduleGrid's
        │                           defensive read defaults to the
        │                           DEFAULT_* constants and forwards
        │                           those, the generator's own arg
        │                           extraction matches them against
        │                           the pre-v1.11.0 hard-coded values
        │                           (2 / 5 / null) → byte-identical
        │                           behaviour for legacy /settings docs.
        ├── GenerateConfirmModal.jsx v1.0.0: NEW. Confirm dialog using
        │                           Overlay. Shows the bullet list of
        │                           what the generator will do +
        │                           current preference mode (Soft/Hard).
        │                           v1.1.0: two action buttons in the
        │                           bottom row — "Fill empty" (primary)
        │                           and "Regenerate" (secondary). Both
        │                           call onConfirm(mode). Explainer
        │                           card above the buttons clarifies the
        │                           difference. Cancel disabled while
        │                           busy.
        │                           v1.7.0: Regenerate is now
        │                           destructive (wipe-and-refill). The
        │                           button switched to the danger
        │                           variant (red) and the explainer
        │                           card leads with "clears every shift
        │                           in this week" + bolded red label so
        │                           the manager can't miss the
        │                           destructive nature.
        │                           v1.8.1: + two Toggle atoms inside
        │                           a third surfaceSoft card —
        │                           "Preserve manual time/role edits"
        │                           + "Preserve existing assignments",
        │                           both default ON. Resets to defaults
        │                           on every open() (useEffect on the
        │                           open prop). Regenerate button's
        │                           variant + explainer copy adapt
        │                           live: `danger` (red) when either
        │                           preserve flag is OFF, `primary`
        │                           (blue) when both ON. onConfirm
        │                           signature gains a 2nd arg for the
        │                           Regenerate path: ("regenerate",
        │                           {preserveTimes, preserveAssignments}).
        │                           Fill-empty path unchanged.
        │                           v1.9.0: preserveAssignments default
        │                           flipped to OFF (was ON);
        │                           preserveTimes stays ON. The modal
        │                           now opens with the danger-red
        │                           Regenerate variant by default,
        │                           matching the intent "reshuffle
        │                           staff but keep my time edits".
        │                           Both Toggle atoms and all three
        │                           bottom-row mkBtn calls (Cancel,
        │                           Regenerate, Fill empty) opted into
        │                           `.mgt-hover-scale` (4th v1.9.0
        │                           commit).
        ├── SwapButton.jsx          v1.7.0: NEW. Schedule nav-bar
        │                           toggle between Generate and Clear.
        │                           Owns no swap state — reads `active`
        │                           from the ScheduleGrid parent and
        │                           fires onToggle on click. Label
        │                           switches between "Swap…" and
        │                           "Swap: cancel" depending on `active`.
        │                           v1.10.0: physical neighbour changed —
        │                           SwapButton is now followed by the
        │                           new UndoButton, then ClearButton.
        ├── UndoButton.jsx          v1.10.0: NEW. Schedule nav-bar undo
        │                           affordance. Placed between SwapButton
        │                           and ClearButton. Props: stack (from
        │                           useUndoStack), onUndo, isMobile. No
        │                           internal state — fully driven by the
        │                           parent. Disabled when stack is
        │                           empty. Label adapts: "Undo" (empty)
        │                           vs "Undo: {top.label}" (e.g.
        │                           "Undo: Regenerate"). The label tells
        │                           the manager what they're about to
        │                           undo before they click; tooltip
        │                           carries the same info for clarity.
        ├── ClearButton.jsx         v1.1.0: NEW. "Clear…" entry point
        │                           in the Schedule nav bar between
        │                           Generate and Export. Owns the
        │                           ClearConfirmModal state + the
        │                           deleteShift loop. Fires onResult
        │                           ({cleared, kind}) so the grid
        │                           banner can report "Cleared N
        │                           shifts."
        │                           v1.10.0: + optional onUndoableOp
        │                           prop. handleConfirm snapshots every
        │                           record about to be deleted (deep-
        │                           cloned via JSON round-trip) BEFORE
        │                           the delete loop, then fires
        │                           onUndoableOp({ label: "Clear week"
        │                           | "Clear day", restoreShifts,
        │                           removeIds: [] }) AFTER. Skips firing
        │                           when restoreShifts came out empty
        │                           (defensive — modal blocks the
        │                           zero-id path).
        ├── ClearConfirmModal.jsx   v1.1.0: NEW. Scope picker + confirm.
        │                           Buttons for Whole week / one per
        │                           open day, each showing the live
        │                           shift count. Confirm is BTN.danger
        │                           labelled "Clear N shifts" once a
        │                           scope is picked. Closed days are
        │                           not offered as scope options.
        ├── WeeklyShiftSummary.jsx  v1.2.0: NEW. Footer panel under the
        │                           Schedule grid. One "Name · N / quota"
        │                           pill per active employee (plus any
        │                           archived employee still on the
        │                           week). Sort: under-utilization ratio
        │                           asc, then name. Visual tints for
        │                           zero / under / at-quota.
        │                           v1.6.0: + `requests` + `dates` props.
        │                           Quota displayed is now effective =
        │                           max(0, workingDaysPerWeek − distinct
        │                           visible-week dates covered by
        │                           day-off/holiday requests). Shift-
        │                           preference requests do not subtract.
        │                           Closed days never count (already
        │                           excluded from `dates`). buildDaysOff-
        │                           ByEmployee helper added. Quota=0
        │                           employees get ratio=1 to keep the
        │                           under-utilization sort sane.
        │                           v1.6.1: buildDaysOffByEmployee
        │                           lifted to schedule-logic.js as
        │                           daysOffInWeekByEmployee — shared
        │                           with the auto-generator's quota
        │                           gate. Pill behaviour unchanged.
        │                           v1.7.0: pill `<span>` became a
        │                           `<button>` with onClick. + new
        │                           `highlightedEmployeeId` +
        │                           `onHighlight` props from
        │                           ScheduleGrid. Selected pill gains
        │                           accent fill + accent border + 2px
        │                           accent ring via box-shadow.
        │                           v1.9.0: import renamed
        │                           daysOffInWeekByEmployee →
        │                           holidayDaysInWeekByEmployee. Local
        │                           variables daysOff / off renamed
        │                           holidayDays / holiday in lockstep.
        │                           Pill denominator no longer shrinks
        │                           for Day-OFF requests — only Holiday
        │                           subtracts from workingDaysPerWeek.
        │                           Math + visual otherwise identical.
        ├── WeeklyRequestsPreview.jsx v1.6.0: NEW. Footer panel under
        │                           WeeklyShiftSummary on the Schedule
        │                           grid. Lists every request whose date
        │                           range overlaps the displayed week
        │                           (`dateFrom..dateTo` ∩ Mon..Sun ≠ ∅).
        │                           Row: name + colored type pill +
        │                           formatted range. Sort: dateFrom asc.
        │                           Notes are intentionally omitted —
        │                           manager opens Requests tab for the
        │                           full record. Returns null when no
        │                           requests overlap (no empty chrome).
        │                           formatRange duplicated from
        │                           RequestsList.jsx (small enough; lift
        │                           to schedule-logic if a third caller
        │                           appears).
        │                           v1.9.0: row container is back to
        │                           an inert `<div>` (no row-level
        │                           click target / hover border). Only
        │                           the colored type pill `<span>`
        │                           became a `<button type="button">`.
        │                           First v1.9.0 used a local class
        │                           `mgt-req-pill` with an inline
        │                           `<style>` block; the third v1.9.0
        │                           commit consolidates the pill into
        │                           the shared `.mgt-hover-scale`
        │                           utility defined in `index.html` —
        │                           local class + inline `<style>`
        │                           block both removed. + local state
        │                           `[previewRequest, setPreviewRequest]`
        │                           owns the read-only preview modal —
        │                           `<RequestPreviewModal>` mounted at
        │                           the bottom of the component's JSX.
        │                           Edit access is intentionally NOT
        │                           wired up here; it stays on the
        │                           Requests tab via `<RequestsList>`
        │                           + `<RequestFormModal>`.
        ├── RequestPreviewModal.jsx v1.9.0: NEW. Read-only preview of
        │                           a single request, rendered inside
        │                           Overlay. Opened from the
        │                           WeeklyRequestsPreview chip pill click.
        │                           Mirrors RequestFormModal's vertical
        │                           Fld stack so the preview feels like
        │                           "read mode" of the same form.
        │                           Fields rendered: employee (with
        │                           archived line-through), type pill
        │                           (palette inherited from
        │                           REQUEST_TYPES), full date range
        │                           ("12 May – 18 May 2026"). For
        │                           shift-preference requests also:
        │                           preferred dayPart label and
        │                           recurringDaysOfWeek (Mon..Sun
        │                           source-order). Notes shown when
        │                           non-empty. Footer is a single
        │                           Close button (ghost variant).
        │                           No Save, no Delete — edit access
        │                           stays on the Requests tab.
        └── GenerateResultsModal.jsx v1.4.0: NEW. "Details" modal opened
                                    from the generator result banner.
                                    Lists `summary.unfilledCells` and
                                    (for Regenerate) `summary.clearedReasons`
                                    grouped by reason with human-readable
                                    labels from constants.GENERATOR_REASONS.
                                    Uses Overlay + Section + TBadge —
                                    no new blur surfaces (Overlay holds
                                    the only blur). Cleared rows show
                                    employee + date + slot; unfilled
                                    rows show date + slot. Closes via
                                    Close button or backdrop click;
                                    closing resumes the banner's auto-
                                    dismiss countdown.
                                    v1.7.0: Regenerate's clearedReasons
                                    all carry the single reason
                                    "regenerated"; the existing reason-
                                    grouping logic collapses to one
                                    bucket naturally — only the
                                    file-header comment was updated.
                                    v1.9.3: + optional onJumpToCell
                                    prop. When provided, ReasonGroup
                                    renders each row as a button
                                    (.mgt-hover-scale) instead of plain
                                    text; click fires the handler with
                                    (dateIso, slotKey) so ScheduleGrid
                                    can navigate + flash the cell.
                                    Unfilled rows use item.dateIso,
                                    cleared rows use item.date — both
                                    carry slotKey. When the prop is
                                    omitted the rows fall back to
                                    plain text (read-only). Pure prop
                                    extension; no state added here.
                                    v1.9.4: bullet integrated into the
                                    row (rendered as a `<span aria-
                                    hidden>` INSIDE the button or the
                                    flex `<li>`, not on the `<li>` via
                                    list-style:disc). `<ul>` lost
                                    list-style; padding moved off the
                                    `<li>` onto the button (4px 8px,
                                    bumped from 2px 6px). Section
                                    blocks now wrapped in an inner
                                    scroll container (maxHeight 55vh
                                    mobile / min(60vh, 480px) desktop,
                                    overflowY:auto, negative-margin +
                                    matching-padding pattern for
                                    hover-scale clipping breathing
                                    room) so long lists scroll
                                    internally instead of spilling off
                                    the Overlay sheet. Summary line +
                                    Close button stay outside the
                                    scroller. Close button gained
                                    `.mgt-hover-scale` (missed in the
                                    v1.9.0 second wave).
```

---

## Data model (drafted; refine as features land)

```
/employees/{employeeId}
  → { name, roles: [Role], fixedDays?: {mon,tue,wed,thu,fri,sat,sun},
      preference: "day"|"evening"|"either",
      workingDaysPerWeek?: number,  // v0.12.0 — 1..7, default 5; off = 7 − N
      schedulingPriority?: boolean, // v1.3.0 — true → auto-generator picks
                                     // this employee before non-priority ones
      active }

/shiftTemplate                                              // v1.9.0 shape
  → { foh:     { day:     { count, times: [{start,end},...] },
                 evening: { count, times: [{start,end},...] } },
      kitchen: { day:     { count, times: [{start,end},...] },
                 evening: { count, times: [{start,end},...] } } }
   // Per-slot times — each shift in a section/dayPart has its own
   // start/end. `times.length === count`. Pre-v1.9.0 docs with the
   // legacy `{start,end,count,secondPersonStart?}` shape still read
   // correctly via the slotsForDay fallback; Settings rewrites to the
   // new shape on the next Save.

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
      dayRequiredRoles?: {                           // v1.11.0 — default
        foh: string[],                                // {foh: [],
        kitchen: string[]                             //  kitchen: ["Chef"]}.
      } }                                            // Per-section override
                                                     // for slotDef.requiredRoles;
                                                     // empty array per section
                                                     // = permissive.
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

### Preview file naming (when iterating before deployment)
- Pattern: `scheduling_v{X}_preview {N}.jsx` (incremented chronologically,
  never overwrite).

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

Standard flow:

1. After the previous PR merges, `git checkout main && git pull --ff-only`.
2. Create a new branch off fresh `main` — naming convention
   `feat/v{X.Y.Z}-{short-slug}` for features (`feat/v0.9.0-polish`),
   `chore/{slug}` for non-version changes (docs, refactors, tooling).
3. Make the edits in `src/`.
4. Bump `__APP_SIGNATURE__` in `src/App.jsx`.
5. Update `CLAUDE.md` file-structure block + locked-decisions if the
   change affects either.
6. Prepend an entry to `REFACTOR_LOG.md`.
7. `npm run build` — must succeed; note the main-bundle gz size delta.
8. Commit with descriptive message
   (e.g. `v0.9.0 — Polish (PDF trim, specialists-first picker, role-pills toggle)`).
9. `git push -u origin <branch>`.
10. `gh pr create --base main --head <branch> --title "..." --body "..."`.
11. Patryk reviews + merges. Vercel auto-deploys from `main`.
12. Confirm the console boot banner / `window.__MGT_SCHED_BUILD__.version`
    matches the new version on production.
13. **Sync the local working folder** (locked v0.10.1, extended v1.5.0):
    ```
    git -C /Users/patrykzychowicz/Desktop/megustastu-scheduling pull --ff-only origin main
    cp /Users/patrykzychowicz/Desktop/megustastu-scheduling/CLAUDE.md \
       "/Users/patrykzychowicz/Desktop/megustastu-scheduling Claude context/CLAUDE.md"
    cp /Users/patrykzychowicz/Desktop/megustastu-scheduling/REFACTOR_LOG.md \
       "/Users/patrykzychowicz/Desktop/megustastu-scheduling Claude context/REFACTOR_LOG.md"
    ```
    The pull keeps the local checkout always on `main` so `npm run dev`
    and any manual file inspection reflect the shipped state without
    manual hunting. The local folder never rides a feature branch —
    branches live only in the `.claude/worktrees/` subfolders.

    The two `cp` lines (v1.5.0) keep the Claude-context folder copy of
    `CLAUDE.md` + `REFACTOR_LOG.md` in sync. That folder is what Patryk
    attaches to fresh chats; if the copy is stale, the next session
    loads with outdated architectural context (we hit this exact
    failure mode pre-v1.4.0).

**Why one-per-branch:**
- Reverts are surgical — a single bad version reverts cleanly without
  also yanking unrelated work.
- PR review stays scoped — reviewer doesn't need to keep two
  versions' design decisions in their head at once.
- Vercel preview URLs map 1:1 to versions, making smoke-tests on the
  preview deployment unambiguous.

**`gh` CLI** is installed at `/opt/homebrew/bin/gh` (not on `$PATH` —
use absolute path or add `/opt/homebrew/bin` to your shell rc).

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
