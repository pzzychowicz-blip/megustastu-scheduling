// src/components/ExportButton.jsx
// "Export PDF" button for the schedule grid's week-nav bar.
//
// Disabled when the displayed week has any empty cells (no employeeId) —
// UNLESS the manager has turned on `allowIncompleteExport` in Settings
// (v15.2.0), in which case the button stays clickable and an incomplete
// click opens a warning confirm modal first. Native `title` carries the
// why. Gating logic lives in schedule-logic.js (isWeekComplete /
// countEmptyCells) so the button is dumb.
//
// Props:
//   weekStart            (Date)             — current Monday (from ScheduleGrid state)
//   slots                (Array<slotDef>)   — slotsForDay(template); same for all days
//   weekShifts           ({ [id]: shift })  — shiftsForWeek output, already narrowed
//   employees            ({ [id]: emp })    — full employees map
//   openingDays          (obj?)             — v0.12.0 weekday → bool map. Closed
//                                             days don't gate completeness and don't
//                                             appear in the PDF.
//   allowIncompleteExport (bool)            — v15.2.0; when true the button stays
//                                             enabled on incomplete weeks and warns
//                                             before exporting blanks.
//   isMobile             (bool)             — forwarded to the warning modal's Overlay.

import { useState, forwardRef, useImperativeHandle } from "react";
import { BTN } from "../lib/constants.js";
import { isWeekComplete, countEmptyCells } from "../lib/schedule-logic.js";
import { ModalPresence } from "./atoms.jsx";
import ExportWarningModal from "./ExportWarningModal.jsx";

// pdf-export.js (and its jspdf dependency tree, ~150KB gz with html2canvas
// + DOMPurify) is lazy-loaded on click. Keeps the initial bundle lean —
// manager exports once a week at most.

// v15.3.0: forwardRef so the `E` keyboard shortcut in ScheduleGrid can
// trigger the same flow as a click (export, or the incomplete-warning modal).
function ExportButton({
  weekStart, slots, weekShifts, employees, openingDays, allowIncompleteExport, isMobile,
}, ref) {
  // v0.12.0: completeness check skips closed days. The button enables
  // when every cell on every OPEN day is filled.
  const ready = isWeekComplete(weekShifts, weekStart, slots, openingDays);
  // v15.2.0: an incomplete week is still clickable when the manager opted
  // in. The warning modal mediates the actual export.
  const canClick = ready || allowIncompleteExport === true;

  // v15.2.0: warning modal state. emptyCount is cached at click time so the
  // modal copy stays stable while open even if the grid re-renders.
  const [warnOpen, setWarnOpen] = useState(false);
  const [emptyCount, setEmptyCount] = useState(0);

  function runExport() {
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

  function handleClick() {
    if (ready) {
      runExport();
      return;
    }
    // Incomplete + opted-in: warn first.
    if (!allowIncompleteExport) return;
    setEmptyCount(countEmptyCells(weekShifts, weekStart, slots, openingDays));
    setWarnOpen(true);
  }

  function handleConfirmIncomplete() {
    setWarnOpen(false);
    runExport();
  }

  // v15.3.0: imperative open() for the `E` shortcut — same gating as a click
  // (handleClick no-ops when the week is incomplete and export-incomplete is
  // off).
  useImperativeHandle(ref, function () {
    return { open: handleClick };
  }, [ready, allowIncompleteExport, weekStart, weekShifts, slots, openingDays]);

  const style = {
    ...BTN.base,
    ...(canClick ? BTN.primary : BTN.ghost),
    padding: "6px 12px",
    fontSize: 13,
    opacity: canClick ? 1 : 0.5,
    cursor: canClick ? "pointer" : "not-allowed",
  };

  const title = ready
    ? "Download this week as PDF"
    : (allowIncompleteExport
        ? "Export with empty cells (you'll be warned first)"
        : "Fill all cells to export");

  return (
    <>
      <button
        type="button"
        className="mgt-hover-scale"
        onClick={handleClick}
        disabled={!canClick}
        style={style}
        title={title}
      >
        Export PDF
      </button>
      <ModalPresence show={warnOpen}>
        {warnOpen ? (
          <ExportWarningModal
            open
            emptyCount={emptyCount}
            isMobile={isMobile === true}
            onClose={function () { setWarnOpen(false); }}
            onConfirm={handleConfirmIncomplete}
          />
        ) : null}
      </ModalPresence>
    </>
  );
}

export default forwardRef(ExportButton);
