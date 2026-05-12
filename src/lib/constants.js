// src/lib/constants.js
// Style tokens, role list, status colours, default shift template.
// Pure logic — no JSX in this file (.js extension is correct).
//
// Anything visual flows through here. New UI composes from S/BTN, NOT
// from inline rgba literals. Reuse beats reinvention.

// ── Roles ────────────────────────────────────────────────────────────────
export const ROLES = Object.freeze(["Bar", "Floor", "Chef", "Plating", "Pot"]);

// Sections group roles by side of house. Used by the schedule grid and the
// default shift template (day shifts cover an entire section's roles).
export const SECTIONS = Object.freeze({
  foh: { label: "Front of House", roles: ["Bar", "Floor"] },
  kitchen: { label: "Kitchen", roles: ["Chef", "Plating", "Pot"] },
});

// ── Default shift template ───────────────────────────────────────────────
// All times editable in Settings; these are the day-one defaults.
// `count` = number of slots per day for that section/day-part.
// `secondPersonStart` (FoH evening only) lets the manager pick 18:00 or 19:00
// for the second evening FoH staffer on a per-day basis.
export const DEFAULT_SHIFT_TEMPLATE = Object.freeze({
  foh: {
    day: { start: "11:00", end: "17:00", count: 1 },
    evening: {
      start: "17:00",
      end: "23:00",
      count: 2,
      secondPersonStart: "18:00", // alt: "19:00"
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
// Each entry: { bg, text, border }. Used by shift chips on the grid.
export const STATUS_COLORS = Object.freeze({
  open: {
    bg: "rgba(142,142,147,0.18)",
    text: "#3a3a3c",
    border: "rgba(142,142,147,0.45)",
  },
  assigned: {
    bg: "rgba(0,122,255,0.18)",
    text: "#004ec2",
    border: "rgba(0,122,255,0.45)",
  },
  confirmed: {
    bg: "rgba(52,199,89,0.20)",
    text: "#1f7a3a",
    border: "rgba(52,199,89,0.50)",
  },
  cancelled: {
    bg: "rgba(255,59,48,0.18)",
    text: "#9a1f17",
    border: "rgba(255,59,48,0.45)",
  },
});

// ── Role colours (4–6 hues, used on shift chips to show role mix) ────────
export const ROLE_COLORS = Object.freeze({
  Bar: "#FF9F0A",
  Floor: "#007AFF",
  Chef: "#FF3B30",
  Plating: "#AF52DE",
  Pot: "#8E8E93",
});

// ── Style tokens (S) ─────────────────────────────────────────────────────
// Translucent / glass aesthetic, iOS-inspired. Matches MGT Bookings.
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
    background: "rgba(255,255,255,0.45)",
    border: "1px solid rgba(255,255,255,0.35)",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  },

  // Typography
  h1: { margin: "0 0 4px 0", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" },
  h2: { margin: "0 0 6px 0", fontSize: 17, fontWeight: 600 },
  body: { margin: "8px 0 0 0", fontSize: 14, lineHeight: 1.45, color: "#1c1c1e" },
  muted: { margin: 0, fontSize: 12, color: "#6e6e73" },

  // Generic surfaces
  surfaceSoft: {
    background: "rgba(255,255,255,0.55)",
    border: "1px solid rgba(255,255,255,0.4)",
    borderRadius: 12,
    padding: 12,
  },

  // Inputs (inset shadow for depth, matches Bookings)
  inputBase: {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    fontSize: 14,
    color: "#111",
    background: "rgba(255,255,255,0.85)",
    border: "1px solid rgba(0,0,0,0.08)",
    borderRadius: 10,
    boxShadow: "inset 0 1px 2px rgba(0,0,0,0.06)",
    outline: "none",
  },

  // Field block
  fldRow: { marginBottom: 12 },
  fldLabel: {
    display: "block",
    fontSize: 12,
    color: "#3a3a3c",
    marginBottom: 4,
    fontWeight: 600,
  },
});

// ── Button tokens (BTN) ──────────────────────────────────────────────────
// Compose mkBtn(BTN.primary, { ...overrides }) at call sites.
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
  },
  primary: {
    background: "#007AFF",
    color: "#fff",
    border: "1px solid #0064d1",
  },
  secondary: {
    background: "rgba(255,255,255,0.7)",
    color: "#007AFF",
    border: "1px solid rgba(0,122,255,0.35)",
  },
  danger: {
    background: "rgba(255,59,48,0.92)",
    color: "#fff",
    border: "1px solid #b62a23",
  },
  ghost: {
    background: "transparent",
    color: "#1c1c1e",
    border: "1px solid rgba(0,0,0,0.12)",
  },
});

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
