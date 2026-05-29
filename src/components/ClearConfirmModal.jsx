// src/components/ClearConfirmModal.jsx
// v1.1.0 — Confirm dialog for the Clear-shifts action.
//
// Two-step flow inside one modal:
//   1. Manager picks a scope: Whole week, one open day, or one shift row.
//   2. A red destructive "Clear N shifts" button confirms; Cancel backs
//      out.
//
// Closed days are not shown — their shifts are orphaned per the v0.12.0
// opening-days model and not reachable from this UI surface.
//
// v1.15.0 (2nd commit): + "By shift row" scope. The manager can clear a
// single slot-row horizontally — every shift matching a (section,
// dayPart, slotIndex) triple across all open days (e.g. "all FoH
// Evening 1 shifts this week", "every Kitchen Day shift this week").
// This is the transpose of the per-day scope (a column → a row).
//
// Props:
//   open         (bool)
//   weekLabel    (string)            — e.g. "12–18 May 2026"
//   weekDates    (Array<Date>)       — visibleWeekDates output (open days only)
//   weekShifts   ({ [id]: shift })   — narrowed to current week
//   slots        (Array<slotDef>)    — v1.15.0(2); slotsForDay ladder for
//                                       the "By shift row" buttons
//   busy         (bool)              — disables both buttons during deletes
//   isMobile     (bool)
//   onClose      (fn)
//   onConfirm    (fn(scope))         — scope = { kind: "week" }
//                                     OR { kind: "day", dateIso: "YYYY-MM-DD" }
//                                     OR { kind: "slot", section, dayPart,
//                                          slotIndex, label }

import { useState, useEffect } from "react";
import { S, BTN } from "../lib/constants.js";
import { Overlay, mkBtn } from "./atoms.jsx";
import { isoDate, formatDayHeader } from "../lib/schedule-logic.js";

// Count helpers — pure JS. Avoid hand-rolling a reduce; the maps are
// small (typically <50 shifts/week).
function shiftsForDay(weekShifts, dateIso) {
  return Object.values(weekShifts || {}).filter(function (s) {
    return s && s.date === dateIso;
  });
}

// v1.15.0(2): shifts matching a slot-row (section, dayPart, slotIndex)
// across every open day in the week. slotIndex defaults to 0 on records
// that predate the field (mirrors findShiftForSlot in schedule-logic).
function shiftsForSlot(weekShifts, slot) {
  return Object.values(weekShifts || {}).filter(function (s) {
    return s
      && s.section === slot.section
      && s.dayPart === slot.dayPart
      && (s.slotIndex || 0) === slot.slotIndex;
  });
}

function allShifts(weekShifts) {
  return Object.values(weekShifts || {});
}

export default function ClearConfirmModal({
  open, weekLabel, weekDates, weekShifts, slots, busy, isMobile, onClose, onConfirm,
}) {
  // Reset the picked scope every time the modal opens. Stale state across
  // opens would be confusing (different week, same scope highlighted).
  const [scope, setScope] = useState(null);
  useEffect(function () {
    if (open) setScope(null);
  }, [open]);

  if (!open) return null;

  const weekTotal = allShifts(weekShifts).length;
  const isWeek = scope && scope.kind === "week";
  const isDay = scope && scope.kind === "day";
  const isSlot = scope && scope.kind === "slot";
  const dayTotal = isDay
    ? shiftsForDay(weekShifts, scope.dateIso).length
    : 0;
  const slotTotal = isSlot
    ? Object.values(weekShifts || {}).filter(function (s) {
        return s
          && s.section === scope.section
          && s.dayPart === scope.dayPart
          && (s.slotIndex || 0) === scope.slotIndex;
      }).length
    : 0;
  const willClear = isWeek ? weekTotal : (isDay ? dayTotal : (isSlot ? slotTotal : 0));

  function scopeButton(label, isSelected, onClick, count) {
    return (
      <button
        type="button"
        className="mgt-hover-scale"
        onClick={onClick}
        disabled={busy}
        style={{
          ...BTN.base,
          padding: "8px 12px",
          fontSize: 13,
          borderRadius: 10,
          flex: "0 0 auto",
          background: isSelected ? "var(--accent)" : "var(--bg-pill)",
          color: isSelected ? "var(--text-on-accent)" : "var(--text-primary)",
          border: "1px solid " + (isSelected ? "var(--accent-deep)" : "var(--btn-ghost-border)"),
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {label}
        <span
          style={{
            marginLeft: 8,
            ...S.muted,
            color: isSelected ? "rgba(255,255,255,0.8)" : "var(--text-muted)",
            fontSize: 11,
          }}
        >
          {count} shift{count === 1 ? "" : "s"}
        </span>
      </button>
    );
  }

  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={busy ? undefined : onClose}
      title={"Clear shifts for " + weekLabel}
    >
      <p style={{ ...S.body, margin: "0 0 8px 0" }}>Choose what to clear:</p>

      {/* Whole week — ungrouped, sits at the top. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {scopeButton(
          "Whole week",
          isWeek,
          function () { setScope({ kind: "week" }); },
          weekTotal
        )}
      </div>

      {/* By day — one button per open weekday (the vertical column). */}
      <div style={{ ...S.muted, fontSize: 11, marginBottom: 4 }}>By day</div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {weekDates.map(function (d) {
          const dIso = isoDate(d);
          const count = shiftsForDay(weekShifts, dIso).length;
          return (
            <span key={dIso}>
              {scopeButton(
                formatDayHeader(d),
                isDay && scope.dateIso === dIso,
                function () { setScope({ kind: "day", dateIso: dIso }); },
                count
              )}
            </span>
          );
        })}
      </div>

      {/* By shift row (v1.15.0(2)) — one button per slot in the
          slotsForDay ladder; clears that row across all open days. */}
      {(slots && slots.length > 0) ? (
        <>
          <div style={{ ...S.muted, fontSize: 11, marginBottom: 4 }}>By shift row</div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {slots.map(function (slot) {
              const count = shiftsForSlot(weekShifts, slot).length;
              const selected = isSlot
                && scope.section === slot.section
                && scope.dayPart === slot.dayPart
                && scope.slotIndex === slot.slotIndex;
              return (
                <span key={slot.key}>
                  {scopeButton(
                    slot.humanLabel,
                    selected,
                    function () {
                      setScope({
                        kind: "slot",
                        section: slot.section,
                        dayPart: slot.dayPart,
                        slotIndex: slot.slotIndex,
                        label: slot.humanLabel,
                      });
                    },
                    count
                  )}
                </span>
              );
            })}
          </div>
        </>
      ) : null}

      <p style={{ ...S.muted, marginTop: 0, marginBottom: 12, fontSize: 12 }}>
        Cleared shifts are deleted. Cells return to template defaults. This
        cannot be undone.
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        {mkBtn({
          type: "button",
          className: "mgt-hover-scale",
          variant: "ghost",
          onClick: onClose,
          disabled: busy,
          style: busy ? { opacity: 0.5, cursor: "not-allowed" } : undefined,
          children: "Cancel",
        })}
        {mkBtn({
          type: "button",
          className: "mgt-hover-scale",
          variant: "danger",
          onClick: function () { if (scope) onConfirm(scope); },
          disabled: busy || !scope || willClear === 0,
          style: (busy || !scope || willClear === 0)
            ? { opacity: 0.5, cursor: "not-allowed" }
            : undefined,
          children: busy
            ? "Clearing…"
            : (!scope
              ? "Pick a scope first"
              : (willClear === 0
                ? "Nothing to clear"
                : "Clear " + willClear + " shift" + (willClear === 1 ? "" : "s"))),
        })}
      </div>
    </Overlay>
  );
}
