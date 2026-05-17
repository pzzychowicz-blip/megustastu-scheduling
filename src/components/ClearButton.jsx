// src/components/ClearButton.jsx
// v1.1.0 — "Clear…" entry point in the Schedule grid's week-nav bar.
// Opens the ClearConfirmModal, then runs the delete loop on confirm.
// Surfaces a result via onResult so the grid's banner can report
// "Cleared N shifts."
//
// Disabled when there are zero shifts in the current week — nothing to
// clear, save a click. Still opens the modal in that case so the
// manager can SEE that the week is already empty; the inner Confirm
// button stays disabled.
//
// Props:
//   weekStart    (Date)             — current Monday
//   weekDates    (Array<Date>)      — visibleWeekDates output (open days only)
//   weekShifts   ({ [id]: shift })  — narrowed to current week
//   isMobile     (bool)
//   actions      (object)           — usePersistence().actions; uses deleteShift
//   onResult     (fn({ cleared }))  — fires after a run; grid renders banner

import { useState } from "react";
import { BTN } from "../lib/constants.js";
import { formatWeekRange, isoDate } from "../lib/schedule-logic.js";
import ClearConfirmModal from "./ClearConfirmModal.jsx";

export default function ClearButton({
  weekStart, weekDates, weekShifts, isMobile, actions, onResult,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const totalCount = Object.keys(weekShifts || {}).length;
  const disabled = false;  // always allow open (the modal explains "nothing to clear")
  const tooltip = totalCount === 0
    ? "No shifts to clear in this week"
    : "Clear week or single day";

  function handleClick() { setOpen(true); }

  function handleClose() {
    if (busy) return;
    setOpen(false);
  }

  function handleConfirm(scope) {
    if (busy) return;
    // Compute the id list locally so the modal stays dumb.
    const all = Object.values(weekShifts || {});
    const ids = scope.kind === "week"
      ? all.map(function (s) { return s.id; })
      : all.filter(function (s) { return s.date === scope.dateIso; })
          .map(function (s) { return s.id; });

    if (ids.length === 0) {
      // Defensive: should be blocked by the modal's Confirm-disabled.
      setOpen(false);
      return;
    }

    setBusy(true);
    Promise.resolve().then(function () {
      for (let i = 0; i < ids.length; i++) {
        actions.deleteShift(ids[i]);
      }
      if (onResult) onResult({ cleared: ids.length, kind: scope.kind });
      setBusy(false);
      setOpen(false);
    });
  }

  const style = {
    ...BTN.base,
    ...BTN.secondary,
    padding: "6px 12px",
    fontSize: 13,
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        style={style}
        title={tooltip}
      >
        Clear…
      </button>

      <ClearConfirmModal
        open={open}
        weekLabel={formatWeekRange(weekStart)}
        weekDates={weekDates}
        weekShifts={weekShifts}
        busy={busy}
        isMobile={isMobile}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    </>
  );
}
