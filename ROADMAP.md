# ROADMAP.md

**Pending work only** — deferred features, follow-ups, and ideas for
**MGT Staff Scheduling**.

Nothing else belongs here:

- shipped-version history → `REFACTOR_LOG.md`
- design rationale and locked decisions → `CLAUDE.md`

When a task resolves an entry, **delete it in the same commit**. If the
detail is worth keeping, it goes in that version's `REFACTOR_LOG.md` entry,
not here.

*(Created in v16.0.0. The workflow skill has always called for this file;
the repo simply never had one, so deferred items were living in thread
summaries where the next session couldn't reliably find them.)*

---

## Deferred

### Port the `:focus-visible` ring back to MGT Bookings
v16.0.0 added a global focus ring to Scheduling
(`index.html`, 2px accent / 2px offset) after finding that **neither app had
any focus affordance at all** — the clearest accessibility gap in both. The
same rule should land in Bookings.

Note the one prerequisite that bit here: Bookings' input style may set
`outline: "none"` inline, which beats a global CSS rule. Scheduling had to
drop it from `S.inputBase` for the ring to reach inputs at all.

### Eager migration never repairs config revisions
`AppShell`'s eager `/shiftTemplate` migration (v1.10.1) only touches the
**singleton**. A malformed template inside `/configRevisions/{id}.shiftTemplate`
is never canonicalised.

Pre-existing, but v16.0.0's `weekdays` axis makes the stored shape deeper and
more hand-editable, so the exposure grew. Mitigated for now by keeping every
read helper tolerant of malformed input (they fall back rather than throw).

A real fix is a revision-migration pass — deliberately out of scope for
v16.0.0, which was already carrying three features.

### `useFlip` list-reorder animation
The one Bookings animation primitive **not** ported in v16.0.0, because no
Scheduling surface currently re-sorts a list in place. If one appears (a
sortable roster, a re-ranking fairness panel), port it from
`megustastu-bookings/src/components/atoms.jsx`.

It uses WAAPI, so it must check `document.documentElement.dataset.motion`
in JS — the CSS reduced-motion kill switches cannot reach the Web Animations
API.

---

## Ideas

*(none currently)*
