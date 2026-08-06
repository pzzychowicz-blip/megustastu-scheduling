# Hand-off — v16.0.0, same branch, new session

Written 2026-08-06. Delete this file once the branch is merged (or once its
content is stale) — it is a session-to-session note, not permanent repo
documentation.

## State

- **Branch:** `feat/v16.0.0-bookings-parity-splits-perweekday` — pushed,
  up to date with origin at `6ba81af`. No PR open.
- **Version:** stays `16.0.0`. Do not bump — this branch is still v16.0.0
  in progress (design-unification + bugfix phases 22–36 on top of the
  original three-part v16.0.0 feature work).
- **Working tree:** clean as of the last commit. `npm run build` passes.
- **Dev server:** `npm run dev` — DEV Firebase (`megustastu-bookings-dev`).

## What this branch is

Originally: MGT Bookings visual/motion parity + manual split shifts +
per-weekday shift template (the plan in `/Users/patrykzychowicz/.claude/plans/`,
now executed — phases 1–21 under the old numbering, phases correspond to
commits, not the plan's Part A/B/C letters).

Then a design-consistency pass was requested (screenshots flagged
inconsistent button sizes, ON-state colours, missing press/hover feedback,
missing transitions) — phases 22–29. Then bug reports (a toggle that
silently reverted, more jumping) — phases 30–35. Then a self-review of
phases 22–35, findings fixed — phase 36. Then one more UI tweak (moved the
connection-status dot to the right of Sign out) — phase 35 actually, see
below for the exact ordering; check `git log --oneline` for ground truth
rather than trusting phase numbers in prose, including this file.

## Known open items — pick up here

### 1. Firebase Rules — cannot be fixed from this repo
`/settings` writes are `PERMISSION_DENIED` on the DEV project
(`megustastu-bookings-dev`), while reads work and the user is signed in.
Diagnosis (phase 30): DEV is **shared with the MGT Bookings app**, whose
Realtime Database Rules cover its own paths (`/bookings`, `/tableBlocks`,
`/tableBlocksRev`) and not Scheduling's six paths (`employees`, `shifts`,
`requests`, `configRevisions`, `shiftTemplate`, `settings`).

**This needs a change in the Firebase Console that only Patryk can make.**
Until it's fixed:
- Every Settings toggle that writes to `/settings` (Dark mode, Show role
  pills, Allow incomplete export, Auto-generator toggles, Scheduling
  rules) will show the phase-30 error banner ("Couldn't save settings —
  the database refused the write…") instead of actually saving.
- `pastWeeksLocked` can't be toggled either, which is WHY the read-only
  banner fix (phase 36, finding #1) could only be verified structurally,
  not by actually triggering `isReadOnly` live — the DEV dataset happens
  to have `pastWeeksLocked` off and there's no way to flip it on right now.
- **First thing to check in a new session:** ask if Patryk has fixed the
  DEV rules yet. If yes, go verify the read-only-banner Reveal fix
  end-to-end (navigate into a genuinely locked past week, confirm the
  banner eases in/out and the grid doesn't jump) — that's the one piece of
  phase 36 that shipped unverified.
- Also worth checking PROD (`megustastu-scheduling`, a separate Firebase
  project) isn't carrying the same gap — it was never checked either way.

### 2. Bookings-repo work — a branch is waiting, untouched since creation
`/Users/patrykzychowicz/Desktop/megustastu-bookings` has a branch
`chore/roadmap-scheduling-ports` (pushed, `8903e46`, doc-only) with two
ROADMAP entries:
- the `.mgt-hover-scale` / `.mgt-press` shared-transition bug (same one
  fixed here in phase 27) — confirmed present in Bookings' actual source,
  28 call sites there carry both classes;
- the missing `:focus-visible` ring.

Phase 36 of THIS session added a third bug that also exists in Bookings
verbatim: the render-phase `last.current = children` write in `Presence`/
`Reveal`/`ModalPresence` (Scheduling's `atoms.jsx`). **That third one was
NOT yet added to the Bookings ROADMAP branch** — this hand-off is the
first place it's written down. If a session works in the Bookings repo,
either add it to that branch before opening a PR, or note that it's still
missing.

The Bookings repo itself is back on clean `main` — the branch exists only
on origin, nothing checked out.

### 3. No PR open on either repo
Neither `feat/v16.0.0-bookings-parity-splits-perweekday` (Scheduling) nor
`chore/roadmap-scheduling-ports` (Bookings) has a PR yet. Per CLAUDE.md,
PR creation is Patryk's call — don't open one unprompted, but if asked
"push and open a PR" in a future turn, both branches are ready for it as
of this hand-off.

## What NOT to redo

- Don't re-run `/code-review` speculatively — phase 36 already applied
  every finding from the last review pass (verified in DEV where
  possible, see the phase 36 commit message for exactly what was and
  wasn't exercised live).
- Don't re-litigate the BTN_SIZE / BADGE_SIZE / pillTone / segmentTone
  design decisions — they're locked in CLAUDE.md with the reasoning.
  Notably: the MonthlyFairnessPanel name button's `4px 8px` padding is
  explicitly NOT to be changed without asking (Patryk rejected exactly
  that change in v1.13.0 round 5).
- Don't re-derive the ROADMAP split rationale — it's written up in both
  repos' ROADMAP.md files and in this repo's CLAUDE.md.

## Verification checklist for the next real UI change

Straight from `<verification_workflow>`, nothing project-specific beyond:
run `npm run dev`, and when checking anything animated, remember phase 31
found a `Reveal` needs BOTH `rAF` to fire (it doesn't reliably in a
backgrounded/automated tab — there's now a 60ms fallback) and its
`overflow: visible` flip to have actually happened before you trust a
measurement of "is this clipped." Screenshot-then-measure, not just
measure, catches the difference.
