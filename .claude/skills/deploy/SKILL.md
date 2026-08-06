---
name: deploy
description: Ship a version of MGT Staff Scheduling — branch naming, the 13-step build/commit/PR/Vercel flow, post-merge folder sync, and preview-file naming. Use when cutting a release, bumping __APP_SIGNATURE__, opening a PR, or syncing the Claude-context folder after a merge.
---

# Deploying MGT Staff Scheduling

The hard rules live in `CLAUDE.md` (one version per branch; never run
`npm run preview`; DEV Firebase only). This skill is the mechanical
sequence.

## Branch naming

- `feat/v{X.Y.Z}-{short-slug}` for features — e.g. `feat/v0.9.0-polish`
- `chore/{slug}` for non-version changes (docs, refactors, tooling)

## Standard flow

1. After the previous PR merges, `git checkout main && git pull --ff-only`.
2. Create a new branch off fresh `main` using the naming convention above.
3. Make the edits in `src/`.
4. Bump `__APP_SIGNATURE__` in `src/App.jsx`.
5. Update `CLAUDE.md` locked-decisions if the change affects them.
6. Prepend an entry to `REFACTOR_LOG.md`.
7. `npm run build` — must succeed; note the main-bundle gz size delta.
8. Commit with a descriptive message, e.g.
   `v0.9.0 — Polish (PDF trim, specialists-first picker, role-pills toggle)`.
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

    The pull keeps the local checkout always on `main` so `npm run dev` and
    any manual file inspection reflect the shipped state without manual
    hunting. The local folder never rides a feature branch — branches live
    only in the `.claude/worktrees/` subfolders.

    The two `cp` lines (v1.5.0) keep the Claude-context folder copy of
    `CLAUDE.md` + `REFACTOR_LOG.md` in sync. That folder is what Patryk
    attaches to fresh chats; if the copy is stale, the next session loads
    with outdated architectural context (we hit this exact failure mode
    pre-v1.4.0).

## Why one version per branch

- Reverts are surgical — a single bad version reverts cleanly without also
  yanking unrelated work.
- PR review stays scoped — the reviewer doesn't need to hold two versions'
  design decisions in their head at once.
- Vercel preview URLs map 1:1 to versions, making smoke-tests on the
  preview deployment unambiguous.

## Preview file naming (when iterating before deployment)

Pattern: `scheduling_v{X}_preview {N}.jsx` — incremented chronologically,
never overwrite.

## Environment note

`gh` CLI is installed at `/opt/homebrew/bin/gh` (not on `$PATH` — use the
absolute path, or add `/opt/homebrew/bin` to your shell rc).
