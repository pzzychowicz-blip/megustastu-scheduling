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
  shift preference (day / evening / either).
- **Work pattern:** 5 working days → 2 days off. The 2 off-days CAN be
  split (e.g. Mon+Tue work, Wed+Thu off, Fri-Sun work). Enforced by the
  generator only — manual edits can override.
- **Requests module:** manager enters all day-off and holiday records on
  staff's behalf (staff communicate via WhatsApp / in person).
- **Export:** PDF in horizontal spreadsheet layout. Available **only when
  the schedule is fully complete** (no empty cells). v0.9.0: evening
  cells render assignee name only (the role is implicit from the row);
  evening row labels show start time only (the end is the close of
  service and was visual noise on the printed sheet). Day rows keep
  the full `start–end` range.
- **Auto-generator:** **Deferred to v1.x** (likely v1.2 or v1.3). v1.0
  ships manual scheduling. When built, the generator is greedy +
  constraint-aware and leaves cells empty rather than violating rules.
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
- **Settings layout (v0.10.0):** single-open accordion. Section order
  is Operating Hours → Display → FoH → Kitchen. Operating Hours opens
  by default. Per-section dirty dot in headers for Hours / FoH /
  Kitchen. Display section bypasses the Save button — toggles inside
  it auto-save immediately on change because their visual effect is
  instant on the schedule grid. Clicking Save while errors exist
  force-opens the first section carrying an error.

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

## File structure (current — v0.10.1)

```
megustastu-scheduling/
├── CLAUDE.md                       this file
├── REFACTOR_LOG.md                 version history + decisions
├── package.json                    React 19, Vite, Firebase, jsPDF
├── vite.config.js                  @vitejs/plugin-react (automatic JSX)
├── index.html                      Vite entry
└── src/
    ├── main.jsx                    mounts <App />
    ├── App.jsx                     orchestration: auth-gate → AppShell
    ├── firebase.js                 dev/prod switch + coloured boot banner
    ├── hooks/
    │   ├── useAuth.js              Firebase Auth state + signIn / signOut
    │   ├── usePersistence.js       Firebase RTDB reads + write-guarded CRUD
    │   └── useWinW.js              viewport-width listener
    ├── lib/
    │   ├── constants.js            S, BTN, ROLES, SECTIONS, STATUS_COLORS,
    │   │                           ROLE_COLORS, REQUEST_TYPES,
    │   │                           DEFAULT_SHIFT_TEMPLATE,
    │   │                           OPERATING_HOURS, WEEKDAYS, DAY_PARTS
    │   ├── schedule-logic.js       week math + slot enumeration (Kitchen
    │   │                           first since v0.8.0) + cell-state
    │   │                           derivation + findRequestConflict +
    │   │                           findSameDayShift + isWeekComplete.
    │   │                           Pure JS, no React.
    │   └── pdf-export.js           landscape-A4 weekly rota → file download
    │                               via jsPDF + jspdf-autotable. Pure JS.
    │                               FoH/Kitchen section divider rows.
    │                               v0.9.0: evening cells = name only,
    │                               evening row labels = start time only.
    └── components/
        ├── atoms.jsx               Overlay, Fld, Section, Collapsible (v0.10.0),
        │                           Toggle (v0.10.0), TBadge, mkInp, mkBtn
        ├── LoginScreen.jsx         email/password sign-in form
        ├── AppShell.jsx            authenticated shell + tab nav
        ├── EmployeesList.jsx       roster list + Add button
        ├── EmployeeFormModal.jsx   add/edit employee modal
        ├── RequestsList.jsx        upcoming/past requests + Add button
        ├── RequestFormModal.jsx    add/edit day-off / holiday modal
        ├── ScheduleGrid.jsx        weekly grid (desktop) / day-card stack (mobile)
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
        └── ExportButton.jsx        Export-PDF button in the week-nav bar;
                                    disabled until every cell is filled
```

### File structure (target — added in later sessions)

```
src/
├── hooks/
│   └── useNowMins.js               15s clock tick
└── lib/
    └── generator.js                v1.x — auto-generator (greedy + constraints)
```

> File list is a **target**, not gospel. Adjust as features land. Update
> this section in the same commit that creates / removes / renames files.

---

## Data model (drafted; refine as features land)

```
/employees/{employeeId}
  → { name, roles: [Role], fixedDays?: {mon,tue,wed,thu,fri,sat,sun},
      preference: "day"|"evening"|"either", active }

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
  → { employeeId, type: "dayoff"|"holiday", dateFrom, dateTo, notes? }

/settings
  → { operatingStart: "11:00", operatingEnd: "23:00", ... }
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
13. **Sync the local working folder** (locked v0.10.1):
    `git -C /Users/patrykzychowicz/Desktop/megustastu-scheduling pull --ff-only origin main`.
    Keeps the local checkout always on `main` so `npm run dev` and any
    manual file inspection reflect the shipped state without manual
    hunting. The local folder never rides a feature branch — branches
    live only in the `.claude/worktrees/` subfolders.

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
- **Auto-generator** — deferred to v1.x; v1.0 is manual scheduling only.
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
