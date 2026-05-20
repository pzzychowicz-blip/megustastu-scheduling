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
//   onToggle   (fn)               — fires when the button is clicked

import { BTN } from "../lib/constants.js";

export default function SwapButton({ active, onToggle }) {
  // v1.7.0: when active, the button paints in the yellow warning
  // palette so it visually matches the source-cell pulse + swap banner
  // (one swap-mode visual identity, distinct from accent-blue / green).
  // Inactive state stays in the neutral secondary palette to read as
  // a regular nav-bar tool alongside Generate / Clear.
  const style = active
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

  return (
    <button
      type="button"
      className="mgt-hover-scale"
      onClick={onToggle}
      style={style}
      title={active
        ? "Click a cell to choose source / target, or click again to cancel"
        : "Toggle Swap mode to move or swap an assignment in two clicks"}
    >
      {active ? "Swap: cancel" : "Swap…"}
    </button>
  );
}
