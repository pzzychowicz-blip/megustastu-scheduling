# REFACTOR_LOG.md

Version history for **MGT Staff Scheduling**. Every shipped version gets
an entry. Newest first.

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
