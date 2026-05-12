// src/components/atoms.jsx
// Tiny, tightly-coupled reusable primitives. The ONE exception to the
// "one component per file" rule — these are deliberately co-located
// because they're all sub-100-line presentational utilities used
// everywhere and never make sense to import in isolation.
//
// Exports:
//   - Overlay      — modal/sheet shell. Mobile = full-screen sheet,
//                    desktop = centered card. Owns the ONLY backdropFilter
//                    blur in the app (≤4 simultaneous blur instances rule).
//   - Fld          — labelled input wrapper (label + child).
//   - Section      — soft surface block with optional title.
//   - TBadge       — text badge (used for role chips, status pills).
//   - mkInp        — builder for an <input> with S.inputBase + overrides.
//   - mkBtn        — builder for a <button> with BTN.base + variant.
//
// Vite's automatic JSX runtime: NO React import required.

import { S, BTN } from "../lib/constants.js";

// ── Overlay ──────────────────────────────────────────────────────────────
// Props:
//   open       (bool) — render the modal or null
//   onClose    (fn)   — backdrop click handler
//   title      (str)  — header title text
//   isMobile   (bool) — toggle full-sheet vs centered-card layout
//   children   (node) — modal body
//
// The only backdropFilter blur in the app lives here. Other surfaces
// must NOT add blur — see CLAUDE.md "Performance gotcha".
export function Overlay({ open, onClose, title, isMobile, children }) {
  if (!open) return null;

  const backdropStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    background: "rgba(0,0,0,0.28)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    display: "flex",
    justifyContent: "center",
    alignItems: isMobile ? "stretch" : "center",
    padding: isMobile ? 0 : 24,
  };

  const sheetStyle = isMobile
    ? {
        width: "100%",
        height: "100%",
        background: "rgba(255,255,255,0.92)",
        borderRadius: 0,
        padding: 16,
        overflow: "auto",
      }
    : {
        width: "100%",
        maxWidth: 560,
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(255,255,255,0.35)",
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        maxHeight: "80vh",
        overflow: "auto",
      };

  return (
    <div
      style={backdropStyle}
      onClick={function (e) {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div style={sheetStyle}>
        {title ? (
          <div style={{ ...S.h2, marginBottom: 12 }}>{title}</div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

// ── Fld ──────────────────────────────────────────────────────────────────
// Labelled field wrapper. Pass the input/select/etc. as the single child.
export function Fld({ label, children }) {
  return (
    <div style={S.fldRow}>
      {label ? <label style={S.fldLabel}>{label}</label> : null}
      {children}
    </div>
  );
}

// ── Section ──────────────────────────────────────────────────────────────
// Soft surface block. Optional title row.
export function Section({ title, children, style }) {
  const merged = style ? { ...S.surfaceSoft, ...style } : S.surfaceSoft;
  return (
    <div style={merged}>
      {title ? <div style={S.h2}>{title}</div> : null}
      {children}
    </div>
  );
}

// ── TBadge ───────────────────────────────────────────────────────────────
// Text badge. Pass { bg, text, border } from STATUS_COLORS or ROLE_COLORS.
export function TBadge({ children, palette, style }) {
  const base = {
    display: "inline-block",
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid transparent",
    lineHeight: 1.4,
  };
  const colours = palette
    ? { background: palette.bg, color: palette.text, borderColor: palette.border }
    : {};
  const merged = { ...base, ...colours, ...(style || {}) };
  return <span style={merged}>{children}</span>;
}

// ── mkInp ────────────────────────────────────────────────────────────────
// Build an <input> with S.inputBase + per-call style overrides.
// Returns a JSX element, NOT a component. Call inline.
export function mkInp(props) {
  const { style, ...rest } = props || {};
  const merged = style ? { ...S.inputBase, ...style } : S.inputBase;
  return <input style={merged} {...rest} />;
}

// ── mkBtn ────────────────────────────────────────────────────────────────
// Build a <button>. Pass variant ("primary" | "secondary" | "danger" | "ghost")
// or a direct style object to override.
export function mkBtn(props) {
  const { variant, style, children, ...rest } = props || {};
  const variantStyle = variant && BTN[variant] ? BTN[variant] : BTN.secondary;
  const merged = { ...BTN.base, ...variantStyle, ...(style || {}) };
  return (
    <button style={merged} {...rest}>
      {children}
    </button>
  );
}
