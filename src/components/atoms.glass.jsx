// src/components/atoms.glass.jsx
// SPIKE FILE — Liquid Glass v2 atoms. Each atom keeps the same name and
// props as the production atoms in `./atoms.jsx` so a component can re-
// theme by changing only its import source:
//   - from "./atoms.jsx"        → original (production)
//   - from "./atoms.glass.jsx"  → glass spike
//
// Glass-only rule (unchanged from v1 spike): glass goes on NAV / control
// atoms (Overlay backdrop, Collapsible header, mkBtn). Content atoms
// (Section, Fld, mkInp, TBadge) stay solid and just adopt the same
// var-backed surface tokens production uses.
//
// v2 changes from the original spike:
//   - `mkBtn` now composes WITH `.mgt-hover-scale` (v1.9.0+ utility)
//     rather than overriding it with its own press-scale handlers.
//     Hover scale 1.08 + active press scale 0.96 stack via CSS
//     specificity. Atoms only pass `className` through; the global
//     CSS rule does the work.
//   - New `GlassSurface` primitive renders the four-div sibling layer
//     stack (glass-filter / glass-overlay / glass-specular /
//     glass-content) that powers the v2 lens-distortion effect.
//   - New `LensFilterDefs` component mounts the SVG <filter> once at
//     the App root so `url(#mgtLensFilter)` resolves globally.
//   - `Overlay` backdrop adopts GlassSurface — backdrop now uses the
//     v2 layered glass, not just a heavier backdrop-filter.
//   - Toggle padding/track/knob unchanged from production (already
//     correct at "10px 12px" since v1.9.0).

import { S_GLASS, BTN_GLASS } from "../lib/constants.glass.js";

// ── LensFilterDefs ───────────────────────────────────────────────────────
// Mount once at the App root (sibling of the USE_GLASS toggle in App.jsx).
// Provides the global `mgtLensFilter` SVG <filter> that
// `.glass-filter` in index.html references via `filter:
// url(#mgtLensFilter)`. Hidden via `display: none` — the SVG element
// itself never paints; only the filter definition is reachable.
//
// Numbers ported verbatim from the Apple Liquid Glass v2 reference
// CSS the user provided. `stdDeviation: 50` + `scale: 50` produce the
// visible refraction effect across a typical glass surface; smaller
// values flatten the lens, larger values exaggerate it past plausible.
export function LensFilterDefs() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" style={{ display: "none" }} aria-hidden="true">
      <filter id="mgtLensFilter" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
        <feComponentTransfer in="SourceAlpha" result="alpha">
          <feFuncA type="identity" />
        </feComponentTransfer>
        <feGaussianBlur in="alpha" stdDeviation="50" result="blur" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="blur"
          scale="50"
          xChannelSelector="A"
          yChannelSelector="A"
        />
      </filter>
    </svg>
  );
}

// ── GlassSurface ─────────────────────────────────────────────────────────
// Reusable v2 layered glass primitive. Renders four sibling divs inside
// the wrapping element:
//   1. .glass-filter   — backdrop-filter blur + url(#mgtLensFilter) refraction
//   2. .glass-overlay  — translucent fill (var(--lg-bg-color))
//   3. .glass-specular — inset white-on-edge highlight box-shadow
//   4. .glass-content  — the actual child content, on top
//
// The wrapping element (`as` prop, default "div") needs `position:
// relative` and `overflow: hidden` so the absolutely-positioned layer
// divs clip to its border-radius. S_GLASS.glassRegularV2 sets these
// already.
//
// Props:
//   as          (str|Component, default "div") — wrapper element
//   className   (str)                          — passes to wrapper (e.g. .mgt-hover-scale)
//   style       (obj)                          — merges onto wrapper style
//   contentStyle(obj)                          — merges onto inner .glass-content
//   onClick     (fn)                           — passes to wrapper
//   ...rest                                    — spread onto wrapper
//
// Use only on surfaces ≥ ~200px in any dimension. Smaller surfaces
// (individual buttons, accordion headers) stick to box-shadow specular
// via the GLASS_REGULAR recipe — the SVG displacement filter is
// GPU-heavy and only worth the cost on big surfaces.
export function GlassSurface({
  as: Tag = "div",
  className,
  style,
  contentStyle,
  onClick,
  children,
  ...rest
}) {
  const wrapStyle = style ? { ...S_GLASS.glassRegularV2, ...style } : S_GLASS.glassRegularV2;
  return (
    <Tag
      className={className}
      style={wrapStyle}
      onClick={onClick}
      {...rest}
    >
      <div className="glass-filter" />
      <div className="glass-overlay" />
      <div className="glass-specular" />
      <div className="glass-content" style={contentStyle}>
        {children}
      </div>
    </Tag>
  );
}

// ── Overlay (glass) ──────────────────────────────────────────────────────
// Modal/sheet shell — same signature as production Overlay. v2 wave 2
// (user request, 2026-05-27): BOTH the backdrop AND the desktop sheet
// are now glass. The backdrop is a viewport-scale GlassSurface (lens
// distortion over whatever's beneath); the desktop sheet floats above
// it as its own GlassSurface (a "card floating on frosted glass" look).
//
// Mobile keeps the SOLID full-sheet for GPU economy — a full-viewport
// glass sheet stacked on top of the full-viewport glass backdrop would
// be two `feDisplacementMap` filters running at viewport scale, which
// pushes weaker GPUs over the edge. Mobile users get the solid-card
// modal they had pre-spike.
export function Overlay({ open, onClose, title, isMobile, children }) {
  if (!open) return null;

  const backdropOuterStyle = {
    position: "fixed",
    inset: 0,
    zIndex: 1000,
    display: "flex",
    justifyContent: "center",
    alignItems: isMobile ? "stretch" : "center",
    padding: isMobile ? 0 : 24,
  };

  // Backdrop GlassSurface — the lens distortion runs over whatever's
  // beneath the modal. Click on the backdrop area closes the modal
  // (handler is on the outer div; backdrop has `pointer-events: none`
  // via the .glass-* CSS so click pierces through to the outer).
  const backdropStyle = {
    position: "absolute",
    inset: 0,
    background: "var(--bg-overlay-backdrop)",
    border: "none",
    boxShadow: "none",
    borderRadius: 0,
    overflow: "hidden",
  };

  // Mobile sheet — solid (GPU economy).
  const mobileSheetStyle = {
    width: "100%",
    height: "100%",
    background: "var(--bg-overlay-sheet)",
    borderRadius: 0,
    padding: 16,
    overflow: "auto",
    position: "relative",
    zIndex: 1,
  };

  // Desktop sheet outer — minimal wrapper so the GlassSurface inside
  // picks up the centering / max-width / max-height. The actual glass
  // wrap is the next layer.
  const desktopSheetWrapStyle = {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 560,
    maxHeight: "80vh",
  };

  // Desktop sheet inner (the GlassSurface) — picks up the layered
  // glass treatment. Padding goes on contentStyle so the four sibling
  // divs paint without padding interfering with the lens filter.
  const desktopSheetGlassStyle = {
    ...S_GLASS.glassRegularV2,
    borderRadius: 22,
    boxShadow: "var(--shadow-overlay), 0 8px 24px var(--lg-shadow-drop)",
    overflow: "visible",
  };

  const sheetInner = (
    <>
      {title ? (
        <div style={{ ...S_GLASS.h2, marginBottom: 12 }}>{title}</div>
      ) : null}
      {children}
    </>
  );

  return (
    <div
      style={backdropOuterStyle}
      onClick={function (e) {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <GlassSurface style={backdropStyle} />
      {isMobile ? (
        <div
          style={mobileSheetStyle}
          onClick={function (e) { e.stopPropagation(); }}
        >
          {sheetInner}
        </div>
      ) : (
        <div
          style={desktopSheetWrapStyle}
          onClick={function (e) { e.stopPropagation(); }}
        >
          <GlassSurface
            style={desktopSheetGlassStyle}
            contentStyle={{ padding: 20, maxHeight: "calc(80vh - 4px)", overflow: "visible" }}
          >
            {sheetInner}
          </GlassSurface>
        </div>
      )}
    </div>
  );
}

// ── Fld (content layer — unchanged shape) ────────────────────────────────
export function Fld({ label, children, className }) {
  return (
    <div style={S_GLASS.fldRow} className={className}>
      {label ? <label style={S_GLASS.fldLabel}>{label}</label> : null}
      {children}
    </div>
  );
}

// ── Section (content layer, no glass) ────────────────────────────────────
export function Section({ title, children, style }) {
  const merged = style ? { ...S_GLASS.surfaceSoft, ...style } : S_GLASS.surfaceSoft;
  return (
    <div style={merged}>
      {title ? <div style={S_GLASS.h2}>{title}</div> : null}
      {children}
    </div>
  );
}

// ── Collapsible (glass header, solid body) ───────────────────────────────
// Production Collapsible wraps in `S.surfaceSoft` and uses
// solid header + solid body. Glass version skips the outer wrapper —
// the parent `S_GLASS.glassContainer` (mounted by Settings.glass.jsx)
// owns the blur for ALL accordion sections together (1 blur instance,
// not 5). Header gets a transparent background that lets the parent
// glass show through; active state tints with the accent.
//
// Body remains solid (`S_GLASS.surfaceSoft` — content layer).
export function Collapsible({ title, open, onToggle, dirty, className, headerClassName, children }) {
  const headerStyle = {
    ...S_GLASS.glassAccordionHeader,
    background: open ? "var(--accent-tint-soft)" : "transparent",
  };
  const titleStyle = {
    ...S_GLASS.h2,
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
  // Body — content layer. Sits inside the parent glass container
  // but doesn't itself have backdrop blur.
  const bodyStyle = {
    padding: "12px 20px 14px 20px",
    borderTop: "1px solid var(--hairline)",
    background: "var(--bg-soft)",
  };

  return (
    <div className={className}>
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

// ── Toggle (mostly unchanged) ────────────────────────────────────────────
// Apple's iOS 26 switch hasn't meaningfully changed shape. Matches the
// production v1.9.0 Toggle padding ("10px 12px") and track/knob
// dimensions exactly so the glass spike isn't visually distinguishable
// from production on this atom.
export function Toggle({ checked, onChange, label, helper, disabled, className }) {
  const off = disabled ? 0.5 : 1;
  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
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
    ...S_GLASS.muted,
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
    transition: "transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1)",
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

// ── TBadge (content layer — unchanged from production) ───────────────────
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

// ── mkInp (content layer — unchanged from production) ────────────────────
// className passes through via {...rest} so the global .mgt-hover-scale
// utility applies on hover.
export function mkInp(props) {
  const { style, ...rest } = props || {};
  const merged = style ? { ...S_GLASS.inputBase, ...style } : S_GLASS.inputBase;
  return <input style={merged} {...rest} />;
}

// ── mkBtn (glass variant — v2 composition rewrite) ───────────────────────
// Original v1 spike's mkBtn overrode the global .mgt-hover-scale by
// installing its own onMouseDown/Up/Leave handlers for the press-scale
// effect. v2 drops those handlers — `.mgt-hover-scale` (defined in
// index.html) handles hover scaling globally and the new
// `.mgt-hover-scale--glass` variant adds the active-state press scale
// (0.96) without the opaque hover background that would paint over
// the glass effect.
//
// Variants:
//   primary   → glassProminent (accent blue, denser, white text)
//   secondary → glass (regular glass capsule, accent-coloured text)
//   danger    → glassProminent (red variant)
//   ghost     → glass (clear, low-fill)
//
// className passes through; consumers should add "mgt-hover-scale--glass"
// (not the plain "mgt-hover-scale") for hover scale + press without the
// hover-bg override. mkBtn doesn't force the class — callers opt in,
// just like with production mkBtn.
export function mkBtn(props) {
  const { variant, style, children, ...rest } = props || {};
  const variantStyle = variant && BTN_GLASS[variant] ? BTN_GLASS[variant] : BTN_GLASS.secondary;
  const merged = { ...BTN_GLASS.base, ...variantStyle, ...(style || {}) };
  return (
    <button style={merged} {...rest}>
      {children}
    </button>
  );
}
