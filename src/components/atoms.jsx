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
// v1.9.0: optional `className` lands on the wrapper div — used by Settings
// to opt individual rows into the `.mgt-hover-scale` utility.
export function Fld({ label, children, className }) {
  return (
    <div style={S.fldRow} className={className}>
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
//   title            (str)  — header text
//   open             (bool) — controlled; parent manages single-open-at-a-time
//   onToggle         (fn)   — fired on header click (no args)
//   dirty            (bool) — show a small blue dot in the header when true
//   className        (str)  — v1.9.0; lands on the OUTER wrapper div. Used
//                             by Settings to apply `.mgt-hover-scale` so
//                             the whole section scales when the cursor
//                             enters anywhere inside it. Inner rows that
//                             also carry the class compound the effect on
//                             top — hovering a specific row scales the
//                             wrapper AND the row visually.
//   headerClassName  (str)  — v1.9.0; lands on the clickable header div
//                             (used to opt-in to .mgt-hover-scale)
//   children         (node) — body content, only rendered when open
//
// v1.9.0: overflow changed from `hidden` → `visible` so transform-scaled
// inner rows can break out of the section border on hover (matches the
// row-card behaviour in Employees / Requests tabs). Side-effect: the body
// `borderTop` hairline now extends to the wrapper's box edge rather than
// being clipped at the rounded corner — a 1-2px cosmetic exposure, but
// the trade-off is the scaled rows no longer get cut at the section
// boundary. The Open days popover (Settings v1.3.0) was originally
// anchored ABOVE its pill row specifically to dodge the old
// `overflow: hidden`; the comment in Settings.jsx still references that
// historical reason and the positioning stays unchanged.
//
// No new backdropFilter — sits inside the existing card blur.
export function Collapsible({ title, open, onToggle, dirty, className, headerClassName, children }) {
  const wrapStyle = {
    ...S.surfaceSoft,
    padding: 0,
    overflow: "visible",
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
    // v1.9.0 (perslot+ commit, second round): horizontal padding bumped
    // from 14 to 20 so scaled inner Toggle / Fld rows (1.08 + compound
    // with the wrapper's own 1.08 = up to 1.166x effective) have
    // breathing room inside the section card before they visually
    // overflow its right edge. Matches the schedule-grid clipping fix
    // (padding on the overflow wrapper) applied to surfaces that host
    // Toggle atoms. Vertical padding unchanged.
    padding: "0 20px 14px 20px",
    borderTop: "1px solid var(--hairline)",
    paddingTop: 12,
  };

  return (
    <div style={wrapStyle} className={className}>
      <div
        style={headerStyle}
        className={headerClassName}
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
//   className  (str)             — v1.9.0; lands on the clickable row div
//                                   (used to opt-in to .mgt-hover-scale)
export function Toggle({ checked, onChange, label, helper, disabled, className }) {
  const off = disabled ? 0.5 : 1;
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    // v1.9.0 (perslot+ commit, third round): row padding bumped from
    // "6px 0" to "10px 12px" so the hover background (added in the
    // sixth v1.9.0 commit) has visible breathing room around the
    // label / switch instead of hugging them tight. Vertical 10 keeps
    // multi-line helper text legible; horizontal 12 inset matches the
    // app's general button / pill padding so the lifted card reads
    // as a coherent surface.
    padding: "10px 12px",
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
      className={className}
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
