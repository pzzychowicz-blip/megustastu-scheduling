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
//   minConsecutiveDaysOff       (number) — v1.11.0. From /settings.minConsecutiveDaysOff
//                                          (clamped 1..3, default 2). Threaded into
//                                          generateWeek → hasConsecutiveDaysOff.
//   maxConsecutiveWorkingDays   (number) — v1.11.0. From /settings.maxConsecutiveWorkingDays
//                                          (clamped 3..14, default 5). Threaded into
//                                          generateWeek → withinMaxConsecutiveWorkingDays.
//   dayRequiredRoles            (object) — v1.11.0. Per-section override
//                                          `{foh: [...], kitchen: [...]}`. Threaded
//                                          into generateWeek → slotsForDay so per-cell
//                                          slotDef.requiredRoles reflects the config.
//   isMobile         (bool)
//   actions          (object)           — usePersistence().actions; uses upsertShift
//   onResult         (fn(summary))      — fires after a run with the summary;
//                                          parent renders the banner. Optional.
//   onUndoableOp     (fn(op))           — v1.10.0; fires after a successful run
//                                          with the op record for the undo stack.
//                                          Optional — caller controls whether
//                                          Generate / Regenerate is undoable.
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
  shiftTemplate, openingDays, strictPreference,
  minConsecutiveDaysOff, maxConsecutiveWorkingDays, dayRequiredRoles,
  monthlyAggregates,
  calendarMonthAggregates,
  isMobile, actions, onResult,
  onUndoableOp,
  disabled: disabledByParent,
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const employeeCount = Object.keys(employees || {}).length;
  // v1.12.0: parent-supplied disabled (past-week lockdown) ORs with the
  // existing self-disabled conditions (no template / no employees).
  const disabled = !shiftTemplate || employeeCount === 0 || Boolean(disabledByParent);
  const tooltip = disabledByParent
    ? "Past weeks are read-only"
    : !shiftTemplate
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

  function handleConfirm(mode, policy) {
    if (busy) return;
    setBusy(true);
    // Wrap the synchronous algorithm + writes in a microtask so the
    // "Working…" label gets a paint before we block on upsertShift /
    // deleteShift calls. Each persistence call is fire-and-forget against
    // Firebase (returns immediately; the network round-trip resolves
    // later, but the local React state updates via onValue).
    //
    // try/finally so the modal recovers from any unexpected exception
    // (otherwise busy=true sticks and both buttons read "Working…"
    // forever, even though the writes may already have landed —
    // observed in v1.8.1 DEV testing on the preserve-time-only case).
    Promise.resolve().then(function () {
      try {
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
          // v1.11.0: configurable scheduling rules. All three drive
          // generator HARD filters via buildCandidates + slotsForDay.
          minConsecutiveDaysOff: minConsecutiveDaysOff,
          maxConsecutiveWorkingDays: maxConsecutiveWorkingDays,
          dayRequiredRoles: dayRequiredRoles,
          // v1.12.0: pre-built 28-day rolling aggregates from
          // ScheduleGrid's memo. Drives rankCandidates' hours+shifts-
          // deficit sort. Shared with MonthlyFairnessPanel so the
          // panel and the generator stay in lockstep.
          monthlyAggregates: monthlyAggregates,
          // v1.14.0: calendar-month aggregates (sibling map, same
          // shape). rankCandidates sums deficits across both windows
          // so the picker respects both rolling-recency AND month
          // boundary fairness. Missing → calendar-month contributes
          // 0 to the rank (legacy fallback).
          calendarMonthAggregates: calendarMonthAggregates,
          // v1.8.1: preserve-on-regenerate policy. Ignored when mode is
          // "fill-empty". Both default to true on the modal — wiring
          // through unchanged forwards that default.
          preserveTimes: policy ? policy.preserveTimes : true,
          preserveAssignments: policy ? policy.preserveAssignments : true,
        });
        // v1.10.0: snapshot PRE-mutation records so the undo stack can
        // restore them. Cleared = full record was deleted (re-upsert by
        // id on undo). Modified = record updated in place (we capture the
        // pre-update version from weekShifts so undo restores the
        // original employee / times). Re-upserting a previously-deleted
        // id is safe — Firebase RTDB writes to any key.
        const restoreCleared = (result.clearedShiftIds || [])
          .map(function (id) {
            const rec = weekShifts ? weekShifts[id] : null;
            return rec ? JSON.parse(JSON.stringify(rec)) : null;
          })
          .filter(function (r) { return r !== null; });
        const restoreModified = (result.modifiedShifts || [])
          .map(function (m) {
            const rec = weekShifts && m ? weekShifts[m.id] : null;
            return rec ? JSON.parse(JSON.stringify(rec)) : null;
          })
          .filter(function (r) { return r !== null; });

        // v1.1.0: regenerate mode returns clearedShiftIds — delete first so
        // the subsequent upserts see clean cells (the local fill-empty pass
        // already worked against a filtered map, but the Firebase store
        // needs the deletes to actually fire).
        if (result.clearedShiftIds && result.clearedShiftIds.length > 0) {
          for (let i = 0; i < result.clearedShiftIds.length; i++) {
            actions.deleteShift(result.clearedShiftIds[i]);
          }
        }
        // v1.8.1: regenerate mode may also return modifiedShifts — records
        // that the wipe-pass partially updated (e.g. employee kept but
        // times reset to defaults under a "preserve assignments only"
        // policy). Each carries its existing id, so upsertShift updates
        // the record in place.
        if (result.modifiedShifts && result.modifiedShifts.length > 0) {
          for (let i = 0; i < result.modifiedShifts.length; i++) {
            actions.upsertShift(result.modifiedShifts[i]);
          }
        }
        // v1.10.0: track the ids of the new records as we write them so
        // undo can delete them. upsertShift returns the resolved id
        // (existing record.id if set, otherwise a fresh push key) or
        // null when the write-guard refused. We skip refused writes —
        // there's nothing to undo for a write that never happened.
        const newIds = [];
        for (let i = 0; i < result.newShifts.length; i++) {
          const newId = actions.upsertShift(result.newShifts[i]);
          if (newId) newIds.push(newId);
        }
        if (onResult) {
          // Hand the mode through to the banner so it can phrase the copy
          // appropriately (regenerate runs include a "Cleared N" prefix).
          onResult({ ...result.summary, mode: mode });
        }
        if (onUndoableOp) {
          const label = mode === "regenerate" ? "Regenerate" : "Fill empty";
          const restoreShifts = restoreCleared.concat(restoreModified);
          // No-op when nothing actually changed — fill-empty on a full
          // week or a regenerate that produced zero deltas shouldn't
          // pollute the stack with an empty undo entry.
          if (restoreShifts.length > 0 || newIds.length > 0) {
            onUndoableOp({
              label: label,
              restoreShifts: restoreShifts,
              removeIds: newIds,
            });
          }
        }
      } catch (err) {
        console.error("[GenerateButton] generator run failed", err);
      } finally {
        setBusy(false);
        setOpen(false);
      }
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
        className="mgt-hover-scale"
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
