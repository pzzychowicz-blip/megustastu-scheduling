# REFACTOR_LOG.md

Version history for **MGT Staff Scheduling**. Every shipped version gets
an entry. Newest first.

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
