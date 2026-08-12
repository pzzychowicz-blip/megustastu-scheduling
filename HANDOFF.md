# Hand-off — v16.0.0, same branch, new session

Written 2026-08-07. Delete this file once the branch is merged (or once its
content is stale) — it is a session-to-session note, not permanent repo
documentation. This supersedes the 2026-08-06 version of this file in full;
that one's Firebase-rules diagnosis is now fixed, not still-open.

## State

- **Branch:** `feat/v16.0.0-bookings-parity-splits-perweekday` — pushed, up
  to date with origin at `9e84120`. No PR open.
- **Version:** stays `16.0.0`. Do not bump.
- **Working tree:** clean. `npm run build` passes.
- **Dev server:** `npm run dev` — DEV Firebase is now
  `megustastu-scheduling-dev`, its own project (phase 43b). It was
  `megustastu-bookings-dev` — the Bookings DEV database — until this
  session; see "What changed" below for why that mattered.

## What this branch is

Originally: MGT Bookings visual/motion parity + manual split shifts +
per-weekday shift template. Then a design-consistency pass (phases 22–29),
then bug reports (30–35), then a self-review (36). Then a separate request
— strip "agentic UI" (swap-mode phase banners, result banners, the
generator's self-explaining modal, reassurance copy) — phases 37–40, with
drag-and-drop for swap added in the same phase 37 commit, and 41 doing
docs + tooltip cleanup. Then a follow-up request restored some of what 37–40
removed, in a different shape: phase 42 brought the generator's per-cell
reasons back as badges on the cells (not the deleted modal) plus a shared
`Notice` atom, and centred/enlarged the status chips. A code review of 42
found three real bugs (a deleted state setter still called, a banner shape
mismatch, stale badges surviving Clear/Undo) — fixed directly in phase 43's
commit, not a separate one. Phase 43 also fixed the DEV database collision
(see below); 43b was the actual project-config swap once its credentials
were available. `git log --oneline` is ground truth over this prose.

## What changed this session (43 / 43b) — read this before touching Settings

**Root cause, now fixed:** `src/firebase.js`'s `devConfig` pointed at
`megustastu-bookings-dev` — copied wholesale when this repo was scaffolded
from its sister app. Both apps shared one database, including one
`/settings` node holding both apps' keys interleaved. Every Scheduling
settings save spread Bookings' rev-guarded children back at their existing
values without bumping their revs, and Bookings' own rules correctly
rejected that. **The rules were right; this app was wrong** — the fix was
never a Firebase-console change on Bookings' rules, it was pointing at the
right database. Full diagnosis is written into `CLAUDE.md`'s "Dev/prod
Firebase split" section — read it before assuming this class of bug again.

**What landed:**
- `src/lib/revGuard.js` (new, pure) + `usePersistence.js` — `/settings` and
  `/shiftTemplate` writes are now an atomic root `update()` carrying the
  node and a `<name>Rev` sibling. Only these two: they're the app's sole
  whole-object writes. The four keyed collections are untouched — they
  write disjoint child paths and can't race wholesale.
- `database.rules.json` + `database.rules.README.md` (new) — this app's
  own rules file, matching Bookings' manual-publish-via-console convention.
  **Not yet published to either Firebase project.** Deploy order is app
  first, rules second — see the README for the exact sequence and the
  rollback text.
- `src/firebase.js` `devConfig` → `megustastu-scheduling-dev`. PROD config
  is untouched.

## Known open items — pick up here

### 1. DEV project needs console setup before it's usable
`megustastu-scheduling-dev` is a fresh project: no Auth users, and its
Database Rules are whatever Firebase defaults to (likely fully locked,
which blocks reads too). Before any visual session there:
1. Authentication → Sign-in method → enable Email/Password; Authentication
   → Users → create the manager account.
2. Realtime Database → Rules → paste `database.rules.json` → Publish.
3. Sign in, flip a Settings toggle, confirm `settingsRev` appears at `1` in
   the RTDB tree and counts up on subsequent saves. **This is the one thing
   phase 43's rev-CAS path could not be verified end-to-end** — before the
   swap the only reachable database correctly rejected the write; after
   the swap sign-in itself was blocked. This is the actual first test.
4. DEV starts with no employees/shifts/requests — it needs seeding (or the
   old DEV data, which is sitting in the Bookings database — see #2) before
   the generator or PDF export have anything to work with.

### 2. Bookings DEV database still holds Scheduling's old data
The Bookings-owned database still has this app's `/employees`, `/shifts`,
`/requests`, `/configRevisions`, and a set of Scheduling-only keys nested
inside its `/settings` node. Patryk is removing them manually via the
Firebase console — the exact list was given in chat, not committed to a
file (it's a one-time cleanup action, not repo documentation). If a new
session needs the list again, re-derive it: read `/Users/patrykzychowicz/Desktop/megustastu-bookings/database.rules.json`
for what Bookings owns, then read the shared DEV database's shallow
top-level + `/settings` children — anything not named in the Bookings rules
file or obviously Bookings-shaped (`bookings`, `tableBlocks*`, `waitlist*`,
`reminders*`, `reminderFires*`, `recurring*`, `conversations`, `messages`,
`templates`, every `settings/*` key the rules file names) is Scheduling's.

### 3. PROD rules not published
`database.rules.json` exists in the repo but has not been pasted into
either Firebase console yet — not DEV (blocked on #1), not PROD. PROD is
running with whatever rules it had before this branch; the app itself
already writes the rev siblings regardless (additive, harmless to old
rules), so publishing can happen at any later quiet moment without an app
redeploy. Sequence is in `database.rules.README.md`.

### 4. Bookings-repo work — a branch is waiting, untouched since creation
`/Users/patrykzychowicz/Desktop/megustastu-bookings` has a branch
`chore/roadmap-scheduling-ports` (pushed, `8903e46`, doc-only) with
ROADMAP entries for bugs ported from this repo's design-unification pass.
Untouched since the last hand-off; not investigated this session.

### 5. No PR open on either repo
Neither `feat/v16.0.0-bookings-parity-splits-perweekday` (Scheduling) nor
`chore/roadmap-scheduling-ports` (Bookings) has a PR yet. PR creation is
Patryk's call.

## What NOT to redo

- Don't re-run `/code-review` speculatively on phases 37–41 — phase 42's
  review already covered that ground and its findings are fixed.
- Don't re-litigate the "no agentic narration" copy rule (statusChip,
  Notice, noun-phrase copy) — it's locked in CLAUDE.md with the reasoning,
  including the specific banned patterns (trailing period, em dash,
  "you can still save" framing, warning glyphs).
- Don't re-derive the DEV-database-collision diagnosis — it's written up
  in full in `CLAUDE.md`'s "Dev/prod Firebase split" section and in
  `REFACTOR_LOG.md` phase 43. Don't propose relaxing Bookings' rules to
  fix a Scheduling symptom — that was the wrong fix, considered and
  rejected this session.
- Don't re-litigate BTN_SIZE / BADGE_SIZE / pillTone / segmentTone /
  R.pill — locked in CLAUDE.md.

## Verification checklist for the next real UI change

Straight from `<verification_workflow>`. One thing specific to this repo's
history: when checking anything that reads `writeWarning`, remember it's
`{ title, detail }` as of phase 42, not a string — a component that renders
it as plain text will show `[object Object]`, and a producer that sets it
as a string will render an empty `<Notice>`. Both shapes of that exact bug
were caught and fixed in phases 42 and 43.
