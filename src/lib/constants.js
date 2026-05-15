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
export const SECTIONS = Object.freeze({
  foh: { label: "Front of House", roles: ["Bar", "Floor"] },
  kitchen: { label: "Kitchen", roles: ["Chef", "Plating", "Pot"] },
});

// ── Default shift template ───────────────────────────────────────────────
export const DEFAULT_SHIFT_TEMPLATE = Object.freeze({
  foh: {
    day: { start: "11:00", end: "17:00", count: 1 },
    evening: {
      start: "17:00",
      end: "23:00",
      count: 2,
      secondPersonStart: "18:00",
    },
  },
  kitchen: {
    day: { start: "11:00", end: "16:00", count: 1 },
    evening: { start: "16:00", end: "23:00", count: 3 },
  },
});

// ── Operating hours ──────────────────────────────────────────────────────
export const OPERATING_HOURS = Object.freeze({ start: "11:00", end: "23:00" });

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
