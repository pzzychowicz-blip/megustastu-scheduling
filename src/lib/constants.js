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
// v1.1.0: optional `dayRequiredRoles` field on a section makes the day
// shift require at least one of the listed roles (not just "any of
// coversRoles"). The day cook for Kitchen has to actually be a Chef —
// Plating-only or Pot-only people aren't trained to lead the prep run.
// FoH Day stays permissive (no required role; any of Bar/Floor works).
// The slotsForDay enumerator copies this onto each day slot's
// `requiredRoles` field; both the manual picker (ShiftFormModal) and
// the auto-generator (generator.js) read from the slot.
export const SECTIONS = Object.freeze({
  foh: { label: "Front of House", roles: ["Bar", "Floor"] },
  kitchen: {
    label: "Kitchen",
    roles: ["Chef", "Plating", "Pot"],
    dayRequiredRoles: ["Chef"],
  },
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

// v1.9.4: generator-results banner auto-dismiss + duration. The banner
// appears above the schedule grid after a Generate/Regenerate/Clear run
// summarizing the outcome. By default it auto-dismisses 5s after
// appearing; the manager can disable auto-dismiss entirely (banner
// stays until they ×-close it or another run replaces it) or tune the
// duration (1–60s). ScheduleGrid reads these settings on every render;
// the auto-dismiss effect re-runs when either value changes.
export const DEFAULT_GENERATOR_BANNER_AUTO_DISMISS = true;
export const DEFAULT_GENERATOR_BANNER_DURATION_SEC = 5;
export const GENERATOR_BANNER_DURATION_MIN = 1;
export const GENERATOR_BANNER_DURATION_MAX = 60;

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
// 3. dayRequiredRoles (object keyed by section)
//    Was hard-coded as `SECTIONS.kitchen.dayRequiredRoles = ["Chef"]`
//    in constants.js. SECTIONS stays put as the system fallback when
//    `slotsForDay` is called bare (tests, future call sites). The
//    /settings override flows through `slotsForDay(template, override)`
//    so every consumer of `slotDef.requiredRoles` (picker filter,
//    `roleMatchesSlot` used by generator + Swap) inherits the change.
//    Empty list per-section = permissive (any of section's
//    coversRoles). Default mirrors v1.10.x — FoH empty, Kitchen
//    requires Chef.
export const DEFAULT_MIN_CONSECUTIVE_DAYS_OFF = 2;
export const MIN_CONSECUTIVE_DAYS_OFF_MIN = 1;
export const MIN_CONSECUTIVE_DAYS_OFF_MAX = 3;

export const DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS = 5;
export const MAX_CONSECUTIVE_WORKING_DAYS_MIN = 3;
export const MAX_CONSECUTIVE_WORKING_DAYS_MAX = 14;

export const DEFAULT_DAY_REQUIRED_ROLES = Object.freeze({
  foh: Object.freeze([]),
  kitchen: Object.freeze(["Chef"]),
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
    background: "var(--bg-card)",
    border: "1px solid var(--border-card)",
    borderRadius: 12,
    padding: 20,
    boxShadow: "var(--shadow-card)",
  },

  // Typography
  h1: { margin: "0 0 4px 0", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)" },
  h2: { margin: "0 0 6px 0", fontSize: 17, fontWeight: 600, color: "var(--text-primary)" },
  body: { margin: "8px 0 0 0", fontSize: 14, lineHeight: 1.45, color: "var(--text-primary)" },
  muted: { margin: 0, fontSize: 12, color: "var(--text-muted)" },

  // Generic surfaces
  surfaceSoft: {
    background: "var(--bg-soft)",
    border: "1px solid var(--border-soft)",
    borderRadius: 12,
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
    borderRadius: 10,
    boxShadow: "var(--shadow-input-inset)",
    outline: "none",
  },

  // Field block
  fldRow: { marginBottom: 12 },
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
export const BTN = Object.freeze({
  base: {
    appearance: "none",
    border: "1px solid transparent",
    borderRadius: 12,
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
  },
  {
    key: "holiday",
    label: "Holiday",
    palette: {
      bg: "var(--status-confirmed-bg)",
      text: "var(--status-confirmed-text)",
      border: "var(--status-confirmed-border)",
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
  },
]);

// ── Day-part labels (used by grid + form) ────────────────────────────────
export const DAY_PARTS = Object.freeze({
  day: { label: "Day", short: "D" },
  evening: { label: "Evening", short: "E" },
});

// ── Generator reason labels (v1.4.0) ─────────────────────────────────────
// Human-readable labels for the reason codes that generator.js attaches to
// `summary.unfilledCells[].reason` and `summary.clearedReasons[].reason`.
// Surfaced by the "Details" modal opened from the generator result banner —
// the manager sees grouped-by-reason lists instead of a bare count.
//
// v1.7.0: Regenerate became wipe-and-refill (every shift in the week is
// cleared with reason "regenerated" before fill-empty runs). The
// constraint-by-constraint reason codes that the old `clearInvalidShifts`
// pre-pass emitted (closed-day, on-request, fixed-days, etc.) are gone —
// none of that machinery survives the rewrite. The codes still listed
// below are the ones `buildCandidates` continues to emit when no
// candidate fits a cell.
export const GENERATOR_REASONS = Object.freeze({
  // Unfilled (eligibility filter, in order from generator.js buildCandidates)
  "no-role-match": "No employee holds the required role",
  "no-eligible": "No eligible employee for this cell",
  "all-on-request": "All eligible staff are on a day off or holiday",
  "all-shift-pref": "All eligible staff are blocked by a shift-preference request",
  "all-conflicted": "All eligible staff are already on another shift that day",
  "all-at-quota": "All eligible staff have reached their working-days quota",
  "no-2-off": "Would break the 2-consecutive-days-off rule for every candidate",
  "max-consecutive": "Would exceed the max consecutive working-days cap for every candidate",
  "preference": "No staff with matching shift preference (Hard mode)",
  // Cleared (v1.7.0 Regenerate wipe — every record gets this one reason)
  "regenerated": "Cleared for regeneration",
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
