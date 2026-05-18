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
- **Shift-preference request type (v1.2.0):** new entry in
  `REQUEST_TYPES` (`key: "shift-preference"`). Constrains an
  employee to ONE dayPart (Day or Evening) on the given dates via a
  new `preferredDayPart: "day" | "evening"` field on the request
  record. `findRequestConflict` is now type-guarded to dayoff /
  holiday only; the new `findShiftPreferenceMismatch` handles the
  dayPart-scoped check. Enforcement: **HARD** in the generator
  (mismatched candidates are rejected, reason `"shift-preference"`)
  and in `clearInvalidShifts` for Regenerate. **SOFT** in the manual
  picker (yellow warning banner, manager judgment wins). The form
  modal renders a Day / Evening segmented control conditionally
  when type === `shift-preference`.
- **At least 2 consecutive days off (v1.2.0):** labor wellness rule.
  `hasConsecutiveDaysOff(employeeId, weekStart, shiftsMap, n=2)` in
  `schedule-logic.js` returns true iff the employee's working
  pattern for the Mon–Sun week has a run of ≥ n consecutive off
  days (closed days count as off). **HARD** in the generator —
  candidate rejected if simulating the assignment would break the
  rule, reason `"no-2-off"`. **HARD** in `clearInvalidShifts` —
  for each employee whose remaining shifts violate, clear
  latest-date shifts until satisfied. **SOFT** in the manual picker
  — yellow warning banner if the chosen employee + this cell would
  break the rule; save still works. No cross-week wrapping
  (Sun ↔ next-Mon doesn't count).
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
- **Schedule grid visual polish (v1.4.0):**
  - **Today-column tint.** A single underlay div with
    `gridColumn: <todayIndex + 2>`, `gridRow: "1 / -1"`,
    `background: var(--accent-tint-soft)`. Translucent cell
    backgrounds let the tint show through. `todayIndex < 0` (today
    outside week / closed) → no underlay. No mobile counterpart this
    round (day-cards stay independent).
- **Generator result details (v1.4.0):** the result banner gains a
  "Details" button (only visible when `summary.unfilledCells` or
  `summary.clearedReasons` is non-empty). Click opens
  `GenerateResultsModal` listing each unfilled cell and (for
  Regenerate) each cleared shift grouped by reason. Human-readable
  labels live in `GENERATOR_REASONS` in `constants.js` — single
  source of truth keyed by the reason codes the generator emits.
  The banner's 5-second auto-dismiss is held while the modal is open
  so the manager can read at leisure; closing the modal resumes the
  countdown. Dismissing the banner (via ×) also closes the modal as
  a safety against stale-state rendering. Clear-button results never
  show "Details" — they carry no reason metadata. Generator's
  `clearInvalidShifts.clear()` was enriched to capture each cleared
  shift's date/employeeId/section/dayPart/slotIndex/slotKey at clear
  time, so the modal can display "Anna — Tue 19, Kitchen Day —
  archived" rows even after the record has been deleted from Firebase.

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

## File structure (current — v1.6.1)

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
    ├── firebase.js                 dev/prod switch + coloured boot banner
    ├── hooks/
    │   ├── useAuth.js              Firebase Auth state + signIn / signOut
    │   ├── usePersistence.js       Firebase RTDB reads + write-guarded CRUD
    │   ├── useThemeMode.js         v0.11.0: dark/light resolver. Takes
    │   │                           explicit boolean (or undefined → follow
    │   │                           system pref live). Writes
    │   │                           `data-theme` on <html>; returns isDark.
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
    └── components/
        ├── atoms.jsx               Overlay, Fld, Section, Collapsible (v0.10.0),
        │                           Toggle (v0.10.0), TBadge, mkInp, mkBtn
        ├── LoginScreen.jsx         email/password sign-in form
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
        ├── EmployeesList.jsx       roster list + Add button.
        │                           v0.12.0: each row shows
        │                           "Pattern: N/M" below the role chips
        │                           (N = workingDaysPerWeek, M = 7 − N).
        │                           v1.3.0: + small "Priority" badge
        │                           alongside the role chips when
        │                           emp.schedulingPriority === true.
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
        ├── RequestFormModal.jsx    add/edit day-off / holiday modal.
        │                           v1.2.0: + Day/Evening segmented
        │                           sub-choice (preferredDayPart) when
        │                           type === "shift-preference".
        │                           Validation requires a dayPart for
        │                           the new type. Other types ignore
        │                           the field on save.
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
        ├── ClearButton.jsx         v1.1.0: NEW. "Clear…" entry point
        │                           in the Schedule nav bar between
        │                           Generate and Export. Owns the
        │                           ClearConfirmModal state + the
        │                           deleteShift loop. Fires onResult
        │                           ({cleared, kind}) so the grid
        │                           banner can report "Cleared N
        │                           shifts."
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
```

### File structure (target — added in later sessions)

```
src/
└── hooks/
    └── useNowMins.js               15s clock tick
```

> File list is a **target**, not gospel. Adjust as features land. Update
> this section in the same commit that creates / removes / renames files.

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

/shiftTemplate
  → { foh:     { day: {start,end,count},
                 evening: {start,end,count,secondPersonStart} },
      kitchen: { day: {start,end,count},
                 evening: {start,end,count} } }

/shifts/{shiftId}
  → { date, section: "foh"|"kitchen", dayPart: "day"|"evening",
      role: Role|null, start, end, employeeId: string|null }
   // role=null for day shifts (one person covers all section roles)

/requests/{requestId}
  → { employeeId, type: "dayoff"|"holiday"|"shift-preference",
      dateFrom, dateTo,
      preferredDayPart?: "day"|"evening",  // v1.2.0 — only for
                                            // shift-preference type
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
      generatorStrictPreference?: boolean }          // v1.0.0 — true = Hard
                                                     // preference matching;
                                                     // default false (Soft)
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
