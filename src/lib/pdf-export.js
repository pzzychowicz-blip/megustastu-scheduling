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
  visibleWeekDates,
  isoDate,
  formatDayHeader,
  formatWeekRange,
  findShiftForSlot,
  deriveCellState,
  isSlotOpenOnDate,
} from "./schedule-logic.js";

function pad2(n) { return String(n).padStart(2, "0"); }

function nowStamp() {
  const now = new Date();
  return isoDate(now) + " " + pad2(now.getHours()) + ":" + pad2(now.getMinutes());
}

// v0.7.0: section-divider row factory. Produces a single full-width header
// cell using jspdf-autotable's `colSpan` mechanic, which collapses a row
// down to one cell spanning the column count (1 label + 7 days = 8).
//
// v0.11.0: mirrors the in-app Schedule grid — one band per (section,
// dayPart) instead of one per section. Format "KITCHEN · DAY",
// centred + bold + uppercase, fill slightly darker than the date row so
// it reads as the dominant horizontal divider.
function sectionHeaderRow(slot, totalCols) {
  return [{
    content: (slot.sectionLabel + " · " + slot.dayPartLabel).toUpperCase(),
    colSpan: totalCols,
    styles: {
      fillColor: [220, 220, 224],
      textColor: [30, 30, 30],
      fontStyle: "normal",
      fontSize: 10,
      halign: "center",
      cellPadding: 5,
    },
  }];
}

// Build the (1 + N)-column table rows from slots × dates.
//
// Slots arrive grouped by section + day-part (Kitchen day → Kitchen
// evening → FoH day → FoH evening since v0.8.0) from
// `slotsForDay(template)`. v0.11.0 injects a section-header row at
// every (section, dayPart) boundary so the four groups read as four
// discrete bands, matching the in-app banded layout.
//
// v1.3.0: cells where the slot's dayPart is closed on that date used to
// render as empty strings — visually indistinguishable from an unfilled
// open cell. v1.9.0 swaps that for a muted italic "Closed" placeholder
// (mirrors the in-app ScheduleGrid.renderClosedCell) so a manager
// reading the printed rota immediately sees the restaurant was shut.
//
// v1.9.0: filled cells whose start/end differs from the slot template
// render two lines — assignee on top, override range on the bottom —
// in a slightly smaller font. The row-header (left column) keeps the
// template default, so the printed rota shows the reference + the
// exception together. Same predicate ScheduleGrid uses for the "*"
// marker, just rendered as readable text on paper.
function buildTableBody(slots, dates, weekShifts, employees, openingDays) {
  const totalCols = 1 + dates.length;
  const rows = [];
  let lastSection = null;
  let lastDayPart = null;
  slots.forEach(function (slot) {
    if (slot.section !== lastSection || slot.dayPart !== lastDayPart) {
      rows.push(sectionHeaderRow(slot, totalCols));
      lastSection = slot.section;
      lastDayPart = slot.dayPart;
    }
    // Left column. v0.9.0: evening rows show start-only — the end-time
    // is implicit (close of service) and made the rota noisier than
    // necessary on a printed sheet. Day rows keep the full range since
    // their end-time isn't a service boundary.
    const labelCell = slot.dayPart === "evening"
      ? slot.humanLabel + "\n" + slot.defaultStart
      : slot.humanLabel + "\n" + slot.defaultStart + "–" + slot.defaultEnd;
    const dayCells = dates.map(function (d) {
      // v1.9.0: closed-dayPart placeholder. The cell stays in the table
      // structure (the column belongs to a partially-open day) but reads
      // as obviously inert — italic muted grey, smaller font. The literal
      // RGB triplet is intentional: pdf-export.js never reads CSS vars,
      // because the printed palette is locked to a light scheme regardless
      // of in-app theme (v0.11.0 decision).
      if (openingDays && !isSlotOpenOnDate(d, slot, openingDays)) {
        return {
          content: "Closed",
          styles: {
            fontSize: 8,
            textColor: [136, 136, 136],
            fontStyle: "italic",
          },
        };
      }
      const dIso = isoDate(d);
      const existing = findShiftForSlot(weekShifts, dIso, slot);
      const cell = deriveCellState(existing, slot);
      const emp = cell.employeeId ? employees[cell.employeeId] : null;
      // isWeekComplete should prevent empty cells from reaching here, but
      // be defensive — a stale isWeekComplete call against an updated
      // shifts map could in theory let an empty cell slip through.
      if (!emp) return "";
      // v1.9.0: time-override detection. Same predicate ScheduleGrid uses
      // for the "*" cell-marker (ScheduleGrid.jsx — `timeOverridden`).
      // When true, render a two-line cell so the manager reading the
      // printed rota at the door can see the cell's actual start/end
      // without cross-referencing the row header.
      const timeOverridden =
        cell.start !== slot.defaultStart || cell.end !== slot.defaultEnd;
      if (!timeOverridden) return emp.name;
      return {
        content: emp.name + "\n" + cell.start + "–" + cell.end,
        styles: { fontSize: 8 },
      };
    });
    rows.push([labelCell, ...dayCells]);
  });
  return rows;
}

// v0.12.0: openingDays optional. When supplied, closed days are dropped
// from the rendered table — column count, head row, body cells, and the
// filename's date range all derive from the filtered date list. Omitted →
// renders the full 7-day week (legacy behaviour).
// v1.3.0: per-day-part shape supported. Closed-dayPart cells render as
// empty strings within an otherwise visible date column.
export function exportWeekPdf({ weekStart, slots, weekShifts, employees, openingDays }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;

  const dates = visibleWeekDates(weekStart, openingDays);
  const weekLabel = formatWeekRange(weekStart);

  // ── Header ─────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Me Gustas Tú — Week of " + weekLabel, margin, margin + 6);

  // ── Table ──────────────────────────────────────────────────────────────
  const head = [["", ...dates.map(formatDayHeader)]];
  const body = buildTableBody(slots, dates, weekShifts, employees, openingDays);

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
      // v0.11.0: thicker vertical (column) dividers, thinner horizontal
      // (row) dividers — makes the seven-day column structure read more
      // clearly at print resolution.
      lineWidth: { top: 0.4, right: 1.2, bottom: 0.4, left: 1.2 },
      valign: "middle",
    },
    headStyles: {
      fillColor: [238, 238, 240],
      textColor: [30, 30, 30],
      fontStyle: "bold",
      fontSize: 10,
      halign: "center",
      cellPadding: 6,
    },
    // v0.11.0: zebra-stripe the day columns. Tuesday / Thursday / Saturday
     // (column indices 2, 4, 6) get a subtle darker fill so the seven-day
     // grid reads at print resolution. Label column gets its own off-white.
    // jspdf-autotable resolves columnStyles after headStyles + bodyStyles,
    // so this also tints the date-header row's matching columns — fine
    // visually (the head fill is already a soft grey).
    columnStyles: {
      0: {
        fontStyle: "bold",
        cellWidth: 110,
        halign: "left",
        fillColor: [248, 248, 250],
      },
      2: { fillColor: [243, 243, 247] },
      4: { fillColor: [243, 243, 247] },
      6: { fillColor: [243, 243, 247] },
    },
    // v0.11.0: employee names in day cells are bold for emphasis. Section
    // header rows override this back to normal via per-cell styles, and the
    // label column 0 already has its own bold via columnStyles.
    bodyStyles: { halign: "center", fontStyle: "bold" },
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
  // v0.12.0: filename range uses first / last visible date (no longer
  // dates[6] — closed days could leave fewer than 7 dates in the array).
  const startIso = isoDate(dates[0]);
  const endIso = isoDate(dates[dates.length - 1]);
  doc.save("MGT_Week_" + startIso + "_to_" + endIso + ".pdf");
}
