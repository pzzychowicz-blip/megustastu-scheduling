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
// v16.0.0 — animation primitives, ported from MGT Bookings so the two apps
// share one motion vocabulary. These pair with the keyframes defined in
// index.html; neither half is useful without the other.
//   - Presence     — generic enter/exit primitive (delayed unmount so the
//                    exit animation can actually run).
//   - Toast        — thin alias: Presence + the toast keyframes.
//   - ModalPresence— the same lifecycle, but renders NO wrapper element;
//                    publishes `{leaving}` on PresenceContext for Overlay.
//   - usePresence  — read that context.
//   - Reveal       — height (or width) expand/collapse via grid 0fr↔1fr.
//   - AutoHeight   — eases its own height when its content is replaced.
//   - SlideView    — directional slide-in wrapper for view/tab switches.
//
// Vite's automatic JSX runtime: NO React import required.

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { R, S, BTN } from "../lib/constants.js";

// ── Overlay ──────────────────────────────────────────────────────────────
// Props:
//   open       (bool) — render the modal or null
//   onClose    (fn)   — backdrop click handler
//   title      (str)  — header title text
//   isMobile   (bool) — toggle full-sheet vs centered-card layout
//   children   (node) — modal body
//   footer     (node) — v16.0.0, optional. When given, the sheet becomes a
//                       flex column: `children` scroll in a bounded region
//                       and `footer` stays pinned to the bottom edge.
//
// The only backdropFilter blur in the app lives here. Other surfaces
// must NOT add blur — see CLAUDE.md "Performance gotcha".
//
// v16.0.0 — enter/exit animation. Overlay reads `{leaving}` from
// PresenceContext and swaps its scrim + sheet to the *-out keyframes before
// unmounting. That context is provided by <ModalPresence> at the mount
// site; with no provider the default `{leaving: false}` applies, so an
// un-wrapped modal still works exactly as before (enter animation only,
// then a hard unmount).
export function Overlay({ open, onClose, title, isMobile, children, footer }) {
  const { leaving } = usePresence();

  // v16.0.0: mobile body-scroll lock. Without it the page behind a
  // full-screen sheet scrolls under the user's finger. Desktop doesn't need
  // it — the scrim covers a centred card and the page beneath is inert.
  // Hooks must run unconditionally, so the guard lives inside the effect
  // rather than around it.
  useEffect(function () {
    if (!open || !isMobile) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return function () { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  if (!open) return null;

  const scrimClass = leaving ? "mgt-scrim-out" : "mgt-scrim-in";
  const sheetClass = isMobile
    ? (leaving ? "mgt-sheet-out" : "mgt-sheet-in")
    : (leaving ? "mgt-card-out" : "mgt-card-in");

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
        // v16.0.0: safe-area insets so a full-screen sheet clears the
        // notch and the home indicator on iOS.
        padding: 16,
        paddingTop: "max(16px, env(safe-area-inset-top))",
        paddingBottom: "max(16px, env(safe-area-inset-bottom))",
        boxSizing: "border-box",
        overflow: footer ? "hidden" : "auto",
        display: footer ? "flex" : undefined,
        flexDirection: footer ? "column" : undefined,
      }
    : {
        width: "100%",
        maxWidth: 560,
        background: "var(--bg-overlay-sheet)",
        border: "1px solid var(--border-overlay-sheet)",
        borderRadius: R.sheet,
        padding: 20,
        boxShadow: "var(--shadow-overlay)",
        maxHeight: "80vh",
        // v16.0.0: without border-box the 80vh cap applied to the CONTENT
        // box only, so the rendered sheet was 80vh + 40px padding + 2px
        // border — measurably taller than its own max-height (704px against
        // a 661.6px cap on an 827px viewport). Harmless while the sheet
        // just overflowed, but the `footer` layout sizes its scrolling body
        // from this cap, so it has to mean what it says.
        boxSizing: "border-box",
        // v1.9.0 (perslot+ commit, fourth round): overflow is `visible`, not
        // `auto`, so transform-scaled inputs inside the modal (Notes
        // textareas, time/date inputs, selects, Toggles) can lift visibly
        // past the sheet's border on hover. Trade-off: content taller than
        // maxHeight spills past the sheet into the backdrop.
        //
        // v16.0.0: passing `footer` is the supported fix for that spill —
        // the sheet becomes a flex column with a bounded, scrolling body
        // and a pinned footer, so the action buttons can never be pushed
        // off the backdrop. Modals WITHOUT a footer keep the historic
        // overflow:visible behaviour untouched.
        overflow: footer ? "hidden" : "visible",
        display: footer ? "flex" : undefined,
        flexDirection: footer ? "column" : undefined,
      };

  // The scrolling body region only exists in the footer layout. `minHeight:
  // 0` is required for a flex child to be allowed to shrink below its
  // content height — without it the body refuses to scroll and pushes the
  // footer out instead. The negative margin + matching padding give
  // hover-scaled rows room to lift before the clip kicks in (same trick the
  // grid's outer wrapper uses).
  const bodyStyle = footer
    ? {
        flex: "1 1 auto",
        minHeight: 0,
        overflowY: "auto",
        margin: isMobile ? "0 -16px" : "0 -20px",
        padding: isMobile ? "4px 16px" : "4px 20px",
      }
    : undefined;

  const footerStyle = {
    flexShrink: 0,
    borderTop: "1px solid var(--hairline)",
    paddingTop: 12,
    marginTop: 12,
  };

  return (
    <div
      style={backdropStyle}
      className={scrimClass}
      // v15.3.0: sentinel for the shared keyboard handlers. Every modal
      // renders through Overlay, so a mounted backdrop carrying this
      // attribute means "a modal is open" — isAnyOverlayOpen() in
      // src/lib/keyboard.js probes for it so AppShell / ScheduleGrid
      // shortcuts can bail while a dialog is up. Purely additive.
      data-mgt-overlay=""
      onClick={function (e) {
        if (e.target === e.currentTarget && onClose) onClose();
      }}
    >
      <div style={sheetStyle} className={sheetClass}>
        {title ? (
          <div style={{ ...S.h2, marginBottom: 12, flexShrink: 0 }}>{title}</div>
        ) : null}
        {footer ? <div style={bodyStyle}>{children}</div> : children}
        {footer ? <div style={footerStyle}>{footer}</div> : null}
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
    borderRadius: R.pill,
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
    borderRadius: R.pill,
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

// ── Kbd ──────────────────────────────────────────────────────────────────
// v15.3.0: keyboard keycap, used by the ShortcutsModal cheatsheet. Ported
// from MGT Bookings' atoms.jsx Kbd — the shortcut UI is shared visual
// language between the two apps. Colours flow through --bg-kbd /
// --border-kbd (index.html, light + dark) per the v0.11.0 theming model.
export function Kbd({ k }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        background: "var(--bg-kbd)",
        border: "1px solid var(--border-kbd)",
        fontFamily: "-apple-system, 'SF Mono', Menlo, monospace",
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text-primary)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06), inset 0 -1px 0 rgba(0,0,0,0.08)",
        minWidth: 22,
        textAlign: "center",
        boxSizing: "border-box",
        lineHeight: "16px",
      }}
    >
      {k}
    </span>
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
    borderRadius: R.pill,
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
//
// v16.0.0: every button built here gets `.mgt-press` for free — the
// brightness dip on :active. Applying it centrally rather than at ~60 call
// sites is the whole point of having a builder, and it composes with any
// className the caller passes (typically "mgt-hover-scale"). The two
// effects are deliberately independent: press uses `filter`, hover uses
// `transform`, so a button can be hovered and pressed at once without
// either clobbering the other.
export function mkBtn(props) {
  const { variant, style, children, className, ...rest } = props || {};
  const variantStyle = variant && BTN[variant] ? BTN[variant] : BTN.secondary;
  const merged = { ...BTN.base, ...variantStyle, ...(style || {}) };
  const cls = className ? "mgt-press " + className : "mgt-press";
  return (
    <button style={merged} className={cls} {...rest}>
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// v16.0.0 — Animation primitives (ported from MGT Bookings)
//
// These pair with the @keyframes + utility classes in index.html. Both apps
// now share the same motion vocabulary; improve a primitive in one and port
// the change to the other, exactly as the .mgt-hover-scale contract works.
//
// Every one of these honours the reduced-motion kill switches for free,
// because they drive CSS animations/transitions rather than the Web
// Animations API. Anything added here that uses WAAPI must check
// `document.documentElement.dataset.motion === "reduce"` in JS itself —
// CSS cannot reach WAAPI.
// ═══════════════════════════════════════════════════════════════════════════

// ── usePresenceLifecycle ─────────────────────────────────────────────────
// The bare "keep it mounted long enough for the exit animation" state
// machine. Returns [render, leaving]:
//   render  — whether to render at all
//   leaving — whether the exit animation should be playing right now
//
// On show→false the node stays mounted, `leaving` flips true (so the caller
// can swap to an *-out class), and `render` drops after outMs. Shared by
// Presence and ModalPresence so the timing logic exists once.
function usePresenceLifecycle(show, outMs) {
  const [render, setRender] = useState(show === true);
  const [leaving, setLeaving] = useState(false);
  useEffect(function () {
    if (show) {
      setRender(true);
      setLeaving(false);
      return undefined;
    }
    if (!render) return undefined;   // never shown → nothing to animate out
    setLeaving(true);
    const t = setTimeout(function () {
      setRender(false);
      setLeaving(false);
    }, outMs);
    return function () { clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `render` is read as a closure snapshot on purpose
  }, [show]);
  return [render, leaving];
}

// ── Presence ─────────────────────────────────────────────────────────────
// Generic enter/exit wrapper. Caches the last truthy children so the exit
// animation still has something to show when the source expression goes
// null mid-flight (the common case: `cond ? <Thing/> : null`).
//
//   <Presence show={x} inClass="mgt-slide-in" outClass="mgt-slide-out">…</Presence>
export function Presence({ show, inClass, outClass, outMs = 200, children, style, tag = "div" }) {
  const last = useRef(null);
  if (children) last.current = children;
  const [render, leaving] = usePresenceLifecycle(show, outMs);
  if (!render) return null;
  const Tag = tag;
  return <Tag className={leaving ? outClass : inClass} style={style}>{children || last.current}</Tag>;
}

// ── Toast ────────────────────────────────────────────────────────────────
// Thin alias: a floating status message = Presence + the toast keyframes.
// `style` lets a one-slot toast layer pass `gridArea` so a leaving and an
// entering toast overlap in the same cell and crossfade in place rather
// than stacking and reflowing the layout.
export function Toast({ show, children, style }) {
  return (
    <Presence show={show} inClass="mgt-toast-in" outClass="mgt-toast-out" outMs={210} style={style}>
      {children}
    </Presence>
  );
}

// ── ModalPresence + PresenceContext ──────────────────────────────────────
// Exit animations for Overlay-based modals.
//
// Scheduling's modals are ALWAYS mounted and toggle an `open` prop, while
// the data behind them goes null the moment the parent closes them (e.g.
// ScheduleGrid sets `modalCell = null`, so `slotDef` becomes null and the
// modal's `if (!open || !slotDef) return null` fires). That means the modal
// cannot animate its own exit — by the time it knows it is closing, its
// content is gone.
//
// ModalPresence solves it by caching the last truthy CHILD ELEMENT, whose
// props still hold the old data. During the exit it re-renders that cached
// element, so the modal paints exactly as it did before the close, and
// publishes `{leaving: true}` on PresenceContext for Overlay to read.
//
// Usage at the mount site:
//   <ModalPresence show={cond}>{cond ? <SomeModal open … /> : null}</ModalPresence>
//
// It renders NO wrapper element, so the modal's own fixed positioning is
// untouched.
//
// NB the cached element keeps `open={true}` in its props for the duration
// of the exit. Modals that bind global keyboard handlers must gate them on
// `!leaving` (via usePresence) so a stray Enter can't re-submit a form that
// is already closing.
export const PresenceContext = createContext({ leaving: false });
export function usePresence() { return useContext(PresenceContext); }

export function ModalPresence({ show, children, outMs = 200 }) {
  const last = useRef(null);
  if (children) last.current = children;
  const [render, leaving] = usePresenceLifecycle(show, outMs);
  if (!render) return null;
  return (
    <PresenceContext.Provider value={{ leaving: leaving }}>
      {children || last.current}
    </PresenceContext.Provider>
  );
}

// ── Reveal ───────────────────────────────────────────────────────────────
// Expand/collapse without knowing the content height, via a CSS grid track
// easing between 0fr and 1fr. Set `horizontal` to ease the WIDTH instead.
//
// Three subtleties, all load-bearing:
//   1. Double requestAnimationFrame — the 0fr→1fr change must land in a
//      different frame from the mount, or React batches them and the
//      transition never fires.
//   2. `last.current` caches children so a collapse still has content to
//      animate when the source expression goes null.
//   3. `revealed` flips the inner track to overflow:visible 320ms after
//      opening, so a `.mgt-hover-scale` child isn't clipped at rest. It
//      goes back to hidden immediately on close so the collapse still
//      clips cleanly. Timeout-driven rather than transitionend, which is
//      unreliable on grid-template-rows across browsers.
export function Reveal({ show, children, style, horizontal = false }) {
  const last = useRef(null);
  if (children) last.current = children;
  const [mounted, setMounted] = useState(show === true);
  const [open, setOpen] = useState(show === true);
  const [revealed, setRevealed] = useState(show === true);
  useEffect(function () {
    if (show) {
      setMounted(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(function () {
        r2 = requestAnimationFrame(function () { setOpen(true); });
      });
      const tv = setTimeout(function () { setRevealed(true); }, 320);
      return function () {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
        clearTimeout(tv);
      };
    }
    setOpen(false);
    setRevealed(false);
    const t = setTimeout(function () { setMounted(false); }, 300);
    return function () { clearTimeout(t); };
  }, [show]);
  if (!mounted) return null;
  const track = horizontal
    ? {
        display: "inline-grid",
        gridTemplateColumns: open ? "1fr" : "0fr",
        transition: "grid-template-columns 280ms cubic-bezier(.4,0,.2,1), opacity 220ms ease",
      }
    : {
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 280ms cubic-bezier(.4,0,.2,1), opacity 220ms ease",
      };
  const innerStyle = horizontal
    ? { overflow: revealed ? "visible" : "hidden", minWidth: 0, minHeight: 0, display: "flex", alignItems: "center" }
    : { overflow: revealed ? "visible" : "hidden", minHeight: 0 };
  return (
    <div style={{ ...track, opacity: open ? 1 : 0, ...(style || {}) }}>
      <div style={innerStyle}>{children || last.current}</div>
    </div>
  );
}

// ── AutoHeight ───────────────────────────────────────────────────────────
// For content-REPLACE cases where there is no clean show/hide to drive a
// Reveal (a tab swap, a form section switching shape). A ResizeObserver
// measures the inner content and the wrapper eases `height` to match.
//
// `overflow` is visible AT REST and hidden ONLY while the height transition
// runs: clipping at rest would cut off any `.mgt-hover-scale` lift inside,
// but not clipping during the transition would let the new content pop out
// at full size on the first frame.
export function AutoHeight({ children, style, linear }) {
  const inner = useRef(null);
  const hRef = useRef(null);
  const [h, setH] = useState(null);          // null = auto until first measure
  const [animating, setAnimating] = useState(false);
  useLayoutEffect(function () {
    const el = inner.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    function measure() {
      const next = el.offsetHeight;
      const prev = hRef.current;
      // Only a CHANGE from a known prior height animates. The first
      // (null → number) measure must not clip the rest state.
      if (prev != null && next !== prev) setAnimating(true);
      hRef.current = next;
      setH(next);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return function () { ro.disconnect(); };
  }, []);
  return (
    <div
      onTransitionEnd={function (e) { if (e.propertyName === "height") setAnimating(false); }}
      style={{
        height: h == null ? "auto" : h,
        overflow: animating ? "hidden" : "visible",
        transition: "height 280ms " + (linear ? "linear" : "ease"),
        ...(style || {}),
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}

// ── SlideView ────────────────────────────────────────────────────────────
// Directional slide-in for view/tab switches. The PARENT re-keys it
// (`key={something}`) so a change remounts it and replays the animation;
// `dir` is "mgt-view-in-left" or "mgt-view-in-right".
//
// `overflow: hidden` applies ONLY while the slide runs, so the 28px
// translateX can't spawn a transient horizontal scrollbar — then it goes
// back to visible so hover lifts aren't clipped at rest.
export function SlideView({ dir, children, style }) {
  const [animating, setAnimating] = useState(true);
  return (
    <div
      className={animating ? dir : undefined}
      onAnimationEnd={function () { setAnimating(false); }}
      style={{ overflow: animating ? "hidden" : "visible", ...(style || {}) }}
    >
      {children}
    </div>
  );
}
