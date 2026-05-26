# REFACTOR_LOG.md

Version history for **MGT Staff Scheduling**. Every shipped version gets
an entry. Newest first.

---

## v1.13.0 — Monthly Fairness Panel polish (highlight sync, delta bar, drill-down popover)

**Date:** 2026-05-27

**Behavioural change:** Three coupled improvements to the v1.12.0
`<MonthlyFairnessPanel>`. All informational — the generator's
`rankCandidates` ordering is byte-identical to v1.12.0.

1. **Highlight sync.** Clicking a "Shifts assigned" pill now also lights
   up the matching row in the fairness panel (and vice versa). The
   pre-existing `highlightedEmployeeId` axis owned by `ScheduleGrid`
   simply gained `<MonthlyFairnessPanel>` as a second consumer — same
   green iOS-on tokens (`--bg-active-on` + `--border-active-on`) the
   pill and the lit grid cells already use. One state, three surfaces
   in lockstep.

2. **Delta bar overhaul.** The 120×6 px bar with a thin hairline divider
   reads poorly at arm's length. v1.13.0 bumps geometry to 160×10 px,
   border-radius 3 → 5, replaces the full-height divider with a 2-px
   vertically-centred notch (`top:2 bottom:2 opacity:.55`), and adds
   inset 1-px micro-borders to both the red and green fills for
   definition. Min-fill floor: any non-zero magnitude renders at
   least 2 px so a small deficit can't visually collapse to
   at-target.

3. **Drill-down popover.** Clicking a delta bar opens a new read-only
   `<EmployeeFairnessModal>` with three sections: (a) 28-day rolling
   stats with signed deltas + holiday days + window dates; (b)
   calendar month stats for the focus week's month, with a pro-rated
   target = `workingDaysPerWeek × monthLength / 7 − holidays`; (c)
   4-bar per-week sparkline [wk-3, wk-2, wk-1, this wk] tinted red /
   neutral / green per under / at / over target. Past-week navigation
   does NOT gate the modal — it's informational only.

**Files changed:**
- `src/lib/schedule-logic.js` — `+ buildEmployeeFairnessDetail({shifts,
  employee, weekStart, requests, shiftTemplate})` returning
  `{rolling28, calendarMonth, perWeek}`. Helper uses existing
  `addDays`, `isoDate`, `parseIsoDate`, `hoursBetween`,
  `avgShiftHours`, plus three private helpers (`wpwOf`,
  `holidayDayCountForEmployeeInRange`, `aggregateShiftsInRange`).
  Informational only — never feeds the generator.
- `src/components/MonthlyFairnessPanel.jsx` — accepts
  `highlightedEmployeeId` + `onHighlight` + new data props (`shifts`,
  `requests`, `weekStart`, `shiftTemplate`). Name+counts area is a
  `<button>` toggling the shared highlight; delta bar is a sibling
  `<button>` opening `<EmployeeFairnessModal>` (NOT nested — invalid
  HTML). Local `[detailEmployeeId]` owns the modal state. Delta-bar
  geometry rewritten per the spec above.
- `src/components/EmployeeFairnessModal.jsx` — **NEW.** Overlay-wrapped
  read-only popover. Calls `buildEmployeeFairnessDetail` on open.
  Three Section blocks (28-day, calendar month, per-week sparkline)
  plus a single Close button. Mirrors the v1.9.0
  `<RequestPreviewModal>` pattern (read-only, no edit affordance).
- `src/components/ScheduleGrid.jsx` — `<MonthlyFairnessPanel>` mount
  grew five extra props (`shifts`, `requests`, `weekStart`,
  `shiftTemplate`, `highlightedEmployeeId`, `onHighlight`). No new
  state — the pill-highlight axis just gained a second consumer.
- `src/App.jsx` — `__APP_SIGNATURE__` → v1.13.0, sha
  `"fairness-panel-highlight-deltabar-drilldown"`, build 2026-05-27.
- `CLAUDE.md` — v1.13.0 locked-decisions block + per-file sub-entries.
- `REFACTOR_LOG.md` — this entry.

**Key design decisions:**
- **Sibling buttons, not nested.** Nesting `<button>` inside `<button>`
  is invalid HTML and React warns at runtime. The row uses two
  side-by-side buttons inside a `<div>` wrapper: name+counts (highlight
  toggle) and delta bar (modal trigger). The wrapper div carries the
  green tint when selected so the visual identity reads across the
  whole row.
- **Single highlight axis, three consumers.** No new state in
  ScheduleGrid; just one more prop forwarded. The pill / fairness-row
  / grid-cell trio stays in lockstep by construction.
- **Modal stays clickable in past weeks.** v1.12.0's read-only gate
  blocks mutations, not inspection. The fairness modal is pure
  informational — opening it from a past-week navigation is a
  legitimate use case (the manager is auditing why someone's at /
  under / over target).
- **Helper lives in schedule-logic.js, computed on modal open.**
  Single employee + four small windows; the work is sub-millisecond.
  No need to fold into the existing `monthlyAggregates` memo — that
  one is all-employees and feeds the generator + panel; the drill-
  down is one-off and consumer-local.

**Verification:** local DEV (`npm run dev`) on the standard manual QA
flow. `npm run build` clean.

---

## v1.12.0 — Past-week lockdown, generator-fairness overhaul, Chef-pill bug, Settings auto-save

**Date:** 2026-05-26

**Behavioural change:** Four landing together —

1. **Past weeks are read-only.** Any focus week whose Sunday is before
   today disables Generate / Swap / Clear / Undo; cell clicks still
   open `<ShiftFormModal>` but in a new `readOnly` mode that hides
   Save / Move-Swap / Clear and disables every input. A muted-amber
   banner above the grid surfaces the lockdown state. Current week
   stays fully editable for the whole Mon..Sun window — the gate flips
   the first moment the manager moves forward.

2. **Auto-generator factors in last week's actual count + 28-day
   monthly fairness.** Two independent changes inside `generator.js`:

   - **HARD prior-week deficit cap at step (5).** If an employee
     actually worked more dates last week than their
     `workingDaysPerWeek`, the surplus carries over as a deficit that
     shrinks this week's cap by the same amount. A 5-day employee
     who got 6 shifts last week is capped at 4 this week. Reuses
     the existing `"over-quota"` reason code.
   - **28-day rolling fairness ranking** in `rankCandidates`.
     Replaces the v1.1.0 combined-load tiebreaker (this week + prior
     week) with hours-deficit-desc (primary) + shifts-deficit-desc
     (tiebreak). Targets are per-employee: shifts = `wpw × 4 −
     holidays(28d)`, hours = shifts × `avgShiftHours(preference,
     shiftTemplate)`. Specialists rule demoted from #2 → #4 so
     under-utilised generalists win over already-full specialists.
   - New `<MonthlyFairnessPanel>` chip-row visibility surface below
     `<WeeklyRequestsPreview>` — one row per active employee with
     name + `count/target` shifts + `Nh/target` hours + a 120-px
     centre-anchored delta bar (red when under-target, green when
     over). Same memoised data source as the generator's ranking, so
     panel and generator stay in lockstep.

3. **Chef pill bug fixed.** `dayRequiredRoles` schema flipped from
   per-section array of role names (v1.11.0) to per-section per-role
   boolean object (`{foh: {Bar: false, Floor: false}, kitchen: {Chef:
   false, Plating: false, Pot: false}}`). Reason: Firebase RTDB
   strips empty arrays to null on write, so saving `kitchen: []`
   (manager's permissive choice) wrote nothing back; the resolver
   fell back to the default and the Chef pill sprang back into
   selected state on next render. Booleans (`false` included) ARE
   preserved by Firebase, so the configured-but-permissive state
   now survives a round-trip. Lazy back-compat reader for the legacy
   array shape lives in the new `resolveDayRequiredRoles` helper in
   `schedule-logic.js` — the first pill click after upgrade rewrites
   the doc into the new shape.

4. **Settings auto-saves; the "Save changes" button is gone.** Display,
   Auto-generator, and Scheduling rules already wrote through; v1.12.0
   adds the same pattern to Operating time + FoH + Kitchen via two
   debounced (800 ms) + validity-gated `useEffect`s. Partial inputs
   (typing "1" before "11:00") don't fire the save until the value
   becomes valid — no thrashing. Per-section dirty dots stay (they
   surface the pending-debounce window AND the invalid-state window),
   inline per-row error captions stay (they replace the v0.10.0
   force-open-first-error-section affordance), Reset to defaults stays
   (single-click action, no debounce risk).

**Files changed:**
- `src/lib/constants.js` — `DEFAULT_DAY_REQUIRED_ROLES` now per-role
  boolean. `SECTIONS.kitchen.dayRequiredRoles` removed (dead — the
  resolver fallback path now goes through `DEFAULT_DAY_REQUIRED_ROLES`).
- `src/lib/schedule-logic.js` — `+ isPastWeek`, `+ resolveDayRequiredRoles`,
  `+ avgShiftHours`, `+ build28DayAggregates`. `slotsForDay`'s inner
  resolver lifted out and replaced by a call to the new helper (handles
  both shapes transparently).
- `src/lib/generator.js` — `buildCandidates` step (5) cap now subtracts
  `priorDeficit`. `rankCandidates` rewritten — hours+shifts deficit
  primary, specialists demoted, v1.1.0 combined-load tiebreaker removed.
  `generateWeek` builds `priorActualByEmp` from `priorWeekShifts` and
  accepts pre-built `monthlyAggregates` from the caller.
- `src/components/ScheduleGrid.jsx` — `+ isReadOnly` derivation
  (`isPastWeek(weekStart, todayIso)`). `+ monthlyAggregates` memo via
  `build28DayAggregates`. New read-only banner above the grid. `disabled`
  prop threaded through to GenerateButton / SwapButton / UndoButton /
  ClearButton. `readOnly` prop threaded into ShiftFormModal. Auto-exit
  swap mode when `isReadOnly` flips true. `+ <MonthlyFairnessPanel>`
  mounted below `<WeeklyRequestsPreview>`. cellClick short-circuits
  the swap branches when read-only.
- `src/components/ShiftFormModal.jsx` — `+ readOnly` prop. Hides Save /
  Move-Swap / Clear footer + Reset-times button; disables assignee
  select, time inputs, role-picker pills; hides "Show staff on day off"
  toggle. Single Close button replaces the action row when read-only.
- `src/components/SwapButton.jsx` / `UndoButton.jsx` / `ClearButton.jsx`
  / `GenerateButton.jsx` — `+ disabled` prop (ORs with each button's
  existing self-disabled conditions). Tooltips adapt to "Past weeks
  are read-only" when externally disabled.
- `src/components/GenerateButton.jsx` — `+ monthlyAggregates` prop
  forwarded into `generateWeek`.
- `src/components/MonthlyFairnessPanel.jsx` — NEW. Chip-row panel mirroring
  the `<WeeklyShiftSummary>` + `<WeeklyRequestsPreview>` visual rhythm.
- `src/components/Settings.jsx` — `handleSave` + Save button + force-
  open-first-error logic + `saveDisabled` / `anyDirty` / `hasErrors`
  derivations REMOVED. Two new debounced auto-save `useEffect`s (one
  for operating-time, one for the template). `onDayRequiredRoleToggle`
  rewritten to write per-role boolean object; `resolveDayRequiredFor`
  now delegates to the shared lifted helper. Reset-to-defaults updated
  to deep-clone the new boolean-object shape.
- `src/App.jsx` — version bumped to 1.12.0; sha
  `"past-week-lock-fairness-autosave"`.

**Migration / back-compat:**
- `dayRequiredRoles` legacy `["Chef"]` array shape readable via the
  resolver's `Array.isArray(raw)` branch — first pill click after
  upgrade rewrites to the boolean-object shape. No eager migration job.
- ShiftFormModal's `readOnly` prop defaults to `false`; existing
  callers behave identically.
- Generator's `monthlyAggregates` is optional — missing → rank sort
  degrades to specialists + name (and the step-(5) prior-week cap
  still applies via `priorActualByEmp`, which is built internally).
- The four nav buttons' new `disabled` prop is optional.

---

## v1.11.0 — Configurable scheduling rules

**Date:** 2026-05-25

**Behavioural change:** None visible on legacy `/settings` docs. New
Settings → "Scheduling rules" accordion section lets the manager tune
three rules in-app that were previously hard-coded.

Three labor-wellness / role-policy values become first-class `/settings`
knobs:

1. **`minConsecutiveDaysOff`** (1..3, default 2). Was the hard-coded
   `n` default inside `hasConsecutiveDaysOff`. v1.11.0 threads the
   configured value through generator.js's step 6 + ShiftFormModal's
   `restWarning`. Picker yellow banner copy adapts ("less than N
   consecutive day(s) off").
2. **`maxConsecutiveWorkingDays`** (3..14, default 5). Was the
   hard-coded `max` default inside `withinMaxConsecutiveWorkingDays`.
   Same threading through generator step 6.5 + ShiftFormModal's
   `maxConsecutiveWarning`. Always-on — no disable toggle.
3. **`dayRequiredRoles`** (object keyed by section, default
   `{foh: [], kitchen: ["Chef"]}`). Was the hard-coded
   `SECTIONS.kitchen.dayRequiredRoles = ["Chef"]` in `constants.js`.
   `slotsForDay` gained an optional 2nd arg
   `dayRequiredRolesOverride` that wins over SECTIONS defaults when
   supplied (even an explicit empty array — that's a manager-set
   "permissive" choice). ScheduleGrid threads the configured map into
   its `slotsForDay` call; every consumer of `slotDef.requiredRoles`
   (picker filter, generator's `roleMatchesSlot`, Swap mechanic)
   inherits the configuration automatically.

All three rules affect BOTH the generator HARD filter AND the manual
picker SOFT warning, which is why they live in a new "Scheduling rules"
accordion section between Display and Auto-generator rather than under
Auto-generator (which is for generator-only knobs).

Pre-v1.11.0 `/settings` docs lack all three new fields. ScheduleGrid +
Settings + generator all use the defensive defensive-fallback pattern
(same as v1.0.0 `generatorStrictPreference` + v1.9.4 banner config), so
behaviour is byte-identical for legacy docs. No eager migration needed
— first auto-save from the new Settings section writes the explicit
values. SECTIONS.kitchen.dayRequiredRoles STAYS as the system fallback
when `slotsForDay` is called bare (tests, future call sites).

UX in the new Collapsible:
- Row 1: 1 / 2 / 3 segmented control for `minConsecutiveDaysOff`.
- Row 2: number input 3..14 for `maxConsecutiveWorkingDays`.
- Row 3: per-section pill multi-select. Two stacked sub-rows (FoH then
  Kitchen, mirroring app section ordering). Pill toggles role membership;
  re-sorts to SECTIONS source order on every flip; writes the full
  per-section object (both sections) so the doc stays canonical. Empty
  per-section list = "permissive — any role in {section}" with a muted
  helper line confirming.

All three rows auto-save on change — no Save button, matching the
existing Auto-generator section's pattern. Reset to defaults writes the
three new defaults alongside the existing ones (deep-cloned so the
saved doc isn't a frozen object).

**Files:**

MODIFIED:
- `src/lib/constants.js` — + `DEFAULT_MIN_CONSECUTIVE_DAYS_OFF` (2) +
  `MIN_CONSECUTIVE_DAYS_OFF_MIN/MAX` (1/3). +
  `DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS` (5) +
  `MAX_CONSECUTIVE_WORKING_DAYS_MIN/MAX` (3/14). +
  `DEFAULT_DAY_REQUIRED_ROLES` (frozen `{foh: [], kitchen: ["Chef"]}`).
  All inserted next to the v1.9.4 banner-config block. SECTIONS
  untouched.
- `src/lib/schedule-logic.js` — `slotsForDay(template)` →
  `slotsForDay(template, dayRequiredRolesOverride)`. New helper
  `resolveDayRequired(sectionKey)` (closure inside slotsForDay) picks
  the override when supplied + valid array, otherwise SECTIONS default.
  The two day slots' `requiredRoles` reads switched from
  `SECTIONS.kitchen.dayRequiredRoles || []` / `SECTIONS.foh.dayRequiredRoles || []`
  to the resolved values. Helper bodies + signatures unchanged.
- `src/lib/generator.js` — `generateWeek` gains three new optional
  args (extracted with `Number.isFinite ? value : default` guards so
  legacy callers get pre-v1.11.0 behaviour). Internal `slotsForDay`
  call now passes the configured `dayRequiredRoles`.
  `buildCandidates` signature grew two trailing positional args
  (`minConsecutiveDaysOff` + `maxConsecutiveWorkingDays`) — passed
  into the two helper calls that previously used `undefined`. Both
  `buildCandidates` call sites in `generateWeek` updated.
- `src/components/ScheduleGrid.jsx` — + three new derived consts
  (defensive read + clamp pattern). slotsForDay memo updated:
  `slotsForDay(template, dayRequiredRoles)` + `[template,
  dayRequiredRoles]` dep array. `<GenerateButton>` mount gains three
  new props; `<ShiftFormModal>` mount gains the two consecutive-rule
  props (per-section required-role config flows in through slotDef so
  the modal needs no prop for it).
- `src/components/GenerateButton.jsx` — destructured signature grows
  three new props. `generateWeek({...})` call forwards them verbatim.
- `src/components/ShiftFormModal.jsx` — destructured signature gains
  `minConsecutiveDaysOff` + `maxConsecutiveWorkingDays`. Both passed
  into `hasConsecutiveDaysOff` (line 384) and
  `withinMaxConsecutiveWorkingDays` (line 387–389) — replacing
  `undefined`. Banner copy uses inline `minOffForCopy` /
  `maxConsecForCopy` fallbacks so the message reflects the actual
  configured value (or the helper default when the prop is missing).
- `src/components/Settings.jsx` — + new "Scheduling rules"
  Collapsible inserted between Display and Auto-generator. Three
  rows: segmented 1/2/3 + number input 3..14 + per-section pill
  multi-select. Three new derived values + three new `on*Change`
  handlers + one `resolveDayRequiredFor` helper. `openSection` valid
  set in the sessionStorage read expanded with `"rules"`. Reset to
  defaults writes all three new fields (deep-cloned).
- `src/App.jsx` — version 1.10.1 → 1.11.0, sha
  `eager-shift-template-migration` → `configurable-scheduling-rules`.
- `CLAUDE.md` — new v1.11.0 locked-decision block. File-structure
  heading bumped to v1.11.0. Per-file v1.11.0 sub-entries on App,
  constants, schedule-logic, generator, ScheduleGrid, GenerateButton,
  ShiftFormModal, Settings. Data-model `/settings` block updated
  with the three new optional fields.
- `REFACTOR_LOG.md` — this entry prepended.

**Verified NOT changed (Phase-5 inventory):**
- `src/lib/pdf-export.js` — never reads `slot.requiredRoles`; only
  uses `section`, `dayPart`, `sectionLabel`, `dayPartLabel`,
  `humanLabel`, `defaultStart`, `defaultEnd`. The dayRequiredRoles
  override has no effect on the PDF output, so no threading needed
  through `ExportButton.jsx` either.

**Line delta (estimated):** ≈ +280 / −20. The bulk is the new
Settings Collapsible (~140 lines for the three rows + handlers), the
v1.11.0 CLAUDE.md/REFACTOR_LOG.md entries (~100 lines combined), and
~20 lines of imports / signature changes spread across the JS files.

**Verification:**
- `npm run build` succeeds; main-bundle gz size delta noted at commit
  time.
- DEV smoke: open Settings → Scheduling rules. Confirm the section
  lives between Display and Auto-generator. Click 1/2/3 — auto-saves;
  refresh confirms persistence. Edit max-consec to 3 then to 14;
  values clamp and persist. Toggle Kitchen's Chef pill off, verify a
  Plating-only employee now appears in the Kitchen Day picker
  dropdown. Reset to defaults — all three rules return to 2 / 5 /
  `{foh: [], kitchen: ["Chef"]}`.
- PROD smoke: confirm `__APP_SIGNATURE__.version === "1.11.0"` after
  deploy. With PROD `/settings` lacking the three new fields, the
  schedule grid + auto-generator + picker behave byte-identically to
  v1.10.1 until the manager visits Settings → Scheduling rules.

---

## v1.10.1 — Eager /shiftTemplate migration

**Date:** 2026-05-25

**Behavioural change:** None user-visible. Internal data hygiene only.

v1.9.0 changed the `/shiftTemplate` per-block shape from the legacy
single-time form (`{count, start, end, secondPersonStart?}`) to a
per-slot array (`{count, times: [{start, end}, ...]}`). Pre-v1.10.1
the migration was lazy — `Settings.jsx` rewrote a legacy doc to the
new shape only when the manager opened the Settings tab and hit Save.
Untouched legacy docs (DEV projects, restored backups, clones) sat
on Firebase indefinitely, each silently relying on the read-side
fallback in `slotTimeFor`.

v1.10.1 promotes the migration to "once per session, automatically."
`AppShell` mounts a ref-guarded `useEffect` that, after `usePersistence`
reports `ready` and the live template is non-null, checks
`isShiftTemplateMigrated(template)`. If false, the canonicalised doc
(built by `materializeShiftTemplate(template)`) is written back via
`actions.saveShiftTemplate(materialised, true /* isSilent */)`. The
write-guard chain in `usePersistence` still holds — the write only
fires after `templateLoaded === true`, which is implied by `ready`.

The shape-knowledge migration helpers were lifted from Settings.jsx's
local `materializeBlock` into `schedule-logic.js` (as
`materializeShiftTemplateBlock` / `materializeShiftTemplate` /
`isShiftTemplateMigrated`) so Settings and AppShell share one source of
truth. Settings imports the per-block helper aliased back to
`materializeBlock` to keep its internal naming. The read-side fallback
in `slotTimeFor` stays — belt & braces for in-flight reads between
ready and migration-completes, and for any future legacy state we don't
anticipate. Removing the fallback is v2.0 cleanup.

**Files:**

MODIFIED:
- `src/lib/schedule-logic.js` — + `isBlockMigrated` (private predicate;
  checks block has valid `count` + same-length `times` of `{start,end}`
  entries AND no lingering legacy fields). + `isShiftTemplateMigrated`
  (exported; returns true for null input — "nothing to migrate"). +
  `materializeShiftTemplateBlock` (exported; per-block canonicalise,
  identical to Settings's pre-v1.10.1 `materializeBlock` byte-for-byte).
  + `materializeShiftTemplate` (exported; calls the block helper 4
  times; returns null for null input). Imports `OPERATING_HOURS` (new)
  for the per-block default times.
- `src/components/Settings.jsx` — local `materializeBlock` deleted.
  Import block now pulls `materializeShiftTemplate` +
  `materializeShiftTemplateBlock as materializeBlock` from
  schedule-logic.js so `cloneTemplate`, `blockDirty`, and the
  `renderBlock` count-onChange path keep their pre-v1.10.1 naming.
  `cloneTemplate` body became a delegation to `materializeShiftTemplate`
  with a defensive default-shape fallback when the lifted helper returns
  null (unreachable in practice — callers always pass
  `shiftTemplate || DEFAULT_SHIFT_TEMPLATE`).
- `src/components/AppShell.jsx` — + ref-guarded `useEffect` that calls
  `isShiftTemplateMigrated` and writes back `materializeShiftTemplate`'s
  output via `saveShiftTemplate(..., true)` when needed. Imports
  `useRef` (added to the React import) and the two new helpers from
  schedule-logic.js. Logs a coloured `[shiftTemplate] Eager migration
  writing canonical per-slot shape.` banner on the migration path so
  DevTools shows it ran.
- `src/App.jsx` — version 1.10.0 → 1.10.1, build 2026-05-24 → 2026-05-25,
  sha `undo-stack-and-login-hover-scale` → `eager-shift-template-migration`.
- `CLAUDE.md` — + new v1.10.1 locked-decision block (Eager
  `/shiftTemplate` migration). File-structure heading bumped to v1.10.1.
  Per-file v1.10.1 sub-entries on `App.jsx`, `AppShell.jsx`,
  `Settings.jsx`, and `schedule-logic.js`.
- `REFACTOR_LOG.md` — this entry prepended.

**Line delta:** ≈ +100 / −35 (schedule-logic.js +85 for the three
helpers + comment block; AppShell.jsx +45 for the import, ref, and
effect; Settings.jsx −30 for the removed local materializeBlock + 8
for the delegation note + 10 for the import block; App.jsx ±3 for the
version field).

**Verification:**
- `npm run build` succeeds; main-bundle gz size delta noted at commit
  time.
- DEV smoke: open the app, watch DevTools console for the coloured
  `[shiftTemplate] Eager migration writing canonical per-slot shape.`
  banner on first sign-in if the DEV `/shiftTemplate` is still in
  legacy shape. Refresh; banner should NOT appear on subsequent loads
  (doc is now canonical). Open Settings → FoH or Kitchen; the form
  must look identical to pre-v1.10.1 (Count input + per-slot Start/End
  rows). Hit Save with no changes → no-op (blockDirty returns false
  for the now-canonical doc).
- PROD smoke: confirm `__APP_SIGNATURE__.version === "1.10.0"` flips to
  "1.10.1" on production. If PROD's `/shiftTemplate` was already in
  the new shape (v1.9.0 was almost a month ago — almost certainly
  yes), no migration write fires, and the DevTools banner does NOT
  appear. That's the correct behaviour.

**Design notes:**
- The legacy fallback in `slotTimeFor` stays. Removing it is a v2.0
  cleanup, not a v1.10 win — the eager migration covers every doc
  that passes through a signed-in session, but the fallback covers
  in-flight reads between `ready` and the migration write completing,
  AND any future legacy state from manual Firebase console edits or
  backup restores.
- `isShiftTemplateMigrated` flags lingering legacy fields
  (`start`/`end`/`secondPersonStart`) on a block whose `times` array
  is otherwise valid — so a partially-migrated doc (Settings wrote
  `times` but Firebase kept the legacy fields beside it) still
  triggers the cleanup pass. In practice Settings's full-block
  replace already drops them, so this is defensive.
- The ref guard prevents re-entrancy after the migration write's own
  onValue echo. Without it, the effect would re-run on the new
  `data.shiftTemplate` reference; `isShiftTemplateMigrated` would
  return true on the canonical write and the effect would short-circuit
  anyway, so the ref is belt-and-braces. The "once per session"
  semantic is more defensible if a future refactor changes the
  canonical check.

---

## v1.10.0 — Undo stack + LoginScreen hover-scale

**Date:** 2026-05-24

**Behavioural change:** Two strands.

(a) **Undo stack.** Every Clear / Generate / Move / Swap action now
captures its pre-mutation state into a 5-entry FIFO stack. A new
`<UndoButton>` lives in the Schedule nav-bar between SwapButton and
ClearButton; its label adapts to advertise the top op
(`"Undo: Regenerate"` / `"Undo: Clear week"` / etc.), disabled when the
stack is empty. Click pops the latest op, re-upserts the captured
records, and deletes the ids the original op created. Multi-step undo:
the manager can roll back several actions in reverse order (cap = 5;
oldest drops silently). Stack lives in-memory only via `useState`
inside the new `useUndoStack` hook — it survives Vite HMR (Fast Refresh
preserves useState) but resets on hard refresh / tab close. Intentional:
undo scopes to "I just did a thing, oops," not "roll back yesterday."
Result banner gains a fourth shape (`{kind: "undo", label, restored,
removed}`) reading `"Undid: <label>."`; the v1.9.4 auto-dismiss /
duration settings apply to it for uniformity.

(b) **LoginScreen hover-scale.** The v1.9.0 `.mgt-hover-scale` utility
was wired through the authenticated app but never landed on the login
surface. Email + password `mkInp` calls and the Sign-in `mkBtn` call
now carry `className: "mgt-hover-scale"` so the same 1.08-scale +
opaque-bg + soft-shadow + 12px-radius hover treatment applies. The
global `:not(:disabled)` guard keeps the Sign-in button flat when
fields are empty / auth is busy. Both atoms already pass `className`
through via `{...rest}` — three-prop change, no atom modification.

**Files:**

NEW:
- `src/hooks/useUndoStack.js` — bounded FIFO stack. Exports
  `{ stack, push, pop, clear }`. Cap = 5; FIFO eviction. Each `push`
  normalizes the op (mints an id, defaults missing arrays). `pop`
  returns the latest entry AND drops it from the stack atomically via
  a synchronous setter trick (StrictMode-safe since both invocations
  see the same `prev` and produce the same slice).
- `src/components/UndoButton.jsx` — schedule nav-bar button. Props:
  stack, onUndo, isMobile. No internal state. Label adapts:
  `"Undo"` (empty / disabled) vs `"Undo: {top.label}"` (e.g.
  `"Undo: Regenerate"`). Title tooltip carries the same info for
  readers who can't see the dynamic label. Uses the shared
  `.mgt-hover-scale` utility.

MODIFIED:
- `src/components/ClearButton.jsx` — + `onUndoableOp` prop. Snapshots
  every record about to be deleted via JSON deep-clone BEFORE the
  delete loop, then fires `onUndoableOp({ label: "Clear week" |
  "Clear day", restoreShifts, removeIds: [] })` AFTER. Defensive:
  skips firing when restoreShifts came back empty (zero-id path
  already blocked by the modal).
- `src/components/GenerateButton.jsx` — + `onUndoableOp` prop.
  Snapshots cleared (deletion targets) and modified (partial-update
  targets) PRE-mutation records from weekShifts via JSON deep-clone
  BEFORE the three mutation loops. Reads each new shift's resolved
  id off `actions.upsertShift`'s return value (already returned by
  `usePersistence.upsertCollection` — no usePersistence change
  needed) into `newIds`. After the loops, fires
  `onUndoableOp({ label: "Regenerate" | "Fill empty", restoreShifts,
  removeIds: newIds })`. Skips on zero-delta runs.
- `src/components/ScheduleGrid.jsx` — + `useUndoStack` mount;
  `recordUndoableOp` wrapper passed to ClearButton + GenerateButton.
  `attemptSwap`'s Swap and Move branches each push directly: Swap
  captures both source + target snapshots, removeIds = [] (both ids
  stay). Move captures source + (when present) target snapshots;
  removeIds = `[newTargetId]` only when target had no prior record
  (placeholder branch reuses the id, so removeIds stays empty there).
  + `handleUndo` helper that pops, restores, removes, and sets a
  `kind: "undo"` result-banner. + UndoButton mount in the nav bar
  between SwapButton and ClearButton. Banner-copy block gained a
  fourth `kind === "undo"` branch reading `"Undid: <label>."`.
- `src/components/LoginScreen.jsx` — + `className: "mgt-hover-scale"`
  on the email `mkInp`, password `mkInp`, and Sign-in `mkBtn` calls.
- `src/App.jsx` — version `1.9.5` → `1.10.0`, sha
  `"mobile-closed-placeholder"` → `"undo-stack-and-login-hover-scale"`.
- `CLAUDE.md` — new locked-decision block for the undo stack +
  LoginScreen hover-scale companion. File-structure header bumped to
  v1.10.0. New entries for `useUndoStack.js` and `UndoButton.jsx`.
  v1.10.0 lines appended to App.jsx / ScheduleGrid.jsx /
  GenerateButton.jsx / ClearButton.jsx / SwapButton.jsx / LoginScreen.jsx.
- `REFACTOR_LOG.md` — this entry.

**Scope:** No data-model change (no Firebase schema change, no new
fields). No new constants. No new CSS rules (reuses
`.mgt-hover-scale` from v1.9.0). PDF export, schedule-logic, and
generator algorithm are byte-identical to v1.9.5.

**Verification target:**
- Sign in → email / password / Sign-in button hover-scale visibly
  (Sign-in stays flat when disabled).
- Pick a week with shifts → Clear week → Undo: Clear week button
  appears in nav → click → shifts return + banner "Undid: Clear week."
- Clear → Generate Fill-empty → Undo: Fill empty → cells empty again.
- Seed shifts → Regenerate with preserve flags OFF → Undo: Regenerate
  → original assignments + cleared shifts return.
- Move a shift onto an empty cell → Undo: Move → source restored,
  target empty again.
- Swap two filled cells → Undo: Swap → both employees back in place.
- Perform 5 distinct ops in sequence → undo button label updates on
  each push → undo five times in a row, verifying each step rolls
  back correctly. A 6th op pushes the oldest out silently.
- v1.9.4 banner-duration config applies to undo banners too.
- v1.9.5 mobile Closed placeholder still renders on partial-closure
  days. v1.9.3 jump-to-cell still works. v1.7.0 swap pulse still
  paints. PDF export still produces a correct rota.

**Bundle:** 165.49 → 166.41 kB gz main (+0.92 kB). 322 modules (was
320 — useUndoStack.js + UndoButton.jsx). HTML unchanged.

---

## v1.9.5 — Mobile "Closed" placeholder + scope tidy

**Date:** 2026-05-24

**Behavioural change:** Two strands. (a) The mobile day-card stack on
ScheduleGrid now renders inert "Closed" placeholders for closed-dayPart
slots, mirroring the desktop v1.3.0 pattern and the PDF v1.9.0 "Closed"
italic cell. Pre-v1.9.5 the mobile path filtered closed slots out
entirely (`slots.filter(isSlotOpenOnDate)`) — on a partial-closure day
(e.g. FoH Day off, FoH Evening on), the missing slot rows just vanished
from the mobile UI, which read as "this day has fewer rows than the
others" rather than "this slot is closed today." (b) `useNowMins.js`
permanently dropped from CLAUDE.md's "File structure (target)" block.
The 15-second clock tick + "current shift in progress" affordance had
lingered as deferred polish since sessions 12–14; Patryk's call this
session is that it's out of v1 scope altogether — the app is for
*making* schedules, not for following shifts in real time. The
historical REFACTOR_LOG entry under v1.5.0's "What did NOT land" stays
as-is (it's a frozen account, not a forward promise).

**Files:**
- `src/components/ScheduleGrid.jsx` — `mobileStack` block. Removed
  the `visibleSlots = slots.filter(isSlotOpenOnDate)` precomputation
  and the subsequent `visibleSlots.map`. Replaced with a direct
  `slots.map((slot, i) => ...)` that computes `slotOpen` per slot and
  renders either `renderCell(d, slot)` or the shared
  `renderClosedCell(d, slot)`. Section-header logic
  (`prev = slots[i-1]`, `showHeader = i === 0 || isSectionBoundary(...)`)
  now operates on the full slots array so partial-closure days keep
  their canonical "FoH · Day" / "FoH · Evening" / "Kitchen · Day" /
  "Kitchen · Evening" ladder above the (now possibly Closed) cells.
- `src/App.jsx` — version `1.9.4` → `1.9.5`, sha
  `"details-always-on-generate-banner"` →
  `"mobile-closed-placeholder"`, build `2026-05-23` → `2026-05-24`.
- `CLAUDE.md` — schedule-grid visual polish locked-decision block
  extended with a v1.9.5 sub-bullet; ScheduleGrid.jsx + App.jsx
  file-structure entries gained v1.9.5 lines; the entire "File
  structure (target — added in later sessions)" block + its
  footnote removed.
- `REFACTOR_LOG.md` — this entry.

**Scope:** No new tokens, no new constants, no new state, no data-model
change. Single component touched; `renderClosedCell` reused without
modification. The PDF export path is unaffected (already symmetric since
v1.9.0).

**Verification target:** On a partial-closure day, the mobile day-card
shows the section banner above a "Closed" placeholder for the closed
dayPart, and the open dayPart sections render normally beneath. On a
fully-open day, the mobile day-card is byte-identical to v1.9.4. On a
fully-closed day, the day-card is filtered out upstream by
`visibleWeekDates` (unchanged behaviour).

**Bundle:** 165.51 → 165.49 kB gz main (−0.02 kB). 320 modules
unchanged. HTML unchanged.

---

## v1.9.4 — Generator-details polish + banner config

**Date:** 2026-05-23
**Post-push fix (same branch):** The initial v1.9.4 push had a crash
bug — the new banner-duration `<input>` used
`style={{ ...mkInp(), maxWidth: 120 }}`, spreading a JSX element
returned by `mkInp()` into a style object. React tried to apply
`$$typeof` / `type` / `props` as CSS properties, which crashed on
render the moment the Auto-generator section opened (white screen;
refresh recovered but next click crashed again). Fixed by switching
to the canonical `{mkInp({ ...props, style: { maxWidth: 120 } })}`
call form used by every other call site in the codebase. App.jsx
sha bumped to `"details-banner-config-mkinp-fix"`; version still
v1.9.4 (the buggy v1.9.4 push never reached main — only the in-
flight PR branch).

**Post-push polish (same branch):** the banner-duration row's
`<Fld>` wrapper had no horizontal padding (`S.fldRow` is just
`{marginBottom: 12}`), so the row sat 12px further left than the
Toggle rows above (which carry `padding: "10px 12px"` via
`Toggle`'s internal `rowStyle`). Replaced the `<Fld>` with an
inline Toggle-shaped flex row — label/helper on the left, input
on the right — so all three Auto-generator rows (strict
preference, auto-dismiss, banner duration) share the same
horizontal inset and visual rhythm. Helper text ("1–60 seconds")
moved off the label parenthetical into a Toggle-style sub-helper
beneath the label. Field-only hover-scale preserved (className on
the input, not the row). Sha bumped to
`"details-banner-row-alignment"`.

**Post-push polish (same branch):** the v1.4.0 "Details" button on
the results banner was hidden when both `unfilledCells` and
`clearedReasons` arrays were empty — a minimalism choice that
became a "disappeared button" surprise for managers who'd seen
Details on prior runs and didn't realise it was conditional.
Predicate switched from "either array is non-empty" to "the banner
has a `mode` field." Effect: Details is now always available on
Generate (fill-empty) and Regenerate banners, even on clean runs.
Clicking on a clean run opens the modal with the existing "Nothing
to report — everything fell within the rules" message, useful as
confirmation. Clear results still skip Details (their summary is
`{cleared, kind}` with no `mode` field — no detail metadata
exists). Sha bumped to `"details-always-on-generate-banner"`.

**Behavioural change:** Two strands. (a) UI fixes to the
GenerateResultsModal rows reported by Patryk after the v1.9.3 PR
preview: the list bullet was rendered outside the row's button via
`list-style: disc` on the `<li>`, so when the inner button hover-
scaled, the bullet stayed put and read as visually detached; long
generator outputs (35+ cleared rows on a Regenerate against a busy
week) also spilled past the Overlay sheet bottom because v1.9.0's
`overflow: visible` sheet (needed for hover-scale transforms to lift
past the border) meant the Close button became unreachable. (b)
Manager-configurable result banner: a new Auto-generator Settings
section toggle for "Auto-dismiss results banner" and a paired
duration field (1–60 seconds) — the previous hard-coded 5-second
fade is now both disable-able and tunable, addressing the recurring
"I missed the banner before I could read it" / "I want to inspect
this longer" feedback.

v1.9.3's "shipped" state never actually reached production — this PR
extends v1.9.3's branch with the polish + new settings, bumping the
version label so the merge commit ships as v1.9.4 with all four
threads (jump-to-cell + bullet integration + scrollable details +
configurable banner) at once. The v1.9.3 entry below documents the
underlying jump-to-cell work that landed in commit `b3c6359`; the
combined feature ships under the v1.9.4 label.

### What landed

1. **`src/components/GenerateResultsModal.jsx`** — bullet integration
   + scroll wrapper:
   - `ReasonGroup` `<ul>` loses `list-style: disc`; padding zeroed.
     Each `<li>` becomes a flex container (non-interactive) or
     wraps a flex button (interactive). The bullet is now a
     `<span aria-hidden="true">` rendered INSIDE the row, so the
     bullet and text scale together on hover.
   - Interactive button padding bumped from `2px 6px` to `4px 8px`
     so the hover background reads as a discrete row card rather
     than hugging the text edge.
   - Default-export wraps the two `<Section>` blocks in a
     scrollable inner `<div>`: `maxHeight: isMobile ? "55vh" :
     "min(60vh, 480px)"`, `overflowY: auto`, with the
     negative-margin + matching-padding pattern (`padding: "4px
     16px"`, `margin: "0 -16px"`) giving hover-scaled rows 16px
     of horizontal breathing room before the scroll container
     clips them. Same pattern as ScheduleGrid's outer wrapper
     (v1.9.0 hover-scale fix). The empty-state ("Nothing to
     report") falls outside the scroller — no list to scroll when
     there's nothing in it. Summary line + Close button stay
     outside the scroller, anchored at the modal bottom.
   - Close button gained `className="mgt-hover-scale"` (missed in
     the v1.9.0 second-wave broad-application pass).

2. **`src/lib/constants.js`** — four new exports:
   - `DEFAULT_GENERATOR_BANNER_AUTO_DISMISS` (true)
   - `DEFAULT_GENERATOR_BANNER_DURATION_SEC` (5)
   - `GENERATOR_BANNER_DURATION_MIN` (1)
   - `GENERATOR_BANNER_DURATION_MAX` (60)

3. **`src/components/Settings.jsx`** — Auto-generator section gains
   a second Toggle ("Auto-dismiss results banner") and a conditional
   `<Fld>`-wrapped number `<input>` (`min=1 max=60 step=1`,
   `mkInp()` styling, capped at 120px width). Both auto-save on
   flip / valid edit (same pattern as strict-preference); duration
   onChange ignores empty / NaN / out-of-range so the saved value
   remains the last valid number while the manager edits. The
   duration row is hidden when auto-dismiss is OFF (no effect to
   tune). Reset-to-defaults now includes both new fields. Imports
   pulled in the four new constants.

4. **`src/components/ScheduleGrid.jsx`** — banner auto-dismiss
   effect now reads `settings.generatorBannerAutoDismiss` (when
   false, no `setTimeout` is scheduled — banner stays until
   manually dismissed) and `settings.generatorBannerDurationSec`
   (clamped to MIN/MAX, multiplied by 1000 at the setTimeout
   call). Both values read via the existing defensive-fallback
   pattern; effect deps array grew to include both so flipping
   the toggle or editing duration re-runs the effect immediately
   if a banner is already showing.

5. **`src/App.jsx`** — `__APP_SIGNATURE__.version` 1.9.3 → 1.9.4,
   `sha` "jump-to-cell-from-results" →
   "details-bullet-scroll-banner-config".

6. **`CLAUDE.md`** — v1.4.0/v1.9.3 GenerateResultsModal locked-
   decision block extended with v1.9.4 polish sub-block. New
   "Generator-results banner config (v1.9.4)" locked-decision
   block. `/settings` data-model entry gained the two new fields.
   App.jsx, constants.js, Settings.jsx, ScheduleGrid.jsx, and
   GenerateResultsModal.jsx file-structure entries each gained
   v1.9.4 lines.

### Why combine into one PR rather than two

The v1.9.3 work (jump-to-cell) had a regression on the bullet/scroll
front that Patryk caught in PR review. Splitting "fix the regression"
into a separate PR would force the regression briefly through main
(and onto Vercel preview) before the fix landed. Layering the polish
on the same branch keeps the regression off main entirely — the merge
ships a clean v1.9.4 with all four threads at once. The "one version
per branch" rule is honoured by relabelling the branch to v1.9.4 in
this PR (the v1.9.3 label only lived on the in-flight branch, never
on main). REFACTOR_LOG keeps both entries for posterity since they
document distinct decisions.

### Bundle delta

Main bundle 164.68 → 165.51 kB gz over the v1.9.2 baseline (+0.83
kB total for v1.9.3 + v1.9.4 combined). The v1.9.4-only step is
+0.52 kB on top of v1.9.3's +0.31 kB. HTML 4.15 (unchanged).
Modules 320 → 320 (no new file).

### Verification

- `npm run build` succeeds.
- `npm run dev`. Generate against a busy week (say 30+ unfilled
  cells); open Details. Confirm:
  - Each row's bullet sits inline with the name/date/slot text;
    hovering scales the whole row including the bullet (no
    detachment).
  - The list scrolls inside the modal — Close button stays
    visible at the bottom regardless of scroll position.
  - Clicking a row still triggers v1.9.3's jump-to-cell flow
    (modal closes, cell pulses).
- Open Settings → Auto-generator. Confirm:
  - New "Auto-dismiss results banner" toggle visible (default ON).
  - New "Banner duration (1–60 seconds)" number input visible
    below the toggle (default 5).
  - Flip the toggle OFF → duration row hides.
  - Flip ON → duration row reappears at last value.
  - Edit duration to e.g. 15 → run Generate → banner now stays
    15s before fading.
  - Toggle OFF → run Generate → banner stays until × or another
    run.
  - Type an out-of-range value (e.g. 999) or empty → no save;
    last valid value persists.
- Reset to defaults → both banner fields revert to true / 5.
- Dark mode → no visual regression in the modal or Settings.

---

## v1.9.3 — Jump-to-cell from GenerateResultsModal

**Date:** 2026-05-23
**Behavioural change:** New interaction in the generator-details modal.
Every unfilled-cell row and (for Regenerate) every cleared-shift row is
now a clickable button. Click takes the manager directly to the cell
on the schedule grid: if the date is outside the visible week, the
grid first navigates to the right week; the modal closes; and the cell
one-shot pulses with the v1.7.0 green highlight palette plus a 1.6-s
scale-bounce animation so the eye lands on it immediately. The cell-
key highlight auto-clears 1.7 s after firing. Esc cancels an in-flight
jump-target highlight (priority order in the keydown handler:
swap-mode → jump-target → sticky pill-highlight).

The visual at-rest is intentionally identical to the v1.7.0 pill-click
highlight (same `--bg-active-on` / `--border-active-on` tokens) — the
mgt-jump-pulse animation is the only distinguishing cue. Single visual
identity for "this cell is the focus right now," regardless of how the
manager got there (clicking a pill OR clicking a results-modal row).

This completes a deferred polish thread from sessions 12–14 listed in
session 15's thread summary as "GenerateResultsModal → jump-to-cell."

### What landed

1. **`src/components/GenerateResultsModal.jsx`** — new optional
   `onJumpToCell(dateIso, slotKey)` prop. `ReasonGroup` extended with
   an `onItemClick` prop; when provided, each row renders as a button
   wrapped inside the existing `<li>` (button is `display:block`,
   `width:100%`, transparent, inherits font, gets the
   `.mgt-hover-scale` utility class so it lifts + paints a soft hover
   background on pointer). When omitted, rows fall back to plain
   text (v1.4.0 behaviour). The default export wires two per-list
   handlers — unfilled rows read `item.dateIso`, cleared rows read
   `item.date` (the underlying shape mismatch from the v1.4.0
   summary, captured at run-time in `generator.js`).

2. **`src/components/ScheduleGrid.jsx`** — three additions:
   - **`highlightedCellKey` state** (composite `${dateIso}|${slotKey}`)
     with a `useEffect` that auto-clears it 1.7 s after set. Distinct
     axis from the v1.7.0 `highlightedEmployeeId` because unfilled
     and cleared cells have no assignee to key by.
   - **`jumpToCell(dateIso, slotKey)` helper** — auto-navigates
     `weekStart` to the week containing the target date (via
     `parseIsoDate` + `startOfWeek` + an `isoDate(start)` equality
     compare so the no-op case is cheap), closes the results modal,
     sets the cell-key. Defensive: no-ops on falsy args; try/catch
     around the date parse falls through to the highlight set.
   - **`renderCell` styling extended** — new `isJumpTarget` boolean +
     `isAnyHighlight = isHighlighted || isJumpTarget`. The existing
     `isHighlighted` references in `baseBg` / `baseBorder` /
     `baseBorderWidth` / `ringShadow` were rewritten to use
     `isAnyHighlight` so the jump target picks up the same green
     ring tokens. New `cellAnimation` local layers the one-shot
     `"mgt-jump-pulse 1.6s ease-out 1"` value when `isJumpTarget`;
     swap-source still wins (its infinite yellow pulse is mutually
     exclusive with jump anyway since swap-source needs an existing
     shift).
   - **Inline `<style>` block** at the component root extended with
     `@keyframes mgt-jump-pulse` (transform scale bounce: 1 → 1.12
     → 0.98 → 1.04 → 1).
   - **Esc-handler `useEffect`** priority order extended to clear
     `highlightedCellKey` between swap-mode and the pill-highlight.
   - **Modal mount** now passes `onJumpToCell={jumpToCell}`.

3. **`src/App.jsx`** — `__APP_SIGNATURE__.version` 1.9.2 → 1.9.3,
   `sha` "mobile-today-card-tint" → "jump-to-cell-from-results".

4. **`CLAUDE.md`** — v1.4.0 GenerateResultsModal locked-decision
   block expanded with a v1.9.3 sub-block describing the jump-to-cell
   wiring + animation + Esc priority. App.jsx, ScheduleGrid.jsx, and
   GenerateResultsModal.jsx file-structure entries each gain a v1.9.3
   line.

### Why the same green palette as v1.7.0 pill-highlight

Two distinct user actions land on the same visual at rest (sticky
green ring on a cell). The pill-click highlight is sticky (toggles
on/off); the jump-target is a one-shot (auto-clears after 1.7s). If
they used different tokens, a manager who'd just clicked Details →
jumped → then clicked a pill would see TWO different greens on
different cells, which is noise. Sharing the palette makes the
visual identity "this is the focused cell" consistent across the
two entry points.

The animation does the distinguishing work: pill-click sets a
steady ring; jump fires a brief scale bounce. The bounce is what
draws the eye to the target cell.

### Edge cases

- **Date outside visible week** — auto-navigates the week. Manager
  who navigated away after a generator run can still jump back.
- **Date in a closed weekday** — `visibleWeekDates` filters closed
  days out of `dates`, so the cell isn't rendered. The highlight is
  set but has no visible effect; auto-clears 1.7s later. Acceptable
  (rare: would require closing a day Settings-side between the
  generator run and the click).
- **Slot removed from template** — same outcome as closed-day:
  highlight set, no cell to flash. Harmless.
- **Compound state** — if `highlightedEmployeeId` is also set (a pill
  is sticky-lit AND the manager clicks a results-modal row), both
  cells get the green ring. The jump target gets the bounce animation
  on top. No conflict; reads correctly.

### Bundle delta

Main bundle 164.68 → 164.99 kB gz (+0.31 kB). HTML 4.15 (unchanged).
Modules 320 → 320 (no new file).

### Verification

- `npm run build` succeeded (above).
- `npm run dev` (DEV Firebase). Sign in, populate a few shifts and
  requests, then:
  - **Generate on a week with multiple conflicts** so the result
    banner shows unfilled cells. Click Details → click any row →
    modal closes, cell scale-bounces and gets a green ring for ~1.6s,
    then settles back to base. Repeat with a Regenerate run to test
    the "Cleared" rows.
  - **Navigate to a different week** before clicking Details → click
    a row → grid auto-navigates back to the run's week + flashes the
    cell.
  - **Esc during the 1.6s pulse** — cell-key state clears
    immediately, animation aborts, cell returns to base. Press Esc
    again with a sticky pill-highlight set → pill-highlight clears.
  - **Modal in read-only mode** — pass `onJumpToCell={undefined}`
    (rendered by deleting that prop temporarily for a sanity check)
    → rows render as plain non-interactive text (v1.4.0 fallback).
  - **Mobile width** — same flow, day-card stack: cell flash should
    still play because the cell is rendered (just in a different
    layout).
  - **Dark mode** — green ring tokens flip via CSS vars; visual
    holds in both themes.

---

## v1.9.2 — Mobile today-card tint (desktop v1.4.0 catch-up)

**Date:** 2026-05-23
**Behavioural change:** Mobile-only visual addition. On the mobile
day-card stack of the Schedule grid, today's day-card now gets the same
three-token accent treatment the desktop already uses for today's
column underlay + date pill. Card background flips to
`var(--accent-tint-soft)`, border to `1px solid var(--accent-tint-strong)`,
and the inline date-header text inside the card flips to
`var(--accent-on-tint)`. No other surface changes, no data-model change,
no logic change.

v1.4.0 had introduced the desktop today-column tint and explicitly
deferred the mobile counterpart with the locked-decision note "*No
mobile counterpart this round (day-cards stay independent)*". The
thread summary from session 15 re-surfaced this as a deferred polish
candidate. This patch completes the v1.4.0 visual story.

### What landed

1. **`src/components/ScheduleGrid.jsx`** — inside the `mobileStack`
   `dates.map(...)`, added `const isToday = dIso === todayIso;` and
   spread two conditional overrides into the existing card style
   block. The card's date-header `<div>` `color` flips to
   `var(--accent-on-tint)` when `isToday`. Reuses the already-memoised
   `todayIso` (line 118), the same source the desktop date-pill loop
   and the desktop today-column underlay (line 732+) read from. No
   new state, no new memo, no new DOM nodes.

2. **`src/App.jsx`** — `__APP_SIGNATURE__.version` 1.9.1 → 1.9.2,
   `build` 2026-05-20 → 2026-05-23, `sha`
   "force-prod-build-env" → "mobile-today-card-tint".

3. **`CLAUDE.md`** — v1.4.0 locked-decision block updated: the
   "No mobile counterpart this round" sentence replaced by a v1.9.2
   sub-block describing the mobile day-card tint with the same
   three-token treatment. ScheduleGrid.jsx file-structure entry
   gained a v1.9.2 line documenting the inline-style overrides.
   App.jsx file-structure entry caught up on v1.9.1 (which the
   v1.9.1 hotfix never added) and gained the v1.9.2 line.

### Why full-card tint rather than header-only

The desktop tint underlay covers the entire today-column from top to
bottom. The mobile analogue of "the entire today-column" is "the
entire today-card". A header-only tint would have mirrored the
desktop *date pill* — but that's a separate, pre-existing effect, not
the v1.4.0 column tint we're catching up on. Going full-card keeps
the desktop ↔ mobile mental model 1:1.

### Compatibility

- v1.7.0 green cell highlight (pill click → cell glow): cells paint
  their own background; green still reads inside the tinted card.
- v1.7.0 yellow swap-mode pulse: per-cell keyframes; unaffected.
- v1.3.0 "Closed" placeholders: not rendered on mobile (the
  `isSlotOpenOnDate` filter drops closed slots from the per-day
  visibleSlots list).
- Dark mode: the three tokens are CSS vars whose dark values live
  under `[data-theme="dark"]` in `index.html` — no JS-side change
  needed, the tint flips automatically with the theme.
- Translucent cell backgrounds let the card tint show through in the
  6px gap between cells, mirroring desktop behaviour (CLAUDE.md
  v0.11.0: *"Translucent cell backgrounds let the tint show through"*).

### Bundle delta

Main bundle 164.68 → 164.68 kB gz (zero effective gz delta — the
override pattern compresses against the existing identical pattern
in the desktop date-pill loop). HTML 4.16 → 4.15 kB gz (noise).
Modules 320 → 320.

### Verification

- `npm run build` succeeds (above).
- `npm run dev`, resize browser <700px, confirm today's day-card has
  the accent tint + accent header colour. Navigate Prev/Next to a
  week without today → no card tinted. Today button returns →
  today's card tinted again.
- Inside today's card: click a "Shifts assigned" pill for someone
  working today → cell flips green over the tinted card. Activate
  Swap mode, click an assignee in today's card → yellow pulse still
  reads.
- Dark mode toggle → tint stays correctly contrasted in both themes.
- Desktop view: no visual regression — the column underlay path is
  untouched.

---

## v1.9.1 — Force `NODE_ENV=production` in build script (hotfix)

**Date:** 2026-05-20
**Behavioural change:** none for the app itself. Production deployment
fix only.

After v1.9.0 merged to main, Vercel built and deployed the merge
commit correctly (latest sha + clean build cache + Vite v6.4.2 in
"building for production..." mode), yet the deployed bundle contained
`projectId:"megustastu-bookings-dev"` and the green DEV firebase boot
banner. Direct inspection of
`https://megustastu-scheduling.vercel.app/assets/index-D48btCoJ.js`
confirmed Vite had statically resolved `import.meta.env.DEV = true`
at build time and tree-shaken `prodConfig` out entirely. Login on
production failed because the manager's PROD credentials don't exist
in the DEV auth pool.

Vite v5+ derives `import.meta.env.DEV` from `process.env.NODE_ENV`
(not from the `--mode` flag). Vercel is supposed to set
`NODE_ENV=production` automatically for production deployments, but
for this project it apparently didn't (or wasn't being read by Vite
at the right moment). Local builds always had `[firebase] PROD —`
because the local shell didn't inherit any conflicting `NODE_ENV`.

### What landed

1. **`package.json`** — `"build"` script changed from `"vite build"`
   to `"NODE_ENV=production vite build"`. Pins the env var at the
   npm-script level so Vite always sees the correct value regardless
   of what Vercel's build environment sets (or doesn't set). Linux
   syntax — works on Vercel (Linux build host) and on Patryk's local
   Mac. Would need `cross-env` on Windows but that's not a target
   platform.

2. **`src/App.jsx`** — `__APP_SIGNATURE__.version` 1.9.0 → 1.9.1,
   `sha` "selects-scale-modal-overflow" → "force-prod-build-env".
   Surface the fix in the version banner so post-deploy verification
   is unambiguous.

### Verification

- `npm run build` locally → `dist/assets/index-*.js` contains
  `[firebase] PROD —` and `projectId:"megustastu-scheduling"`. The
  green DEV banner and `megustastu-bookings-dev` projectId are absent
  (tree-shaken).
- After merge + Vercel redeploy, the live bundle at
  `megustastu-scheduling.vercel.app/assets/index-*.js` should now show
  the same PROD content. Confirm in DevTools console:
  - `[firebase] PROD — megustastu-scheduling` (red banner)
  - `window.__MGT_SCHED_BUILD__` → `{ version: "1.9.1", sha: "force-prod-build-env", build: "2026-05-20" }`
- Manager login with PROD credentials succeeds.

---

## v1.9.0 — PDF visibility, Day-OFF quota rebalance, request-chip preview

**Date:** 2026-05-20
**Behavioural change:** Three manager-visibility / semantics tweaks
shipped together. (a) The PDF export now shows the actual start–end on
any cell whose times differ from the slot template default (second line
inside the cell), and renders a muted-italic "Closed" placeholder for
cells that fall on a closed dayPart of a partially-closed day. (b)
Day-OFF requests no longer decrement the effective-quota number on the
WeeklyShiftSummary pill or in the generator's quota gate — only
`holiday` requests subtract from `workingDaysPerWeek`. Day-OFF still
HARD-blocks the date via `findRequestConflict` and stays hidden in the
picker by default (no change). (c) The colored type pill on each chip
row in the WeeklyRequestsPreview "Requests this week" panel is now
clickable — opens a NEW read-only `<RequestPreviewModal>` showing the
full record (employee, type, full date range, preferred dayPart and
recurring weekdays for shift-preference requests, notes when set).
Edit access stays on the Requests tab; the Schedule-tab surface is
read-only for safety.

### Revision note
The first commit on this branch wired up an editable
RequestFormModal in ScheduleGrid + made each chip ROW clickable.
Patryk's feedback was that the row-level click target was too heavy,
the row-hover border noisy, and edit access on the Schedule tab risky
during a glance. The second commit reverted those ScheduleGrid
additions and pared the click target down to just the type pill,
swapped the row-border hover for a `transform: scale(1.08)` on the
pill via real CSS `:hover`, and switched the click action to a
read-only preview modal.

The **third commit** (hover-scale) extends the v1.9.0 request-pill
hover affordance to every primary interactive surface in the app —
schedule grid cells, "Shifts assigned" pills, nav buttons
(Prev/Today/Next/Generate/Swap/Clear/Export PDF — Export
auto-skipped when disabled via `:not(:disabled)`), top tab nav
(Schedule | Employees | Requests | Settings), employee row cards +
Add Employee + Show archived, request row cards + Add Request +
Show past, and Settings' Save changes + Reset to defaults. Form
controls, Toggle atoms, segmented controls, accordion headers,
and modal action buttons are deliberately out of scope. The
class is defined once globally in `index.html` alongside the
theme tokens; consumers just add `className="mgt-hover-scale"`.
The local `mgt-req-pill` class + inline `<style>` block inside
`WeeklyRequestsPreview` are removed as part of the consolidation.

The **fourth commit** (hover-scale broad + clipping fix +
preserveAssignments default flip) does three things:
1. **Broadens hover-scale scope** to cover modal action buttons,
   modal segmented controls, modal pill toggles, the multi-select
   weekday pickers in RequestFormModal, the `Sign out` button,
   every Collapsible section header in Settings, every Fld-wrapped
   row in Settings, every Toggle in Settings, the Open days
   weekday pills, and the Day/Evening buttons inside the Open days
   popover. The `<Fld>`, `<Toggle>`, and `<Collapsible>` atoms
   gained optional `className` / `headerClassName` props so callers
   can opt-in row by row without forking the atom.
2. **Fixes schedule grid cell clipping on hover.** The desktopGrid
   wrapper's `overflowX: auto` forces an implicit `overflow-y: auto`
   in browsers, which clips transformed children at the wrapper
   box on hover — Sunday's FoH evening 2 cell (right-bottom edge)
   was getting visibly cut at the surrounding section border. Fix:
   `padding: 8` on the wrapper + `minWidth: 120 + dates.length * 120
   - 16` on the grid so the horizontal scroll threshold is
   unchanged. The 8px padding gives every edge cell room to scale
   (≈5px each direction for a 60px cell) before hitting the clip.
3. **`preserveAssignments` default flipped to OFF** in
   `GenerateConfirmModal`. Managers hit Regenerate precisely to
   reshuffle staff; the previous "default ON" made the first click
   degenerate into Fill-empty. New defaults match intent —
   reshuffle staff (preserveAssignments OFF), keep manual time
   edits (preserveTimes ON). The modal opens with the danger-red
   Regenerate variant by default, making the destructive default
   explicit before any click.

### What landed

1. **`src/lib/pdf-export.js`** — `buildTableBody` rewritten in two
   spots. Closed-cell branch now returns
   `{ content: "Closed", styles: { fontSize: 8, textColor: [136, 136, 136], fontStyle: "italic" } }`
   instead of an empty string — matches `ScheduleGrid.renderClosedCell`
   in intent. Filled-cell branch detects `cell.start !== slot.defaultStart
   || cell.end !== slot.defaultEnd` (same predicate `ScheduleGrid` uses
   for the "*" marker) and switches the cell from a plain name string
   to a two-line `{ content: name + "\n" + start–end, styles: { fontSize: 8 } }`
   so the override is legible on paper. Pure local change; row-header
   labels and the rest of autotable's config untouched. Literal RGB
   triplet is intentional: `pdf-export.js` never reads CSS vars (printed
   palette stays light per v0.11.0 decision).

2. **`src/lib/schedule-logic.js`** — `daysOffInWeekByEmployee` renamed
   to `holidayDaysInWeekByEmployee`. Filter narrowed from
   `r.type !== "dayoff" && r.type !== "holiday"` to `r.type !== "holiday"`.
   The function semantic and doc-block updated to reflect: "only
   `holiday` requests reduce the weekly cap; `dayoff` is informational
   and still HARD-blocks its date via `findRequestConflict`." Locked
   decision recorded in the session 15 questionnaire.

3. **`src/components/WeeklyShiftSummary.jsx`** — import + callsite +
   local variable names (`daysOff` → `holidayDays`, `off` → `holiday`)
   renamed in lockstep. Pill math is identical otherwise; the
   denominator just stops shrinking for Day-OFF requests. The
   WeeklyRequestsPreview panel right below remains the manager's
   visibility into which dates a Day-OFF actually covers.

4. **`src/lib/generator.js`** — import renamed; `daysOffByEmp` →
   `holidayDaysByEmp` in `buildCandidates` signature and inside the
   step (5) quota gate. `generateWeek` builds the map via the renamed
   helper. Algorithm otherwise byte-identical. Net effect: an employee
   with a 5-day quota and a single Day-OFF on Tuesday is now eligible
   for up to 5 other shifts that week (was capped at 4 before — the
   Tuesday HARD-block alone constrains the available dates to 6, so
   the cap of 5 is reachable). Reason code for over-cap rejection
   stays `"all-at-quota"`.

5. **`src/components/WeeklyRequestsPreview.jsx`** — the colored type
   pill (was a `<span>`) became a `<button type="button"
   className="mgt-req-pill">` with default button chrome stripped
   (palette background / border preserved, `font: inherit`,
   `cursor: pointer`). The row container stays an inert `<div>`
   — no row-level click target, no row-level hover styling. An
   inline `<style>` block at the rendered tree's top defines real
   CSS `.mgt-req-pill:hover { transform: scale(1.08); }` with a
   120ms transition (mirrors the v1.7.0 swap-pulse keyframes
   approach in ScheduleGrid). New local state
   `[previewRequest, setPreviewRequest]` owns the read-only
   preview modal — pill click sets the full original request
   record; modal close clears it. `<RequestPreviewModal>` mounted
   at the bottom of the component's JSX. Each row's intermediate
   object now carries `record: r` so the click passes the full
   record to the modal without a second lookup. No `onChipClick`
   prop on the component — the modal lifecycle is fully internal,
   so `<ScheduleGrid>` doesn't need to participate.

6. **`src/components/RequestPreviewModal.jsx`** — NEW file. Tiny
   read-only mirror of the request record, rendered inside
   `<Overlay>`. Fields (in order, conditional on data presence):
   employee name (with archived line-through + "(archived)"
   suffix), type pill (palette inherited from `REQUEST_TYPES`),
   formatted date range ("12 May – 18 May 2026"),
   preferredDayPart label (shift-preference only),
   recurringDaysOfWeek list (shift-preference with non-empty
   array; rendered in WEEKDAYS source order), notes (when set;
   `whiteSpace: pre-wrap` so manual line breaks render). Footer
   is a single Close button (ghost variant). No Save, no Delete.
   Mirrors RequestFormModal's vertical `<Fld>` stack so the
   preview reads as the "view mode" of the same form. Helper
   text at the bottom: "Read-only preview. To change this
   request, open the Requests tab."

7. **`src/components/ScheduleGrid.jsx`** — net-zero change from
   main. (The first v1.9.0 commit added a `RequestFormModal`
   import, `editingRequest` state, 4 handlers, a JSX mount, and
   an Esc-key guard extension; the refinement commit reverts all
   of that. The preview-modal lifecycle lives entirely in
   `WeeklyRequestsPreview`.)

8. **`src/App.jsx`** — `__APP_SIGNATURE__.version` 1.8.2 → 1.9.0,
   `build` 2026-05-19 → 2026-05-20,
   `sha` "recurring-shift-preference" → "pdf-dayoff-preview-hover-broad"
   (renamed across the four commits as the scope grew —
   "pdf-visibility-dayoff-chip-edit" → "-chip-preview" → "-preview-hover"
   → "-preview-hover-broad").

### Third commit — unified hover-scale (files touched)

A. **`index.html`** — added `.mgt-hover-scale { transition:
   transform 120ms ease } .mgt-hover-scale:hover:not(:disabled)
   { transform: scale(1.08); }` inside the existing top-of-file
   `<style>` block alongside the theme tokens. Single source for
   the hover affordance.

B. **`src/components/WeeklyRequestsPreview.jsx`** — removed the
   local `mgt-req-pill` class + the inline `<style>` block; the
   type pill now uses `className="mgt-hover-scale"`. Cursor stays
   inline (default `pointer` for buttons; explicit declaration
   kept on the pill for clarity).

C. **`src/components/WeeklyShiftSummary.jsx`** — pill button gains
   `className="mgt-hover-scale"`.

D. **`src/components/ScheduleGrid.jsx`** — schedule grid cell
   button + the three nav buttons (Prev, Today, Next) gain
   `className="mgt-hover-scale"`. The cell's existing inline
   `animation` (swap-pulse on the source cell) composes cleanly
   with the hover transform — different CSS properties, no
   conflict.

E. **`src/components/GenerateButton.jsx`**,
   **`src/components/SwapButton.jsx`**,
   **`src/components/ClearButton.jsx`**,
   **`src/components/ExportButton.jsx`** — each component's single
   button gains the className. Export PDF's disabled state is
   already handled by the CSS rule's `:not(:disabled)` guard — no
   per-render conditional needed.

F. **`src/components/AppShell.jsx`** — top tab-nav `<button>`
   inside `TABS.map` gains the className. All four tabs (Schedule,
   Employees, Requests, Settings) participate.

G. **`src/components/EmployeesList.jsx`** — row card button + Show
   archived button + both `mkBtn`-rendered Add Employee buttons
   (empty-state CTA and header-row CTA) gain the className. The
   `mkBtn` helper already spreads `...rest` onto its `<button>`,
   so passing `className` through the props object lands it on the
   DOM node without any helper signature changes.

H. **`src/components/RequestsList.jsx`** — symmetric to
   EmployeesList: row card button + Show past + both Add Request
   `mkBtn` instances.

I. **`src/components/Settings.jsx`** — Reset to defaults + Save
   changes `mkBtn` calls gain the className.

J. **`src/App.jsx`** — sha bump (see above).

### Fourth commit — broader hover-scale + clipping fix + preserveAssignments OFF (files touched)

K. **`index.html`** — unchanged (the global `.mgt-hover-scale`
   rule introduced in the third commit covers all the new
   consumers).

L. **`src/components/atoms.jsx`** — `<Fld>`, `<Toggle>`, and
   `<Collapsible>` each gained an optional `className` /
   `headerClassName` prop, applied to the clickable / wrapping
   div respectively. No default value (absent prop = no extra
   class). The change is additive — existing callers don't pass
   the prop and see no behavioural diff.

M. **`src/components/ScheduleGrid.jsx`** — desktopGrid outer
   wrapper gains `padding: 8`; the inner grid's `minWidth`
   decreases by 16 so the horizontal-scroll threshold is
   unchanged. Prevents transform-scaled edge cells (Sunday FoH
   evening 2 was the reported case) from being clipped by the
   wrapper's implicit overflow-y when overflow-x is auto.

N. **`src/components/AppShell.jsx`** — Sign out button gains
   `className="mgt-hover-scale"` (separate from the existing
   tab nav additions in the third commit).

O. **`src/components/Settings.jsx`** — all five Collapsible
   section headers (Operating time / Display / Auto-generator /
   FoH / Kitchen) gain `headerClassName="mgt-hover-scale"`. All
   `<Fld>` wrappers inside the accordions gain `className=
   "mgt-hover-scale"` — Operating time's Start/End rows, every
   row inside `renderBlock` for FoH/Kitchen (Count, Start, End,
   plus the 2nd-person-starts row when applicable). The three
   Toggle atoms in Display + Auto-generator gain the same. The
   seven Open days weekday pills + the two Day/Evening buttons
   inside the open-day popover each gain the class.

P. **`src/components/GenerateConfirmModal.jsx`** — two Toggles
   gain the class; all three bottom-row mkBtn calls (Cancel,
   Regenerate, Fill empty) gain the class. AND
   `preserveAssignments` default flipped from `useState(true)`
   to `useState(false)`; the open-reset effect flipped from
   `setPreserveAssignments(true)` to `setPreserveAssignments(false)`
   so reopening always gives the new default.

Q. **`src/components/ClearConfirmModal.jsx`** — `scopeButton`
   helper gains the class on every scope button (Whole week +
   per-day buttons). Both bottom-row mkBtn calls (Cancel, the
   danger-variant Confirm) gain the class.

R. **`src/components/EmployeeFormModal.jsx`** — every role pill
   (in rolesGrid), every preference segment (Day/Evening/Either),
   every working-days segment (1..7), every fixed-day pill (when
   shown), `activeToggle`, `fixedDaysToggle`, `priorityToggle`,
   and the bottom-row Delete / Cancel / Save mkBtn calls each
   gain the class.

S. **`src/components/RequestFormModal.jsx`** — every type
   segment, every preferredDayPart segment (Day shifts only /
   Evening shifts only — when shift-preference), every weekday
   pill in the v1.8.2 recurring picker, and the bottom-row
   Delete / Cancel / Save mkBtn calls each gain the class.

T. **`src/App.jsx`** — `sha` 
   "pdf-visibility-dayoff-preview-hover" → 
   "pdf-dayoff-preview-hover-broad".

### Fifth commit — ShiftFormModal + Collapsible scaling + per-slot hours

**Three buckets:**

1. **ShiftFormModal + swap banner Cancel:** every clickable element
   inside the cell-edit modal in the Schedule grid gets
   `mgt-hover-scale`. Specifically: the "Show staff on day off /
   holiday" Toggle, each evening-role pill in the role picker, the
   "Reset times & role to template defaults" ghost button, Clear
   (delete), Move/Swap, Cancel, Save. Plus the
   `swap-mode banner`'s Cancel/× button on `ScheduleGrid`.

2. **Settings: whole-section + clipping fix:** the `Collapsible`
   atom gained an optional `className` prop on its outer wrapper
   div (previously only `headerClassName` lived on the header
   inside). Settings passes `className="mgt-hover-scale"` on every
   Collapsible — so the whole section scales when the cursor
   enters anywhere inside it. The inner Toggles / Flds / pills
   already had the class from the 4th commit, so the effect
   compounds: hovering a specific row scales BOTH the section and
   the row, giving a layered "section is hot" + "this row is hot"
   feedback. Additionally, `Collapsible`'s wrapper `overflow`
   flipped from `hidden` to `visible` so transform-scaled inner
   rows can break out of the section border — matches the Schedule
   grid clipping behaviour from the 4th commit. Side-effect: the
   body's `borderTop` hairline now extends to the wrapper's box
   edge rather than being clipped at the rounded corner (1-2 px
   cosmetic exposure, acceptable trade-off). The Open days
   popover stays anchored ABOVE its pill row (the original
   workaround for the now-removed `overflow: hidden`); leaving it
   above keeps the layout stable and avoids re-introducing a
   downward clip risk.

3. **Per-slot shift hours in FoH/Kitchen:** the `/shiftTemplate`
   shape per (section, dayPart) block changed from
   `{count, start, end, secondPersonStart?}` to
   `{count, times: [{start, end}, ...]}` with `times.length ===
   count`. Each shift now carries its own start/end on the
   template. Kitchen evening's Chef can run 16:00–23:00 while
   Plating runs 16:00–22:00 and Pot runs 17:00–22:30 — all
   stored independently.
   - `src/lib/constants.js`: `DEFAULT_SHIFT_TEMPLATE` updated to
     the new shape (defaults preserve the v0.8.0 behaviour:
     FoH evening slot 0 starts 17:00, slot 1 starts 18:00; all
     other slots inherit their block's existing single time).
   - `src/lib/schedule-logic.js`: new internal helper
     `slotTimeFor(block, sectionKey, dayPart, index)` reads from
     `block.times[i]` when present, falls back to the legacy
     `start`/`end`/`secondPersonStart` shape otherwise. Used by
     `slotsForDay()` for each slot it enumerates. Consumers
     (grid, picker, generator, PDF export) read
     `slot.defaultStart`/`slot.defaultEnd` as before — no
     downstream change.
   - `src/components/Settings.jsx`: new helper `materializeBlock()`
     normalizes any block (new or legacy shape) into the per-slot
     shape — used by `cloneTemplate()` on form init. `blockError`
     validates each slot's times independently (error messages
     include the slot index, e.g. "Shift 2: end time must be
     after start"). `blockDirty` compares the per-slot arrays
     (with `materializeBlock` on the saved side so a legacy doc
     doesn't register as permanently dirty). `onCountChange`
     grows/truncates the `times` array: growing copies the last
     entry's times (intent: "add another person at the same
     hours"); shrinking drops trailing entries. New
     `onSlotTimeChange(section, dayPart, slotIndex, field, e)`
     replaces the old block-wide `onTimeChange`. `renderBlock`
     renders the `Count` input once at the top, then N labelled
     per-slot rows below — labelled with the section's role
     (Chef / Plating / Pot / Bar / Floor) for evening slots, or
     "Shift N" for day slots where one person covers all section
     roles.
   - No write migration: existing Firebase docs with the legacy
     shape are upgraded lazily on the next Save click. Reads from
     legacy docs work via the slotsForDay fallback.

`src/App.jsx`: `sha` "pdf-dayoff-preview-hover-broad" →
"perslot-hours-hover-polish".

Bundle delta: 164.03 → 164.67 kB gz main (+0.64 kB), 320 modules
unchanged.

### Sixth commit — RequestPreviewModal Close + opaque background on hover

Two surfaces flagged in the v1.9.0 5th-commit review:

1. **RequestPreviewModal's Close button was missing
   `mgt-hover-scale`.** Added the className via the `mkBtn` props.

2. **Transparent rows had their text bleed into adjacent rows on
   hover** — visible on the "Show staff on day off / holiday"
   Toggle inside ShiftFormModal and on the Settings accordion
   section headers ("Operating time", etc.). The scaled element
   had no opaque background of its own, so when its visual extent
   grew past the original row, the row below's text was still
   visible through the scaled area. Fix lives entirely in
   `index.html`'s `.mgt-hover-scale:hover` rule:

   ```css
   .mgt-hover-scale:hover:not(:disabled) {
     transform: scale(1.08);
     background-color: var(--bg-overlay-sheet);
     box-shadow: var(--shadow-soft);
     position: relative;
     z-index: 2;
   }
   ```

   Elements with inline `background:` styles (mkBtn variant
   buttons, palette pills, status cells, row cards) keep their
   inline colours because inline beats CSS — the new
   `background-color` only fills in the gap for surfaces that
   had no inline background. The `position: relative + z-index:
   2` lifts the hovered element above its non-positioned siblings
   so the painted card visually covers anything underneath even
   when the inline background isn't fully opaque. `box-shadow`
   adds a subtle elevation cue.

`src/App.jsx`: `sha` "perslot-hours-hover-polish" →
"perslot-hover-opaque-bg".

Files touched: `index.html`, `src/App.jsx`,
`src/components/RequestPreviewModal.jsx`, plus doc updates in
`CLAUDE.md` and this log entry. No JS bundle delta expected
(CSS-only + one className string).

### Seventh commit — rounded hover corners + Toggle-container padding

Two follow-up issues from the sixth-commit screenshots:

1. **Sharp corners on the hover background.** Adding
   `border-radius: 12px` to the `.mgt-hover-scale:hover` rule in
   `index.html`. Matches `S.surfaceSoft` / `S.card` / `BTN.base`
   so the hover-card look is visually consistent with the rest of
   the app. Elements with inline border-radius (pills at 999,
   schedule cells at 10, etc.) keep their inline value because
   inline beats CSS — the new declaration only fills the gap for
   transparent rows (Toggles, Collapsible headers, Fld rows).

2. **Toggle row visually overflowing its container** when
   compounded with the section's own scale (Toggle 1.08 × wrapper
   1.08 ≈ 1.166 from the original wrapper position). Applied the
   schedule-grid clipping-fix pattern — extra padding on the
   container — to surfaces that host Toggle atoms:
   - `src/components/atoms.jsx` — Collapsible bodyStyle horizontal
     padding 14 → 20. Atom-level change, so every Collapsible in
     Settings benefits.
   - `src/components/GenerateConfirmModal.jsx` — the Toggle card's
     padding 8px 10px → 12px 16px.
   `src/components/ShiftFormModal.jsx` left alone — the Toggle
   there sits in a Fld inside the modal Overlay which already has
   20px padding on the sheet (more than enough breathing room).

`src/App.jsx`: `sha` "perslot-hover-opaque-bg" →
"hover-rounded-toggle-padding".

Files touched: `index.html`, `src/App.jsx`,
`src/components/atoms.jsx`, `src/components/GenerateConfirmModal.jsx`,
plus doc updates in `CLAUDE.md` and this log entry. JS bundle
delta in noise range (~+0.05 kB gz for the slightly longer padding
strings).

### Eighth commit — Toggle padding + field-only-scale pattern

Three points from the seventh-commit screenshot review:

1. **Toggle row's hover background looked squashed against the
   text.** `atoms.jsx` Toggle `rowStyle.padding` bumped from
   `"6px 0"` (vertical-only, hugging the row edges horizontally)
   to `"10px 12px"`. Vertical breathing room near-doubles so
   multi-line helper text isn't crowded; horizontal 12 inset
   matches the app's general button / pill padding so the lifted
   card reads as a coherent surface.

2. **In Settings FoH / Kitchen, "Count" / "Start" / "End"
   LABELS were scaling on hover** — the manager's eye snapped to
   the label rather than the editable field. The
   `mgt-hover-scale` className moved from the wrapping `<Fld>` to
   the input element itself. Labels stay anchored; only the
   editable surface lifts. Applies to:
   - `Settings.jsx` Operating time Start / End inputs;
   - `Settings.jsx` FoH / Kitchen Count + every per-slot Start /
     End input (renderBlock);

3. **Same pattern persistently applied across the app** for any
   field where the manager adjusts time / date / notes:
   - `ShiftFormModal.jsx` cell-edit Start / End time inputs;
   - `RequestFormModal.jsx` From / To date inputs + Notes
     `<textarea>`.

   `EmployeeFormModal.jsx` has no time / date / notes fields
   (Name is a free-text identifier, not a notes field), so no
   changes there. Read-only modals (`RequestPreviewModal`) display
   values as static text and aren't affected.

Item #3 from the user's report — "Show staff on day off /
holiday Toggle must be able to overflow the section border when
mgt-hover-scale is in use" — is left unconstrained by design:
the Toggle's wrapping `<div style={{marginTop: 8}}>` in
`ShiftFormModal.jsx` has no overflow rule, and the modal
Overlay sheet's `overflow: auto` clips only when content actually
exceeds 80vh — a slim Toggle row at the top of the Assignee Fld
doesn't reach that threshold, so the scaled card lifts freely
within the modal sheet.

`src/App.jsx`: `sha` "hover-rounded-toggle-padding" →
"field-only-scale-pattern".

Files touched: `src/App.jsx`, `src/components/atoms.jsx`,
`src/components/Settings.jsx`, `src/components/ShiftFormModal.jsx`,
`src/components/RequestFormModal.jsx`, plus doc updates in
`CLAUDE.md` and this log entry. Bundle delta in noise range
(className strings moved between elements; Toggle padding string
4 chars longer).

### Ninth commit — Employee/Assignee selects + modal sheet overflow:visible

Two follow-ups from the eighth-commit review:

1. **`<select>` dropdowns weren't included in the field-only-
   scale pattern.** Added `className="mgt-hover-scale"` to the
   Employee select in `RequestFormModal.jsx` (edit + add modes
   share the component) and the Assignee select in
   `ShiftFormModal.jsx`. Now the editable surface lifts on hover
   to match the time / date / notes inputs done in the
   eighth commit.

2. **Notes textarea (and other modal-resident scaled elements)
   couldn't visibly lift past the modal sheet's border** —
   `overflow: auto` clipped any transform-scaled child at the
   sheet boundary. Changed the desktop sheet's `overflow` from
   `auto` to `visible` in `src/components/atoms.jsx` Overlay.
   Mobile sheet keeps `auto` since it fills the full viewport
   and tall content needs internal scrolling there. Trade-off
   accepted: long desktop modal content (taller than `maxHeight:
   80vh`) extends past the sheet boundary into the backdrop;
   typical forms stay well under 80vh so this rarely happens.

`src/App.jsx`: `sha` "field-only-scale-pattern" →
"selects-scale-modal-overflow".

Files touched: `src/App.jsx`, `src/components/atoms.jsx`,
`src/components/RequestFormModal.jsx`,
`src/components/ShiftFormModal.jsx`, plus doc updates in
`CLAUDE.md` and this log entry.

### Locked decisions (session 15)

| Q | A |
|---|---|
| Day-OFF generator behaviour | **Keep HARD block.** Generator never auto-assigns over a covering Day-OFF (unchanged). Only the quota-decrement is removed. Patryk left this open; chose the smaller-blast-radius option that stays consistent with the picker's hide-by-default behaviour. |
| Day-OFF picker behaviour | **Hidden-by-default stays.** Picker keeps the existing toggle ("Show staff on day off / holiday"). Only the WeeklyShiftSummary pill and the generator's quota gate are affected. |
| PDF override format | **Name on first line, time on second line.** Two-line cell at `fontSize: 8` (one step below the autotable body default of 9). Inline single-line with `·` separator was the runner-up; the two-line form was picked for legibility on a printed sheet. |

### Side-effects / things to know

- **A 5-day employee with one Day-OFF in the visible week now shows
  `0/5` on the pill instead of `0/4`.** Working as intended. The Day-OFF
  still HARD-blocks its date in the picker dropdown and in the
  generator — only the cap math changed.
- **The generator can now reach a 5-day quota when one date in the
  week is Day-OFF-blocked (was capped at 4 before).** Working as
  intended — the cap matches "how many days the employee said they
  can work", not "how many days they have left after preference
  filtering."
- **A cell with both a different role AND different time on an evening
  slot — only the time difference shows in the PDF.** Row identity in
  the PDF is per-slot (one row per slot key), so the role is implicit
  from the row label by v0.8.0's default-role policy. Acceptable: the
  manager reading the print can cross-reference role from the row
  header. If this becomes confusing in practice, add an explicit
  `· Role` suffix on overridden cells.
- **WeeklyRequestsPreview hover affordance** is real CSS `:hover`
  inside an inline `<style>` block (mirrors the v1.7.0 swap-pulse
  keyframes approach in ScheduleGrid). React inline-style doesn't
  get `:hover` for free; the alternative (onMouseEnter /
  onMouseLeave handlers mutating `e.currentTarget.style`) was
  rejected as heavier than necessary for a purely cosmetic effect
  and harder to keep in sync across hover states.

### Verification

- DEV smoke test: created an evening cell with override start `18:00`
  (template `17:00`). Export PDF → cell shows "Mary\n18:00–23:00" in
  smaller font; surrounding cells show plain names.
- DEV smoke test: set Wednesday evening closed in Settings → Operating
  time, Wednesday day open. Export PDF → Wednesday day-row cells
  render normally; Wednesday evening rows render "Closed" in muted
  italic.
- DEV smoke test: 5-day employee with one Day-OFF (Tuesday) in the
  visible week → pill shows `0/5` (was `0/4` pre-v1.9.0). Same
  employee with Tuesday changed to Holiday → pill shows `0/4`.
- DEV smoke test: Generate run with the same employee + Day-OFF →
  generator schedules them on up to 5 dates this week, never Tuesday
  (Details modal shows Tuesday Mary candidates rejected with reason
  `request-conflict`).
- DEV smoke test: hover the type pill on any chip in "Requests
  this week" → the pill scales up ~8%. The row itself shows NO
  border / NO scale change. Click the pill → read-only preview
  modal opens with employee + type + full date range. For
  shift-preference requests, the modal additionally shows the
  preferred dayPart + recurring weekday list. Requests with notes
  show the notes block at the bottom. Close button + backdrop
  click both dismiss the modal.
- DEV smoke test: open the Requests tab and click any existing
  row → RequestFormModal opens in edit mode (regression check —
  RequestsList wasn't touched substantively; only className
  additions in the third commit).
- DEV smoke test (third commit hover-scale):
  - Schedule nav: hover each of Prev / Today / Next / Generate /
    Swap / Clear / Export PDF → all scale by 8%. With an
    incomplete week, Export PDF is disabled and does NOT scale.
  - Schedule grid: hover any cell → scales. Hover the swap-source
    cell during swap mode → still pulses AND scales together.
  - "Shifts assigned": hover any pill → scales. Selected
    (green-fill) pill still scales on hover.
  - Top tab nav: hover each of Schedule / Employees / Requests /
    Settings → scales. Active tab still scales (its tinted
    background follows the transform).
  - Employees tab: hover any employee row card → scales. Hover
    Add Employee → scales. Hover Show archived → scales.
  - Requests tab: hover any request row card → scales. Hover
    Add Request → scales. Hover Show past → scales.
  - Settings tab: hover Save changes → scales. Hover Reset to
    defaults → scales. Accordion headers and Toggle atoms do NOT
    scale (deliberately out of scope).
- Regression: v1.8.2 recurring shift-preference, v1.8.1 preserve-
  overrides on Regenerate, v1.7.0 Swap mechanic, dark mode, mobile
  day-cards. App loads cleanly on DEV + Vercel (no stuck splash).
  No console errors. No write-guard banners.

### Bundle delta

TBD on `npm run build` — recorded in the commit body.

### Line delta (cumulative across all three v1.9.0 commits)

- `index.html`                          +24 / -1  (NEW .mgt-hover-scale rule)
- `src/lib/pdf-export.js`              +30 / -7
- `src/lib/schedule-logic.js`          +14 / -10  (rename + doc rewrite)
- `src/components/WeeklyShiftSummary.jsx`  +11 / -7  (+1 className)
- `src/lib/generator.js`               +20 / -15  (rename + gate doc)
- `src/components/WeeklyRequestsPreview.jsx` +70 / -25  (pill via shared class, inline <style> block removed)
- `src/components/RequestPreviewModal.jsx` +175 / 0  (NEW)
- `src/components/ScheduleGrid.jsx`    +4 / -1   (1 cell className + 3 nav-button classNames)
- `src/components/GenerateButton.jsx`  +1 / 0
- `src/components/SwapButton.jsx`      +1 / 0
- `src/components/ClearButton.jsx`     +1 / 0
- `src/components/ExportButton.jsx`    +1 / 0
- `src/components/EmployeesList.jsx`   +4 / 0   (row + Show archived + 2 Add buttons)
- `src/components/RequestsList.jsx`    +4 / 0   (row + Show past + 2 Add buttons)
- `src/components/Settings.jsx`        +2 / 0   (Save + Reset)
- `src/components/AppShell.jsx`        +1 / 0   (tab nav)
- `src/App.jsx`                        +3 / -3

---

## v1.8.2 — Recurring shift-preference patterns

**Date:** 2026-05-19
**Behavioural change:** `shift-preference` requests can now be narrowed
to a recurring weekday list (e.g. "every Sat/Sun in this date range").
The existing `dateFrom..dateTo` range still bounds the request; the new
`recurringDaysOfWeek` field (array of WEEKDAYS keys) further restricts
the request to dates whose weekday is in the list. Empty / missing list
preserves pre-v1.8.2 behaviour: every date in the range is covered.

Final entry in the v1.8.x generator-polish batch:
v1.8.0 cross-week + max-cap → v1.8.1 preserve overrides → v1.8.2
recurring shift-preference.

### What landed

1. **`src/lib/schedule-logic.js`** — `findShiftPreferenceMismatch`
   extended with an optional weekday-narrowing check. When a request
   carries a non-empty `recurringDaysOfWeek` array, the matcher
   computes `weekdayKeyForDate(parseIsoDate(dateIso))` lazily (only
   when a request in scope has the field set) and skips the request
   if the date's weekday isn't in the list. Empty / missing list
   degrades to the legacy "every date in range" path. Function
   signature is unchanged — all four arguments are positional same
   as v1.2.0; the new behaviour is driven entirely by the request
   record's `recurringDaysOfWeek` field. Both the generator's HARD
   filter and the manual picker's SOFT warning pick it up
   automatically.

2. **`src/components/RequestFormModal.jsx`** — new "Repeat on
   weekdays (optional)" picker rendered conditionally beneath the
   Day/Evening segmented control, only for `type === "shift-preference"`.
   Seven pill buttons (Mon..Sun) in WEEKDAYS source order, multi-
   select. The form state tracks `recurringDaysOfWeek` as a JS
   array; the picker re-sorts on every toggle so the stored array
   stays in Mon..Sun order regardless of click order (so downstream
   readers can render labels without re-sorting). Empty list saves
   as `null` (Firebase reads null as "remove this field" so legacy
   records stay clean on edit); non-empty list saves as the
   filtered array. Only the shift-preference type carries the field
   on save; other types drop it.

3. **`src/components/RequestsList.jsx`** — row secondary line
   appends "· Sat, Sun" (or whichever days) after the existing "Day
   shifts only" / "Evening shifts only" label when the request has a
   non-empty `recurringDaysOfWeek`. WEEKDAYS source order, comma-
   separated. Legacy requests without the field render unchanged.

4. **`src/App.jsx`** — `__APP_SIGNATURE__.version` 1.8.1 → 1.8.2,
   `sha` "preserve-overrides-on-regenerate" → "recurring-shift-preference".

### Data model

```
/requests/{id} (when type === "shift-preference")
  → { …existing fields,
      preferredDayPart: "day" | "evening",
      recurringDaysOfWeek?: string[] | null   // ["sat","sun"] etc.
                                              // empty/null = every date
                                              // in the range
    }
```

No migration. Legacy records without the field read as "every date in
range" via the matcher's null-guard. The field is only persisted when
the manager picks at least one weekday in the form.

### Verification

- Manual: created a "Mary · Day shifts only · every Sat, Sun · 2026-05-18..2026-08-31"
  request. The manual picker's yellow warning fires when assigning
  Mary to a Saturday evening shift in that range, and does NOT fire
  for a Tuesday evening shift in the same range. Generator skips Mary
  for Saturday/Sunday evening cells with reason `shift-preference`.
- Build clean (see bundle size below).
- HMR happy throughout.

### Bundle size

| Run | Main bundle gz | Modules |
|---|---|---|
| pre-v1.8.2 (= v1.8.1) | 162.88 kB | 319 |
| post-v1.8.2 | 163.21 kB | 319 |

Delta: **+0.33 kB gz** (one new helper conditional in
`findShiftPreferenceMismatch`, the weekday picker block in
RequestFormModal, and the secondary-line append in RequestsList).

### Out of scope

- Recurring patterns for `dayoff` and `holiday` requests. Locked
  decision (session 14 prep): a day-off / holiday is a single
  scheduled event, not a recurring pattern. If managers need
  recurring time off (e.g. "every Thursday morning"), it would
  conceptually be a different request type or a long-running
  `shift-preference` constraint — defer until asked.
- Sticky weekday list across modal opens. The form resets to the
  saved record on edit (or empty for add) per the existing
  `formFromRequest` path; no "remember last picked weekdays" state.

---

## v1.8.1 — Preserve overrides on Regenerate

**Date:** 2026-05-19
**Behavioural change:** Regenerate is no longer an unconditional wipe.
The GenerateConfirmModal exposes two checkboxes (both default ON):

- **Preserve manual time/role edits** — cells where start/end/role
  differ from the slot template defaults stay as-is.
- **Preserve existing assignments** — cells with an assigned employee
  stay as-is.

The two axes act **independently** per cell. A cell can have its
assignment preserved while its custom times are reset (preserveTimes
OFF, preserveAssignments ON → cell keeps its employee but
start/end/role revert to template defaults). Or its custom times
preserved while the assignment is cleared (preserveTimes ON,
preserveAssignments OFF → cell becomes worklist-fillable and the
new shift the generator picks for it inherits the saved times).
Both ON (the default) leaves all non-empty cells fully intact —
Regenerate behaves like Fill-empty. Both OFF reproduces v1.7.0's
full-wipe semantic.

*First implementation pass shipped with OR-logic that kept the whole
record on either preserve match — Patryk's DEV smoke test surfaced
that this produced incorrect behaviour in the asymmetric cases
(employee preserved but times not reset; times preserved but
employee not cleared). The fix lands in the same commit as the
docs: the wipe-pass now computes per-axis target state and emits
three lists — cleared / modified / pendingOverrides — so each axis
applies independently.*

Second entry in the three-version generator-polish batch:
v1.8.0 cross-week + max-cap → v1.8.1 preserve overrides → v1.8.2
recurring shift-preference. Patryk merged v1.8.0 to production on
2026-05-19 and reported the bug case (10-in-a-row) was resolved
before this branch was opened.

### What landed

1. **`src/lib/generator.js`** — `wipeAllShifts` replaced with
   `wipeShiftsWithPolicy(workingShifts, slotsByKey, policy)`. Local
   helpers: `hasTimeOrRoleOverride(shift, slot)` compares
   start/end/role against slot template defaults; `buildClearedRecord`
   factors out the snapshot shape. Per-axis logic computes target
   state for each cell:
   - `keepTimes = preserveTimes && hasOverride`
   - `keepEmployee = preserveAssignments && hasEmployee`
   - `nextStart/nextEnd/nextRole = keepTimes ? s.x : slot.defaultX`
   - `nextEmpId = keepEmployee ? s.employeeId : null`
   Three outcomes per record:
   - **modified** (nextEmpId present, fields changed) → record updated
     in place in `workingShifts`; persistence upserts later.
   - **pendingOverrides + cleared** (nextEmpId null, keepTimes true)
     → record deleted, time/role saved in `pendingOverrides` keyed
     by `dateIso|slotKey`. Fill-empty's payload construction reads
     the map and applies overrides to the new record.
   - **cleared** (nextEmpId null, no override saved) → straight wipe.
   `generateWeek` builds `slotsByKey` up-front, threads
   `pendingOverrides` into the fill-empty payload, accepts
   `preserveTimes` + `preserveAssignments` args (both default true),
   and returns `{newShifts, clearedShiftIds, modifiedShifts, summary}`.
2. **`src/components/GenerateConfirmModal.jsx`** — two Toggle atoms in
   a third surfaceSoft card under the Fill-empty/Regenerate explainer.
   Both default ON and reset to ON on every open via a useEffect on
   the open prop. The Regenerate explainer copy adapts in lockstep:
   four text variants (both ON / time-only / assignments-only / both
   OFF). The Regenerate button's variant switches from `danger` (red)
   to `primary` (blue) when both toggles are ON — visually signals
   that the run is non-destructive. `onConfirm` for Regenerate gains
   a second arg with the policy bag; Fill-empty path unchanged.
3. **`src/components/GenerateButton.jsx`** — `handleConfirm(mode,
   policy)` accepts the new policy and forwards `preserveTimes` +
   `preserveAssignments` into `generateWeek({...})`. Persistence
   loop now iterates `result.modifiedShifts` (records with
   pre-existing ids) and upserts each. Order: delete cleared →
   upsert modified → upsert newShifts. Defaults to both-true if
   `policy` is undefined (Fill-empty path).
4. **`src/App.jsx`** — `__APP_SIGNATURE__` bumped to `1.8.1`,
   sha `"preserve-overrides-on-regenerate"`.
5. **`CLAUDE.md`** — Regenerate locked-decision entry extended with
   the v1.8.1 policy section + file-structure annotations for
   App.jsx, generator.js, GenerateButton.jsx, GenerateConfirmModal.jsx.
6. **`REFACTOR_LOG.md`** — this entry.

### Build size impact

- v1.8.0 production: 161.92 kB gz, 319 modules.
- v1.8.1 first commit (whole-record OR-logic, later corrected):
  162.40 kB gz (+0.48 kB).
- v1.8.1 final (per-axis): **162.67 kB gz** (+0.75 kB from v1.8.0),
  319 modules (no new files).

### Verification (intended; Patryk runs in DEV)

- **Default behaviour (both ON):** customise Tuesday Kitchen Day's
  start time to 10:30. Open Generate → click Regenerate. The
  Tuesday cell should keep `10:30–16:00`; the GenerateResultsModal
  Details should NOT list Tuesday Kitchen Day as cleared.
- **Only time/role preserved:** Mary assigned to Tuesday Kitchen
  Day (default times). Uncheck "Preserve existing assignments",
  leave "Preserve manual time/role edits" on. Run Regenerate.
  Tuesday gets reassigned (Mary or someone else, per generator
  fairness) but the times stay at template defaults. No surprise
  custom times preserved because there weren't any.
- **Only assignments preserved:** Mary assigned 10:30–16:00 to
  Tuesday. Uncheck "Preserve manual time/role edits". Run
  Regenerate. Mary stays on Tuesday but the times reset to
  template defaults (11:00–16:00).
- **Both OFF:** matches the v1.7.0 wipe-and-refill behaviour. Red
  Regenerate button; explainer reads "Clears every shift in this
  week and re-allocates the whole rota fresh."
- **Button colour live-updates:** flip toggles back and forth.
  Both ON → button is blue. Either OFF → button is red. Explainer
  text changes in lockstep.

### Key design decisions

- **OR-logic across the two preserve criteria.** A cell with a custom
  time but no employee qualifies for "preserve times". A cell with an
  employee but default times qualifies for "preserve assignments".
  Both → kept twice (no-op). Neither → wiped. Matches manager intent:
  "if I spent attention on this cell along either axis, don't wipe it."
- **Reset on every open.** Sticky-across-opens would be a power-user
  request. Default-ON-every-time keeps the safe behaviour in front
  of the manager.
- **Regenerate vs Fill-empty when both ON.** They become functionally
  equivalent. We keep both buttons as explicit affordances — manager
  can hit Regenerate intentionally and just see that nothing changes
  unexpectedly. Cleaner than hiding Regenerate.
- **Reason code unchanged.** Cleared records still carry `"regenerated"`.
  Adding `"preserved"` or similar would only matter for cells that
  STAY — those aren't reported in `clearedRecords` at all, so no
  reason code is needed.

---

## v1.8.0 — Cross-week consecutive-off + max-consecutive-working-days cap

**Date:** 2026-05-19
**Behavioural change (two coordinated rules):**

1. The "at least 2 consecutive days off" wellness rule (v1.2.0) gains
   cross-week awareness. A Sun-off employee with the next Mon also off
   now correctly counts as having 2 consecutive off days. Symmetrically,
   prior-Sun off + Mon off counts too. Generator (HARD) and manual
   picker (SOFT yellow warning) both pick up the extension; Swap
   mechanic still skips the rule per the v1.7.0 decision.
2. A companion **max 5 consecutive working days** rule. The 2-off rule
   alone is per-calendar-week and can be satisfied by rest at the
   *edges* of two adjacent weeks — e.g. week 1 Mon–Tue off + Wed–Sun
   work, then week 2 Mon–Fri work + Sat–Sun off → 10 consecutive
   working days, each week independently passing the 2-off rule. This
   came up in Patryk's first DEV smoke test of the original v1.8.0
   work; the bug was the rule's per-week framing, not the v1.8.0
   cross-week extension itself. Companion helper
   `withinMaxConsecutiveWorkingDays(empId, weekStart, shiftsMap,
   max=5, options)` scans a 21-day window [prior, focus, next] and
   rejects any run > max that overlaps the focus week. HARD in the
   generator (`buildCandidates` step 6.5, reason `"max-consecutive"`),
   SOFT yellow warning in the picker (stacked after the 2-off banner).

First entry in a planned three-version generator-polish batch:
v1.8.0 cross-week → v1.8.1 preserve overrides on Regenerate →
v1.8.2 recurring shift-preference patterns. Each ships on its own
branch per the one-version-per-branch rule.

### What landed

1. **`src/lib/schedule-logic.js`** — `hasConsecutiveDaysOff` extended
   from a 7-cell `[Mon..Sun]` array to a 9-cell `[priorSun, Mon..Sun,
   nextMon]` window. New optional 5th parameter `options` accepts
   `{priorWeekShifts, nextWeekShifts}` — when present, the boundary
   cells are resolved from those maps (working iff a matching shift
   exists). When absent, boundaries default to "worked", which
   degrades the helper to its pre-v1.8.0 Mon..Sun-only behaviour for
   callers that haven't adopted the new option bag. Runs of off cells
   count only when they overlap indices 1..7 (the focus week) — a
   prior-Sat–Sun-off pattern with the focus week fully worked is
   correctly dropped (that rest happened last week).
   Companion export: `withinMaxConsecutiveWorkingDays(empId,
   weekStart, shiftsMap, max=5, options)`. Computes a 21-cell working
   pattern across [prior week, focus week, next week]; rejects when
   any run > max overlaps the focus week (indices 7..13). Missing
   adjacent-week maps default cells to OFF — opposite conservative
   direction from `hasConsecutiveDaysOff` (here we avoid
   over-reporting long runs).
2. **`src/lib/generator.js`** — `generateWeek` accepts a new
   `nextWeekShifts` arg parallel to `priorWeekShifts`. Both are
   bundled into a single `crossWeekShifts` object threaded through
   `buildCandidates` (additional positional arg at the tail). The
   step-6 consecutive-off filter forwards `crossWeekShifts` into
   `hasConsecutiveDaysOff`. New step 6.5 filter calls
   `withinMaxConsecutiveWorkingDays` with the same bag and reason
   code `"max-consecutive"`. Step 7's preference filter now reads
   from `cappedOk` (the new gate's output) instead of `restedOk`.
   Algorithm otherwise byte-identical — ordering, ranking, quota,
   request and preference filters unchanged.
3. **`src/components/ScheduleGrid.jsx`** — added a `nextWeekShifts`
   memo via `shiftsForWeek(shifts, addDays(weekStart, 7))`, sitting
   next to the existing `priorWeekShifts` memo. Threaded into
   `<GenerateButton>` and `<ShiftFormModal>`.
4. **`src/components/GenerateButton.jsx`** — accepts the new
   `nextWeekShifts` prop and forwards it into the `generateWeek({…,
   nextWeekShifts})` call.
5. **`src/components/ShiftFormModal.jsx`** — accepts
   `priorWeekShifts` and `nextWeekShifts` as new optional props,
   passes them into `hasConsecutiveDaysOff` via the v1.8.0 options
   bag. The yellow rest-warning banner now fires/clears on cross-week
   2-off straddles. Companion `maxConsecutiveBanner` — second yellow
   warning (same palette/style) stacked after the 2-off banner; fires
   when the proposed assignment would create > 5 consecutive working
   days across [prior, focus, next].
6. **`src/lib/constants.js`** — `GENERATOR_REASONS` gains
   `"max-consecutive"` → "Would exceed the max consecutive
   working-days cap for every candidate". Shown in
   `GenerateResultsModal` for cells the new gate left unfilled.
7. **`src/App.jsx`** — `__APP_SIGNATURE__` bumped to `1.8.0`,
   sha `"cross-week-consec-and-max-cap"`.
8. **`CLAUDE.md`** — locked-decision entries for both rules +
   file-structure annotations for the seven modified files.
9. **`REFACTOR_LOG.md`** — this entry.

### Line delta (approx, both rules combined)

| File | Delta |
|---|---|
| `src/lib/schedule-logic.js` | +120 / −15 (new helper + extended one) |
| `src/lib/generator.js` | +30 / −5 |
| `src/lib/constants.js` | +1 / 0 |
| `src/components/ScheduleGrid.jsx` | +9 / 0 |
| `src/components/GenerateButton.jsx` | +6 / −1 |
| `src/components/ShiftFormModal.jsx` | +30 / −2 |
| `src/App.jsx` | +2 / −2 |
| `CLAUDE.md` | +110 / −7 |

### Build size impact

- Pre v1.8.0 (production v1.7.0): main bundle 161.32 kB gz, 319 modules.
- v1.8.0 first commit (cross-week only): 161.61 kB gz (+0.29 kB).
- v1.8.0 final (both rules): **161.92 kB gz** (+0.60 kB total), 319
  modules (unchanged — no new files; helpers added to existing
  schedule-logic.js).

### Verification (intended; Patryk runs in DEV)

- **Cross-week 2-off rule:** Manual picker, employee assigned Mon–Sat
  this week and no shift next Mon → open Sun cell, pick them →
  rest-warning should NOT fire (Sun + next Mon straddle satisfies).
  Assign them to next Mon too, retry → warning fires.
- **Max-consecutive-working-days rule:** Manual picker, employee
  assigned Wed–Sun of prior week → open Mon of focus week, pick them
  → max-consecutive warning fires (would be day 6 in a row).
  Generator with the same prior-week state → won't auto-pick this
  employee for Mon (or any subsequent day that pushes them past 5
  consecutive). With prior-week empty, generator stops auto-picking
  this employee after they've worked 5 consecutive days in focus
  week.
- **Regression:** Employee with isolated 1-day offs or a clean 5-on /
  2-off pattern in a single week → both rules satisfied, no warnings,
  generator picks normally.
- **Regenerate end-to-end:** Run Regenerate on a 2-week stretch where
  the previous attempt produced 10-in-a-row. Confirm the new run
  redistributes shifts so no employee exceeds 5 consecutive.

### Key design decisions

- **Default boundary days to "worked" for the 2-off rule.** Without
  authoritative cross-week data, `hasConsecutiveDaysOff` falls back to
  the pre-v1.8.0 Mon..Sun-only result rather than artificially
  extending boundary runs. Safer toward false-negatives on the
  wellness check — a silently-extended run could mask a real rest gap
  if the boundary day was actually worked.
- **Default boundary days to "off" for the max-cap rule.** Opposite
  conservative direction: without authoritative data we don't want to
  over-report long working runs. The two helpers' fallbacks point in
  opposite directions because their failure modes do.
- **Runs must touch the focus week.** A run entirely in the prior or
  next week shouldn't count — that's manager state from earlier
  decisions, not what this proposal is creating. Both helpers
  implement the same "must overlap focus week indices" check.
- **Pass cross-week shifts as a bag.** `buildCandidates` gains one
  positional arg (`crossWeekShifts`) rather than two (`priorWeekShifts,
  nextWeekShifts`). The same bag drives both step-6 (2-off) and
  step-6.5 (max-cap) filters. Future cross-week-aware filters reuse
  it without further signature churn.
- **Swap mechanic untouched.** Per v1.7.0, swap doesn't enforce the
  consecutive-off rule (manager judgment wins). Same applies to the
  new max-cap rule. Consistent across both wellness checks.
- **Cap value (5) hard-coded for now.** Could become a Settings
  toggle later. v1 default matches "≥1 rest day in every 6-day
  stretch" interpretation of typical labour-law guidance for
  restaurant work; combined with the 2-off rule, gives a strong
  wellness floor.

---

## v1.7.0 — Swap UX, pill-click highlight, Regenerate wipe-and-refill, Priority badge re-pin

**Date:** 2026-05-18
**Behavioural change:** Four user-facing changes bundled, all in the
Schedule grid + Employees list surfaces.

1. **Move / Swap mechanic.** Manual cell edits gain a one-flow path
   for relocating an assignment. Two entry points: a "Move / Swap…"
   button in the picker modal (visible for any filled cell) and a
   nav-bar Swap toggle on the Schedule grid. Both feed the same
   mechanic: target empty → MOVE (deleteShift + upsertShift), target
   filled → SWAP (two upsertShifts switching employeeIds while each
   cell keeps its own role/time identity). Hard validation on role
   match, request conflicts, shift-preference, and same-day
   double-booking; refusal surfaces a red banner. Source cell pulses
   via inline `@keyframes mgt-swap-pulse`. Esc cancels.
2. **Shifts-assigned pill → cell highlight.** Pills became clickable
   buttons. Clicking a pill paints every cell assigned to that
   employee with an accent ring; clicking again (or pressing Esc, or
   selecting another pill) clears or switches. Both desktop and
   mobile day-card layouts participate (shared `renderCell`).
3. **Regenerate is now wipe-and-refill.** What was
   "clear-invalid-then-fill" became "wipe-all-then-fill-empty fresh".
   When new requests land mid-week, the manager wanted a fresh global
   allocation rather than localized constraint repairs. The previous
   `clearInvalidShifts` pre-pass (≈190 lines) is gone; the new
   `wipeAllShifts` empties every record with reason "regenerated"
   before the fill-empty pass runs. The Regenerate button's variant
   switched to `danger` (red) and the modal explainer leads with
   "clears every shift in this week" to flag the destructive nature.
4. **Priority badge re-pin.** Moved out of the top-right cluster
   into its own bottom-right sibling row on each Employees list row.
   Hidden entirely when `schedulingPriority !== true` so row height
   doesn't shift between priority and non-priority employees.

Version bump to **1.7.0** — four user-visible surfaces (swap mechanic,
highlight, destructive Regenerate semantics, badge re-pin).

### What landed

1. **`src/lib/schedule-logic.js`** — + `roleMatchesSlot(emp, slot)`
   exported. Lifted from generator.js's local `roleMatches`. Shared
   by the generator's eligibility filter and the new Swap mechanic
   in ScheduleGrid.
2. **`src/lib/constants.js`** — `GENERATOR_REASONS` audit: removed
   the 11 reason codes only emitted by `clearInvalidShifts` (`closed-day`,
   `closed-day-part`, `unassigned`, `slot-removed`, `no-employee`,
   `archived`, `on-request`, `shift-preference`, `fixed-days`,
   `same-day-dup`, `over-quota`). Added `"regenerated"` →
   "Cleared for regeneration".
3. **`src/lib/generator.js`** — `clearInvalidShifts` deleted in full.
   `wipeAllShifts(workingShifts)` added — empties every record with
   reason "regenerated", returning the cleared-records list. `generateWeek`
   regenerate branch simplified to one line. Local `roleMatches`
   replaced by the imported `roleMatchesSlot`. Pruned now-unused
   `parseIsoDate` import and the `slotsByKey` / `visibleDateSet`
   locals.
4. **`src/components/SwapButton.jsx`** — NEW. Nav-bar toggle button
   between Generate and Clear. Dumb — reads `active` from parent and
   fires `onToggle`. Label switches between "Swap…" and "Swap: cancel".
5. **`src/components/ScheduleGrid.jsx`** — + `swapMode` state
   (phase "source-select" | "target-select" | null) + `swapBanner`
   (info/success/error). + `cellClick` router that branches on swap
   mode. + `attemptSwap(source, target)` does the full validation
   chain. + inline `@keyframes mgt-swap-pulse` style block.
   `renderCell` paints highlight + swap-source decorations.
   `highlightedEmployeeId` state + `onHighlight` callback fed to
   WeeklyShiftSummary. Esc keydown handler cancels swap first, then
   clears the pill highlight. `<SwapButton>` mounted in the nav bar.
6. **`src/components/ShiftFormModal.jsx`** — + `onStartSwap` prop.
   "Move / Swap…" secondary button rendered only when the cell has
   an assignment AND the parent supplied `onStartSwap`.
7. **`src/components/WeeklyShiftSummary.jsx`** — pill `<span>` →
   `<button>` with `onClick`. + `highlightedEmployeeId` +
   `onHighlight` props. Selected pill gains accent fill + accent
   border + 2-px accent ring via box-shadow.
8. **`src/components/EmployeesList.jsx`** — Priority badge moved
   into its own bottom-right sibling div, conditionally rendered.
9. **`src/components/GenerateConfirmModal.jsx`** — Regenerate button
   switched to `danger` variant. Explainer card emphasizes
   "clears every shift in this week" with a bolded red label.
10. **`src/components/GenerateResultsModal.jsx`** — file-header
    comment updated; rendering unchanged (the existing groupByReason
    collapses to one bucket when every cleared record carries the
    same reason).
11. **`src/App.jsx`** — `__APP_SIGNATURE__` → version 1.7.0, sha
    `swap-highlight-regen-priority`.
12. **`CLAUDE.md`** — new locked-decision entries (Move/Swap;
    pill-click highlight; new Regenerate semantics; Priority badge
    re-pin). File-structure annotations updated for every touched
    file plus the new `SwapButton.jsx` entry.

### Verification

- `npm run build` — Vite produced a clean production bundle in 1.27s.
  319 modules transformed (up from 318 — the new SwapButton.jsx).
  Main bundle 161.17 kB gzipped (v1.6.1: 160.71 kB; delta **+0.46 kB**
  — well inside the +5 kB budget).
- Behavioural smoke (DEV via `npm run dev`): pending Patryk's manual
  pass against the 17-step checklist in the plan file.
- Cross-feature: pill click during swap mode is ignored
  (`onHighlight` still fires but cell clicks route through swap);
  swap source cell still routes through swap router for cancel-click
  detection.

---

## v1.6.1 — Effective quota in the auto-generator

**Date:** 2026-05-18
**Behavioural change:** The auto-generator now respects the same
effective-quota cap the v1.6.0 "Shifts assigned" pill displays. A
five-day employee with two dayoff/holiday days in the visible week is
capped at three generator-assigned shifts (was five), freeing the
remaining cells for other staff. Algorithm is otherwise byte-identical
to v1.6.0 (ordering, ranking, request / preference / consecutive-off /
fixedDays filters unchanged). No data-model change.

Patch bump rather than minor because this completes v1.6.0's
effective-quota story rather than introducing a new surface — the UI
math and the algorithm now read from a single definition.

### What landed

1. **`src/lib/schedule-logic.js`** — added
   `daysOffInWeekByEmployee(requestsMap, dates) → { [empId]: count }`.
   Same algorithm previously living in WeeklyShiftSummary's local
   `buildDaysOffByEmployee`. Counts the distinct visible-week dates
   each employee has covered by a `dayoff` or `holiday` request;
   `shift-preference` intentionally skipped (constrains dayPart, not
   whether the person works); closed weekdays don't enter the count
   because callers pass the post-filter `visibleWeekDates(...)`.
2. **`src/components/WeeklyShiftSummary.jsx`** — removed the local
   `buildDaysOffByEmployee`; imports and calls the lifted
   `daysOffInWeekByEmployee` instead. Behaviour identical (single
   source of truth for the pill math and the generator's quota gate).
3. **`src/lib/generator.js`** — `generateWeek` builds the
   per-employee dayoff/holiday count once after computing visible
   dates and threads it through:
   - **`buildCandidates`** step (5) — per-candidate cap becomes
     `max(0, workingDaysPerWeek − off)`. Reason code on cap-out
     stays `"all-at-quota"`.
   - **`clearInvalidShifts`** step 10 (workplace-quota over-cap) —
     same effective cap, so Regenerate clears excess assignments
     down to the effective number. Reason code stays
     `"over-quota"`.
   Both `buildCandidates` call sites (worklist pre-sort + main fill
   loop) pass `daysOffByEmp`. The new arg defaults to `{}` inside
   `buildCandidates` and `clearInvalidShifts` so any future caller
   that omits it falls back to raw-cap behaviour.
4. **`src/App.jsx`** — `__APP_SIGNATURE__` → version 1.6.1, sha
   `generator-effective-quota`.
5. **`CLAUDE.md`** — new locked-decision entry under v1.6.0's
   effective-quota note explaining the generator consumes the same
   cap. File-structure annotations updated for `schedule-logic.js`,
   `generator.js`, `WeeklyShiftSummary.jsx`, `App.jsx`.

### Verification

- `npm run build` — Vite produced the production bundle without
  warnings; bundle size delta noted below.
- Behavioural smoke (DEV via `npm run dev`):
  - 5-day employee with a 2-day holiday in the displayed week →
    Generate Fill-empty now assigns ≤3 distinct dates, matching the
    pill cap. Remaining open cells go to other employees.
  - Same setup with 3 holiday days → cap drops to 2.
  - Shift-preference (Day only) request on a different employee →
    pill quota unchanged; generator still respects the dayPart
    filter from v1.2.0.
  - Regenerate after manually assigning the 5-day employee to 4
    non-holiday dates → Results modal lists one shift cleared with
    reason "Over quota"; pill drops to 3 / 3.
  - Negative test: a week with zero holiday requests yields identical
    generator output to v1.6.0 (every effective cap equals raw cap).
- Cross-feature regression: tab + week + Settings-section
  persistence still works; WeeklyRequestsPreview still renders;
  manual picker warnings unchanged; PDF export gate unchanged.

---

## v1.6.0 — Weekly requests preview + effective quota + Settings section persistence

**Date:** 2026-05-18
**Behavioural change:** Three Schedule-grid UX improvements bundled with
v1.5.0 in the same PR (scope grew mid-review; PR title amended). All
additive — no data-model or generator-algorithm changes.

1. **Weekly requests preview.** New `<WeeklyRequestsPreview>` component
   renders below `<WeeklyShiftSummary>` on the Schedule grid. Lists
   every request whose date range overlaps the displayed week
   (chronological, name + type pill + range). Manager can see who's
   off / on holiday / preference-constrained without leaving the
   Schedule tab.
2. **Effective quota on Shifts-assigned pills.** Pill format becomes
   "Name · count / effective" where effective =
   max(0, workingDaysPerWeek − distinct visible-week dates covered by
   day-off / holiday requests). Shift-preference requests do not
   subtract. The pill shows just the reduced number; the "why" is
   answered by the requests preview right below it.
3. **Settings accordion persistence.** `openSection` in `Settings.jsx`
   now persists across refresh / Vite HMR within the same browser tab
   via sessionStorage (`mgt-sched.settingsSection`). Mirrors the
   v1.5.0 tab and week persistence patterns.

Version bump to **1.6.0** — three new visible surfaces. The scope grew
past v1.5.0's "session persistence + workflow rules + generator
ordering" description, so a minor bump rather than a patch.

### What landed

1. **`Settings.jsx`** — lazy useState initializer + write effect for
   `openSection` against `sessionStorage["mgt-sched.settingsSection"]`.
   Read validates against the known section keys (hours, display,
   generator, foh, kitchen) + the literal "null" sentinel for the
   all-collapsed state. Anything else falls back to `"hours"`.
2. **`WeeklyShiftSummary.jsx`** — `requests` + `dates` props added.
   New `buildDaysOffByEmployee(requests, dates)` helper counts the
   visible-week dates each employee has covered by a dayoff/holiday
   request. The displayed quota = max(0, raw − offCount). Quota=0
   employees collapse to ratio=1 in the under-utilization sort.
3. **`WeeklyRequestsPreview.jsx`** — NEW. Composes only from `S`
   tokens + `REQUEST_TYPES` palette. No `Overlay` involved (no new
   blur surface). Renders nothing when no requests overlap the
   displayed week so the grid footer stays tidy on empty weeks.
4. **`ScheduleGrid.jsx`** — both new components mounted directly below
   the existing helper caption (WeeklyShiftSummary first, then
   WeeklyRequestsPreview). Same `dates` array threaded into both;
   `requests` already in scope.
5. **`App.jsx`** — `__APP_SIGNATURE__` → version 1.6.0, build
   `2026-05-18`, sha `weekly-requests-effective-quota-settings-section`.
6. **`CLAUDE.md`** — three new locked-decision entries (Settings
   accordion persistence; weekly requests preview; effective quota
   semantics). File-structure annotations updated for `App.jsx`,
   `Settings.jsx`, `WeeklyShiftSummary.jsx`, `ScheduleGrid.jsx`, and
   the new `WeeklyRequestsPreview.jsx`.

### Verification

- `npm run dev` — Vite ran clean. Settings: opened Kitchen accordion
  → refresh → still on Kitchen. Sign-out + sign-in → back to default
  Operating time (sessionStorage scoped to the tab, not the auth
  session). Empty-week schedule: requests panel renders nothing
  (no chrome). Mixed-request week: panel lists each request once
  with the correct type pill colour.
- Effective quota: created a 5-day-week employee with a 2-day holiday
  inside the displayed week → pill reads "Name · 0 / 3" (raw 5 minus
  2 dayoff dates). Removing the holiday restores "Name · 0 / 5".
  Shift-preference requests left the pill unchanged (correct).
- Cross-feature regression: generator + clear + Details modal,
  manual picker, PDF export, dark mode — all behave as in v1.5.0.

---

## v1.5.0 — Session persistence + generator most-constrained-first ordering

**Date:** 2026-05-18
**Behavioural change:** Three small UX improvements + two workflow
rules. None of the code changes alter the data model; one is a
generator algorithm change that produces *better* schedules but
strictly within the existing constraint set.

1. **In-session tab + week persistence.** The open tab (Schedule /
   Employees / Requests / Settings) and the displayed week persist
   across refresh / Vite HMR within the same browser tab via
   `sessionStorage` under the `mgt-sched.*` key namespace. Closing the
   tab clears the values, so a fresh browser tab / new sign-in still
   defaults to Schedule + current week as before.
2. **Generator most-constrained-cell-first ordering.** The worklist's
   primary sort key is now the size of each cell's eligible candidate
   pool (`buildCandidates(...).eligible.length`), ascending. Cells with
   fewer qualifying employees get the versatile multi-role candidates,
   instead of an early easy cell consuming them and starving a hard
   cell later in the week. Existing keys (evening-before-day,
   role-rarity, date, slot-key) remain as deterministic tiebreakers.
3. **Workflow rule: Claude Code never runs `npm run preview`.** Locked
   in CLAUDE.md's Local-preview-server section. Only `npm run dev`;
   Patryk opens the localhost URL in his own browser. Eliminates the
   risk of pointing inspection at PROD.
4. **Workflow rule: keep the Claude-context folder in sync.** The
   "Sync the local working folder" deploy step now also copies
   `CLAUDE.md` + `REFACTOR_LOG.md` into
   `~/Desktop/megustastu-scheduling Claude context/`. That folder is
   what Patryk attaches to fresh chats; stale copies were the failure
   mode pre-v1.4.0.

Version bump to **1.5.0** — new persisted-state surface (tab + week)
is user-visible; the generator ordering change is also user-visible
in the sense that runs will produce different (better) schedules for
mixed-role staffs. Minor bump rather than patch.

### What landed

1. **`AppShell.jsx`** — lazy useState initializer + write effect for
   `tab` against `sessionStorage["mgt-sched.tab"]`. Stored value is
   validated against the live `TABS` array so a stale / hand-edited
   value falls back to `"schedule"`. All storage calls in try/catch
   so Safari private mode (sessionStorage throws on `setItem`)
   degrades gracefully.
2. **`ScheduleGrid.jsx`** — same pattern for `weekStart` against
   `sessionStorage["mgt-sched.weekStart"]` (stored as the ISO Monday
   date). Read path re-normalizes through `startOfWeek` so any drift
   self-heals. `parseIsoDate` added to the import list.
3. **`generator.js`** — worklist build site (line ~546) now calls
   `buildCandidates(...)` once per (date, slot) entry and stores
   `eligibleCount` on it. `compareWorklistEntries` gains
   `eligibleCount` as its new primary sort key (ascending).
   `clearInvalidShifts` and `rankCandidates` unchanged.
4. **`App.jsx`** — `__APP_SIGNATURE__` → version 1.5.0, build
   `2026-05-18`, sha `session-persistence-most-constrained`.
5. **`CLAUDE.md`** — two new locked-decision entries (session
   persistence; generator most-constrained-first ordering); file-
   structure annotations updated for `App.jsx`, `AppShell.jsx`,
   `ScheduleGrid.jsx`, `generator.js`; Local-preview-server section
   sharpened with the absolute no-`preview` rule; deploy step 13
   extended with the two `cp` lines for the context folder.

### What did NOT land

- **Mobile day-card today tint** — deferred to a future session.
- **15-second clock tick (`useNowMins.js`)** — still on the target
  file list, not built.
- **CSP-style dynamic constraint propagation in the generator.** The
  v1.5.0 ordering pre-computes eligibility once at worklist-build
  time; re-ranking after each greedy pick is a future option if
  symptoms surface. Problem size (≤49 cells/week) makes the
  pre-sort sufficient for now.

### Verification

- `npm run dev` — Vite ran clean. Tab persistence: clicked Settings →
  refresh → landed on Settings. Closed tab + new tab → landed on
  Schedule (default). Week persistence: navigated forward two weeks
  → refresh → still on that week. `Today` button still goes back to
  current.
- Generator: ran Fill empty on a partially populated week; no
  regressions, no new console warnings. Most-constrained-first
  ordering visible in the result banner's filled count when an
  intentional Chef+Bar mix is in play.
- Cross-feature regression: dark mode, picker filters, manual shift
  edits, PDF export, clear flow, generator details modal all behave
  as in v1.4.0.
- `npm run build` succeeded; main-bundle gz delta noted in the PR.

---

## v1.4.0 — Today tint + Generator result details

**Date:** 2026-05-18
**Behavioural change:** Two schedule-grid polish items bundled. One is
purely visual; the other is an information-only modal that surfaces
data the auto-generator already produced but threw away.

Vertical column rules were prototyped during this session and removed
before merge — they sliced section banners and didn't earn their
visual weight once the today-column tint was in place. Section header
keeps the `position: relative; zIndex: 1` stacking lift from that
prototype as defensive future-proofing for any later underlay.

1. **Today-column tint.** Today's column gets a soft `--accent-tint-soft`
   wash via a single underlay div with `gridColumn: <today+2>` and
   `gridRow: "1 / -1"`. Translucent cell backgrounds let the tint show
   through. Extends the existing today-pill highlight downward. No
   mobile counterpart this round.
3. **Generator result details modal.** Clicking "Details" on the
   generator result banner opens a modal grouped by reason, listing
   each unfilled cell and each cleared shift with a human-readable
   label. Reads from `summary.unfilledCells` and `summary.clearedReasons`
   (Regenerate only). Banner auto-dismiss is paused while the modal is
   open so closing the modal restores the banner cleanly.

Version bump to **1.4.0** — new user-visible feature surface (info
modal); the today-column tint is visual polish but warrants a minor
bump alongside the modal.

### What landed

1. **`GENERATOR_REASONS` map** in `src/lib/constants.js` — single source
   of truth for reason-code → human-readable label. Modal looks up the
   label; generator emits the bare code. Adding a code only touches
   one file.
2. **`generator.clearInvalidShifts.clear(id, reason)`** enriched —
   captures the pre-clear shift's `date`, `employeeId`, `section`,
   `dayPart`, `slotIndex`, `slotKey` so the result modal can render
   "Anna — Tue 19, Kitchen Day — archived" rows after the cleared
   record has been removed from Firebase. No algorithmic change.
3. **`GenerateResultsModal.jsx`** — NEW. Composes from `Overlay`,
   `Section`, `TBadge` (no new atoms). Groups entries by reason with
   stable first-seen insertion order. Cleared rows use a neutral
   palette; unfilled rows use the cancelled-status palette
   (informational vs actionable visual hierarchy).
4. **`ScheduleGrid.jsx`** — `slotsByKey` memo for the modal's slot
   lookup; `showResultsModal` state; "Details" button on the result
   banner (only renders when there's something to inspect); banner
   auto-dismiss effect now respects `showResultsModal`; today-column
   tint underlay div prepended to the desktop grid; `todayIndex`
   derived from `dates`. Section header gets `position: relative;
   zIndex: 1` so the absolutely-positioned tint underlay can never
   slice through the "Kitchen · Day" / "FoH · Evening" banners.
5. **`App.jsx`** — `__APP_SIGNATURE__` bumped to v1.4.0, sha
   `today-tint-result-details`, build `2026-05-18`.

### Files

- `src/App.jsx` — version bump.
- `src/lib/constants.js` — `+ GENERATOR_REASONS`.
- `src/lib/generator.js` — enriched `clear()` records.
- `src/components/GenerateResultsModal.jsx` — NEW (~180 lines).
- `src/components/ScheduleGrid.jsx` — today-tint underlay, Details
  button, modal mount, auto-dismiss guard, section header z-index
  lift.
- `CLAUDE.md` — locked-decision block for v1.4.0 features;
  ScheduleGrid + GenerateResultsModal + constants file-structure
  annotations.
- `REFACTOR_LOG.md` — this entry.

### Bundle delta

317 modules (+1: GenerateResultsModal). Main bundle:
**157.95 → 159.60 kB gz** (+1.65 kB). All three features in one bump.

### Verification

- `npm run build` — clean.
- Local dev server (`npm run dev`) on DEV Firebase — boots cleanly,
  v1.4.0 banner confirmed in console, login page renders.
- Visual + behavioural smoke-tests deferred to Vercel preview:
  today-column tint follows the current weekday, Details button on
  the banner only appears when reasons exist, modal lists are grouped
  by reason, modal close resumes banner auto-dismiss, dark mode
  renders correctly.

### Locked decisions (this session)

- **Vertical column rules dropped.** Initial prototype rendered a
  hairline between every pair of date columns. Two problems surfaced:
  (a) absolutely-positioned underlays sliced through the section
  banners until z-index was lifted (fixed mid-session); (b) once the
  today-column tint was in place, the rules added visual noise without
  earning their weight. Removed before merge. The section header's
  zIndex lift stays as defensive future-proofing for any subsequent
  underlay work.
- **Per-cell failure badges rejected** in favour of the on-demand
  modal. Per-cell badges would require persisting generator-run
  state per-cell, plus a cleanup story when the manager manually
  fills cells. Modal-on-demand is simpler and matches the v1
  "judgment wins" principle.
- **Cleared records enriched in `clear()`**, not via a parent-side
  snapshot. Generator owns the records at clear time; denormalizing
  at the source is cheaper and clearer than passing a snapshot of
  `weekShifts` through `onResult`.

---

## v1.3.0 — Per-day-part opening + Employee priority + "Operating time"

**Date:** 2026-05-17
**Behavioural change:** Three independent quality-of-life improvements
bundled into a single PR.

1. **Per-day-part opening hours.** `/settings.openingDays` was a
   per-weekday boolean (`{mon: true, tue: false, ...}`). v1.3.0 extends
   each weekday to `{day: bool, evening: bool}` so the restaurant can
   open for day shifts only or evening only on any weekday. Closed
   halves are skipped by the auto-generator's worklist + Regenerate
   pre-pass (reason `"closed-day-part"`), render as inert "Closed"
   placeholders on the desktop grid, get filtered out of the mobile
   day-card slot lists, and render as empty cells in the PDF. Legacy
   boolean docs auto-migrate at read time via the new
   `normalizeOpeningDays(raw)` helper (no Firebase write migration).
2. **Per-employee "Auto-generator priority"** boolean. When ON, the
   auto-generator picks that employee before any non-priority
   employee — new primary sort key in `rankCandidates`. Specialists,
   load-balance, and name only tiebreak within the priority and
   non-priority groups separately. Eligibility chain is unchanged
   (priority employees still need role match, request OK, fixedDays
   OK, quota OK, consecutive-off OK). Roster row carries a "Priority"
   badge for at-a-glance visibility.
3. **Settings rename** — top accordion section "Operating hours" →
   "Operating time" (label only; same internal `openSection === "hours"`
   key).

Version bump to **1.3.0** — new user-visible feature surface (per-day-
part picker + per-employee priority).

### What landed

1. **`DEFAULT_OPENING_DAYS` reshape** in `src/lib/constants.js` —
   per-day-part `{day, evening}` per weekday.
2. **`normalizeOpeningDays(raw)`, `isDateOpen(openingDays, date)`,
   `isSlotOpenOnDate(date, slot, openingDays)`** added to
   `src/lib/schedule-logic.js`. Legacy boolean shape accepted by
   the normalizer.
3. **`visibleWeekDates` + `isWeekComplete`** updated to consult
   the per-day-part normalized shape. A fully-closed day still drops
   from `visibleWeekDates`; a half-closed day stays visible but its
   closed half doesn't gate completeness.
4. **`generator.generateWeek` worklist** skips cells where the slot's
   dayPart is closed on that date (`isSlotOpenOnDate`).
5. **`generator.clearInvalidShifts`** gains a closed-day-part pass
   (reason `"closed-day-part"`) so Regenerate clears stale shifts
   when the manager closes a half after assigning.
6. **`generator.rankCandidates`** — new primary sort key
   `schedulingPriority` (true wins). Specialists, combined load,
   and name only tiebreak within the priority and non-priority
   groups separately.
7. **`pdf-export.buildTableBody`** — closed-dayPart cells render as
   empty strings within the otherwise-visible date column.
8. **`Settings.jsx` Open days picker rewrite.** Each weekday pill
   shows a state indicator (D·E / D / E / —). Tap opens an inline
   anchored popover with two `Toggle` rows (Day shifts / Evening
   shifts). Outside click + Escape close the popover. Form state
   always carries the normalized per-day-part shape; legacy boolean
   docs round-trip cleanly.
9. **`Settings.jsx` rename.** Accordion title "Operating hours" →
   "Operating time". Comments + docstring updated. Internal
   `openSection === "hours"` key unchanged so dirty-section
   force-open logic still works.
10. **`EmployeeFormModal.jsx`** — `schedulingPriority` added to
    `emptyForm()`, `formFromEmployee(emp)`, and `handleSave()`'s
    payload. New "Auto-generator priority" Fld with a pill toggle +
    helper line.
11. **`EmployeesList.jsx`** — small "Priority" badge in the role-chip
    row when `emp.schedulingPriority === true`.
12. **`ScheduleGrid.jsx`** — new `renderClosedCell(date, slot)`
    helper. Desktop grid renders inert closed cells; mobile
    day-cards pre-filter the slot list per date so section headers
    only show for sections with open slots that day. Empty-state
    notice pointer updated to "Operating time".
13. **`__APP_SIGNATURE__` → `1.3.0`** (sha
    `perday-opening-priority-operating-time`).
14. **CLAUDE.md updated** — Opening-days, Settings layout, data
    model, and file-structure annotations reflect the per-day-part
    shape, schedulingPriority field, and renamed section.

### Why bundle

Three small features that don't depend on each other; merging
sequentially would mean three Vercel redeploys and three PR
round-trips for what reads as one coherent "v1.3.0 — Operating
time refinements + employee priority" line on the user-facing
changelog. Same bundling judgment that landed v1.0.0+v1.1.0+v1.2.0
in PR #14.

### Verification

- `npm run build` succeeded; bundle gz delta from 156.81 kB.
- Local DEV smoke (Vite at http://localhost:5173/, hot-reload):
  - Settings → Operating time renames correctly; pills cycle through
    state indicators; popover opens/closes on outside click + Esc.
  - Toggling Mon evening off shrinks the desktop grid's Mon column
    to day-only cells (evening rows become "Closed" placeholders);
    PDF export remains enabled once the open cells are filled.
  - Empty week + Generate fills cells respecting closed-dayPart;
    Regenerate clears stale closed-dayPart shifts (reason
    `"closed-day-part"`).
  - Employee with Priority ON gets picked before non-priority
    employees on the empty week.
  - Legacy `openingDays: {mon: true, tue: false, ...}` boolean doc
    in DEV Firebase renders correctly (the normalizer migrates on
    read).
- Production smoke pending Vercel auto-deploy.

---

## v1.2.0 — Shift-preference request + Consecutive-off rule + Weekly summary

**Date:** 2026-05-17
**Behavioural change:** Three additions layered on the v1.1.0
auto-generator work.

1. **Weekly shifts summary footer.** New `<WeeklyShiftSummary>`
   panel under the schedule grid. One compact pill per active
   employee (plus any archived employee with shifts on the week):
   "Name · N / quota". Sorted by under-utilization ratio asc, then
   name. Visual cues: zero count → muted; under quota → soft accent
   tint; at/over → neutral. Reads from the existing `employees` +
   `weekShifts` props — no new state.
2. **New REQUEST_TYPE `shift-preference`** (Day or Evening). Lets
   the manager record "this employee can only work day (or evening)
   shifts on these dates." Enforcement is **HARD** in the
   auto-generator and in Regenerate's clearInvalidShifts pass;
   **SOFT** yellow warning in the manual picker. Request record
   gains an optional `preferredDayPart: "day" | "evening"` field.
3. **At least 2 consecutive days off per week**, a labor wellness
   rule. **HARD** in the generator (any candidate whose resulting
   pattern would lack a 2-day off run is rejected, reason
   `"no-2-off"`) and in `clearInvalidShifts` (over-budget shifts
   cleared latest-date first). **SOFT** in the manual picker (yellow
   non-blocking warning). Closed days count as off. Calendar week
   only (no cross-week wrapping).

Version bump to **1.2.0** — new feature surface area (new request
type, new constraint, new UI panel) warrants the minor.

### What landed

1. **`REQUEST_TYPES` extended** in `src/lib/constants.js` with a
   third entry `shift-preference`.
2. **Type-guarded `findRequestConflict`** in
   `src/lib/schedule-logic.js` — only `dayoff` and `holiday` block;
   shift-preference is handled separately. Constant
   `BLOCKING_REQUEST_TYPES` documents the set.
3. **New `findShiftPreferenceMismatch(requestsMap, employeeId,
   dateIso, dayPart)`** — returns the conflicting request when an
   employee's "day only" / "evening only" preference contradicts
   the slot's dayPart.
4. **New `hasConsecutiveDaysOff(employeeId, weekStart, shiftsMap,
   minN=2)`** — pure helper. Builds a Mon..Sun working-bitmap and
   scans for a run of consecutive off cells.
5. **`generator.buildCandidates` adds two filter steps**
   (HARD blocks): shift-preference mismatch (reason
   `"all-shift-pref"`) and consecutive-off rule break (reason
   `"no-2-off"`). Signature now includes `weekStart` so the
   consecutive-off simulation can iterate the calendar week.
6. **`generator.clearInvalidShifts` extended** for Regenerate:
   - Per-shift filter clears shift-preference mismatches (reason
     `"shift-preference"`).
   - New post-pass clears latest-date shifts for any employee whose
     remaining pattern violates the consecutive-off rule (reason
     `"no-2-off"`).
7. **`RequestFormModal` Day/Evening sub-choice.** Conditionally
   renders a segmented `Day shifts only / Evening shifts only` row
   when `form.type === "shift-preference"`. Validation requires the
   field for the new type. Save payload includes
   `preferredDayPart` only for the matching type.
8. **`RequestsList` secondary line** under the date range:
   "Day shifts only" / "Evening shifts only" for shift-preference
   rows.
9. **`ShiftFormModal` warning banner extended.** Now also fires for
   shift-preference mismatch and for a consecutive-off rule break
   on the proposed assignment. Banners stack under the picker. All
   three are yellow / non-blocking — manager judgment wins.
10. **NEW `WeeklyShiftSummary.jsx`** — footer panel rendered after
    the helper caption in `ScheduleGrid`. Receives `employees`,
    `weekShifts`, `weekLabel`. Pure presentation; counts derive
    locally.
11. **`__APP_SIGNATURE__` → `1.2.0`** (sha
    `shift-preference-consecutive-off-summary`, build
    `2026-05-17`).

### Decisions locked this version

- **Shift-preference is HARD in the generator, SOFT in the picker.**
  Same pattern as dayoff / holiday — automation respects, manager
  judgment wins.
- **Single new request type with sub-choice** instead of two parallel
  types ("Day shift only" + "Evening shift only"). Cleaner type list
  in the segmented row; sub-choice nests under the type field.
- **Consecutive-off evaluated within Mon..Sun, no cross-week
  wrap.** Each week independent — keeps the rule evaluable without
  loading a 14-day window.
- **Closed days count as off.** Reduces the schedulable budget by
  default, making the rule trivially satisfiable on weeks with
  multiple closed days.
- **Regenerate clears LATEST-date shifts to satisfy the off rule.**
  Same deterministic heuristic as the quota over-cap pass.
- **Summary panel placement: footer.** Right sidebar / cell-inline /
  separate tab all rejected in clarification. Footer keeps the grid
  uncluttered and the summary visible without navigation.
- **Summary format: `N / quota` per employee.** Bare count rejected
  (loses the quota context); breakdown by dayPart rejected
  (doubles visual weight).

### Files changed

NEW:
- `src/components/WeeklyShiftSummary.jsx`

MODIFIED:
- `src/lib/constants.js` — `REQUEST_TYPES` gets `shift-preference`.
- `src/lib/schedule-logic.js` — guard `findRequestConflict`; add
  `findShiftPreferenceMismatch`, `hasConsecutiveDaysOff`.
- `src/lib/generator.js` — `buildCandidates` filter steps + signature
  gains `weekStart`. `clearInvalidShifts` extended for both new
  rules; `clearInvalidShifts` accepts `weekStart`.
- `src/components/RequestFormModal.jsx` — Day/Evening sub-choice +
  validation + save.
- `src/components/RequestsList.jsx` — secondary line for
  shift-preference.
- `src/components/ShiftFormModal.jsx` — three stacked warning
  banners (existing dayoff/holiday + new shift-preference + new
  consecutive-off).
- `src/components/ScheduleGrid.jsx` — render `<WeeklyShiftSummary>`
  under the helper caption.
- `src/App.jsx` — version bump to `1.2.0`.
- `CLAUDE.md` — locked decisions, data-model block, file-structure
  annotations.

### Verification

- `npm run build` clean. 316 modules (was 315). Main bundle:
  **156.81 kB gz** (+1.31 kB vs v1.1.0).
- Footer summary updates per week navigation; under-utilized rows
  visually tinted.
- Shift-preference Day request blocks Evening cells for that
  employee in the generator + Regenerate; picker shows the warning
  banner but allows save.
- Consecutive-off rule limits the generator's per-employee
  assignments so each has a ≥2-day off run; manual picker shows
  warning when the choice would break the rule.
- Regenerate clears stale shifts that violate either new rule.

---

## v1.1.0 — Day-shift required role + Regenerate + Clear + Prior-week fairness

**Date:** 2026-05-16
**Behavioural change:** Four refinements after smoke-testing v1.0.0.

1. **Kitchen Day requires Chef.** A new per-section
   `dayRequiredRoles` field gates day-shift eligibility. Kitchen Day
   declares `["Chef"]` — Plating-only or Pot-only employees no
   longer qualify, neither in the manual picker nor in the
   auto-generator. FoH Day declares nothing and stays permissive
   (any of Bar / Floor).
2. **Regenerate mode.** The Generate confirm modal now exposes two
   action buttons: "Fill empty" (v1.0.0 behaviour) and "Regenerate"
   (smart re-evaluate). Regenerate walks every existing shift, clears
   any that violate current constraints (failed role, new request,
   fixedDays change, preference flip in Hard mode, quota over-cap,
   closed day, archived employee, etc.), then runs the standard
   fill-empty pass on the survivors.
3. **Clear-shifts button.** New "Clear…" button in the Schedule
   nav bar between Generate and Export. Opens a modal with a scope
   picker (Whole week, or one button per open day), each showing the
   live shift count. Red destructive confirm.
4. **Prior-week fairness.** The generator now considers last week's
   shift counts when ranking candidates. Sort key changed from
   "specialists → current-week count → name" to "specialists →
   combined (current + prior week) load → name". Employees who
   worked many shifts last week get picked later this week until
   their two-week totals roughly match peers. Most weeks balance
   themselves over a 2-week window without manual intervention.
   History window: 7 days only (longer would let stale data linger
   and overcorrect for runs the manager already hand-balanced).

Major / minor decision: **MINOR** bump (1.0.0 → 1.1.0). New features
(Regenerate, Clear) plus a behavioural change (Kitchen Day stricter)
warrant more than a patch.

### What landed

1. **`SECTIONS.kitchen.dayRequiredRoles = ["Chef"]`** in
   `src/lib/constants.js`. Optional field — sections without it keep
   the permissive day-shift rule.
2. **`slotsForDay` propagates `requiredRoles`** onto each day slot
   in `src/lib/schedule-logic.js`. Single source of truth — both
   consumers (manual picker + generator) read from the slot.
3. **Manual picker honours `requiredRoles`** in
   `src/components/ShiftFormModal.jsx` (the eligibility chain). When
   `requiredRoles.length > 0`, employee must hold AT LEAST ONE
   required role. Empty / undefined → fallback to the permissive
   "any of coversRoles" rule.
4. **Generator `roleMatches` honours `requiredRoles`** in
   `src/lib/generator.js`. Same precedence as the picker — same
   eligibility verdict.
5. **`generateWeek({ mode })` extension.** New `mode` argument
   (default `"fill-empty"`, accepts `"regenerate"`). Regenerate runs
   a new `clearInvalidShifts` pre-pass that walks every existing
   shift in the working map and clears any that fail today's
   constraints. Pre-pass checks (in order): closed-day, unassigned,
   slot-removed, no-employee, archived, no-role-match, on-request,
   fixed-days, preference (Hard mode only), same-day duplicate,
   workplace-quota over-cap (clears latest-date surplus). Returns
   `clearedShiftIds: [id, …]` for the caller to `deleteShift`.
   Summary type extended with `cleared` count + `clearedReasons`
   list (the latter is captured for future debug UI, not yet
   surfaced).
6. **`GenerateConfirmModal.jsx` two-button row.** Cancel + Regenerate
   (secondary) + Fill empty (primary). Explainer card above the
   buttons clarifies the difference. Both action buttons call
   `onConfirm(mode)`.
7. **`GenerateButton.handleConfirm(mode)`** forwards mode to the
   algorithm. Regenerate path runs `deleteShift` for every
   `clearedShiftIds` entry before the upsert loop. Summary handed
   back to the grid banner with `mode` embedded.
8. **NEW `ClearConfirmModal.jsx`.** Scope picker with live shift
   counts (Whole week + one button per open day). Closed days don't
   appear. Confirm is BTN.danger labelled "Clear N shifts" once a
   scope is picked.
9. **NEW `ClearButton.jsx`.** Schedule nav-bar entry point. Opens
   the modal; on confirm, computes the affected shift IDs locally
   and loops `deleteShift`. Fires `onResult({ cleared, kind })`.
10. **`ScheduleGrid.jsx` integration.** ClearButton slots between
    Generate and Export. Unified result-banner state replaces
    v1.0.0's `generateResult` — both Generate and Clear now feed the
    same banner slot via discriminated summary shapes
    (`{mode}=generator`, `{kind}=clear`). + memoized
    `priorWeekShifts` (shiftsForWeek of `weekStart − 7 days`)
    threaded into GenerateButton.
11. **`generator.rankCandidates` takes `priorShifts`** and uses
    combined load (`currentCount + priorCount`) as the secondary
    sort dimension. Empty / missing prior map degrades cleanly to
    zero counts.
12. **`__APP_SIGNATURE__` → `1.1.0`** (sha
    `regenerate-clear-required-role`, build `2026-05-16`).

### Decisions locked this version

- **Kitchen Day requires Chef.** Plating-only or Pot-only employees
  cannot lead the day shift. Chef is the lead role for prep across
  all three stations. Encoded as `SECTIONS.kitchen.dayRequiredRoles
  = ["Chef"]` — single source, both consumers read from the slot.
- **FoH Day unchanged.** No required role for FoH; any of Bar /
  Floor qualifies. Patryk explicitly preserved the v1.0 rule for
  this section.
- **Regenerate = pre-pass clear + fill-empty.** A two-phase
  algorithm keeps the fill-empty pass identical and isolates the
  "what to clear" decision in one helper. Easier to test / extend.
- **Quota over-cap clears latest dates.** Deterministic rule for the
  rare case where pre-existing shifts blow the cap. Avoids
  "we cleared an arbitrary cell" surprises.
- **Soft preference + Regenerate.** Pref-mismatched assignments
  survive in Soft mode. Only Hard mode clears them. Soft is
  permissive by definition.
- **Clear UX = single button → scope modal.** Cleaner than two
  buttons (week + day) on the nav bar. Day-level clicks happen
  inside the modal where the affected count is visible.
- **Unified banner.** One auto-dismissing banner for both Generate
  and Clear summaries. Two parallel banner states would double
  the dismiss logic without UX benefit.
- **Prior-week fairness = combined load, 7-day window.** Sum of
  current-week + prior-week shift counts as the secondary sort key.
  History stops at 7 days because longer windows risk
  overcorrecting for runs the manager already hand-balanced.

### Files changed

NEW:
- `src/components/ClearConfirmModal.jsx`
- `src/components/ClearButton.jsx`

MODIFIED:
- `src/lib/constants.js` — `SECTIONS.kitchen.dayRequiredRoles`.
- `src/lib/schedule-logic.js` — `slotsForDay` emits `requiredRoles`
  on each day slot.
- `src/lib/generator.js` — `roleMatches` honours `requiredRoles`;
  `generateWeek({ mode })` + `clearInvalidShifts` pre-pass;
  `clearedShiftIds` in the return shape. + `priorWeekShifts` arg
  and combined-load ranking in `rankCandidates`.
- `src/components/ShiftFormModal.jsx` — picker chain honours
  `slotDef.requiredRoles`.
- `src/components/GenerateConfirmModal.jsx` — two-button bottom row
  + explainer.
- `src/components/GenerateButton.jsx` — `handleConfirm(mode)` +
  `deleteShift` loop for `clearedShiftIds`. + `priorWeekShifts`
  prop, forwarded to `generateWeek`.
- `src/components/ScheduleGrid.jsx` — `<ClearButton>` in nav bar;
  unified result banner; copy branches on summary shape. +
  memoized `priorWeekShifts` (prior 7-day slice of `shifts`), passed
  into `<GenerateButton>`.
- `src/App.jsx` — version bump to `1.1.0`.
- `CLAUDE.md` — locked decisions, file-structure annotations.

### Verification

- `npm run build` clean. 315 modules (was 313). Main bundle:
  **155.43 kB gz** (+1.91 kB vs v1.0.0).
- Kitchen Day: Plating-only employee absent from the picker dropdown
  and never auto-assigned. Chef-only employee appears + is picked.
  FoH Day: Bar-only employee still qualifies (rule unchanged).
- Regenerate after adding a holiday request: the affected
  employee's Tuesday shifts are cleared and re-filled. Banner copy:
  "Cleared X stale, filled Y, Z left empty for <range>."
- Clear week: every shift deleted; banner reports "Cleared N
  shifts." Clear day: only the selected day cleared.
- Confirm modal busy state: "Working…" label on action buttons
  while writes flush.
- Closed-day scope: Mon does not appear in the Clear modal when
  Settings has Mon off.
- Prior-week fairness: seed two employees with equal roles where
  one has 5 shifts last week and the other has 2. New-week Generate
  picks the under-utilized employee first; assignments end up
  balanced across two-week totals.

---

## v1.0.0 — Auto-generator

**Date:** 2026-05-16
**Behavioural change:** The big parking-lot item lands. A new
"Generate" button in the Schedule grid's week-nav bar opens a confirm
modal; clicking Generate fills every empty cell in the displayed week
respecting the same constraint chain the manual picker enforces. After
the run, an auto-dismissing banner above the grid reports
"Filled X cells, Y left empty."

The algorithm is greedy + constraint-aware. It leaves cells empty
rather than violating rules (the locked v1 stance). Existing shifts
(with employeeId set) are never overwritten — the manager has to clear
a cell to make it eligible for re-generation.

### What landed

1. **`src/lib/generator.js` (NEW).** Pure algorithm.
   `generateWeek({weekStart, weekShifts, employees, requests,
   shiftTemplate, openingDays, strictPreference})` →
   `{newShifts: [...], summary: {filled, unfilled, total,
   unfilledCells: [{dateIso, slotKey, reason}]}}`. No React, no
   Firebase. The caller (`GenerateButton`) iterates `newShifts` and
   persists each via the existing `actions.upsertShift`. Splitting
   the algorithm from persistence keeps the write-guard in
   `usePersistence.js` and makes the algorithm trivially unit-testable
   in the future.
2. **Constraint chain (mirrors `ShiftFormModal.jsx` lines 108–165).**
   Per cell, in order:
   - Active + role match (day → any section coversRole; evening →
     specific `slotDef.defaultRole`, or any `eligibleRoles` when
     defaultRole is null).
   - Request conflict — **HARD block** (`findRequestConflict`).
   - Same-day strict (`findSameDayShift`) + fixedDays gate
     (`weekdayKeyForDate` × `employee.fixedDays`).
   - Working-days quota (`countAssignedDates < workingDaysPerWeek ?? 5`).
   - Preference (see below).
3. **Worklist ordering (constraint propagation).** Evening slots first
   (specific role required), sorted by role rarity (number of active
   employees holding that role, ascending — rarest first). Then day
   slots. Within each priority bucket, by date then by slot key.
   Fills the hardest constraints while options still exist.
4. **Candidate ranking** (after eligibility filter): specialists
   first (`roles.length` ascending), load balance (current weekly
   assigned count ascending), name tie-break. Same heuristic as the
   manual picker so generator-assigned cells match what a careful
   manager would pick themselves.
5. **Preference handling — switchable in Settings.** New
   `/settings.generatorStrictPreference` boolean (default false).
   - Soft (default): Pass 1 = preference-matching only. If empty,
     Pass 2 = drop the preference filter.
   - Hard: only Pass 1. Cell stays empty with reason `"preference"`
     when no preferred candidate fits.
6. **`src/components/GenerateConfirmModal.jsx` (NEW).** Confirm
   dialog using the `Overlay` atom. Body explains what the generator
   will do (bullet list) and surfaces the current preference mode.
   Cancel is disabled while a run is in flight to avoid mid-write
   close. Generate button shows "Generating…" during the loop.
7. **`src/components/GenerateButton.jsx` (NEW).** Owns the modal
   state, the `upsertShift` loop, and the busy spinner. Wraps the
   algorithm + writes in a `Promise.resolve().then(...)` so the
   "Generating…" label paints before we block on writes. Disabled
   when `shiftTemplate` is null or there are zero employees;
   tooltip explains why.
8. **`ScheduleGrid.jsx` rendering.** `GenerateButton` slots into the
   week-nav bar between the week-range label and `ExportButton`.
   Result banner state lives in the grid (auto-dismisses after 5s
   via `useEffect` + `setTimeout`; manual "×" dismiss). Banner uses
   `var(--accent-tint-soft)` so it retunes for dark mode.
9. **`Settings.jsx`.** New "Auto-generator" accordion section between
   Display and FoH. Single `Toggle` for "Strict shift-preference
   matching" — auto-saves on flip (same pattern as the Display
   toggles). Reset to defaults clears it back to false.
10. **`constants.js`.** + `DEFAULT_GENERATOR_STRICT_PREFERENCE =
    false`. Aligns with the existing fallback-constant pattern for
    `DEFAULT_OPENING_DAYS` / `DEFAULT_WORKING_DAYS`.
11. **`__APP_SIGNATURE__` → `1.0.0`** (sha `auto-generator`, build
    `2026-05-16`). Major version bump — the v1.0 milestone "manual
    scheduling + auto-generator" is now feature-complete.

### Decisions locked this version

- **Re-run = fill-empty only.** Existing shifts (with employeeId set)
  are skipped. To full-regenerate, the manager clears cells first.
  Rationale: never destroy a manual edit by accident; the manager
  retains authority.
- **Requests = HARD block.** Generator never auto-assigns over a
  day-off / holiday request. Manager can still override manually via
  the picker modal's "Show staff on day off / holiday" toggle.
  Rationale: automation must respect human approvals.
- **Preference = switchable Soft/Hard** in Settings (default Soft).
  Soft is permissive (try preferred first, fall back). Hard leaves
  cells empty when no preferred candidate fits. Surfaced as a
  manager-tunable knob rather than hardcoded so each restaurant can
  match its culture.
- **Banner over modal.** Inline auto-dismissing summary banner above
  the grid; no detailed per-cell failure modal in v1.0.0. Reasons
  are captured in the summary object for future debug UI.
- **Pure algorithm in `src/lib/generator.js`.** No Firebase, no
  React. Caller loops `upsertShift` to persist. Keeps the write-guard
  centralized and makes the algorithm reusable / testable.
- **Specialists-first + load-balance ranking** (same as picker). Lets
  the generator pick the same employee a careful manager would.

### Files changed

- `src/lib/constants.js` — `+DEFAULT_GENERATOR_STRICT_PREFERENCE`.
- `src/lib/generator.js` — NEW (~200 lines).
- `src/components/GenerateButton.jsx` — NEW.
- `src/components/GenerateConfirmModal.jsx` — NEW.
- `src/components/ScheduleGrid.jsx` — wire `GenerateButton` into the
  nav bar; result-banner state + auto-dismiss; strict-preference
  read from settings.
- `src/components/Settings.jsx` — new "Auto-generator" accordion
  section; strict-preference auto-save handler; Reset-to-defaults
  includes the new field.
- `src/App.jsx` — version bump to `1.0.0`.
- `CLAUDE.md` — locked-decisions update (auto-generator from
  "deferred" → "shipped"), data-model block, file-structure block,
  removed auto-generator from out-of-scope list.

### Verification

- `npm run build` succeeds. 313 modules (was 310). Main bundle:
  **153.52 kB gz** (+2.37 kB vs v0.12.0). New code adds the generator
  module + the two new components.
- Empty week + 5 mixed-role employees → Generate → cells fill;
  banner reports filled/unfilled. No employee has two shifts on
  the same date; preference roughly respected; no request conflicts.
- Partially filled week → Generate → only empty cells get filled,
  manual ones unchanged.
- Settings → Auto-generator → toggle Hard ON → a "day"-preference
  employee never lands in an evening slot (cell stays empty).
- Holiday request covering Tuesday → that employee never appears
  on Tuesday after Generate.
- `workingDaysPerWeek = 3` → employee assigned at most 3 days.
- Closed Monday → no Monday cells are created.
- Re-run on a full week → "Nothing to fill — every open-day cell
  already has a shift."

---

## v0.12.0 — Opening days + per-employee work pattern

**Date:** 2026-05-16
**Behavioural change:** Two related additions.

1. **Opening days** in Settings → Operating Hours. Manager picks a
   per-weekday boolean map (`{ mon, tue, … sun }`). Closed days
   disappear from the weekly schedule grid (desktop columns + mobile
   day-cards) and from the PDF export. Validation requires at least
   one open day. Defaults to all-true so legacy `/settings` docs
   without the field render a full 7-day week.

2. **Per-employee work pattern.** Every employee gets a
   `workingDaysPerWeek` field (1..7, default 5). Off-days are derived
   (`7 − N`). v0.12.0 just stores + displays the pattern (segmented
   1..7 control in the edit form with a live "N working / M off"
   helper; `Pattern: N/M` line on the roster row). The
   field is NOT consumed by any scheduling logic yet — the
   auto-generator (v1.x) is the primary consumer.

### What landed

1. **`DEFAULT_OPENING_DAYS` + `DEFAULT_WORKING_DAYS` constants** in
   `src/lib/constants.js`. Single source for the fallbacks used by
   every read site.
2. **`visibleWeekDates(weekStart, openingDays)` + helper
   `weekdayKeyForDate(date)`** in `src/lib/schedule-logic.js`. Pure
   filter wrapping the existing `weekDates()` — undefined
   `openingDays` short-circuits to all 7 days for pre-v0.12.0
   compatibility.
3. **`isWeekComplete` updated** to take `openingDays` and skip closed
   days. Returns false when zero days are open so the Export-PDF
   button stays disabled rather than emitting an empty rota.
4. **Settings opening-days picker.** Inside the Operating Hours
   `Collapsible`, under the time fields: a weekday pill row using the
   same styling as `EmployeeFormModal`'s fixed-days picker.
   Validation = ≥1 open day; error message inline, error force-opens
   the Hours section. Dirty tracking combines hours + open-days into a
   single `operatingDirty` flag for the section header dot. Saved as
   part of the same Save click as operating hours.
5. **`ScheduleGrid` filters dates.** Reads
   `settings.openingDays ?? DEFAULT_OPENING_DAYS`. Desktop
   `gridTemplateColumns` becomes `"120px repeat(${dates.length}, …)"`
   — column count is data-driven. `minWidth` scales with column
   count so a 5-day week doesn't force a horizontal scrollbar. Mobile
   stack naturally narrows because it iterates the filtered date
   list. Defensive "No open days configured" empty-state when
   `dates.length === 0`.
6. **`pdf-export.js` accepts `openingDays`.** Uses `visibleWeekDates`
   for the table head + body iteration. Filename date range derives
   from `dates[0]` / `dates[dates.length-1]` (was `dates[6]`, would
   have errored with fewer than 7 dates).
7. **`ExportButton` forwards `openingDays`** to both `isWeekComplete`
   and `exportWeekPdf`. The button enables when every cell on every
   OPEN day is filled.
8. **`EmployeeFormModal` gets the working-days segmented row.** New
   field placed between "Shift preference" and "Fixed working days".
   1..7 segmented control with live "N working / M off" helper line.
   Legacy / out-of-range stored values clamp to the default (5) on
   read.
9. **`EmployeesList` shows `Pattern: N/M`** on each roster row, below
   the role chips, above the fixed-days summary. Falls back to the
   default 5/2 for employees without the field.
10. **`__APP_SIGNATURE__` → 0.12.0** (sha `opening-days-work-pattern`,
    build `2026-05-16`).

**Scope:** 8 source files + 2 docs (CLAUDE.md, this log). New data
fields are both optional with sensible read-time fallbacks — no
migration needed for existing /employees or /settings docs.

### Files modified

- `src/lib/constants.js` — `DEFAULT_OPENING_DAYS`, `DEFAULT_WORKING_DAYS`.
- `src/lib/schedule-logic.js` — `weekdayKeyForDate`,
  `visibleWeekDates`, `isWeekComplete(openingDays)`.
- `src/lib/pdf-export.js` — accepts `openingDays`; uses
  `visibleWeekDates`; safer filename date range.
- `src/components/Settings.jsx` — opening-days picker inside Operating
  Hours; validation; dirty flag; reset includes the new field.
- `src/components/ScheduleGrid.jsx` — opening-days resolve + filter;
  data-driven desktop grid columns; empty-state.
- `src/components/ExportButton.jsx` — accepts + forwards
  `openingDays`.
- `src/components/EmployeeFormModal.jsx` — working-days segmented
  control + payload field.
- `src/components/EmployeesList.jsx` — Pattern N/M row.
- `src/App.jsx` — version bump to 0.12.0.
- `CLAUDE.md` — file-structure annotations, data-model block, two
  new locked decisions (Opening days, Per-employee work pattern),
  updated work-pattern + employee-profile-fields decisions.

### Decisions locked this version

- **Per-employee pattern shape: single number.** Off-days derive as
  `7 − N`. Rejected alternatives: pattern picker (`5/2`, `6/1`, …),
  separate work/off numbers (cycle ≠ 7). Reason: simplicity; the
  Settings + employee model are weekly, not cyclic.
- **Opening-days placement: inside Operating Hours section.** Keeps
  total accordion sections at 4. Both define when the restaurant is
  open — conceptually grouped.
- **v1.0 surfacing: opening days filter, work pattern displays
  only.** Opening days are a hard filter (must-have effect). Work
  pattern is stored for the auto-generator (v1.x) and surfaced as a
  small helper, but does NOT block assignments or warn on
  over/under-assignment yet.
- **PDF zebra-stripe column indices stay absolute (2 / 4 / 6).**
  After a closure they fall on alternating visible columns rather
  than specifically Tue / Thu / Sat — acceptable since the goal is
  print readability, not specific weekdays.
- **Existing shifts on newly-closed days remain in Firebase.** They
  are hidden from the grid + PDF but not deleted; the manager
  re-opens the day to see / clear them. Not surfaced as a warning
  in v0.12.0 (low-frequency, manager-driven config change).

### Verification

- `npm run build` succeeds.
- Settings → Operating Hours → toggle Monday OFF → Save → Monday
  column drops from the desktop grid; Monday card drops from mobile;
  PDF export omits Monday.
- All 7 days off → Save shows inline error, save blocked.
- Reload → opening-days choice persists.
- Employees → Add → "Working days per week" defaults to 5; helper
  reads "5 working / 2 off". Change to 4 → helper updates to "4
  working / 3 off". Saved value renders as "Pattern: 4/3" on the
  roster row.
- Pre-v0.12.0 employees show "Pattern: 5/2" without any Firebase
  migration.
- Console boot banner: `v0.12.0`;
  `window.__MGT_SCHED_BUILD__.version === "0.12.0"`.

---

## v0.11.0 — Dark mode (CSS vars + system-pref follow) + PDF polish

**Date:** 2026-05-15 → 2026-05-16
**Behavioural change:** New theming model. Adds a Dark mode Toggle in
Settings → Display. Default = follow OS `prefers-color-scheme`; flipping
the toggle saves an explicit boolean that overrides system pref from
that point on. PDF export stays light regardless.

Underneath: every visual token now reads from a CSS custom property.
`:root` in `index.html` holds light values; `[data-theme="dark"]`
overrides for dark. Theme flip = one DOM attribute change. Zero React
re-renders.

### What landed

1. **CSS variable token system.** `index.html` carries a `:root` +
   `[data-theme="dark"]` block defining ~80 tokens covering body,
   card, soft surface, input, text, accent, status palette, role
   channels, hairlines, button states, overlay, danger/warning
   surfaces, employee status pill, Toggle atom, dot glow, and shadows.
2. **`constants.js` refactor.** Every value in `S`, `BTN`,
   `STATUS_COLORS`, `ROLE_COLORS` now references `var(--…)` strings.
   Zero rgba/hex literals remain in JS. ROLE_COLORS specifically
   holds RGB channel triplets (`"var(--role-bar-rgb)"`) so callers
   keep the alpha-on-the-fly composition pattern via
   `rgba(${rgb}, 0.2)`.
3. **`useThemeMode` hook.** New file. Takes an `explicitPref` (true /
   false / undefined) and writes `data-theme`. When undefined,
   subscribes to `prefers-color-scheme` so OS-level theme flips
   propagate live. Returns the resolved `isDark` for the caller.
4. **AppShell wires the hook.** Reads `data.settings?.darkMode`,
   passes to `useThemeMode`, then forwards `isDark` to Settings as
   a prop.
5. **Settings → Display gets the Toggle.** Auto-saves the boolean
   like the Show role pills toggle. Helper line reads "Following
   your system preference. Tap to override." while
   `settings.darkMode === undefined`; collapses once explicit.
6. **Component-level inline literals removed.** Every component file
   that previously hardcoded rgba/hex (AppShell tab nav, LoginScreen
   card + error banner, ScheduleGrid v0.10.2 colours, atoms Overlay /
   Collapsible dot / Toggle track + knob, ShiftFormModal banners +
   role chips, EmployeeFormModal role/weekday/preference segments +
   active/fixedDays pills, EmployeesList + RequestsList rows,
   RequestFormModal type segments + error text, Settings error
   text) now references CSS vars.
7. **No-flash inline script.** `index.html` runs a tiny IIFE before
   React mounts that reads `prefers-color-scheme` and sets
   `data-theme` so the page doesn't paint the wrong theme during
   the JS boot.
8. **Dark palette tuning.** Status colours, role channels, accent,
   surfaces all retuned for dark backgrounds (Apple system dark
   variants where applicable — systemBlue → #0A84FF, systemOrange
   dark → #FFB340, etc).
9. **Late-session UI polish.** Drop shadow (`--shadow-soft`) cascaded
   to the Employees + Requests list rows, every chip / section / cell
   in the Schedule grid (date pills, banded section headers, label
   chips, shift cells), and the entire button system (via `BTN.base`).
   Schedule section headers bumped to fontWeight 800 + fontSize 12 +
   text-primary colour for stronger emphasis. The shadow uses
   `var(--shadow-soft)` so it auto-retunes for dark mode.
10. **PDF generator reworked to mirror the UI layout (light only —
    print legibility).**
    - Section dividers now fire on every (section, dayPart) boundary
      (4 bands: "KITCHEN · DAY", "KITCHEN · EVENING", "FRONT OF
      HOUSE · DAY", "FRONT OF HOUSE · EVENING") instead of one per
      section. Centred uppercase, regular weight on darker grey fill.
    - Body cell employee names rendered **bold** for emphasis.
    - Date header row + label column polished (slightly more padding,
      label column gets its own off-white fill).
    - Zebra striping: Tuesday / Thursday / Saturday columns get a
      subtle darker fill (`[243, 243, 247]`) so the seven-day grid
      reads at print resolution.
    - Vertical (column) borders bumped to 1.2pt; horizontals stay
      0.4pt. Column dividers dominate the grid as in the UI.
    - PDF stays light regardless of in-app theme — locked decision
      reaffirmed for print legibility / ink economics. `pdf-export.js`
      contains zero CSS var refs.
11. **Workflow rule codified (CLAUDE.md → Local preview server —
    MANDATORY).** Visual sessions must start `npm run preview` at
    the beginning and keep it running. After each change: rebuild,
    hard-refresh. `npm run dev` is avoided because the DEV Firebase
    project has unreliable auth (`auth/invalid-credential` errors
    during this session). Preview hits PROD — read-only inspection
    flow, no Save clicks during pure visual review. Memory backstop
    saved to `feedback_local_preview_mandatory.md`.

**Scope:** ~14 source files + 2 docs. Pure visual / theming —
zero data-model or persistence changes (apart from a new optional
`settings.darkMode` boolean).

### Files modified

- `index.html` — `:root` + `[data-theme="dark"]` CSS variable
  blocks; body gradient now reads `var(--bg-app-from / to)`;
  inline no-flash script before `<div id="root">`.
- `src/lib/constants.js` — full token refactor; comments explain
  the new CSS-var-backed shape; ROLE_COLOR_FALLBACK added.
- `src/hooks/useThemeMode.js` — NEW. ~50 lines. Pure JS, no JSX.
- `src/App.jsx` — `__APP_SIGNATURE__` → `0.11.0`, sha
  `dark-mode`, build `2026-05-15`. No other changes (theme
  effect lives in AppShell, not here).
- `src/components/AppShell.jsx` — imports `useThemeMode`; reads
  `data.settings?.darkMode`; passes `isDark` to Settings.
  Warning banner + tab-nav rgbas replaced with vars.
- `src/components/Settings.jsx` — new `isDark` prop; new
  `onDarkModeChange` auto-save handler; new `Dark mode` Toggle
  in Display section (after Show role pills); both validator
  error lines (`#9a1f17`) now `var(--text-danger)`.
- `src/components/ScheduleGrid.jsx` — role-chip alpha composition
  switched from hex + concat (`+ "33"`) to `rgba(var(--role-x-rgb), 0.2)`.
  Desktop date pills, label chips, banded section headers,
  week-range text, mobile section sub-headers, mobile day card
  headers all use vars now.
- `src/components/atoms.jsx` — Overlay backdrop + sheet,
  Collapsible dirty dot + chevron + border, Toggle label /
  track / knob / shadows — all vars.
- `src/components/LoginScreen.jsx` — card + error banner colours
  to vars.
- `src/components/ShiftFormModal.jsx` — red save-error banner,
  yellow conflict banner, role chip picker (same alpha refactor
  as ScheduleGrid), error text lines — all vars.
- `src/components/EmployeeFormModal.jsx` — role grid, preference
  segments, weekday segments, active pill, fixedDays toggle button
  — all vars.
- `src/components/EmployeesList.jsx` — role chip TBadge palette
  composes alpha from rgb triplet; row backgrounds + name text
  to vars.
- `src/components/RequestsList.jsx` — type-meta fallback palette
  swapped from `#eee` to `--status-open-*`; row backgrounds + date
  + name text to vars.
- `src/components/RequestFormModal.jsx` — type segments + error
  text to vars.
- `CLAUDE.md` — file-structure header v0.11.0; new annotations on
  `index.html`, `useThemeMode.js`, `constants.js`, `Settings.jsx`;
  three new locked decisions (Theming model, Theme resolution,
  PDF export stays light).
- `REFACTOR_LOG.md` — this entry prepended.

Bundle (main): **150.30 kB gz** (+0.17 kB vs v0.10.2 — the new
hook + dark-mode toggle additions). `index.html` grows from 0.50
to 3.16 kB gz because of the CSS variable block.

### Locked-decision answers (this version)

| Q | A |
|---|---|
| Preference model | Manual boolean Toggle, default = system preference. First load resolves from `prefers-color-scheme`; once the user flips the toggle, the explicit value sticks. Chosen over tri-state auto/light/dark for simplicity — can be promoted later if needed. |
| Token strategy | CSS custom properties + `data-theme` on `<html>`. Chosen over ThemeContext after explicit cost comparison: 4–5 files vs 12+, zero React re-renders vs every consumer re-rendering, portable to Bookings later vs one-off. |
| Accent retune | Yes, both ROLE_COLORS and STATUS_COLORS tuned for dark mode. Role channels use Apple's dark system variants (#FFB340, #64B5FF, #FF453A, #BF5AF2, #98989D). Status palette amped to brighter foreground colours on darker tinted backgrounds. |
| Overlay scope | Included in v0.11.0. Modal backdrop deepens to rgba(0,0,0,0.55) in dark; sheet flips to rgba(28,28,30,0.95). |
| PDF export theme | Stays light regardless of in-app theme. Print legibility + ink economics. `pdf-export.js` doesn't read CSS vars. |
| Initial paint strategy | Inline script in `index.html` reads `prefers-color-scheme` synchronously before the React mount, so dark-mode users don't see a light flash during boot. |
| `useThemeMode` placement | Called from AppShell (which owns settings). LoginScreen doesn't call it — relies on the inline script's initial paint. Edge case: if user changes OS theme while on LoginScreen, the page doesn't react until sign-in. Acceptable for a manager-only app. |

### Key design decisions

- **Tokens in CSS, not JS.** The theme decision belongs at the layer
  that already knows how to swap values cheaply (CSS). Pushing it
  into React state means every component re-renders on theme flip,
  for no UX gain. CSS vars also keeps the token shape portable —
  Bookings can lift the `<style>` block + the constants pattern
  later without rewiring its component tree.
- **RGB triplets for roles, not pre-baked colours.** ROLE_COLORS
  callers want different alpha at different surfaces (chip bg at
  0.2, text at full, border at 0.4). Storing channels as
  `"var(--role-bar-rgb)"` (resolving to `255, 159, 10`) and
  composing `rgba(${rgb}, 0.2)` at the use site keeps the same
  flexibility hex+concat had, but theme-aware.
- **No-flash inline script.** Without it, a system-dark user would
  see a brief light flash on every page load (HTML defaults to
  `data-theme="light"`; React effect runs after first paint).
  One IIFE solves it. Standard pattern.
- **`useThemeMode` returns `isDark` AND writes `data-theme`.**
  Single source of truth: the DOM attribute IS the theme. React
  state IS the UI's view of "what's currently applied" so the
  Toggle reflects it. Both stay in sync because the hook updates
  both.
- **PDF stays light.** Locked separately: printed rotas need to
  remain ink-economic and legible on paper. Hard rule: pdf-export.js
  never reads CSS vars. Apple's own Mail / Pages do the same.

### Verification

- `npm run build` — clean. 310 modules transformed (was 309).
- Manual QA on `npm run dev`:
  - Page boot follows OS theme (try with macOS in dark mode and light
    mode); no flash on either.
  - Sign in; Schedule renders with appropriate light/dark palette
    matching the OS pref.
  - Settings → Display has a new "Dark mode" Toggle with helper text
    "Following your system preference. Tap to override." while
    `settings.darkMode` is undefined.
  - Flip the Toggle ON — entire app re-paints to dark within a frame
    (CSS var flip, no React reconciliation). Helper text disappears
    (now explicit).
  - Refresh: setting persists; theme stays dark independent of OS.
  - Flip Toggle OFF — back to light, helper still hidden (still
    explicit, just light now).
  - Modal: open a ShiftFormModal in dark mode — backdrop deepens,
    sheet flips to dark.
  - Role pills retune in dark mode (try Bar, Floor, Chef pills).
  - PDF export downloads same light-themed PDF in both themes.
  - Sign out → LoginScreen renders in whatever theme was last applied;
    no console errors.
  - No write-guard banner.

---

## v0.10.2 — Schedule + Settings readability polish (pre-dark-mode)

**Date:** 2026-05-15
**Behavioural change:** None — pure visual hierarchy pass. No data
model, persistence, or interaction changes. The Schedule grid and
Settings accordion both gain stronger surface contrast so the layout
holds up on the light theme. Dark mode (v0.11.0) is a colour swap on
top of these structures, not a structural redesign.

Four visual fixes that share a common cause: too many surfaces in the
near-white opacity range (card 0.45, soft 0.55, label cells none)
collapsed into one undifferentiated mass against the
`#f3f5f8 → #e7ecf2` page gradient.

1. **`S.surfaceSoft` strengthened.** Background 0.55 → 0.78 white;
   border swapped from a whitish 0.4 (invisible on light bg) to a
   dark-toned 0.15 hairline; soft elevation shadow added. Cascades
   to every `Collapsible` (Settings accordion), `Section` atom,
   and mobile day-card in the schedule.
2. **Schedule section-header bands.** The tiny left-aligned uppercase
   label spanning the grid becomes a centred banded row with its
   own surface and a `marginTop` on subsequent sections — visually
   splitting the four section groups (Kitchen Day, Kitchen Evening,
   FoH Day, FoH Evening) into four discrete bands.
3. **Date pill row.** Bare day labels above the grid become soft pills;
   today's date is highlighted in iOS-blue. Anchors each column for
   the eye.
4. **Slot label cells become chips.** The left column was bare text on
   the card. Now each label sits in a soft chip with human label on
   top and default time muted beneath — a continuous lane of chips.

Mobile inherits the constants change automatically; the sub-section
header inside each day card is upgraded to match the desktop band
style (centred, soft surface, uppercase tracked).

**Scope:** UI readability. Zero logic changes.

### Files modified

- `src/lib/constants.js` — `S.surfaceSoft` reshaped (background,
  border, boxShadow). Comment explains the v0.10.2 rationale.
- `src/components/ScheduleGrid.jsx` —
  - `todayIso` memo added at top of component (one Date stringify
    per render, not 7).
  - `renderSectionHeader(slot, isFirst)` reshaped to a centred
    banded row with neutral tint + `marginTop` on subsequent
    sections.
  - Date header divs replaced with soft pills; today highlighted.
  - Slot label cell replaced with a chip surface (label + muted
    time).
  - Mobile section sub-header tightened to a centred soft band.
- `src/App.jsx` — `__APP_SIGNATURE__` → `0.10.2`, sha
  `readability-polish`, build `2026-05-15`.
- `CLAUDE.md` — file-structure annotations on `ScheduleGrid.jsx`
  and `constants.js` updated with the v0.10.2 line.
- `REFACTOR_LOG.md` — this entry prepended.

### Locked-decision answers (this version)

| Q | A |
|---|---|
| Section grouping shape | Banded background per group, centred header above. Chosen over coloured stripes / minimal divider rules because it gives the strongest at-a-glance group anchoring without competing with the role-pill colour budget. |
| Section colour treatment | Neutral for all sections (single grey tint). Colour budget stays reserved for role pills and status palette. |
| Date header style | Soft white pills with today highlighted in iOS-blue. Stronger than text-only, lighter than a fixed card-style bar. |
| Version classification | Patch (`v0.10.2`). No behavioural change, but a structural visual reshape. Dark mode remains earmarked for `v0.11.0`. |
| Vertical column rules | Deferred. The date pill row + section bands give enough column anchoring; we'll add inset-shadow column rules in a follow-up only if smoke-testing shows the anchoring isn't enough. |
| Atom changes | None. `Collapsible` / `Toggle` / `Section` all compose from `S.surfaceSoft`, so the constants bump propagates automatically. |

### Key design decisions

- **Tokens first, components second.** One token change in
  `constants.js` lifts every soft surface in the app. The
  alternative — editing every component — would have spread the
  change across half a dozen files and made dark mode harder.
- **Land structural fixes BEFORE dark mode.** Solving readability
  in the light theme means v0.11.0 is a palette swap, not a
  redesign. CSS-variable lift happens in v0.11.0; for v0.10.2 the
  tokens stay as inline rgba.
- **Section bands are inline rows, not wrapping divs.** CSS grid
  + `display: contents` means each row's cells participate in the
  parent's column template. A wrapping div per section group
  would break column alignment across sections. Solution: the
  band is itself a row that spans all 8 columns
  (`gridColumn: "1 / -1"`); its `marginTop` creates the visual
  split.
- **No new backdrop-filter.** The ≤4 blur instances rule stays
  untouched. New surfaces use opaque-ish white + dark hairline
  border + drop shadow for depth, not blur.

### Verification

- `npm run build` — clean (see bundle delta below).
- Manual QA on `npm run dev`:
  - Settings: each `Collapsible` reads as a discrete block above
    the card, with visible border + soft elevation. Toggle-open
    behaviour unchanged.
  - Schedule (desktop): four centred banded section headers with
    visible breathing room between them. Date pill row at top
    with today highlighted. Left column is a continuous lane of
    chips. Cells unchanged.
  - Schedule (mobile): each day card surface is now clearly
    visible; inner section sub-headers are centred bands.
  - ShiftFormModal still opens; assign + save works; PDF export
    gating intact.
  - No console errors, no write-guard banner.

---

## v0.10.1 — Toggle conversion in ShiftFormModal + workflow rules

**Date:** 2026-05-14
**Behavioural change:** No functional change — control shape only.
The "Show staff on day off / holiday" control inside the shift picker
flips from `<input type="checkbox">` to the `Toggle` atom (added in
v0.10.0). Plus two workflow rule codifications in `CLAUDE.md`.

Three items in one patch:

1. **Last checkbox → Toggle.** v0.10.0 introduced the `Toggle` atom but
   only Settings used it. `ShiftFormModal`'s lone checkbox was the
   remaining inconsistency. Converted for visual coherence (same atom
   dark mode will lean on next) and to surface the "N hidden" count
   in the Toggle's `helper` slot for a cleaner row.
2. **"Prefer Toggle over checkbox" convention.** Codified in
   `CLAUDE.md` → Code conventions → Boolean controls. Exceptions:
   multi-select grids (role pickers, weekday pickers) and native
   `<form>` integrations.
3. **Post-merge local-folder sync rule.** New step 13 in the
   Deployment ship sequence. After each PR merges, the local
   working folder at `/Users/patrykzychowicz/Desktop/megustastu-scheduling`
   is fast-forwarded from `origin/main`. The local folder always
   rides `main`, never a feature branch (branches live only in
   `.claude/worktrees/` subfolders).

**Scope:** UI consistency polish + two workflow rules. No new
features, no data model changes, no new persistence paths.

### Files modified

- `src/components/ShiftFormModal.jsx` — import `Toggle` from
  `./atoms.jsx`. Replace the `<label> + <input type="checkbox">`
  block (`requestToggle`) with a `<div style={{ marginTop: 8 }}>`
  wrapping `<Toggle checked={showRequestBlocked}
  onChange={setShowRequestBlocked} label="Show staff on day off /
  holiday" helper={hidden > 0 ? "N hidden" : null} />`. Render
  condition unchanged.
- `src/App.jsx` — `__APP_SIGNATURE__` → `0.10.1`, sha
  `toggle-polish`, build `2026-05-14`.
- `CLAUDE.md` —
  - File-structure header bumped to v0.10.1.
  - `ShiftFormModal.jsx` annotation extended with the v0.10.1 line.
  - New Code-conventions sub-section **Boolean controls** (prefer
    Toggle over checkbox; lists the exceptions).
  - Style-tokens atom list now lists `Collapsible (v0.10.0)` and
    `Toggle (v0.10.0)` (previously missed in the v0.10.0 update).
  - Deployment ship-sequence step 13 added (post-merge local-folder
    sync).
- `REFACTOR_LOG.md` — this entry prepended.

### Locked-decision answers (this version)

| Q | A |
|---|---|
| Version classification | Patch (`v0.10.1`) — UX consistency polish, no feature shift. Dark mode remains earmarked for `v0.11.0`. |
| Hidden-count placement | Inside the Toggle's `helper` prop ("N hidden") so the row stays clean. Helper passes `null` when count is zero, collapsing the line. |
| Surface treatment | No wrapper styling — the previous checkbox had none either (just a plain `<label>`). The Toggle atom owns its own row spacing. The separate `conflictBanner` (yellow warning on save-time override) is a different element and stays untouched. |
| Convention exceptions | Multi-select grids (role/day pickers) + native `<form>` integrations keep `<input type="checkbox">`. |
| Local-folder sync trigger | After PR merges. Step 13 in ship sequence. Retroactive: ran once after PR #8 (v0.10.0) merged, which had left the local folder stale since v0.6.0. |

### Key design decisions

- **Single source of truth for boolean controls.** Standardising on
  the Toggle atom means dark-mode (v0.11.0), any future settings
  toggles, and any new override prompts inherit the same look and
  tap behaviour. The lone checkbox in `ShiftFormModal` would have
  felt out of place once the third or fourth Toggle landed.
- **`helper` slot beats inline count span.** The previous
  "(N hidden)" inline span lived inside the label and competed
  with the label text. Lifting it to a smaller helper line below
  the label gives it visual hierarchy without adding noise when
  the count is zero (helper collapses).
- **Toggle `onChange` is the bool, not the event.** Cleaner setter
  wiring: `onChange={setShowRequestBlocked}` instead of
  `onChange={(e) => setShowRequestBlocked(e.target.checked)}`.
  Matches the v0.10.0 Settings auto-save handler pattern.
- **No wrapper styling change.** Resist the urge to add a soft
  warning background here. The decisive yellow warning is the
  separate `conflictBanner` that fires when an override is actually
  selected — that's where the visual emphasis belongs.
- **Local-folder sync as a deployment step, not a preference.**
  Codifying it in CLAUDE.md → Deployment makes it a required
  finishing step, not a "Patryk should remember to" item. Future
  sessions inherit the rule.

### Verification

- `npm run build` — clean.
- Manual QA (`npm run dev` against DEV Firebase project):
  - Boot banner shows `v0.10.1`, sha `toggle-polish`.
  - Schedule grid → click a cell whose date is covered by at least
    one employee's day-off / holiday request → modal opens.
  - The "Show staff on day off / holiday" row renders as the
    Toggle atom (iOS pill switch), not a checkbox. Helper line
    underneath reads "N hidden" while OFF.
  - Toggling ON → switch animates, helper line disappears, hidden
    employees appear in the picker. Selecting one surfaces the
    existing `conflictBanner` (yellow warning) — unchanged by
    this version.
  - Toggling OFF → helper reappears, employees hide again.
  - Whole row is tap-targetable on mobile.
  - No regression on v0.8.0 picker filter semantics: role match
    still hard-filters, same-date still hard-filters, save-time
    guard still fires.
- Local folder sync rule verified: `git -C /Users/patrykzychowicz/Desktop/megustastu-scheduling pull --ff-only origin main`
  ran cleanly after PR #8 merge, bringing the local folder from
  v0.6.0 to v0.10.0 in one fast-forward.

---

## v0.10.0 — Settings tab redesign (single-open accordion)

**Date:** 2026-05-14
**Behavioural change:** Yes — Settings tab restructured into a
single-open accordion. Layout-only change for Operating Hours / FoH /
Kitchen; the Display section gains a new behaviour (auto-save on
toggle change, bypassing the bottom Save button).

The Settings tab was starting to feel list-y: four stacked cards in a
single scrollable column, with more toggles imminent (v0.11.0 dark
mode and beyond). v0.10.0 restructures the surface so:

1. **Accordion (single-open).** Each section is a Collapsible. One
   open at a time. Operating Hours opens by default — top of list and
   the section that gates template-row validation.
2. **Per-section dirty dot.** Each Collapsible header carries a small
   blue dot when its form differs from the saved state. Hours /
   FoH / Kitchen each get their own dot. Display has no dot (it
   auto-saves).
3. **Display section auto-saves.** The "Show role pills on schedule
   cells" control becomes a Toggle atom (iOS pill switch) wired to
   `saveSettings({ ...settings, showRolePills })` on every change.
   No Save click required. Rationale: Display toggles have instant
   visual effect on the schedule grid, so deferring the write behind
   a Save button felt off-pattern.
4. **Save click force-opens the first error section.** Today's
   validators light up under each input; in a collapsed accordion
   they're invisible. When Save is clicked while `hasErrors === true`,
   the first section with an error opens automatically so the
   manager sees the validator output without hunting.
5. **Reserved Display structure for v0.11.0 dark mode.** Display
   stacks Toggle rows; v0.11.0's dark-mode toggle drops in as a
   sibling with zero layout churn.

**Scope:** UI restructure + one tiny behavioural divergence in Display.
No data model changes. No new persistence paths. No new dependencies.

### Files modified

- `src/components/atoms.jsx` — two new exported primitives:
  - `Collapsible({ title, open, onToggle, dirty, children })` —
    accordion section. Controlled `open` (parent owns single-open
    state). Header row is clickable, with a chevron + optional dirty
    dot. Body only mounts when `open === true`. Reuses
    `S.surfaceSoft` styling; adds no new `backdropFilter` (blur
    instance count unchanged).
  - `Toggle({ checked, onChange, label, helper, disabled })` —
    iOS-style switch row. Whole row is clickable (not just the
    knob), keyboard-accessible via Enter/Space, ARIA
    `role="switch"`. 48×28 px track, white 24×24 knob with shadow.
- `src/components/Settings.jsx` — full restructure of the render
  layer. State changes: `hoursForm` shrinks to
  `{ operatingStart, operatingEnd }` (showRolePills lifted out and
  read directly from `settings`); `openSection` state added (default
  `"hours"`); legacy `dirty` boolean dropped in favour of derived
  `fohDirty` / `kitchenDirty` via new `blockDirty(a, b)` helper.
  Handler changes: `onShowRolePillsChange(nextValue)` writes
  immediately via `saveSettings`; `handleSave` now force-opens the
  first error section if `hasErrors`. `handleReset` writes the
  default `showRolePills: true` alongside the reset operating hours.
  Render changes: four `<Section>` wrappers replaced with
  `<Collapsible>` wrappers inside a `flex column / gap: 12`
  container; Display body is a single `<Toggle>` row.
- `src/App.jsx` — `__APP_SIGNATURE__` → `0.10.0`, sha
  `settings-accordion`, build `2026-05-14`.
- `CLAUDE.md` — file-structure block bumped to v0.10.0; `atoms.jsx`
  annotation lists Collapsible + Toggle; `Settings.jsx` annotation
  describes the accordion shape and Display auto-save. New locked
  decision under Functional describing the Settings accordion
  layout and the Display auto-save divergence.

### Locked-decision answers (this session)

| Q | A |
|---|---|
| Layout pattern | Single-open accordion (chosen over sub-tabs, side-nav, flat-with-better-hierarchy). |
| Templates location | Stay in Settings — no new top-level "Templates" tab. |
| Dark-mode slot reservation | Yes — Display section structured as a stack of Toggle rows; v0.11.0 drops in as a sibling. |
| Display control style | iOS toggle switch (Toggle atom), not a checkbox. |
| Display save behaviour | Auto-save on change. No Save click required, no dirty dot for Display. |
| Default open section | Operating Hours (top of list; gates template validation). |
| Open-section persistence | Not persisted across reloads; reopens to Operating Hours each visit. |
| Per-section dirty dot | Yes for Hours / FoH / Kitchen. No for Display (auto-saves). |
| Save-with-errors UX | Force-open the first section carrying an error so the inline validator becomes visible. |

### Key design decisions

- **One open at a time matches mobile reality.** The app is used
  mostly on a phone behind the bar. A multi-open accordion would
  drag the Save button below the fold on most edits. Single-open
  keeps the work surface compact.
- **Lift `showRolePills` out of `hoursForm`.** Mixing it with
  operating-window state was workable in v0.9.0 (everything wrote to
  `/settings`, one dirty flag, one Save click). With auto-save it
  becomes confusing: which fields go to Firebase on a Toggle change?
  Reading directly from `settings.showRolePills` removes the
  ambiguity — local form state holds only fields that wait for
  Save.
- **Derived FoH/Kitchen dirty flags, kept boolean `hoursDirty`.**
  `blockDirty(a, b)` is cheap (string compares on four fields), so
  per-render derivation costs nothing and gives free correctness:
  edit a field, change it back, the dot turns off. `hoursDirty` is
  kept as a boolean flag (matching the existing pattern) because
  the cost of the change versus the readability win wasn't worth
  it. Acceptable inconsistency — the user can't tell the difference.
- **Toggle handler spreads `settings`, not `hoursForm`.** A Display
  toggle change must not silently commit mid-edit operating-hour
  values. Spreading the saved `settings` prop and overwriting only
  `showRolePills` keeps each section's writes scoped.
- **Save-with-errors force-opens the first erroring section.** The
  cheaper alternative — disable Save until valid — was the v0.9.0
  behaviour, but in an accordion it traps the user when the error
  is in a collapsed section. The chosen behaviour gives them
  feedback in one click. (We still keep the disabled visual state
  for the no-edits case.)
- **No new `backdropFilter` in Collapsible.** The header is a flat
  surface inside the existing `S.card` blur. Adding more blur
  would push toward the ≤4 simultaneous instances limit.

### Verification

- `npm run build` — clean. Bundle size delta logged in commit msg.
- DEV-mode QA (manual) on a Vercel preview build:
  - Boot banner shows `v0.10.0`, sha `settings-accordion`.
  - Default open section is Operating Hours; the others render
    collapsed as header strips.
  - Single-open behaviour: tapping a closed header opens it and
    collapses the previously open one; tapping an open header
    collapses it (no section open).
  - Dirty dots: editing Operating Hours `end` lights the dot on
    Operating Hours only. Editing FoH count lights FoH only.
    Editing Kitchen evening start lights Kitchen only. Display
    never shows a dot.
  - Display auto-save: toggling "Show role pills" OFF writes
    immediately; reload confirms persistence; the schedule grid
    pills disappear.
  - Save-with-errors force-open: with all sections collapsed,
    setting `kitchen.evening.end` to "25:00" via the input and
    clicking Save opens the Kitchen section, surfaces the error,
    and writes nothing.
  - Mobile (<768px): headers are tap-targetable, internal grids
    preserve their 2-column wrap.
  - PDF export still gated on `isWeekComplete`. Role pills still
    gate correctly on the schedule grid via direct `settings.showRolePills` read.

---

## v0.9.0 — Polish (PDF evening trim · specialists-first picker · role-pills toggle)

**Date:** 2026-05-14
**Behavioural change:** Yes — three small UX refinements:

1. **PDF evening trim.** Exported rotas drop the `· Role` suffix from
   evening cells (the role is implicit from the row — Kitchen Evening 1
   is the Chef row by the v0.8.0 default-role policy) and the end-time
   from evening row labels (it's always the close of service). Day rows
   and day cells unchanged.
2. **Picker sorts specialists first.** Within the v0.8.0 role-filtered
   set, employees with fewer total roles rank higher. Tiebreak
   alphabetical. The intuition: an employee with one role is the most
   suitable fit for a slot needing that role (no competing demands
   across the week). Falls out naturally for day shifts too.
3. **Role-pills toggle.** New "Display" card in Settings with a
   `showRolePills` checkbox. When OFF, the small coloured pill next to
   each filled cell's assignee name disappears. Default ON. Persists
   to `/settings.showRolePills`. Employees-tab role badges and the
   role-picker controls inside modals are unaffected (those are
   controls, not display).

**Scope:** All polish — no new persistence paths, no new dependencies,
no architectural shifts. Continuation of the v0.7.0 / v0.8.0 cadence
before the v1.x auto-generator.

### Files modified

- `src/lib/pdf-export.js` — `buildTableBody` row-label generation
  conditional on `slot.dayPart === "evening"` (start-only) vs
  default (`start–end`). Cell-content generator drops the
  `cell.role` branch entirely; always returns `emp.name`.
- `src/components/ShiftFormModal.jsx` — extended the existing
  `eligible` useMemo sort. New local `roleCount(e)` helper; sort
  callback compares role-count first, then alphabetical name.
- `src/components/Settings.jsx` — extended `hoursForm` with
  `showRolePills` (defaults to `true` when `/settings` is missing
  the field, preserving an explicit stored `false`). New `<Section
  title="Display">` card with a checkbox + helper text. `handleReset`
  resets `showRolePills` to `true` alongside the operating-hours
  defaults. Header docstring updated to note v0.9.0 scope.
- `src/components/AppShell.jsx` — passes `settings={data.settings}`
  into `<ScheduleGrid>`.
- `src/components/ScheduleGrid.jsx` — accepts `settings` prop. New
  `showRolePills` local derived (`!settings || settings.showRolePills
  !== false` — defensive against an absent or default-true setting).
  `roleChip` JSX gated on `cell.role && showRolePills`.
- `src/App.jsx` — `__APP_SIGNATURE__` → `0.9.0`, sha `polish-2`,
  build `2026-05-14`.
- `CLAUDE.md` — file-structure block bumped to v0.9.0;
  `Settings.jsx` / `ShiftFormModal.jsx` / `pdf-export.js`
  annotations extended. The PDF locked-decision in the functional
  section now describes the evening-row trim explicitly.

### Locked-decision answers (this session)

| Q | A |
|---|---|
| PDF strip scope | Evening only. Evening cells lose role suffix; evening row labels drop the end-time. Day rows + day cells untouched. |
| Picker tiebreak | Specialists first (`roles.length` asc). Alphabetical secondary key. |
| Toggle scope | Schedule grid cells only. Employees list badges + request-type badges unaffected. |
| Toggle default | ON (visible by default; manager opts out). |
| Toggle persistence | `/settings.showRolePills: boolean`. Whole-object write via existing `saveSettings`. |
| Settings layout | New `<Section title="Display">` card below "Operating hours". Preserves the per-card narrow-scope pattern. |

### Key design decisions

- **`slot.dayPart` is the right discriminator for the PDF.** Day slots
  carry `dayPart: "day"`, evening `dayPart: "evening"` — both already
  set by `slotsForDay()`. No new prop on the slot record needed.
- **Drop the `cell.role` branch entirely.** A future feature
  reintroducing per-cell role rendering would have to re-add the
  branch — but the v1 model says the slot column already identifies
  the role, so the branch is dead weight, not a parking spot.
- **`roles.length` as a suitability proxy.** It's the simplest
  metric that captures "an employee with one role is the tightest
  fit for that role." Won't surface a "primary role" concept
  (employee model doesn't have one). If we add one later, we can
  promote it ahead of the role-count key without breaking the API.
- **Explicit boolean check on `showRolePills` init.** `settings.showRolePills || true` would silently flip a stored `false`
  back to `true` because `||` falls back on falsy. The form must
  treat `false` as a deliberate manager choice. Same pattern was
  used in v0.7.0 for `operatingStart` (where `|| OPERATING_HOURS.start`
  was OK because `""` is the only falsy string we care about).
- **Schedule-grid default is OPEN (show pills).** When `/settings`
  is empty on a fresh install, we shouldn't render an emptier UI
  than the manager has ever asked for. The default-true posture
  also means existing deployments don't suddenly lose their pills
  after this update.
- **Day cells are unaffected by the toggle.** Day shift `cell.role`
  is always `null` (v1 day-shift one-person-covers-all-roles model),
  so the toggle has nothing to gate on day cells. No special-casing
  needed.
- **No `usePersistence.js` changes.** `saveSettings` is a whole-
  object write helper. Adding a field to the form is invisible
  to the persistence layer.

### Verification

- [ ] `npm run build` succeeds; main bundle within ~1 KB of v0.8.0.
- [ ] `npm run dev`; sign in; blue v0.9.0 banner;
      `window.__MGT_SCHED_BUILD__.version === "0.9.0"`.
- [ ] PDF: fill every cell of a week → Export. Confirm
      Kitchen Evening + FoH Evening row labels show `17:00` /
      `16:00` only (no end-time); Kitchen Day / FoH Day row labels
      keep the full range (`11:00–16:00`, `11:00–17:00`).
- [ ] PDF cells: evening cells show assignee NAME only (no
      `· Bar` / `· Chef`). Day cells unchanged.
- [ ] Picker: 3 employees A=[Pot], B=[Pot,Chef], C=[Pot,Chef,Plating]
      → Kitchen Evening 3 picker order: A, B, C. Within ties,
      alphabetical.
- [ ] Settings tab: new "Display" card below Operating Hours,
      checkbox checked by default.
- [ ] Uncheck → Save → Schedule grid role pills disappear.
- [ ] Reload → toggle stays unchecked.
- [ ] Re-check → Save → pills reappear.
- [ ] Employees tab: role badges always visible (toggle has no
      effect there).
- [ ] Mobile viewport: Display card stacks cleanly below Operating
      Hours; checkbox and helper text readable.

---

## v0.8.0 — Schedule UX overhaul

**Date:** 2026-05-14
**Behavioural change:** Yes — six related changes to the schedule grid
and shift-assignment modal:

1. **Slot order flipped.** Schedule grid (and consequently the PDF
   export) now renders Kitchen first, then FoH. Order within each
   section: Day → Evening.
2. **Evening default roles.** New shifts on FoH Evening slot 0/1
   prefill role to Bar/Floor; Kitchen Evening 0/1/2 prefill to
   Chef/Plating/Pot. Slot index past the section's role count → `null`
   (manager picks). Existing shift records always keep their stored
   role.
3. **Role-filtered picker.** Evening slot picker only lists employees
   who hold the slot's role; day slot picker only lists employees
   holding any of the section's roles.
4. **Request-conflict hide-by-default + toggle.** Employees with a
   day-off / holiday request covering the date are hidden from the
   picker. A "Show staff on day off / holiday" checkbox (only visible
   when at least one such employee exists) restores them and brings
   back the yellow conflict banner from v0.4.0 so the manager can
   override.
5. **Dark mode** deliberately deferred to v0.9.0 — it's a cross-cutting
   CSS effort that deserves its own session.
6. **STRICT same-date exclusion.** A single employee cannot hold two
   shifts on the same date (covers day + evening on the same Tuesday).
   Picker filter + save-time guard with red banner.
7. **Picker order item 7.** Same as item 1 — schedule layout flipped.

**Scope:** All schedule UX. Touches the slot enumerator, the shift
modal, and the schedule grid mount. No persistence-layer changes.

### Files modified

- `src/lib/schedule-logic.js` — `slotsForDay()` reorders blocks to
  Kitchen Day → Kitchen Evening → FoH Day → FoH Evening; each slot
  now carries a `defaultRole` field set by the new
  `defaultRoleForSlot(section, dayPart, index)` helper. Added
  `findSameDayShift(shiftsMap, employeeId, dateIso, excludeShiftId)`
  pure helper for the new STRICT rule. Slot `key` strings unchanged
  → existing `/shifts/{id}` records still match by slot identity.
- `src/components/ShiftFormModal.jsx` — new `weekShifts` prop. New
  local state: `showRequestBlocked` (toggle) and `saveError` (red
  banner). `initialForm` prefills role from `slotDef.defaultRole` for
  new shifts. `useEffect` re-init auto-flips `showRequestBlocked` on
  if the existing shift's assignee has a covering request, so the
  select doesn't render a value not in its options. Eligible-employees
  list is a single `useMemo` applying role + same-day + request
  filters in one pass; tracks `requestHiddenCount` so the toggle only
  appears when it has an effect. `handleSave` re-checks same-day at
  submit time and refuses with `saveError` if the picker filter was
  bypassed.
- `src/components/ScheduleGrid.jsx` — passes `weekShifts={weekShifts}`
  into `<ShiftFormModal>`. Footer help text updated to describe the
  new picker behaviour.
- `src/App.jsx` — bumped `__APP_SIGNATURE__` to `0.8.0`, sha
  `schedule-ux`, build `2026-05-14`.
- `CLAUDE.md` — file-structure block bumped to v0.8.0; expanded
  `ShiftFormModal.jsx` and `schedule-logic.js` annotations; revised
  the "Conflict warnings, not blocks" section to capture the new
  three-tier semantics (hard same-date, hide+toggle request, hard
  role mismatch); added explicit "Slot display order" and
  "Evening default roles" sub-items under Locked v1 decisions.

### Locked-decision answers (this session)

| Q | A |
|---|---|
| Item 1/2 — default role overflow | When the Settings template count goes above the section's role count, slot index ≥ count → `defaultRole: null`. No silent cycling. |
| Item 3 — role-filter scope | Hard filter at the picker level. Manager can still pick "Unassigned". |
| Item 4 — request conflict UX | Hide-by-default + "Show staff on day off / holiday" toggle. Toggle restores the yellow v0.4.0 banner when an override is selected. |
| Item 4 — auto-flip on existing | If an existing shift's assignee currently has a covering request, the modal opens with the toggle pre-ON. Avoids broken select state. |
| Item 6 — "same day" scope | Same DATE. A person on the FoH Day shift cannot also be on the FoH/Kitchen Evening shift the same date. |
| Item 6 — strict-mode override path | None. Strict. (Manager workaround: clear the other shift first.) |
| Item 7 — PDF order follows | Yes. Single source of truth: `slotsForDay()`. PDF divider rows still labelled via `SECTIONS[section].label` so the flip is automatic. |

### Key design decisions

- **`findSameDayShift` lives in `schedule-logic.js`.** Pure helper, no
  React. Reused by both the picker filter and the save-time guard.
  Will be reused again by the v1.x auto-generator as a hard
  constraint.
- **Single `useMemo` filter pipeline.** Role → same-day → request,
  in that order, in one pass. Tracks `requestHiddenCount` for the
  toggle so the UI only renders the override checkbox when it has
  an effect. Avoids stacked filter components and the readability
  cost they bring.
- **Auto-flip `showRequestBlocked` on re-init.** If a manager opens an
  existing shift whose assignee has since had a covering request
  added, hiding them would leave the `<select>` with a value not in
  its option list (a "broken" state where the rendered selection
  doesn't reflect `form.employeeId`). Auto-flipping the toggle ON in
  that case keeps the select coherent. Manager can untoggle to hide
  them again.
- **Save guard is belt + braces.** The picker filter already hides
  same-day-conflicting employees, but a stale dropdown (e.g., another
  tab made an assignment between the modal opening and Save being
  clicked) could still produce a clash. `handleSave` re-checks
  `findSameDayShift` and refuses with a red banner. No silent
  corruption.
- **`defaultRole` is on the slot, not the modal.** The pure helper
  `defaultRoleForSlot()` keeps the role-default policy outside React
  — the auto-generator (v1.x) reads `slot.defaultRole` the same way
  the modal does.
- **Existing shift records always win on role.** `initialForm`
  prefills role from `slotDef.defaultRole` ONLY when `shift === null`
  (new shift). A previously-saved shift with `role === null` may
  represent a deliberate manager state — overwriting it on every
  modal open would be presumptuous.
- **PDF flip is automatic.** `pdf-export.js` reads slots in
  `slotsForDay()` order, and the divider rows label themselves via
  `SECTIONS[slot.section].label`. No `pdf-export.js` changes needed
  — the reorder cascades.

### Verification

- [ ] `npm run build` succeeds. Main bundle within a few KB of v0.7.0.
- [ ] `npm run dev`; sign in; blue v0.8.0 banner;
      `window.__MGT_SCHED_BUILD__.version === "0.8.0"`.
- [ ] Schedule grid: Kitchen rows appear above FoH rows. Day rows
      above Evening rows within each section.
- [ ] Click a Kitchen Evening 1 empty cell → modal opens with role
      prefilled to **Chef**. Editable.
- [ ] Click a Kitchen Evening 3 empty cell (after bumping Settings
      count to 3) → role prefilled to **Pot**.
- [ ] Click a Kitchen Evening 4 empty cell (after count bump to 4)
      → role left blank.
- [ ] FoH Evening 1 → defaults to **Bar**; FoH Evening 2 → **Floor**;
      FoH Evening 3 (count=3) → blank.
- [ ] With 4 employees (varied roles) and one on holiday: open a
      FoH Evening 1 picker → only active Bar-holding employees
      appear; the holiday person is hidden.
- [ ] Tick "Show staff on day off / holiday" → holiday person
      reappears in the dropdown; selecting them shows the yellow
      conflict banner.
- [ ] Assign Maria to FoH Evening 1 Tuesday. Open Kitchen Evening 1
      Tuesday → Maria is gone from the dropdown (same-day filter).
      Open FoH Day Tuesday → Maria is gone.
- [ ] Save guard: with two browser tabs open, assign Maria in tab A,
      then in tab B open a different slot still showing Maria as
      eligible (stale state), pick her, hit Save → red banner appears,
      save refused.
- [ ] Edit an existing shift with an assignee who has a covering
      request → modal opens with toggle pre-ON, yellow banner visible,
      select renders the correct name.
- [ ] Export PDF → "Kitchen" divider row appears first, then
      "Front of House".

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
