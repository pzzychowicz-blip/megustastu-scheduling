// src/lib/constants.js
// Style tokens, role list, status colours, default shift template.
// Pure logic — no JSX in this file (.js extension is correct).
//
// Anything visual flows through here. New UI composes from S/BTN, NOT
// from inline rgba literals. Reuse beats reinvention.
//
// v0.11.0: every visual token reads from a CSS custom property defined
// in index.html (`:root` for light, `[data-theme="dark"]` for dark).
// JS contains zero rgba/hex literals — the theme decision lives in CSS,
// flipped by setting `document.documentElement.dataset.theme`. See
// App.jsx (system-preference default) and AppShell.jsx (settings.darkMode
// override) for where the data-theme attribute is written.

// ── Roles ────────────────────────────────────────────────────────────────
export const ROLES = Object.freeze(["Bar", "Floor", "Chef", "Plating", "Pot"]);

// Sections group roles by side of house. Used by the schedule grid and the
// default shift template (day shifts cover an entire section's roles).
//
// v1.12.0: the historical `dayRequiredRoles` field on a section was the
// system fallback for the v1.1.0 day-shift required-role rule. The
// fallback now goes through `DEFAULT_DAY_REQUIRED_ROLES` in this file +
// `resolveDayRequiredRoles` in schedule-logic.js, which together honour
// the v1.12.0 per-role boolean schema in /settings. SECTIONS just lists
// each section's role membership now.
export const SECTIONS = Object.freeze({
  foh: { label: "Front of House", roles: ["Bar", "Floor"] },
  kitchen: { label: "Kitchen", roles: ["Chef", "Plating", "Pot"] },
});

// ── Default shift template ───────────────────────────────────────────────
// v1.9.0 shape: each (section, dayPart) block stores `count` + a per-slot
// `times` array of `{start, end}` entries (one per slot). Lets the
// manager set distinct hours for each shift in a section/dayPart — e.g.
// Kitchen evening's Chef (16:00–23:00), Plating (16:00–22:00), Pot
// (17:00–22:30) all independent.
//
// Legacy v0.5.0–v1.8.x shape was `{count, start, end, secondPersonStart?}`
// — a single start/end shared by every slot. slotsForDay() in
// schedule-logic.js handles both shapes for backward compat: it reads
// `times[i]` when present, falls back to the legacy fields otherwise
// (with the v0.8.0 FoH-evening secondPersonStart override for slot 1+).
// Settings.jsx materializes the legacy shape into the new shape on first
// render so the form always edits per-slot.
export const DEFAULT_SHIFT_TEMPLATE = Object.freeze({
  foh: {
    day: {
      count: 1,
      times: [
        { start: "11:00", end: "17:00" },
      ],
    },
    evening: {
      count: 2,
      // v0.8.0 default behaviour preserved: 1st FoH evening starts at 17:00,
      // 2nd at 18:00. Both end at 23:00 (close of service).
      times: [
        { start: "17:00", end: "23:00" },
        { start: "18:00", end: "23:00" },
      ],
    },
  },
  kitchen: {
    day: {
      count: 1,
      times: [
        { start: "11:00", end: "16:00" },
      ],
    },
    evening: {
      count: 3,
      times: [
        { start: "16:00", end: "23:00" },
        { start: "16:00", end: "23:00" },
        { start: "16:00", end: "23:00" },
      ],
    },
  },
});

// ── Operating hours ──────────────────────────────────────────────────────
export const OPERATING_HOURS = Object.freeze({ start: "11:00", end: "23:00" });

// ── Opening days (v0.12.0, per-day-part since v1.3.0) ───────────────────
// Default = restaurant open every day, both day shifts and evening shifts.
// Used as a fallback when /settings has no openingDays field, so legacy
// installs keep their 7-day week.
//
// v1.3.0 shape: each weekday holds an object `{ day: bool, evening: bool }`.
// A day is "closed" when both are false. Legacy boolean values from older
// /settings docs (`openingDays.mon === true | false`) are normalized at
// read time by `normalizeOpeningDays` in schedule-logic.js:
//   - `true`  → { day: true,  evening: true  }   (fully open, as before)
//   - `false` → { day: false, evening: false }   (fully closed, as before)
// No Firebase write migration — docs upgrade lazily next time the manager
// saves Operating time. Both the in-app consumers and the PDF export
// always go through `normalizeOpeningDays` first.
export const DEFAULT_OPENING_DAYS = Object.freeze({
  mon: { day: true, evening: true },
  tue: { day: true, evening: true },
  wed: { day: true, evening: true },
  thu: { day: true, evening: true },
  fri: { day: true, evening: true },
  sat: { day: true, evening: true },
  sun: { day: true, evening: true },
});

// ── Incomplete-schedule export toggle (v15.2.0) ──────────────────────────
// `allowIncompleteExport` on /settings — when false (default), the Export
// PDF button stays disabled until every open cell on the visible week has
// an assignee (the v0.12.0 isWeekComplete gate). When true, the button is
// always clickable; clicking it on an incomplete week opens a warning
// confirm modal (ExportWarningModal) before producing a PDF with blanks.
// Missing field reads as false so legacy docs keep the gated behaviour.
export const DEFAULT_ALLOW_INCOMPLETE_EXPORT = false;

// ── Past-week lockdown toggle (v15.1.0) ──────────────────────────────────
// `pastWeeksLocked` on /settings — when true (default), weeks whose Sunday
// is before today are read-only on the Schedule grid (v1.12.0 behaviour).
// When false, past weeks stay fully editable (no banner, no button gates).
// Missing field reads as true so legacy docs keep the locked behaviour.
export const DEFAULT_PAST_WEEKS_LOCKED = true;

// ── Employee work pattern (v0.12.0) ──────────────────────────────────────
// `workingDaysPerWeek` on each employee — number of working days per week,
// 1..7. Off-days = 7 − N. v1.0 just stores + displays it; the auto-generator
// (v1.x) is the primary consumer.
export const DEFAULT_WORKING_DAYS = 5;

// ── Auto-generator settings (v1.0.0) ─────────────────────────────────────
// `generatorStrictPreference` on /settings — when false (default), the
// generator first tries employees whose shift preference matches the slot's
// dayPart, then falls back to anyone eligible. When true, preference is a
// hard filter: a "day"-preference employee will never be auto-assigned to
// an evening slot. Hard mode increases unfilled cells but is useful when
// the manager has carefully tuned preferences and wants them respected.
export const DEFAULT_GENERATOR_STRICT_PREFERENCE = false;

// ── Generator reason labels (v1.4.0, deleted phase 38, restored phase 42) ─
// Human labels for the codes `buildCandidates` in generator.js returns when
// no candidate survives its filters. Keyed by reason code — that file emits
// them, this one names them, and they must stay in step.
//
// Phase 38 deleted this along with GenerateResultsModal, on the reasoning
// that a modal reporting on a finished run was the app narrating its own
// work. That was right about the MODAL and wrong about the DATA: "this cell
// is empty" is visible on the grid, but "and nothing could legally go in it"
// is not deducible from anything on screen, so the manager was left unable
// to tell a cell the generator skipped from one it never considered.
//
// Restored in a different shape. The label now hangs on the CELL it explains
// rather than in a list that describes the run, which is the distinction
// that matters: it answers a question the artifact raises, in the place the
// question is raised.
//
//   tag    — the in-cell badge. Rendered uppercase at BADGE_SIZE.cell, so it
//            has ~50px beside the word "Open". Terse to the point of being
//            a mnemonic; `detail` is what actually explains it.
//   detail — the title tooltip. One clause, names the constraint, no
//            trailing period and no advice about what to do next.
//
// The "regenerated" code is deliberately absent. It tags shifts CLEARED by a
// Regenerate wipe, and no surface shows cleared records any more — a label
// nothing renders is the dead-token case this file warns about elsewhere.
export const GENERATOR_REASONS = Object.freeze({
  "no-role-match": {
    tag: "no role",
    detail: "No active employee holds a role for this slot",
  },
  "out-of-tenure": {
    tag: "tenure",
    detail: "Everyone qualified is outside their active dates on this date",
  },
  "all-on-request": {
    tag: "on leave",
    detail: "Everyone qualified has a day-off or holiday request on this date",
  },
  "all-shift-pref": {
    tag: "day part",
    detail: "Everyone qualified has a shift-preference request against this day part",
  },
  "all-conflicted": {
    tag: "booked",
    detail: "Everyone qualified already works this date, or their fixed days exclude it",
  },
  "all-at-quota": {
    tag: "at quota",
    detail: "Everyone qualified has reached their weekly shift quota",
  },
  "no-2-off": {
    tag: "rest rule",
    detail: "Assigning anyone would break the consecutive-days-off rule",
  },
  "max-consecutive": {
    tag: "max days",
    detail: "Assigning anyone would exceed the consecutive-working-days cap",
  },
  "preference": {
    tag: "preference",
    detail: "No qualified employee prefers this day part, and strict matching is on",
  },
  "no-eligible": {
    tag: "no staff",
    detail: "No employee qualified for this cell",
  },
});

// ── Scheduling rules (v1.11.0) ───────────────────────────────────────────
// Three rules that used to be hard-coded constants become first-class
// /settings knobs in v1.11.0. Defaults preserve every prior version's
// behaviour byte-for-byte — legacy /settings docs (lacking the new
// fields) read the defaults via the defensive-fallback pattern in
// ScheduleGrid.jsx, so nothing changes on the wire until the manager
// edits the new Settings → "Scheduling rules" accordion section.
//
// Each rule affects BOTH the generator HARD filter AND the manual picker
// SOFT warning — they're scheduling-policy knobs, not generator-only
// knobs (which is why they live in their own Settings section rather
// than under Auto-generator).
//
// 1. minConsecutiveDaysOff (1..3, default 2)
//    Was hard-coded in `hasConsecutiveDaysOff` (schedule-logic.js).
//    Both call sites — generator.js step 6, ShiftFormModal restWarning —
//    used to pass `undefined` so the helper's own default applied.
//    v1.11.0 threads the configured value through every call site.
// 2. maxConsecutiveWorkingDays (3..14, default 5)
//    Was hard-coded in `withinMaxConsecutiveWorkingDays` (schedule-
//    logic.js). Same `undefined` pattern at generator.js step 6.5 and
//    ShiftFormModal maxConsecutiveWarning. Always-on — no disable
//    toggle (locked decision: labor wellness rule, the cap is the
//    knob, not its existence).
// 3. dayRequiredRoles (object keyed by section, per-role boolean map)
//    Was hard-coded as `SECTIONS.kitchen.dayRequiredRoles = ["Chef"]`
//    in constants.js. SECTIONS stays put as the system fallback when
//    `slotsForDay` is called bare (tests, future call sites). The
//    /settings override flows through `slotsForDay(template, override)`
//    so every consumer of `slotDef.requiredRoles` (picker filter,
//    `roleMatchesSlot` used by generator + Swap) inherits the change.
//    Default mirrors pre-v1.11.0 — FoH permissive (all roles false),
//    Kitchen requires Chef (Chef true, others false).
//
//    v1.12.0 schema: per-role boolean object instead of v1.11.0's
//    array-of-role-names. Reason: Firebase RTDB strips empty arrays to
//    null when writing — saving `kitchen: []` (manager's "permissive"
//    choice) wrote nothing back, the v1.11.0 resolver fell back to the
//    default `["Chef"]`, and the Chef pill sprang back on next render.
//    Booleans (including `false`) ARE preserved by Firebase, so the
//    configured-but-permissive state survives a round-trip. The v1.11.0
//    array shape stays readable via the type-guarded resolver in
//    schedule-logic.js (`resolveDayRequiredRoles`) so legacy docs
//    upgrade lazily on the next pill click.
export const DEFAULT_MIN_CONSECUTIVE_DAYS_OFF = 2;
export const MIN_CONSECUTIVE_DAYS_OFF_MIN = 1;
export const MIN_CONSECUTIVE_DAYS_OFF_MAX = 3;

export const DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS = 5;
export const MAX_CONSECUTIVE_WORKING_DAYS_MIN = 3;
export const MAX_CONSECUTIVE_WORKING_DAYS_MAX = 14;

export const DEFAULT_DAY_REQUIRED_ROLES = Object.freeze({
  foh: Object.freeze({ Bar: false, Floor: false }),
  kitchen: Object.freeze({ Chef: true, Plating: false, Pot: false }),
});

// ── Status colours (alpha-tinted, matches Bookings pattern) ──────────────
// v0.11.0: each entry references CSS vars that flip on dark mode.
export const STATUS_COLORS = Object.freeze({
  open: {
    bg: "var(--status-open-bg)",
    text: "var(--status-open-text)",
    border: "var(--status-open-border)",
  },
  assigned: {
    bg: "var(--status-assigned-bg)",
    text: "var(--status-assigned-text)",
    border: "var(--status-assigned-border)",
  },
  confirmed: {
    bg: "var(--status-confirmed-bg)",
    text: "var(--status-confirmed-text)",
    border: "var(--status-confirmed-border)",
  },
  cancelled: {
    bg: "var(--status-cancelled-bg)",
    text: "var(--status-cancelled-text)",
    border: "var(--status-cancelled-border)",
  },
});

// ── Role colours (RGB triplet refs — composers add their own alpha) ──────
// v0.11.0: each entry is a `var(--role-x-rgb)` reference pointing at a
// comma-separated R,G,B triplet defined in index.html. Callers compose
// alpha at the use site:
//   background: `rgba(${ROLE_COLORS.Bar}, 0.2)`
//   color:      `rgb(${ROLE_COLORS.Bar})`
//   border:     `1px solid rgba(${ROLE_COLORS.Bar}, 0.4)`
// This keeps the alpha-on-the-fly pattern that the schedule grid + modals
// already use, while making the channel values theme-aware.
export const ROLE_COLORS = Object.freeze({
  Bar: "var(--role-bar-rgb)",
  Floor: "var(--role-floor-rgb)",
  Chef: "var(--role-chef-rgb)",
  Plating: "var(--role-plating-rgb)",
  Pot: "var(--role-pot-rgb)",
});

// Fallback RGB triplet for "unknown role" use sites. Resolves to the same
// neutral grey in both themes (lighter in dark mode automatically).
export const ROLE_COLOR_FALLBACK = "var(--role-fallback-rgb)";

// ── Radii scale (R) ──────────────────────────────────────────────────────
// v16.0.0: ported from MGT Bookings so the two apps share one radii
// vocabulary. Values are defined in index.html's :root and are deliberately
// NOT duplicated into the dark block — radii are theme-agnostic.
//
// ASSIGN BY ROLE, never by matching the old literal — the same
// `borderRadius: 12` meant "control" in one file and "card" in another, so
// every call site is read rather than pattern-replaced:
//
//   R.pill    CONTROLS — every button, input, select, chip, badge,
//             segmented track AND its segments, weekday pill, stepper.
//             999px is a true pill at any control height because CSS
//             clamps an oversized radius to half the box, so one token
//             covers 28px pills and 44px sheet actions alike with no
//             per-element arithmetic.
//   R.auth    the login card, only.
//   R.sheet   modal shells + popovers.
//   R.card    cards, banners, panels, soft surfaces, Collapsible bodies.
//   R.inset   rows nested inside a card, and the schedule grid cells.
//
// CANVAS EXCEPTION — the schedule grid cells stay `inset`. They are a data
// grid, the direct analogue of Bookings' timeline blocks (an explicit
// exception there too): a 100×60px cell at 999px reads as a lozenge and
// the grid stops reading as a table.
//
// Documented exceptions that stay NUMERIC at their call sites, because
// they are geometry rather than a surface role: `borderRadius: "50%"`
// circles, the Kbd keycap (6), the MonthlyFairnessPanel delta-bar trio
// (5/5/1/4), the EmployeeFairnessModal sparkline pair (6), and the mobile
// Overlay sheet's full-bleed 0. The list is exhaustive: `grep -rn
// "borderRadius: [0-9]" src/` should return exactly these. (ScheduleGrid's
// section band and closed tag were listed here through the sweep but were
// in fact converted — to R.card and R.pill — so they are not exceptions.)
// src/lib/pdf-export.js is out of scope entirely — it never reads CSS vars
// (the printed palette is locked light, v0.11.0).
//
// Values are IDENTICAL to MGT Bookings v17.7.0's scale, token for token.
// That is the point: a shared vocabulary that can't drift apart again.
export const R = Object.freeze({
  pill: "var(--r-pill)",
  auth: "var(--r-auth)",
  sheet: "var(--r-sheet)",
  card: "var(--r-card)",
  inset: "var(--r-inset)",
});

// ── Style tokens (S) ─────────────────────────────────────────────────────
// Translucent / glass aesthetic, iOS-inspired. Matches MGT Bookings.
// v0.11.0: backed by CSS vars; theme flip swaps every value automatically.
export const S = Object.freeze({
  // Layout shells
  appShell: {
    minHeight: "100vh",
    padding: "24px 16px",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  },
  card: {
    width: "100%",
    maxWidth: 720,
    // v16.0.0 (phase 28): the flexbox min-width trap. `appShell` is
    // `display: flex`, so this card is a flex item, and a flex item's
    // default `min-width: auto` refuses to shrink below its CONTENT's
    // min-content width. The schedule grid sets an explicit `minWidth`
    // (944px for a 7-day week) on the element inside its `overflowX: auto`
    // wrapper — that min-content width propagated all the way up and won
    // against `width: 100%`.
    //
    // Measured on a 932px viewport: the card rendered 942px wide at
    // left: -5, so the PAGE itself scrolled horizontally by 5px and every
    // fixed reference point shifted with it. `min-width: 0` restores the
    // intended behaviour — the card is 900px, and the grid scrolls inside
    // its own wrapper, which is what that wrapper was for.
    minWidth: 0,
    background: "var(--bg-card)",
    border: "1px solid var(--border-card)",
    borderRadius: R.card,
    padding: 20,
    boxShadow: "var(--shadow-card)",
  },

  // Typography
  h1: { margin: "0 0 4px 0", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)" },
  h2: { margin: "0 0 6px 0", fontSize: 17, fontWeight: 600, color: "var(--text-primary)" },
  body: { margin: "8px 0 0 0", fontSize: 14, lineHeight: 1.45, color: "var(--text-primary)" },
  muted: { margin: 0, fontSize: 12, color: "var(--text-muted)" },
  // v16.0.0 (phase 33): the title line of a list row card — the employee
  // name in EmployeesList, the employee name in RequestsList. Both were
  // hand-written at `fontSize: 15`, which sits between `body` (14) and
  // `h2` (17) and matched nothing else in the app. Body size at 600
  // weight is the row-title convention already used elsewhere, so this
  // puts them on the scale and keeps the two mirrored surfaces in
  // lockstep. Callers add their own `textDecoration` / `opacity` for the
  // archived state.
  rowTitle: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },
  // v16.0.0 (phase 33): the heading of a panel stacked under the schedule
  // grid — "Shifts assigned", "Requests this week", "Last 28 days ·
  // fairness". All three wrote `{ ...S.h2, margin: 0, fontSize: 14 }`,
  // i.e. each one reached for h2 and then immediately overrode its size.
  // Three copies of the same override is a missing token, and it is how
  // the headings would eventually drift apart.
  panelTitle: { margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text-primary)" },

  // Generic surfaces
  surfaceSoft: {
    background: "var(--bg-soft)",
    border: "1px solid var(--border-soft)",
    borderRadius: R.card,
    padding: 12,
    boxShadow: "var(--shadow-soft)",
  },

  // Inputs (inset shadow for depth, matches Bookings)
  inputBase: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    fontSize: 14,
    color: "var(--text-input)",
    background: "var(--bg-input)",
    border: "1px solid var(--border-input)",
    // v16.0.0 pill radius: inputs are CONTROLS. 999px clamps to half the
    // box, so this is a true pill at every input height in the app.
    borderRadius: R.pill,
    boxShadow: "var(--shadow-input-inset)",
    // v16.0.0: `outline: "none"` removed. It was an inline style, so it beat
    // the global :focus-visible rule in index.html and left every input in
    // the app with no focus affordance at all. The browser default outline
    // it was suppressing is now replaced by that rule's accent ring.
  },

  // Selects. Identical to inputBase except that the fill is set with
  // `backgroundColor` rather than the `background` SHORTHAND — and that is
  // the entire reason this token exists, so do not "simplify" it back.
  //
  // v16.0.0 (phase 42) draws the dropdown chevron as a `background-image` on
  // the `.mgt-select` class in index.html (see there for why the native one
  // had to go). An inline `background: …` is a shorthand, so it resets
  // `background-image` to `none`, and inline styles beat class rules — which
  // silently deleted the chevron and left the control with no affordance at
  // all. Longhand touches only the colour and leaves the image alone.
  //
  // The right padding IS here, and has to be: it clears the chevron, so it
  // belongs with the chevron — but `padding` is a shorthand and inline beats
  // the class, so a `padding-right` in `.mgt-select` would be overwritten by
  // this token exactly the way the `background` shorthand was overwriting the
  // chevron. Measured in the browser, which is the only reason it was caught.
  // 34px against the chevron's `right 14px` leaves the glyph clear of both
  // the pill's curve and the longest option label.
  selectBase: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 34px 10px 12px",
    fontSize: 14,
    color: "var(--text-input)",
    backgroundColor: "var(--bg-input)",
    border: "1px solid var(--border-input)",
    borderRadius: R.pill,
    boxShadow: "var(--shadow-input-inset)",
  },

  // Field block
  // v16.0.0 (pill radius): Fld-wrapped rows opt into `.mgt-hover-scale` in
  // Settings and had no radius of their own — they took their hover-card
  // shape from that rule's border-radius, which is now deleted so pills
  // survive hover. `card`, not `pill`: a labelled field row is a surface.
  fldRow: { marginBottom: 12, borderRadius: R.card },
  fldLabel: {
    display: "block",
    fontSize: 12,
    color: "var(--text-secondary)",
    marginBottom: 4,
    fontWeight: 600,
  },
});

// ── Button tokens (BTN) ──────────────────────────────────────────────────
// Compose mkBtn(BTN.primary, { ...overrides }) at call sites.
// v0.11.0: theme-aware via CSS vars.
//
// v16.0.0 note on cross-app parity: MGT Bookings exports ten BTN variants,
// but they are named for ITS domain (tables / edit / del / cancel / clear /
// reset / today / nav / dismiss / orange). Scheduling's five semantic
// variants cover every call site here, so the parity pass deliberately did
// NOT import the extra eight — dead tokens are worse than no tokens. What
// IS shared is the radii scale (R) and the motion vocabulary in index.html.
export const BTN = Object.freeze({
  base: {
    appearance: "none",
    border: "1px solid transparent",
    // v16.0.0 pill radius: buttons are CONTROLS. This one line is the
    // highest-leverage edit in the rollout — every mkBtn call site, and
    // every raw `...BTN.base` button, becomes a pill from here.
    borderRadius: R.pill,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none",
    boxShadow: "var(--shadow-soft)",
  },
  primary: {
    background: "var(--accent)",
    color: "var(--text-on-accent)",
    border: "1px solid var(--accent-deep)",
  },
  secondary: {
    background: "var(--btn-secondary-bg)",
    color: "var(--btn-secondary-text)",
    border: "1px solid var(--btn-secondary-border)",
  },
  danger: {
    background: "var(--btn-danger-bg)",
    color: "var(--text-on-accent)",
    border: "1px solid var(--btn-danger-border)",
  },
  ghost: {
    background: "transparent",
    color: "var(--btn-ghost-text)",
    border: "1px solid var(--btn-ghost-border)",
  },
});

// ── Button size scale (BTN_SIZE) ─────────────────────────────────────────
// v16.0.0 (phase 22). BTN carries a control's COLOUR; this carries its
// SIZE. Compose them: `{ ...BTN.base, ...BTN.ghost, ...BTN_SIZE.sm }`.
//
// Why this exists: before phase 22 the app had THIRTEEN distinct control
// sizes across ~40 hand-rolled `<button style={{ ...BTN.base, padding,
// fontSize }}>` sites — 10/14, 8/14, 8/12, 6/14, 6/12·13, 6/12·12, 6/10·13,
// 6/10·12, 4/10·12, 4/10·11, 3/9, 2/10, 2/8. Every one had been tuned by
// eye at its own call site, so controls that sit side by side (Prev / Today
// / Next; Roles / Priority / Fixed days) disagreed by a pixel or two in
// ways that read as sloppiness rather than intent.
//
// Four tiers, assigned by ROLE — same discipline as the R radii scale:
//
//   lg   Modal primary actions (Save / Cancel / Delete). This is BTN.base's
//        own padding, so `mkBtn` with no size override is already `lg`.
//   md   The default for anything the manager aims at directly: week nav,
//        segmented controls, form pills, scope pickers, modal secondaries.
//   sm   Inline controls that sit INSIDE another surface and must not
//        dominate it: list "Show" buttons, summary pills, Settings pills.
//   xs   Markers and dismissers riding on one line of text, where any more
//        vertical padding would grow the row: banner ×, split marker.
//
// GLYPH EXCEPTION: a button whose whole label is a glyph (× or ‹ ›) may
// override `fontSize` upward while keeping its tier's padding — an 11px ×
// is an unhittable speck. Keep the padding so the row height still agrees.
// Two such buttons exist, both in ScheduleGrid's banners; each says so.
//
// The three buttons that are deliberately OFF this scale — verified by
// reading every button's computed padding in the browser, so this list is
// exhaustive:
//
//   ConnectionStatus dot (padding: 6px)  — a 50%-radius circle. Its padding
//     is the circle's geometry, not a text control's breathing room.
//   MonthlyFairnessPanel delta bar (0)   — a wrapper around a fixed 160×10
//     bar; any padding would misalign the bars between rows.
//   MonthlyFairnessPanel name button (4px 8px) — LOCKED. v1.13.0 spent
//     seven review rounds on this row; round 5 tried exactly this scale's
//     `sm` (4px 10px) "to match the WeeklyShiftSummary pill rhythm" and it
//     was rejected — the row read too short and the hover card lost its
//     snug fit. Do not re-align it without asking first.
export const BTN_SIZE = Object.freeze({
  lg: { padding: "10px 14px", fontSize: 14 },
  md: { padding: "7px 12px", fontSize: 13 },
  sm: { padding: "4px 10px", fontSize: 12 },
  xs: { padding: "2px 8px", fontSize: 11 },
});

// ── Badge size scale (BADGE_SIZE) ────────────────────────────────────────
// v16.0.0 (phase 24). The label counterpart to BTN_SIZE. A badge is a
// non-interactive pill: a role chip, a request-type label, a status marker.
//
// `base` is deliberately the same metrics as BTN_SIZE.xs — a standalone
// badge and the app's smallest button are the same physical size, which is
// what lets a "split" marker sit beside a summary pill without either
// looking mis-scaled. The `TBadge` atom spreads it, so anything rendered
// through TBadge is already correct; these tokens exist for the surfaces
// that can't use the atom (a badge that is also a <button>, or one whose
// palette is composed inline).
//
// `cell` is the SCHEDULE-GRID exception, and it is a real one rather than
// drift. A cell is ~110px wide and already carries a time range and a name;
// `base` metrics on the role chip pushed the assignee name onto a second
// line. Two surfaces need it — the role chip and the inert "closed" /
// "not today" tag — and before this they were 1px 6px/10 and 1px 5px/9,
// near-identical for no reason anyone recorded.
//
// `status` (v16.0.0 phase 42) is the grid's PAGE-LEVEL chip — the swap
// refusal, the no-op notice, the unfilled count, the read-only marker. It
// sits alone above a 944px grid with nothing beside it to be scaled
// against, and at `base` metrics it was legible but easy to miss: an 11px
// pill floating over a grid of 13px assignee names does not read as the
// thing that just happened. Roughly +30% on both axes, landing a hair above
// BTN_SIZE.lg — deliberate, since this is the one label on the page
// competing with a whole data grid for attention.
export const BADGE_SIZE = Object.freeze({
  base: { padding: "2px 8px", fontSize: 11 },
  cell: { padding: "1px 6px", fontSize: 10 },
  status: { padding: "5px 14px", fontSize: 14 },
});

// ── Selectable-pill tones ────────────────────────────────────────────────
// v16.0.0 (phase 23). Returns a STYLE FRAGMENT — spread it, don't render
// it. (Contrast `mkBtn` / `mkInp` in atoms.jsx, which return JSX.)
//
// The app has two distinct shapes of "pick one / pick several", and before
// phase 23 both were re-typed at every call site with drift:
//
//   pillTone     A free-standing pill on the page background. OFF must be
//                VISIBLE — it is the only thing showing there is a control
//                there at all — so OFF gets `--bg-pill` plus a border.
//                Used by: Clear scope picker, fixed-days weekdays, the
//                recurring-weekday picker, Settings open-day parts,
//                min-consecutive-days-off, day-required roles, and the
//                Fixed days / Priority booleans.
//
//   segmentTone  A segment inside a `--bg-segment-strong` track. The track
//                already draws the control, so OFF is TRANSPARENT and
//                borderless — an OFF segment with its own fill would read
//                as a second selected state. Used by: shift preference,
//                working-days-per-week, request type, preferred day part.
//
// ON is solid `--accent` in BOTH. That is the whole point: before this,
// "Fixed days: ON" painted `--accent-tint-mid` while "Priority: ON" beside
// it painted solid `--accent`, so two booleans on one form disagreed about
// what ON looks like.
//
// DELIBERATELY NOT ROUTED THROUGH THESE — each carries meaning that a
// generic accent would destroy:
//   • Role pills (EmployeeFormModal, ShiftFormModal) — ON is the ROLE's own
//     colour from ROLE_COLORS. That is the app's role-identity language.
//   • Active / Archived (EmployeeFormModal) — a record STATUS, not a
//     setting. Keeps the `--bg-active-on` green it shares with the grid's
//     pill-highlight axis.
//   • Tab nav (AppShell) — a lifted `--bg-tab-active` pill with a shadow,
//     matching MGT Bookings' tab track.
export function pillTone(on) {
  return {
    background: on ? "var(--accent)" : "var(--bg-pill)",
    color: on ? "var(--text-on-accent)" : "var(--text-primary)",
    border: "1px solid " + (on ? "var(--accent-deep)" : "var(--btn-ghost-border)"),
  };
}

export function segmentTone(on) {
  return {
    background: on ? "var(--accent)" : "transparent",
    color: on ? "var(--text-on-accent)" : "var(--text-primary)",
    border: "1px solid transparent",
  };
}

// ── Request types ────────────────────────────────────────────────────────
// v0.11.0: palettes reference the status-* CSS vars so they retune for
// dark mode along with the rest of the status palette.
//
// v1.2.0: the `shift-preference` type is qualitatively different from
// dayoff / holiday — instead of blocking the employee from working at
// all, it constrains them to ONE dayPart (Day or Evening) on the given
// dates. The request record carries an extra `preferredDayPart` field
// ("day" | "evening"). `findRequestConflict` ignores it (only blocks
// for dayoff / holiday); `findShiftPreferenceMismatch` handles the
// dayPart-specific gating.
export const REQUEST_TYPES = Object.freeze([
  {
    key: "dayoff",
    label: "Day off",
    palette: {
      bg: "var(--status-open-bg)",
      text: "var(--status-open-text)",
      border: "var(--status-open-border)",
    },
    // v16.0.0: the SOLID variant, used wherever this type renders as a
    // LABEL (requests list, weekly preview, preview modal) so it reads at
    // the same weight as the buttons beside it. The tinted `palette` above
    // stays for PICKERS, where "chosen = solid, rest = tinted" is the only
    // thing distinguishing the selected option.
    solidPalette: {
      bg: "var(--status-open-solid)",
      text: "var(--text-on-accent)",
      border: "var(--border-overlay-sheet)",
    },
  },
  {
    key: "holiday",
    label: "Holiday",
    palette: {
      bg: "var(--status-confirmed-bg)",
      text: "var(--status-confirmed-text)",
      border: "var(--status-confirmed-border)",
    },
    // v16.0.0: the SOLID variant, used wherever this type renders as a
    // LABEL (requests list, weekly preview, preview modal) so it reads at
    // the same weight as the buttons beside it. The tinted `palette` above
    // stays for PICKERS, where "chosen = solid, rest = tinted" is the only
    // thing distinguishing the selected option.
    solidPalette: {
      bg: "var(--status-confirmed-solid)",
      text: "var(--text-on-accent)",
      border: "var(--border-overlay-sheet)",
    },
  },
  {
    key: "shift-preference",
    label: "Shift preference",
    palette: {
      bg: "var(--status-cancelled-bg)",
      text: "var(--status-cancelled-text)",
      border: "var(--status-cancelled-border)",
    },
    // v16.0.0: the SOLID variant, used wherever this type renders as a
    // LABEL (requests list, weekly preview, preview modal) so it reads at
    // the same weight as the buttons beside it. The tinted `palette` above
    // stays for PICKERS, where "chosen = solid, rest = tinted" is the only
    // thing distinguishing the selected option.
    solidPalette: {
      bg: "var(--status-cancelled-solid)",
      text: "var(--text-on-accent)",
      border: "var(--border-overlay-sheet)",
    },
  },
]);

// ── Day-part labels (used by grid + form) ────────────────────────────────
export const DAY_PARTS = Object.freeze({
  day: { label: "Day", short: "D" },
  evening: { label: "Evening", short: "E" },
});

// ── Weekday helpers ──────────────────────────────────────────────────────
// Week starts Monday — matches EU / restaurant rota convention.
export const WEEKDAYS = Object.freeze([
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
]);
