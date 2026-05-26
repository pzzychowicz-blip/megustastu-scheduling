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
//   weekStart      (Date)             — current Monday
//   weekDates      (Array<Date>)      — visibleWeekDates output (open days only)
//   weekShifts     ({ [id]: shift })  — narrowed to current week
//   isMobile       (bool)
//   actions        (object)           — usePersistence().actions; uses deleteShift
//   disabled       (bool)             — v1.12.0; greys out the button and
//                                        no-ops the click. Past-week
//                                        lockdown in ScheduleGrid passes this.
//   onResult       (fn({ cleared }))  — fires after a run; grid renders banner
//   onUndoableOp   (fn(op))           — v1.10.0; fires after a successful run
//                                        with the op record for the undo stack.
//                                        Optional — caller controls whether
//                                        Clear is undoable.

import { useState } from "react";
import { BTN } from "../lib/constants.js";
import { formatWeekRange, isoDate } from "../lib/schedule-logic.js";
import ClearConfirmModal from "./ClearConfirmModal.jsx";

export default function ClearButton({
  weekStart, weekDates, weekShifts, isMobile, actions, onResult, onUndoableOp,
  disabled: disabledByParent,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const totalCount = Object.keys(weekShifts || {}).length;
  const disabled = Boolean(disabledByParent);
  const tooltip = disabledByParent
    ? "Past weeks are read-only"
    : totalCount === 0
      ? "No shifts to clear in this week"
      : "Clear week or single day";

  function handleClick() {
    if (disabled) return;
    setOpen(true);
  }

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

    // v1.10.0: snapshot the records BEFORE deletion so the undo stack can
    // re-upsert them later. JSON round-trip is enough for plain shift
    // records (no Date / Map / cycles in our schema). Records that don't
    // resolve from weekShifts (out-of-band id) are filtered out — they
    // shouldn't exist but we'd rather skip than push undefineds.
    const restoreShifts = ids
      .map(function (id) {
        const rec = weekShifts ? weekShifts[id] : null;
        return rec ? JSON.parse(JSON.stringify(rec)) : null;
      })
      .filter(function (r) { return r !== null; });

    setBusy(true);
    Promise.resolve().then(function () {
      for (let i = 0; i < ids.length; i++) {
        actions.deleteShift(ids[i]);
      }
      if (onResult) onResult({ cleared: ids.length, kind: scope.kind });
      if (onUndoableOp && restoreShifts.length > 0) {
        // Label distinguishes whole-week vs single-day so the Undo button
        // can advertise the scope before the manager clicks.
        const label = scope.kind === "week"
          ? "Clear week"
          : "Clear day";
        onUndoableOp({
          label: label,
          restoreShifts: restoreShifts,
          removeIds: [],
        });
      }
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
        className="mgt-hover-scale"
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
