// src/lib/pdf-export.js
// PDF export of a single week's schedule.
//
// Layout: landscape A4 ("horizontal spreadsheet" per the locked v1 decision).
//   - Top:    title + week range
//   - Body:   table — rows = slots, columns = days (Mon..Sun)
//   - Footer: generated timestamp, bottom-right
//
// Pure module — no React, no Firebase. The only side effect is the file
// download triggered by jsPDF.save().
//
// Locked v0.6.0 decisions (no need to re-litigate):
//   - Cell content: "Name · Role" for evening slots (where role is set on
//     the shift record), bare "Name" for day shifts (role = null per the
//     v1 day-shift one-person-covers-all-roles model).
//   - No requests section in the PDF — manager prints rota; requests live
//     in-app on the Requests tab.
//   - No phone / contact info — the employee model doesn't include it.
//   - "Complete" = every (date, slot) has a non-null employeeId. Enforced
//     at the button level via isWeekComplete() in schedule-logic.js.

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import {
  weekDates,
  isoDate,
  formatDayHeader,
  formatWeekRange,
  findShiftForSlot,
  deriveCellState,
} from "./schedule-logic.js";
import { SECTIONS } from "./constants.js";

function pad2(n) { return String(n).padStart(2, "0"); }

function nowStamp() {
  const now = new Date();
  return isoDate(now) + " " + pad2(now.getHours()) + ":" + pad2(now.getMinutes());
}

// Phase v0.7.0: section-divider row factory. Produces a single full-width
// header cell using jspdf-autotable's `colSpan` mechanic, which collapses a
// row down to one cell that spans the column count (1 label + 7 days = 8).
// Visual cue between FoH and Kitchen slot groups in the printout.
function sectionDividerRow(sectionKey, totalCols) {
  return [{
    content: SECTIONS[sectionKey].label,
    colSpan: totalCols,
    styles: {
      fillColor: [230, 230, 230],
      textColor: [60, 60, 60],
      fontStyle: "bold",
      halign: "left",
    },
  }];
}

// Build the (1 + 7)-column table rows from slots × dates.
//
// Slots arrive grouped by section + day-part (FoH day → FoH evening →
// Kitchen day → Kitchen evening) from `slotsForDay(template)`. v0.7.0
// injects a divider row at every section boundary, including before the
// first slot, so both FoH and Kitchen get a labelled header band.
function buildTableBody(slots, dates, weekShifts, employees) {
  const totalCols = 1 + dates.length;
  const rows = [];
  let lastSection = null;
  slots.forEach(function (slot) {
    if (slot.section !== lastSection) {
      rows.push(sectionDividerRow(slot.section, totalCols));
      lastSection = slot.section;
    }
    // Left column. v0.9.0: evening rows show start-only — the end-time
    // is implicit (close of service) and made the rota noisier than
    // necessary on a printed sheet. Day rows keep the full range since
    // their end-time isn't a service boundary.
    const labelCell = slot.dayPart === "evening"
      ? slot.humanLabel + "\n" + slot.defaultStart
      : slot.humanLabel + "\n" + slot.defaultStart + "–" + slot.defaultEnd;
    const dayCells = dates.map(function (d) {
      const dIso = isoDate(d);
      const existing = findShiftForSlot(weekShifts, dIso, slot);
      const cell = deriveCellState(existing, slot);
      const emp = cell.employeeId ? employees[cell.employeeId] : null;
      // isWeekComplete should prevent empty cells from reaching here, but
      // be defensive — a stale isWeekComplete call against an updated
      // shifts map could in theory let an empty cell slip through.
      if (!emp) return "";
      // v0.9.0: cells render the assignee name only. The role is
      // implicit from the slot column on the left of the row
      // (e.g., the "Kitchen Evening 1" row is the Chef row by the
      // v0.8.0 default-role policy).
      return emp.name;
    });
    rows.push([labelCell, ...dayCells]);
  });
  return rows;
}

export function exportWeekPdf({ weekStart, slots, weekShifts, employees }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  const dates = weekDates(weekStart);
  const weekLabel = formatWeekRange(weekStart);

  // ── Header ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Me Gustas Tú — Week of " + weekLabel, margin, margin + 6);

  // ── Table ──────────────────────────────────────────────────────────────
  const head = [["", ...dates.map(formatDayHeader)]];
  const body = buildTableBody(slots, dates, weekShifts, employees);

  autoTable(doc, {
    head: head,
    body: body,
    startY: margin + 24,
    margin: { left: margin, right: margin, bottom: margin + 12 },
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 6,
      lineColor: [200, 200, 200],
      lineWidth: 0.5,
      valign: "middle",
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: 30,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 110, halign: "left" },
    },
    bodyStyles: { halign: "center" },
  });

  // ── Footer on every page (timestamp, bottom-right) ─────────────────────
  // autoTable can paginate if the table overflows. Stamp every page so the
  // print stays self-documenting.
  const stamp = "Generated " + nowStamp();
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(stamp, pageW - margin, pageH - 18, { align: "right" });
  }

  // ── Save ───────────────────────────────────────────────────────────────
  const startIso = isoDate(dates[0]);
  const endIso = isoDate(dates[6]);
  doc.save("MGT_Week_" + startIso + "_to_" + endIso + ".pdf");
}
