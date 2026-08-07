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
//   - ModalPresence— the same lifecycle, but renders NO wrapper element;
//                    publishes `{leaving}` on PresenceContext for Overlay.
//   - usePresence  — read that context.
//   - SlideView    — directional slide-in wrapper for view/tab switches.
//
// Bookings also has `Reveal`, `AutoHeight` and `useFlip`. They are
// NOT ported: no Scheduling surface calls them today, and shipping ~120
// lines of never-executed code — including AutoHeight's ResizeObserver
// lifecycle and Reveal's double-rAF + delayed overflow flip — just banks
// the risk without the benefit. Same reasoning this version applied to
// Bookings' ten BTN variants ("dead tokens are worse than no tokens").
// ROADMAP.md tracks them; port each one WITH its first real consumer, so
// its first execution isn't its first test.
//
// Vite's automatic JSX runtime: NO React import required.

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { R, S, BTN, BTN_SIZE, BADGE_SIZE } from "../lib/constants.js";

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

// Module-level, because the body-scroll lock is a property of the DOCUMENT
// and not of any one Overlay instance — see the refcount note in the effect.
let bodyScrollLocks = 0;
let bodyScrollPrevOverflow = "";

export function Overlay({ open, onClose, title, isMobile, children, footer }) {
  const { leaving } = usePresence();

  // v16.0.0: mobile body-scroll lock. Without it the page behind a
  // full-screen sheet scrolls under the user's finger. Desktop doesn't need
  // it — the scrim covers a centred card and the page beneath is inert.
  // Hooks must run unconditionally, so the guard lives inside the effect
  // rather than around it.
  //
  // REFCOUNTED, not save-and-restore. Modals are one-at-a-time by design,
  // but ModalPresence keeps a closing one mounted for its 200 ms exit, so
  // two Overlays genuinely overlap if the manager opens B while A is still
  // animating out. With per-instance save/restore that interleaves wrongly:
  // B saves prev="hidden" (A's lock), A's cleanup then restores "" and
  // unlocks the page under a full-screen B, and B's cleanup finally writes
  // back "hidden" — leaving <body> unscrollable with no modal open, until a
  // reload. Counting locks and only touching the style on the 0↔1 edges is
  // order-independent.
  useEffect(function () {
    if (!open || !isMobile) return undefined;
    if (bodyScrollLocks === 0) {
      bodyScrollPrevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    bodyScrollLocks += 1;
    return function () {
      bodyScrollLocks -= 1;
      if (bodyScrollLocks === 0) {
        document.body.style.overflow = bodyScrollPrevOverflow;
      }
    };
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
    // v16.0.0 (pill radius): see the Toggle row above — the header has no
    // resting background and previously took its hover shape from the
    // `.mgt-hover-scale` declaration that is now gone.
    borderRadius: R.card,
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
      {/* v16.0.0 (phase 26): was `{open ? <div…> : null}` — the chevron
          rotated over 150ms while the body it points at appeared instantly,
          which is the jarring half of an animation. Reveal eases the height
          via a 0fr↔1fr grid track.

          bodyStyle stays on the INNER element, inside Reveal's clip. Its
          padding and borderTop have to be part of what collapses; hoisting
          them onto the track would leave a 12px stub and a stray hairline
          behind after the section closed. */}
      <Reveal show={open === true}>
        <div style={bodyStyle}>{children}</div>
      </Reveal>
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
    // v16.0.0 (pill radius): its OWN radius now. This row carries no
    // background at rest and used to borrow its hover-card shape from
    // `.mgt-hover-scale`, whose border-radius declaration was deleted so
    // that pills stay pills on hover. `card` rather than `pill` — a
    // full-width settings row is a surface, not a control.
    borderRadius: R.card,
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
        boxShadow: "var(--shadow-keycap)",
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
    // v16.0.0 (phase 24): these were the literals 2px 8px / 11. Same
    // numbers, but now stated as the token so the four surfaces that
    // re-implement a badge outside this atom have something to match.
    ...BADGE_SIZE.base,
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

// ── Notice ───────────────────────────────────────────────────────────────
// v16.0.0 (phase 42). The app's one tinted message block: a permission
// error above the tab bar, a split-shift warning inside the picker, a rest-
// rule caution under an assignee dropdown. Before this there were three
// hand-rolled versions of the same box in three files, drifted apart on
// padding (6×10 / 8×10 / 10×12), on whether the lead was bold, and on
// whether the copy ended in a reassuring sentence.
//
// SHAPE — title + detail, always in that order:
//   title   the fact, in the tone's colour at 700. What happened.
//   detail  the consequence or the specifics, one line, same hue at 82%.
//           Optional; a Notice can be a title alone.
// Two weights of the same colour rather than two colours, so the block
// still reads as one object rather than as two stacked messages.
//
// ACTION — a SOLID pill, not the ghost button the write-error banner used
// to carry. The rest of the app resolved this in phase 23: an actionable
// control is filled. A dismiss sitting in a red box, outlined, read as
// decoration next to the Regenerate and Fill-empty buttons two rows up.
// `actionVariant` picks which BTN fill; it defaults to the tone's own, so
// callers normally pass only `actionLabel` + `onAction`.
//
// NO GLYPH. The tint IS the severity signal, and a ⚠ in front of amber text
// says it twice. Semantics go to `role` instead, where they reach a screen
// reader — "alert" for something that just failed, "note" for a standing
// caution the manager is reading past.
export function Notice({
  tone = "warning", title, detail, actionLabel, onAction, actionVariant, role, style,
}) {
  const danger = tone === "danger";
  const palette = danger
    ? { bg: "var(--bg-danger-tint)", border: "var(--border-danger-tint)", fg: "var(--text-danger)" }
    : { bg: "var(--bg-warning-tint)", border: "var(--border-warning-tint)", fg: "var(--text-warning)" };
  const hasAction = Boolean(actionLabel) && Boolean(onAction);
  return (
    <div
      role={role || (danger ? "alert" : "note")}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        background: palette.bg,
        border: "1px solid " + palette.border,
        borderRadius: R.card,
        color: palette.fg,
        ...(style || {}),
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>{title}</div>
        {detail ? (
          <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, opacity: 0.82, marginTop: 2 }}>
            {detail}
          </div>
        ) : null}
      </div>
      {hasAction ? (
        <button
          type="button"
          className="mgt-hover-scale mgt-press"
          onClick={onAction}
          style={{
            ...BTN.base,
            ...(BTN[actionVariant || (danger ? "danger" : "secondary")] || BTN.secondary),
            ...BTN_SIZE.sm,
            flexShrink: 0,
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
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
// ── useRetainedChildren ──────────────────────────────────────────────────
// Keeps the last non-null `children` so an exit animation has something to
// render after the caller has already dropped the content. Returns a ref.
//
// The cache is written in an EFFECT, not in the render body. All three
// consumers used to do `if (children) last.current = children;` inline,
// which mutates a ref during render — React disallows that, and this app
// mounts under StrictMode. React is free to render a component and throw
// the result away without committing (StrictMode's dev double-render, and
// concurrent rendering or a Suspense retry in general); a render-phase
// write would then cache children from a tree that never reached the
// screen, and the exit would replay content the user never saw.
//
// Writing after commit is also sufficient: by the time `children` goes
// null, the previous render HAS committed, so its effect has already run
// and the ref holds exactly what was last displayed.
//
// Ported from MGT Bookings, where the same three atoms carry the same
// render-phase write — see that repo's ROADMAP.
function useRetainedChildren(children) {
  const last = useRef(null);
  useEffect(function () {
    if (children) last.current = children;
  }, [children]);
  return last;
}

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
  const last = useRetainedChildren(children);
  const [render, leaving] = usePresenceLifecycle(show, outMs);
  if (!render) return null;
  const Tag = tag;
  return <Tag className={leaving ? outClass : inClass} style={style}>{children || last.current}</Tag>;
}

// ── Reveal ───────────────────────────────────────────────────────────────
// v16.0.0 (phase 26). Expand / collapse that EASES rather than cutting.
//
// The mechanism is a CSS grid track animating `0fr ↔ 1fr`. That is the one
// technique that eases to a content-derived height without JavaScript
// measuring anything — `height: auto` is not animatable, and a measured
// pixel height goes stale the moment the content reflows (a Settings
// section grows a row when the manager adds a shift slot). No
// ResizeObserver, no layout thrash, and nothing to go wrong on resize.
//
// Three details are load-bearing; all three are why this was ported whole
// rather than reimplemented:
//
//   1. DOUBLE requestAnimationFrame. The mount and the 0fr→1fr flip must
//      land in different frames or React batches them into one and the
//      browser sees no change to transition — the section would snap open,
//      which is the bug this atom exists to fix.
//   2. CACHED last children. On close the caller usually drops the content
//      in the same render that flips `show` false, so the collapse would
//      animate an empty box. Re-rendering the cached children keeps the
//      section looking normal all the way down.
//   3. DELAYED overflow flip. The inner track clips while the ease runs, or
//      the content spills past the closing edge. But it must go back to
//      `visible` once settled, or it clips two things Scheduling depends
//      on: `.mgt-hover-scale` rows lifting at rest, and — more seriously —
//      the per-weekday and open-days POPOVERS, which are absolutely
//      positioned above their pill row and would be cut off mid-air.
//      Timeout-driven rather than transitionend: `grid-template-rows`
//      transitionend is unreliable across browsers.
//
// Bookings' `horizontal` variant is NOT ported — no Scheduling surface
// reveals along the inline axis, and the same "dead tokens are worse than
// no tokens" rule that kept out its extra BTN variants applies to a branch
// that would never execute.

// How long a Reveal stays mounted after `show` goes false, i.e. how long
// the collapse takes.
//
// v16.0.0 (phase 40): no longer exported. Its export existed so a nested
// Toast could be told to outlive the collapse — and the Toast atom, whose
// only consumer was the result banner phase 38 removed, is gone with it.
// Kept as a module constant because Reveal itself still needs the value.
const REVEAL_OUT_MS = 300;

export function Reveal({ show, children, style }) {
  const last = useRetainedChildren(children);
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
      // SAFETY NET (v16.0.0 phase 31, an addition to Bookings' original).
      // The closed state is `0fr` + `opacity: 0`, i.e. the content is
      // INVISIBLE rather than merely un-animated. So if the double rAF
      // above is delayed, what the user loses is not a nice transition —
      // it is the content itself. rAF does not fire in a backgrounded or
      // unpainted tab, and browsers throttle it under load; caught here
      // when an automated run measured a revealed section still at
      // `opacity: 0, height: 0` almost a second after opening, because
      // nothing had forced a paint.
      //
      // `setOpen(true)` is idempotent, so whichever path fires first wins
      // and the other is a no-op: the rAF path still gives the smooth
      // open in the normal case, and this only decides the outcome when
      // rAF has not run at all. 60ms is past ~3 frames at 60Hz.
      const fallback = setTimeout(function () { setOpen(true); }, 60);
      // Slightly past the 280ms track transition, so the clip lifts only
      // once the section has actually settled.
      const tv = setTimeout(function () { setRevealed(true); }, 320);
      return function () {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
        clearTimeout(fallback);
        clearTimeout(tv);
      };
    }
    setOpen(false);
    setRevealed(false);  // clip immediately so the collapse hides cleanly
    const t = setTimeout(function () { setMounted(false); }, REVEAL_OUT_MS);
    return function () { clearTimeout(t); };
  }, [show]);

  if (!mounted) return null;

  const trackStyle = {
    display: "grid",
    gridTemplateRows: open ? "1fr" : "0fr",
    transition: "grid-template-rows 280ms cubic-bezier(.4,0,.2,1), opacity 220ms ease",
    opacity: open ? 1 : 0,
    ...(style || {}),
  };
  // minHeight: 0 is required — a grid item's default `min-height: auto`
  // refuses to shrink below its content, which pins the track at full
  // height and kills the animation entirely.
  const innerStyle = { overflow: revealed ? "visible" : "hidden", minHeight: 0 };

  return (
    <div style={trackStyle}>
      <div style={innerStyle}>{children || last.current}</div>
    </div>
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
  const last = useRetainedChildren(children);
  const [render, leaving] = usePresenceLifecycle(show, outMs);
  if (!render) return null;
  return (
    <PresenceContext.Provider value={{ leaving: leaving }}>
      {children || last.current}
    </PresenceContext.Provider>
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
//
// The target check is load-bearing: animationend BUBBLES, and ScheduleGrid
// renders `mgt-jump-pulse` (1.6s, one-shot) and `mgt-swap-pulse` on cells
// INSIDE this wrapper. Without it, a cell animation finishing mid-slide
// clears `animating`, which strips the direction class and snaps the
// half-slid view into place — while also dropping the overflow guard this
// comment is about.
export function SlideView({ dir, children, style }) {
  const [animating, setAnimating] = useState(true);
  return (
    <div
      className={animating ? dir : undefined}
      onAnimationEnd={function (e) {
        if (e.target !== e.currentTarget) return;
        setAnimating(false);
      }}
      style={{ overflow: animating ? "hidden" : "visible", ...(style || {}) }}
    >
      {children}
    </div>
  );
}
