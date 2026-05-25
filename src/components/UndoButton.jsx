// src/components/UndoButton.jsx
// v1.10.0 — Schedule nav-bar undo affordance. Placed between SwapButton and
// ClearButton in ScheduleGrid. Fully driven by parent — no internal state.
//
// Props:
//   stack    (Array<Op>) — from useUndoStack(); newest LAST. Empty → disabled.
//   onUndo   (fn)        — fires on click; parent pops the stack and applies
//                          the inverse mutations.
//   isMobile (bool)      — currently informational; kept for parity with the
//                          other nav-bar buttons (Generate/Swap/Clear/Export)
//                          which already accept it.
//   disabled (bool)      — v1.12.0; greys out the button and no-ops the
//                          click regardless of stack state. Past-week
//                          lockdown in ScheduleGrid passes this.
//
// Label: "Undo" when stack is empty, "Undo: {top.label}" when populated.
// The label shows the user what they're about to undo before they click,
// matching the explicit-target style of the rest of the schedule nav bar.

import { BTN } from "../lib/constants.js";

export default function UndoButton({ stack, onUndo, isMobile, disabled: disabledByParent }) {
  // We intentionally accept isMobile so the prop surface stays parallel
  // to the other nav buttons even though we don't render anything
  // mobile-specific here. eslint-disable-next-line no-unused-vars
  void isMobile;

  const top = stack && stack.length > 0 ? stack[stack.length - 1] : null;
  const disabled = !top || Boolean(disabledByParent);
  const label = top ? "Undo: " + top.label : "Undo";
  const tooltip = disabledByParent
    ? "Past weeks are read-only"
    : top
      ? "Undo the last action (" + top.label + ")"
      : "Nothing to undo";

  const style = {
    ...BTN.base,
    ...BTN.secondary,
    padding: "6px 12px",
    fontSize: 13,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };

  function handleClick() {
    if (disabled) return;
    if (onUndo) onUndo();
  }

  return (
    <button
      type="button"
      className="mgt-hover-scale"
      onClick={handleClick}
      disabled={disabled}
      style={style}
      title={tooltip}
    >
      {label}
    </button>
  );
}
