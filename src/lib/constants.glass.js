// src/lib/constants.glass.js
// SPIKE FILE — Liquid Glass v2 design exploration. Parallel `S_GLASS` and
// `BTN_GLASS` token sets translated from Apple's Liquid Glass design
// system (iOS 26 / macOS Tahoe 26+) to CSS-in-JS.
//
// Never imported by production code; only used by *.glass.jsx variants
// on the `spike/liquid-glass-redesign` branch. See spike-notes.md for
// the full design brief (including the v2 addendum at the bottom).
//
// Loading rule (unchanged from v1 spike): glass is for the NAVIGATION
// LAYER only — toolbars, tab bars, buttons, accordion headers, modal
// backdrops, the login card. Never apply to content (lists, grids,
// form inputs, the main app card, the schedule cells / day-cards, the
// fairness / requests / shifts panels below the grid).
//
// v2 additions over the original spike:
//   - Every rgba literal moved to a CSS custom property (`--lg-*` in
//     index.html), so a single token works in both light AND dark mode.
//     Dark recipe was missing in the original v1 spike entirely (v0.10.1
//     predates the v0.11.0 theming system).
//   - New `S_GLASS.glassNavBar`, `glassResultBanner`, `glassLoginCard`
//     for the v1.x surfaces that didn't exist in the v1 spike's scope.
//   - `S_GLASS.glassSaveBar` removed — v1.12.0 made Settings autosave
//     so the Save/Reset row is gone. The accordion is now the only
//     control-layer surface in Settings.
//   - mkBtn rewritten to compose with the global `.mgt-hover-scale`
//     utility (v1.9.0+) rather than overriding it. Hover scale 1.08
//     and active press scale 0.96 stack via `:hover`/`:active`
//     specificity.

// Re-export the non-visual constants so glass atoms don't duplicate.
export {
  ROLES,
  SECTIONS,
  DEFAULT_SHIFT_TEMPLATE,
  OPERATING_HOURS,
  DEFAULT_OPENING_DAYS,
  DEFAULT_WORKING_DAYS,
  DEFAULT_GENERATOR_STRICT_PREFERENCE,
  DEFAULT_GENERATOR_BANNER_AUTO_DISMISS,
  DEFAULT_GENERATOR_BANNER_DURATION_SEC,
  GENERATOR_BANNER_DURATION_MIN,
  GENERATOR_BANNER_DURATION_MAX,
  DEFAULT_MIN_CONSECUTIVE_DAYS_OFF,
  MIN_CONSECUTIVE_DAYS_OFF_MIN,
  MIN_CONSECUTIVE_DAYS_OFF_MAX,
  DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS,
  MAX_CONSECUTIVE_WORKING_DAYS_MIN,
  MAX_CONSECUTIVE_WORKING_DAYS_MAX,
  DEFAULT_DAY_REQUIRED_ROLES,
  STATUS_COLORS,
  ROLE_COLORS,
  ROLE_COLOR_FALLBACK,
  REQUEST_TYPES,
  DAY_PARTS,
  WEEKDAYS,
  GENERATOR_REASONS,
} from "./constants.js";

// ── Glass recipes ────────────────────────────────────────────────────────
// Each recipe is a JS object that merges into inline `style={...}` props,
// matching the existing S/BTN composition pattern. The actual colours are
// CSS vars — flip dark mode and they re-resolve without atom code knowing.

// .regular — standard nav/button glass. Medium transparency, full content
// adaptation. The blur radius is intentionally bigger than the production
// modal Overlay (which is 8px) — Apple's Liquid Glass is heavier (~28px).
const GLASS_REGULAR = {
  background: "var(--lg-bg-regular)",
  backdropFilter: "blur(28px) saturate(140%)",
  WebkitBackdropFilter: "blur(28px) saturate(140%)",
  boxShadow:
    "inset 0 1px 0 var(--lg-highlight), " +
    "inset 0 -1px 0 var(--lg-shadow-bottom), " +
    "0 8px 24px var(--lg-shadow-drop)",
  border: "0.5px solid var(--lg-border-outer)",
  color: "var(--text-primary)",
};

// .clear — high transparency. Reserved for surfaces sitting over imagery /
// dark backgrounds. Not used much in MGT (no hero images), but exported
// for completeness.
const GLASS_CLEAR = {
  background: "var(--lg-bg-clear)",
  backdropFilter: "blur(40px) saturate(160%)",
  WebkitBackdropFilter: "blur(40px) saturate(160%)",
  boxShadow:
    "inset 0 1px 0 var(--lg-highlight-soft), " +
    "0 12px 32px var(--lg-shadow-drop-clear)",
  border: "0.5px solid var(--lg-border-outer)",
  color: "var(--text-primary)",
};

// .glassProminent — primary action buttons. Accent tint, denser fill,
// still has the specular highlight on top.
const GLASS_PROMINENT = {
  background: "var(--lg-bg-prominent)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  color: "var(--lg-text-prominent)",
  boxShadow:
    "inset 0 1px 0 var(--lg-highlight-soft), " +
    "0 6px 16px var(--lg-shadow-drop-prominent)",
  border: "0.5px solid var(--lg-border-outer)",
};

// .glassProminent (danger variant) — destructive action.
const GLASS_DANGER = {
  background: "var(--lg-bg-danger)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  color: "var(--lg-text-prominent)",
  boxShadow:
    "inset 0 1px 0 var(--lg-highlight-soft), " +
    "0 6px 16px var(--lg-shadow-drop-danger)",
  border: "0.5px solid var(--lg-border-outer)",
};

// .glass (ghost) — regular glass with low fill. For tertiary actions.
const GLASS_GHOST = {
  background: "var(--lg-bg-ghost)",
  backdropFilter: "blur(28px) saturate(140%)",
  WebkitBackdropFilter: "blur(28px) saturate(140%)",
  color: "var(--lg-text-ghost)",
  boxShadow:
    "inset 0 1px 0 var(--lg-highlight-soft), " +
    "0 4px 12px var(--lg-shadow-drop)",
  border: "0.5px solid var(--lg-border-outer)",
};

// .regular (v2 layered) — the LARGE-surface variant that swaps the
// box-shadow specular for the four-div sibling stack
// (glass-filter / glass-overlay / glass-specular / glass-content).
// The actual glass effect lives in the children — this style is just
// the outer container shell. Consumers wrap content in <GlassSurface>
// (defined in atoms.glass.jsx) which renders the layer divs and the
// child content.
//
// Use only on surfaces ≥ ~200px in any dimension (tab bar, week-nav
// bar, modal backdrop, login card). Smaller surfaces (individual
// buttons, accordion headers) keep the simpler box-shadow recipe in
// GLASS_REGULAR above — the SVG displacement filter is GPU-heavy and
// not worth the cost on tiny elements.
const GLASS_REGULAR_V2_CONTAINER = {
  position: "relative",
  overflow: "hidden",
  background: "transparent",          // .glass-overlay child paints bg
  boxShadow: "0 8px 24px var(--lg-shadow-drop)",
  border: "0.5px solid var(--lg-border-outer)",
  color: "var(--text-primary)",
};

// ── Tokens (S_GLASS) ─────────────────────────────────────────────────────
// Same key shape as the existing `S` so atoms.glass.jsx can swap in
// place. Only the navigation/control-layer surfaces gain glass treatment;
// typography, inputs, fldRow, the main app card stay solid (content).

export const S_GLASS = Object.freeze({
  // Layout shell (unchanged — content layer wrapper)
  appShell: {
    minHeight: "100vh",
    padding: "24px 16px",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  },

  // Main app card — CONTENT, not nav. Slightly more glassy than the v0.x
  // card to read as a Liquid-Glass-era surface, but NO backdrop blur.
  card: {
    width: "100%",
    maxWidth: 720,
    background: "var(--bg-card)",
    border: "1px solid var(--border-card)",
    borderRadius: 22,
    padding: 20,
    boxShadow:
      "var(--shadow-card), " +
      "inset 0 1px 0 var(--lg-highlight-soft)",
  },

  // Typography (unchanged from production S)
  h1: { margin: "0 0 4px 0", fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)" },
  h2: { margin: "0 0 6px 0", fontSize: 17, fontWeight: 600, color: "var(--text-primary)" },
  body: { margin: "8px 0 0 0", fontSize: 14, lineHeight: 1.45, color: "var(--text-primary)" },
  muted: { margin: 0, fontSize: 12, color: "var(--text-muted)" },

  // Generic soft surface — content. Sits naturally under glass headers
  // but no blur on its own. (e.g. Collapsible body, Section blocks.)
  surfaceSoft: {
    background: "var(--bg-soft)",
    border: "1px solid var(--border-soft)",
    borderRadius: 18,
    padding: 12,
    boxShadow: "var(--shadow-soft)",
  },

  // Inputs — CONTENT. No blur. Match production S.inputBase exactly.
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

  // Field block (unchanged)
  fldRow: { marginBottom: 12 },
  fldLabel: {
    display: "block",
    fontSize: 12,
    color: "var(--text-secondary)",
    marginBottom: 4,
    fontWeight: 600,
  },

  // ── Glass surfaces (NAV LAYER only) ──
  glassRegular: GLASS_REGULAR,
  glassClear: GLASS_CLEAR,
  glassGhost: GLASS_GHOST,
  glassRegularV2: GLASS_REGULAR_V2_CONTAINER,

  // Glass container — wraps a group of glass surfaces so they share a
  // single blur (Apple's GlassEffectContainer equivalent). Used by
  // Settings.glass.jsx to wrap all 5 accordion sections in one parent
  // blur instead of 5 separate ones.
  glassContainer: {
    ...GLASS_REGULAR,
    borderRadius: 22,
    padding: 0,
    overflow: "hidden",
  },

  // Top tab bar (AppShell). Capsule, one blur instance, sits at the
  // top of the app card. v2: uses the layered structure when wrapped
  // in <GlassSurface>.
  glassTabBar: {
    ...GLASS_REGULAR_V2_CONTAINER,
    borderRadius: 999,
    padding: 4,
    display: "flex",
    gap: 4,
    marginBottom: 16,
  },

  // Individual tab chip inside the tab bar. No own blur (inherits
  // parent's). Active state uses a subtle accent tint pill.
  glassTab: {
    flex: 1,
    minWidth: 90,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 999,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    transition:
      "background 200ms ease, " +
      "color 200ms ease, " +
      "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  glassTabActive: {
    background: "var(--accent-tint-mid)",
    color: "var(--accent-on-tint)",
  },

  // Schedule week-nav bar (NEW in v2 — wasn't in the v1 spike). Houses
  // [Prev | Today | Next | weekRange | Generate | Swap | Undo | Clear |
  // Export]. One blur for the whole row.
  glassNavBar: {
    ...GLASS_REGULAR_V2_CONTAINER,
    borderRadius: 18,
    padding: "8px 12px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 12,
  },

  // Schedule result banner — Generate / Clear / Undo summary. Floats
  // above the grid as a glass capsule. Auto-dismiss reads v1.9.4
  // banner-duration settings (handled by ScheduleGrid). One blur
  // instance when visible.
  glassResultBanner: {
    ...GLASS_REGULAR,
    borderRadius: 14,
    padding: "10px 14px",
    marginBottom: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    fontSize: 13,
  },

  // Login screen card — wraps the auth form on the login screen. Glass
  // because the card floats over the body gradient; reads as a "floating
  // sign-in chip" rather than a paper form.
  glassLoginCard: {
    ...GLASS_REGULAR_V2_CONTAINER,
    borderRadius: 22,
    padding: 24,
    width: "100%",
    maxWidth: 380,
  },

  // Glass accordion header (used by Collapsible.glass). No own blur —
  // sits inside a parent glassContainer that owns the blur instance.
  // Active background tints with the accent.
  glassAccordionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "14px 16px",
    cursor: "pointer",
    userSelect: "none",
    background: "transparent",
    borderRadius: 0,
    transition: "background 150ms ease",
  },
});

// ── Button tokens (BTN_GLASS) ────────────────────────────────────────────
// Same `base + variant` shape as production BTN. mkBtn (glass) merges
// base + variant the same way.

export const BTN_GLASS = Object.freeze({
  base: {
    appearance: "none",
    border: "0.5px solid var(--lg-border-outer)",
    borderRadius: 999,                  // capsule by default
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none",
  },

  // .glassProminent → primary action
  primary: GLASS_PROMINENT,

  // .glass → secondary action
  secondary: {
    ...GLASS_REGULAR,
    color: "var(--accent-on-tint)",
  },

  // .glassProminent (danger) → destructive
  danger: GLASS_DANGER,

  // .glass (ghost / clear) → tertiary
  ghost: GLASS_GHOST,
});
