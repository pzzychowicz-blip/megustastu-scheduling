// src/components/ExportButton.jsx
// "Export PDF" button for the schedule grid's week-nav bar.
//
// Disabled when the displayed week has any empty cells (no employeeId).
// Native `title` attribute carries the why — "Fill all cells to export"
// — so the manager doesn't have to guess. Gating logic lives in
// schedule-logic.js (isWeekComplete) so the button is dumb.
//
// Props:
//   weekStart    (Date)             — current Monday (from ScheduleGrid state)
//   slots        (Array<slotDef>)   — slotsForDay(template); same for all days
//   weekShifts   ({ [id]: shift })  — shiftsForWeek output, already narrowed
//   employees    ({ [id]: emp })    — full employees map
//   openingDays  (obj?)             — v0.12.0 weekday → bool map. Closed
//                                     days don't gate completeness and don't
//                                     appear in the PDF.

import { BTN } from "../lib/constants.js";
import { isWeekComplete } from "../lib/schedule-logic.js";

// pdf-export.js (and its jspdf dependency tree, ~150KB gz with html2canvas
// + DOMPurify) is lazy-loaded on click. Keeps the initial bundle lean —
// manager exports once a week at most.

export default function ExportButton({ weekStart, slots, weekShifts, employees, openingDays }) {
  // v0.12.0: completeness check skips closed days. The button enables
  // when every cell on every OPEN day is filled.
  const ready = isWeekComplete(weekShifts, weekStart, slots, openingDays);

  function handleClick() {
    if (!ready) return;
    import("../lib/pdf-export.js").then(function (mod) {
      mod.exportWeekPdf({
        weekStart: weekStart,
        slots: slots,
        weekShifts: weekShifts,
        employees: employees,
        openingDays: openingDays,
      });
    }).catch(function (err) {
      console.warn("[pdf-export] failed to load module", err);
    });
  }

  const style = {
    ...BTN.base,
    ...(ready ? BTN.primary : BTN.ghost),
    padding: "6px 12px",
    fontSize: 13,
    opacity: ready ? 1 : 0.5,
    cursor: ready ? "pointer" : "not-allowed",
  };

  return (
    <button
      type="button"
      className="mgt-hover-scale"
      onClick={handleClick}
      disabled={!ready}
      style={style}
      title={ready ? "Download this week as PDF" : "Fill all cells to export"}
    >
      Export PDF
    </button>
  );
}
