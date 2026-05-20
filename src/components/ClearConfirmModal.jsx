// src/components/ClearConfirmModal.jsx
// v1.1.0 — Confirm dialog for the Clear-shifts action.
//
// Two-step flow inside one modal:
//   1. Manager picks a scope: Whole week, or one open day.
//   2. A red destructive "Clear N shifts" button confirms; Cancel backs
//      out.
//
// Closed days are not shown — their shifts are orphaned per the v0.12.0
// opening-days model and not reachable from this UI surface.
//
// Props:
//   open         (bool)
//   weekLabel    (string)            — e.g. "12–18 May 2026"
//   weekDates    (Array<Date>)       — visibleWeekDates output (open days only)
//   weekShifts   ({ [id]: shift })   — narrowed to current week
//   busy         (bool)              — disables both buttons during deletes
//   isMobile     (bool)
//   onClose      (fn)
//   onConfirm    (fn(scope))         — scope = { kind: "week" }
//                                     OR { kind: "day", dateIso: "YYYY-MM-DD" }

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

function allShifts(weekShifts) {
  return Object.values(weekShifts || {});
}

export default function ClearConfirmModal({
  open, weekLabel, weekDates, weekShifts, busy, isMobile, onClose, onConfirm,
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
  const dayTotal = isDay
    ? shiftsForDay(weekShifts, scope.dateIso).length
    : 0;
  const willClear = isWeek ? weekTotal : (isDay ? dayTotal : 0);

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

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        {scopeButton(
          "Whole week",
          isWeek,
          function () { setScope({ kind: "week" }); },
          weekTotal
        )}
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
