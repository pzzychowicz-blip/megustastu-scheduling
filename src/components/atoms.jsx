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
//   - Collapsible  — accordion section. Controlled `open`, optional dirty dot
//                    in the header. (v0.10.0 — used by Settings)
//   - Toggle       — iOS-style on/off switch row. (v0.10.0)
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
    background: "var(--bg-overlay-backdrop)",
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
        background: "var(--bg-overlay-sheet)",
        borderRadius: 0,
        padding: 16,
        overflow: "auto",
      }
    : {
        width: "100%",
        maxWidth: 560,
        background: "var(--bg-overlay-sheet)",
        border: "1px solid var(--border-overlay-sheet)",
        borderRadius: 16,
        padding: 20,
        boxShadow: "var(--shadow-overlay)",
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

// ── Collapsible ──────────────────────────────────────────────────────────
// v0.10.0: accordion section. Composes from Section's surfaceSoft look but
// adds a clickable header row, optional dirty dot, and only mounts children
// when `open === true`. Parent owns the open state — pass `open` + `onToggle`.
//
// Props:
//   title      (str)  — header text
//   open       (bool) — controlled; parent manages single-open-at-a-time
//   onToggle   (fn)   — fired on header click (no args)
//   dirty      (bool) — show a small blue dot in the header when true
//   children   (node) — body content, only rendered when open
//
// No new backdropFilter — sits inside the existing card blur.
export function Collapsible({ title, open, onToggle, dirty, children }) {
  const wrapStyle = {
    ...S.surfaceSoft,
    padding: 0,
    overflow: "hidden",
  };
  const headerStyle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 14px",
    cursor: "pointer",
    userSelect: "none",
  };
  const titleStyle = {
    ...S.h2,
    margin: 0,
    flex: 1,
  };
  const dotStyle = {
    display: "inline-block",
    width: 8,
    height: 8,
    borderRadius: 999,
    background: "var(--accent)",
    boxShadow: "0 0 0 2px var(--dot-glow)",
  };
  const chevronStyle = {
    fontSize: 12,
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "rotate(0deg)",
    transition: "transform 150ms ease",
    display: "inline-block",
    width: 12,
    textAlign: "center",
  };
  const bodyStyle = {
    padding: "0 14px 14px 14px",
    borderTop: "1px solid var(--hairline)",
    paddingTop: 12,
  };

  return (
    <div style={wrapStyle}>
      <div
        style={headerStyle}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (onToggle) onToggle();
          }
        }}
        aria-expanded={open ? "true" : "false"}
      >
        <span style={titleStyle}>{title}</span>
        {dirty ? <span style={dotStyle} aria-label="Unsaved changes" /> : null}
        <span style={chevronStyle} aria-hidden="true">▸</span>
      </div>
      {open ? <div style={bodyStyle}>{children}</div> : null}
    </div>
  );
}

// ── Toggle ───────────────────────────────────────────────────────────────
// v0.10.0: iOS-style on/off switch row. The whole row is clickable, not
// just the switch knob. Use for boolean settings that take effect
// immediately on change (Display section's role-pills, future dark mode).
//
// Props:
//   checked    (bool)            — controlled
//   onChange   (fn(nextBool))    — fires with the new value
//   label      (str)             — main row label
//   helper     (str|null)        — smaller helper text below the label
//   disabled   (bool, default false)
export function Toggle({ checked, onChange, label, helper, disabled }) {
  const off = disabled ? 0.5 : 1;
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "6px 0",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: off,
    userSelect: "none",
  };
  const textWrapStyle = { flex: 1, minWidth: 0 };
  const labelStyle = {
    fontSize: 14,
    color: "var(--text-primary)",
    fontWeight: 500,
  };
  const helperStyle = {
    ...S.muted,
    fontSize: 11,
    marginTop: 2,
  };
  const trackStyle = {
    flexShrink: 0,
    width: 48,
    height: 28,
    borderRadius: 999,
    background: checked ? "var(--toggle-track-on)" : "var(--toggle-track-off)",
    position: "relative",
    transition: "background 150ms ease",
    boxShadow: "var(--shadow-toggle-track)",
  };
  const knobStyle = {
    position: "absolute",
    top: 2,
    left: 2,
    width: 24,
    height: 24,
    borderRadius: "50%",
    background: "var(--toggle-knob)",
    boxShadow: "var(--shadow-toggle-knob)",
    transform: checked ? "translateX(20px)" : "translateX(0)",
    transition: "transform 150ms ease",
  };

  function handleClick() {
    if (disabled) return;
    if (onChange) onChange(!checked);
  }

  return (
    <div
      style={rowStyle}
      onClick={handleClick}
      role="switch"
      aria-checked={checked ? "true" : "false"}
      aria-disabled={disabled ? "true" : "false"}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={function (e) {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div style={textWrapStyle}>
        <div style={labelStyle}>{label}</div>
        {helper ? <div style={helperStyle}>{helper}</div> : null}
      </div>
      <div style={trackStyle}>
        <div style={knobStyle} />
      </div>
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
