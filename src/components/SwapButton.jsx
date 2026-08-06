// src/components/SwapButton.jsx
// v1.7.0 — Schedule grid's "Swap" toggle entry point. Lives in the
// week-nav bar between Generate and Clear. When OFF, ordinary cell
// clicks open the picker modal. When ON, the next cell click chooses a
// source (must be filled), and the cell click after that triggers the
// swap/move mechanic owned by ScheduleGrid.
//
// Dumb button — owns no swap state itself. Reads `active` from the
// parent and fires `onToggle()` when clicked.
//
// Props:
//   active     (bool)             — whether swap mode is currently on
//   phase      ("source-select"|"target-select"|undefined)
//                                  — unused since v16.0.0; the button no
//                                    longer narrates which phase it is in.
//                                    Kept so ScheduleGrid's call site (which
//                                    passes it) needs no edit if a future
//                                    per-phase affordance wants it back.
//   isMobile   (bool)             — currently unused; kept for parity with
//                                   the other nav-bar buttons
//   disabled   (bool)             — v1.12.0; greys out the button and
//                                   no-ops the click. Past-week lockdown
//                                   in ScheduleGrid passes this.
//   onToggle   (fn)               — fires when the button is clicked

import { BTN, BTN_SIZE, pillTone } from "../lib/constants.js";

export default function SwapButton({ active, onToggle, disabled }) {
  // v16.0.0 (phase 37): ON is `pillTone(true)` — solid `--accent`, the same
  // ON language phase 23 gave every other selectable control in the app, and
  // now also the swap-source cell's ring.
  //
  // It used to paint the yellow WARNING tint, on the reasoning that swap
  // needed a visual identity "distinct from accent-blue / green". That was
  // reasonable in isolation and wrong in context: yellow already means
  // something specific here (a conflict, a breached rule, a shift on a
  // closed day-part), so an armed tool wearing it read as a problem. An
  // armed tool is a selected control, and this app has one look for that.
  const baseStyle = active
    ? { ...BTN.base, ...BTN_SIZE.md, ...pillTone(true) }
    : { ...BTN.base, ...BTN.secondary, ...BTN_SIZE.md };
  const style = disabled
    ? { ...baseStyle, opacity: 0.5, cursor: "not-allowed" }
    : baseStyle;

  function handleClick() {
    if (disabled) return;
    if (onToggle) onToggle();
  }

  return (
    <button
      type="button"
      className="mgt-hover-scale mgt-press"
      onClick={handleClick}
      disabled={disabled}
      style={style}
      aria-pressed={active === true}
      // v16.0.0 (phase 37): the label is the tool's NAME, in both states. It
      // used to flip to "Swap: cancel" when armed — a control relabelling
      // itself with its own exit instruction, on top of a banner that said
      // the same thing and a Cancel button beside it. Three affordances for
      // one Esc. The solid-accent fill and `aria-pressed` carry the state.
      title={disabled ? "Past weeks are read-only" : "Move or swap an assignment"}
    >
      Swap
    </button>
  );
}
