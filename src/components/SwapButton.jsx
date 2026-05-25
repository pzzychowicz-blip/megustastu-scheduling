// src/components/SwapButton.jsx
// v1.7.0 — Schedule grid's "Swap" toggle entry point. Lives in the
// week-nav bar between Generate and Clear. When OFF, ordinary cell
// clicks open the picker modal. When ON, the next cell click chooses a
// source (must be filled), and the cell click after that triggers the
// swap/move mechanic owned by ScheduleGrid.
//
// Dumb button — owns no swap state itself. Reads `active` from the
// parent and fires `onToggle()` when clicked. The hint label below the
// button is also rendered here for spatial proximity.
//
// Props:
//   active     (bool)             — whether swap mode is currently on
//   phase      ("source-select"|"target-select"|undefined)
//                                  — for the hint copy; undefined when active=false
//   isMobile   (bool)             — currently unused; kept for parity with
//                                   other nav-bar buttons in case the hint
//                                   needs a mobile-specific tweak later
//   disabled   (bool)             — v1.12.0; greys out the button and
//                                   no-ops the click. Past-week lockdown
//                                   in ScheduleGrid passes this.
//   onToggle   (fn)               — fires when the button is clicked

import { BTN } from "../lib/constants.js";

export default function SwapButton({ active, onToggle, disabled }) {
  // v1.7.0: when active, the button paints in the yellow warning
  // palette so it visually matches the source-cell pulse + swap banner
  // (one swap-mode visual identity, distinct from accent-blue / green).
  // Inactive state stays in the neutral secondary palette to read as
  // a regular nav-bar tool alongside Generate / Clear.
  const baseStyle = active
    ? {
        ...BTN.base,
        padding: "6px 12px",
        fontSize: 13,
        background: "var(--bg-warning-tint)",
        color: "var(--text-warning)",
        border: "1px solid var(--border-warning-tint)",
        fontWeight: 600,
      }
    : {
        ...BTN.base,
        ...BTN.secondary,
        padding: "6px 12px",
        fontSize: 13,
      };
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
      className="mgt-hover-scale"
      onClick={handleClick}
      disabled={disabled}
      style={style}
      title={disabled
        ? "Past weeks are read-only"
        : active
          ? "Click a cell to choose source / target, or click again to cancel"
          : "Toggle Swap mode to move or swap an assignment in two clicks"}
    >
      {active ? "Swap: cancel" : "Swap…"}
    </button>
  );
}
