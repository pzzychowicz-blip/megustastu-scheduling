// src/components/GenerateButton.jsx
// v1.0.0 — Schedule grid's "Generate" entry point. Owns the confirm
// modal, the result-banner state, and the loop that persists each
// generated shift via actions.upsertShift().
//
// Props:
//   weekStart        (Date)             — current Monday from ScheduleGrid
//   weekShifts       ({ [id]: shift })  — narrowed-to-week shifts map
//   priorWeekShifts  ({ [id]: shift })  — shifts in the 7 days BEFORE weekStart.
//                                          v1.1.0 fairness: combined-load
//                                          ranking factors in prior usage.
//                                          Empty / missing falls back to no-op.
//   nextWeekShifts   ({ [id]: shift })  — shifts in the 7 days AFTER weekStart.
//                                          v1.8.0 cross-week consecutive-off:
//                                          hasConsecutiveDaysOff uses next Mon
//                                          to detect Sun ↔ next-Mon 2-off
//                                          straddles.
//   employees        ({ [id]: employee })
//   requests         ({ [id]: request })
//   shiftTemplate    (object | null)
//   openingDays      (object | null)    — from /settings.openingDays
//   strictPreference (bool)             — from /settings.generatorStrictPreference
//   isMobile         (bool)
//   actions          (object)           — usePersistence().actions; uses upsertShift
//   onResult         (fn(summary))      — fires after a run with the summary;
//                                          parent renders the banner. Optional.
//
// Disabled when shiftTemplate is null (data not ready) or there are no
// employees.

import { useState } from "react";
import { BTN } from "../lib/constants.js";
import { formatWeekRange } from "../lib/schedule-logic.js";
import { generateWeek } from "../lib/generator.js";
import GenerateConfirmModal from "./GenerateConfirmModal.jsx";

export default function GenerateButton({
  weekStart, weekShifts, priorWeekShifts, nextWeekShifts, employees, requests,
  shiftTemplate, openingDays, strictPreference, isMobile, actions, onResult,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const employeeCount = Object.keys(employees || {}).length;
  const disabled = !shiftTemplate || employeeCount === 0;
  const tooltip = !shiftTemplate
    ? "Schedule template not loaded yet"
    : employeeCount === 0
      ? "Add employees first"
      : "Auto-fill empty cells for this week";

  function handleClick() {
    if (disabled) return;
    setOpen(true);
  }

  function handleClose() {
    if (busy) return;
    setOpen(false);
  }

  function handleConfirm(mode) {
    if (busy) return;
    setBusy(true);
    // Wrap the synchronous algorithm + writes in a microtask so the
    // "Working…" label gets a paint before we block on upsertShift /
    // deleteShift calls. Each persistence call is fire-and-forget against
    // Firebase (returns immediately; the network round-trip resolves
    // later, but the local React state updates via onValue).
    Promise.resolve().then(function () {
      const result = generateWeek({
        mode: mode,                                 // "fill-empty" | "regenerate"
        weekStart: weekStart,
        weekShifts: weekShifts,
        priorWeekShifts: priorWeekShifts,           // v1.1.0 fairness
        nextWeekShifts: nextWeekShifts,             // v1.8.0 cross-week 2-off
        employees: employees,
        requests: requests,
        shiftTemplate: shiftTemplate,
        openingDays: openingDays,
        strictPreference: strictPreference,
      });
      // v1.1.0: regenerate mode returns clearedShiftIds — delete first so
      // the subsequent upserts see clean cells (the local fill-empty pass
      // already worked against a filtered map, but the Firebase store
      // needs the deletes to actually fire).
      if (result.clearedShiftIds && result.clearedShiftIds.length > 0) {
        for (let i = 0; i < result.clearedShiftIds.length; i++) {
          actions.deleteShift(result.clearedShiftIds[i]);
        }
      }
      for (let i = 0; i < result.newShifts.length; i++) {
        actions.upsertShift(result.newShifts[i]);
      }
      if (onResult) {
        // Hand the mode through to the banner so it can phrase the copy
        // appropriately (regenerate runs include a "Cleared N" prefix).
        onResult({ ...result.summary, mode: mode });
      }
      setBusy(false);
      setOpen(false);
    });
  }

  const style = {
    ...BTN.base,
    ...BTN.primary,
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
        Generate
      </button>

      <GenerateConfirmModal
        open={open}
        weekLabel={formatWeekRange(weekStart)}
        strictPref={Boolean(strictPreference)}
        busy={busy}
        isMobile={isMobile}
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    </>
  );
}
