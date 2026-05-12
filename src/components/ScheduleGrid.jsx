// src/components/ScheduleGrid.jsx
// Weekly schedule view. Two layouts:
//   - Desktop (isMobile=false): 7-column grid (Mon..Sun) × slot rows,
//     grouped visually by section/day-part.
//   - Mobile (isMobile=true): vertical stack of 7 day-cards, each card
//     listing the 7 slots inline.
//
// Both layouts call into the same data and open the same ShiftFormModal.
//
// Props:
//   shifts        ({ [id]: shift })       — from usePersistence
//   employees     ({ [id]: employee })
//   shiftTemplate (object | null)         — from usePersistence; falls back
//                                           to DEFAULT_SHIFT_TEMPLATE when null
//   actions       (object)                — usePersistence().actions
//   isMobile      (bool)

import { useMemo, useState } from "react";
import {
  S, BTN,
  ROLE_COLORS,
  STATUS_COLORS,
  DEFAULT_SHIFT_TEMPLATE,
} from "../lib/constants.js";
import {
  startOfWeek,
  weekDates,
  isoDate,
  formatDayHeader,
  formatWeekRange,
  slotsForDay,
  findShiftForSlot,
  deriveCellState,
  shiftsForWeek,
  addDays,
} from "../lib/schedule-logic.js";
import ShiftFormModal from "./ShiftFormModal.jsx";
import ExportButton from "./ExportButton.jsx";

// Section row dividers (visual grouping in the desktop grid).
function isSectionBoundary(prevSlot, slot) {
  if (!prevSlot) return false;
  return prevSlot.section !== slot.section || prevSlot.dayPart !== slot.dayPart;
}

export default function ScheduleGrid({ shifts, employees, requests, shiftTemplate, actions, isMobile }) {
  // Active template — DB-customized values when present, defaults otherwise.
  const template = shiftTemplate || DEFAULT_SHIFT_TEMPLATE;

  // Slot definitions for the week (same every day until per-day overrides land).
  const slots = useMemo(function () { return slotsForDay(template); }, [template]);

  // ── Week navigation ──────────────────────────────────────────────────
  const [weekStart, setWeekStart] = useState(function () { return startOfWeek(new Date()); });
  const dates = useMemo(function () { return weekDates(weekStart); }, [weekStart]);

  function goPrev()  { setWeekStart(function (d) { return addDays(d, -7); }); }
  function goNext()  { setWeekStart(function (d) { return addDays(d, 7); }); }
  function goToday() { setWeekStart(startOfWeek(new Date())); }

  // Narrow the shifts map to this week before passing into the grid — keeps
  // the per-cell scan cheap.
  const weekShifts = useMemo(function () { return shiftsForWeek(shifts, weekStart); }, [shifts, weekStart]);

  // ── Modal state ──────────────────────────────────────────────────────
  const [modalCell, setModalCell] = useState(null);  // { dateIso, slotDef, shift } or null

  function openCell(dateIso, slotDef, shift) {
    setModalCell({ dateIso: dateIso, slotDef: slotDef, shift: shift || null });
  }
  function closeModal() { setModalCell(null); }

  function handleSave(payload) {
    actions.upsertShift(payload);
    closeModal();
  }
  function handleDelete(id) {
    actions.deleteShift(id);
    closeModal();
  }

  // ── Cell renderer (shared between layouts) ───────────────────────────
  function renderCell(date, slot) {
    const dIso = isoDate(date);
    const existing = findShiftForSlot(weekShifts, dIso, slot);
    const cell = deriveCellState(existing, slot);
    const emp = cell.employeeId ? employees[cell.employeeId] : null;
    const empArchived = emp && emp.active === false;

    const status = cell.employeeId ? "assigned" : "open";
    const palette = STATUS_COLORS[status];

    const roleChip = cell.role
      ? (
        <span
          style={{
            display: "inline-block",
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 6,
            background: (ROLE_COLORS[cell.role] || "#8E8E93") + "33",
            color: ROLE_COLORS[cell.role] || "#3a3a3c",
            border: "1px solid " + (ROLE_COLORS[cell.role] || "#8E8E93") + "66",
            marginLeft: 6,
          }}
        >
          {cell.role}
        </span>
      )
      : null;

    const timeOverridden =
      cell.hasRecord && (cell.start !== slot.defaultStart || cell.end !== slot.defaultEnd);

    return (
      <button
        key={slot.key + "-" + dIso}
        type="button"
        onClick={function () { openCell(dIso, slot, existing); }}
        style={{
          width: "100%",
          textAlign: "left",
          background: palette.bg,
          border: "1px solid " + palette.border,
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 12,
          cursor: "pointer",
          minHeight: 60,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: palette.text,
            fontWeight: 600,
          }}
        >
          <span>{cell.start}–{cell.end}{timeOverridden ? " *" : ""}</span>
          {roleChip}
        </div>
        <div
          style={{
            fontSize: 13,
            color: emp ? "#1c1c1e" : palette.text,
            fontWeight: emp ? 600 : 500,
            opacity: empArchived ? 0.5 : 1,
            textDecoration: empArchived ? "line-through" : "none",
          }}
        >
          {emp ? emp.name : "Open"}
        </div>
      </button>
    );
  }

  // ── Section-header row for desktop grid ──────────────────────────────
  function renderSectionHeader(slot) {
    return (
      <div
        key={"hdr-" + slot.section + "-" + slot.dayPart}
        style={{
          gridColumn: "1 / -1",
          padding: "10px 6px 4px",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "#6e6e73",
        }}
      >
        {slot.sectionLabel} · {slot.dayPartLabel}
      </div>
    );
  }

  // ── Week-nav bar (shared) ────────────────────────────────────────────
  const navBar = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={goPrev}  style={{ ...BTN.base, ...BTN.ghost, padding: "6px 10px", fontSize: 13 }}>‹ Prev</button>
        <button onClick={goToday} style={{ ...BTN.base, ...BTN.secondary, padding: "6px 12px", fontSize: 13 }}>Today</button>
        <button onClick={goNext}  style={{ ...BTN.base, ...BTN.ghost, padding: "6px 10px", fontSize: 13 }}>Next ›</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#1c1c1e" }}>
          {formatWeekRange(weekStart)}
        </div>
        <ExportButton
          weekStart={weekStart}
          slots={slots}
          weekShifts={weekShifts}
          employees={employees}
        />
      </div>
    </div>
  );

  // ── Desktop layout: 7-column × N-row grid ────────────────────────────
  const desktopGrid = (
    <div style={{ overflowX: "auto" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px repeat(7, minmax(120px, 1fr))",
          gap: 6,
          minWidth: 880,
        }}
      >
        {/* Top-left empty + day headers */}
        <div />
        {dates.map(function (d) {
          return (
            <div
              key={"day-" + d.toISOString()}
              style={{
                padding: "6px 4px",
                fontSize: 12,
                fontWeight: 600,
                color: "#3a3a3c",
                textAlign: "center",
              }}
            >
              {formatDayHeader(d)}
            </div>
          );
        })}

        {/* Slot rows, grouped by section/day-part */}
        {slots.map(function (slot, i) {
          const prev = i > 0 ? slots[i - 1] : null;
          const showHeader = i === 0 || isSectionBoundary(prev, slot);
          return (
            <div key={"row-" + slot.key} style={{ display: "contents" }}>
              {showHeader ? renderSectionHeader(slot) : null}
              <div
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  color: "#3a3a3c",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {slot.humanLabel.replace(slot.sectionLabel + " ", "")}
                <span style={{ ...S.muted, marginLeft: 6 }}>
                  {slot.defaultStart}–{slot.defaultEnd}
                </span>
              </div>
              {dates.map(function (d) { return renderCell(d, slot); })}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Mobile layout: vertical stack of day cards ───────────────────────
  const mobileStack = (
    <div>
      {dates.map(function (d) {
        const dIso = isoDate(d);
        return (
          <div
            key={"dayCard-" + dIso}
            style={{
              ...S.surfaceSoft,
              marginBottom: 12,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#1c1c1e",
                marginBottom: 8,
              }}
            >
              {formatDayHeader(d)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {slots.map(function (slot, i) {
                const prev = i > 0 ? slots[i - 1] : null;
                const showHeader = i === 0 || isSectionBoundary(prev, slot);
                return (
                  <div key={slot.key + "-" + dIso} style={{ display: "contents" }}>
                    {showHeader
                      ? (
                        <div
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#6e6e73",
                            letterSpacing: "0.04em",
                            textTransform: "uppercase",
                            marginTop: i === 0 ? 0 : 4,
                          }}
                        >
                          {slot.sectionLabel} · {slot.dayPartLabel}
                        </div>
                      )
                      : null}
                    {renderCell(d, slot)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div>
      {navBar}
      {isMobile ? mobileStack : desktopGrid}

      <p style={{ ...S.muted, marginTop: 12, fontSize: 11 }}>
        Click any cell to assign someone or edit the time / role. Cells marked
        with “*” have times that differ from the template defaults. A yellow
        banner appears in the assignment form when the picked employee has a
        day-off or holiday request that overlaps the date.
      </p>

      <ShiftFormModal
        open={modalCell !== null}
        dateIso={modalCell ? modalCell.dateIso : ""}
        slotDef={modalCell ? modalCell.slotDef : null}
        shift={modalCell ? modalCell.shift : null}
        employees={employees}
        requests={requests}
        isMobile={isMobile}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
