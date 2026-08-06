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

### Bookings animation primitives not yet ported
Two of Bookings' animation atoms still have **no Scheduling consumer**, so
they are deliberately absent from `src/components/atoms.jsx`. Port each one
*with* its first real call site — never speculatively, or its first
execution in this app is also its first test.

*(`Toast` and `Reveal` were ported in v16.0.0 phase 26 with the two
consumers this entry named — the result banner and the `Collapsible` body.
`Reveal`'s `horizontal` variant is still unported: no inline-axis
consumer.)*

- **`AutoHeight`** — eases its own height when content is *replaced* rather
  than shown/hidden. `Reveal` does not cover this case: it animates between
  "there" and "not there", while `AutoHeight` animates between two
  different contents. Its `onTransitionEnd` needs an `e.target ===
  e.currentTarget` guard on arrival (transitionend bubbles) — the same bug
  the v16.0.0 review found in `SlideView`.
- **`useFlip`** — list-reorder animation. No Scheduling surface re-sorts a
  list in place yet; a sortable roster or a re-ranking fairness panel would
  want it. It uses WAAPI, so it must check
  `document.documentElement.dataset.motion` in JS — the CSS reduced-motion
  kill switches cannot reach the Web Animations API.

Both live in `megustastu-bookings/src/components/atoms.jsx`. Everything
they depend on is already here — `usePresenceLifecycle` is shared with
`Presence`, `ModalPresence`/`usePresence`, `SlideView`, `Toast` and
`Reveal`.

### Port the shared-transition fix back to MGT Bookings
v16.0.0 phase 27 found that `.mgt-hover-scale` and `.mgt-press` each
declared their own `transition`. Being equal-specificity single-class
selectors, the later rule REPLACED the earlier one, so every element
carrying both classes lost its `transform` transition and its hover
snapped. Scheduling now declares the transition once for both selectors.

**Check whether Bookings has the same bug** — the two classes came from
there, and if its `.mgt-press` also sits below `.mgt-hover-scale` with its
own `transition`, the same silent hover-snap applies.

### Card width jumps on tab switch
[AppShell.jsx:360](src/components/AppShell.jsx:360) sets
`maxWidth: tab === "schedule" ? 1100 : 820`, so the card's edges move by
~19px when the manager switches tabs. Deliberate — the schedule grid needs
the room and the forms would look stretched at 1100 — but it is the one
remaining layout shift after the v16.0.0 phase 28 sweep. Worth revisiting
if a layout emerges that suits both.

---

## Ideas

*(none currently)*
