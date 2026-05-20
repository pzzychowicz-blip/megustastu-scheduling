// src/components/RequestPreviewModal.jsx
// v1.9.0 — Read-only preview of a single request, rendered inside <Overlay>.
//
// Opened from WeeklyRequestsPreview when the manager clicks the colored
// type pill of a chip row on the Schedule grid. Pure display — no Save,
// no Delete. Edit access stays on the Requests tab via RequestFormModal.
//
// This surface answers "what's in this request?" without forcing the
// manager off the Schedule tab. Surfaces fields the chip row hides:
// notes, preferredDayPart (for shift-preference), recurringDaysOfWeek
// (for shift-preference with recurring).
//
// Props:
//   open       (bool)
//   request    (obj?)                — the full request record
//   employees  ({ [id]: employee })  — for resolving employeeId → name
//   isMobile   (bool)
//   onClose    (fn)                  — invoked by backdrop click or Close button
//
// Closing semantics:
//   - Click the backdrop → Overlay calls onClose.
//   - Click the Close button → onClose.
//   - Esc → not supported (matches the existing ShiftFormModal /
//     RequestFormModal behaviour; ScheduleGrid's document-level Esc
//     handler short-circuits when a modal is open, but the Overlay
//     atom doesn't bind Esc itself).
//
// Visual: mirrors RequestFormModal's vertical Fld stack so the preview
// feels like the "read mode" of the edit form rather than a separate UI.

import { S, REQUEST_TYPES, WEEKDAYS } from "../lib/constants.js";
import { Overlay, Fld, mkBtn } from "./atoms.jsx";
import { parseIsoDate } from "../lib/schedule-logic.js";

// ── Display helpers ──────────────────────────────────────────────────────

const SHORT_MONTH = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];

// Full-form date range — "12 May 2026" or "12 May – 18 May 2026" or, when
// the months differ, "30 Apr – 5 May 2026". More verbose than the
// compact form used inline on the chip row, on purpose — the modal has
// space to be readable.
function formatRangeLong(fromIso, toIso) {
  if (!fromIso) return "";
  const from = parseIsoDate(fromIso);
  const effectiveTo = toIso || fromIso;
  if (fromIso === effectiveTo) {
    return from.getDate() + " " + SHORT_MONTH[from.getMonth()] + " " + from.getFullYear();
  }
  const to = parseIsoDate(effectiveTo);
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return from.getDate() + " – " + to.getDate() + " " +
      SHORT_MONTH[to.getMonth()] + " " + to.getFullYear();
  }
  if (from.getFullYear() === to.getFullYear()) {
    return from.getDate() + " " + SHORT_MONTH[from.getMonth()] + " – " +
      to.getDate() + " " + SHORT_MONTH[to.getMonth()] + " " + to.getFullYear();
  }
  return from.getDate() + " " + SHORT_MONTH[from.getMonth()] + " " + from.getFullYear() + " – " +
    to.getDate() + " " + SHORT_MONTH[to.getMonth()] + " " + to.getFullYear();
}

function typeMeta(key) {
  for (let i = 0; i < REQUEST_TYPES.length; i++) {
    if (REQUEST_TYPES[i].key === key) return REQUEST_TYPES[i];
  }
  return { key: key, label: key, palette: null };
}

// Mon..Sun source-order rendering of the recurringDaysOfWeek list.
// Matches RequestsList's "· Sat, Sun" tail format.
function formatRecurringWeekdays(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return "";
  const labels = [];
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (keys.indexOf(WEEKDAYS[i].key) !== -1) labels.push(WEEKDAYS[i].label);
  }
  return labels.join(", ");
}

// ── Component ────────────────────────────────────────────────────────────
export default function RequestPreviewModal({ open, request, employees, isMobile, onClose }) {
  if (!open || !request) return null;

  const emp = employees ? employees[request.employeeId] : null;
  const empName = emp ? (emp.name || "(unnamed)") : "(unknown employee)";
  const empArchived = emp ? emp.active === false : false;

  const meta = typeMeta(request.type);

  // Conditional fields (only render the row when meaningful):
  //   - preferredDayPart: shift-preference only
  //   - recurringDaysOfWeek: shift-preference only, non-empty list
  //   - notes: any type, non-empty trimmed string
  const isShiftPref = request.type === "shift-preference";
  const dayPartLabel = isShiftPref
    ? (request.preferredDayPart === "evening" ? "Evening shifts only" : "Day shifts only")
    : null;
  const recurringStr = isShiftPref ? formatRecurringWeekdays(request.recurringDaysOfWeek) : "";
  const notes = (typeof request.notes === "string" && request.notes.trim().length > 0)
    ? request.notes.trim()
    : null;

  // Static read-only display style — the same font / spacing the form's
  // inputs use, minus the input chrome. Keeps the visual hierarchy
  // identical to RequestFormModal so the manager perceives this as the
  // "read mode" of the same form.
  const valueStyle = {
    fontSize: 14,
    color: "var(--text-primary)",
    padding: "6px 0",
    lineHeight: 1.5,
  };

  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={onClose}
      title="Request details"
    >
      <Fld label="Employee">
        <div
          style={{
            ...valueStyle,
            fontWeight: 600,
            textDecoration: empArchived ? "line-through" : "none",
            opacity: empArchived ? 0.6 : 1,
          }}
        >
          {empName}
          {empArchived ? " (archived)" : ""}
        </div>
      </Fld>

      <Fld label="Type">
        <div style={{ paddingTop: 4 }}>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 500,
              background: meta.palette ? meta.palette.bg : "var(--bg-pill)",
              color: meta.palette ? meta.palette.text : "var(--text-secondary)",
              border: meta.palette
                ? ("1px solid " + meta.palette.border)
                : "1px solid var(--hairline-strong)",
              display: "inline-block",
            }}
          >
            {meta.label}
          </span>
        </div>
      </Fld>

      <Fld label="Dates">
        <div style={valueStyle}>
          {formatRangeLong(request.dateFrom, request.dateTo)}
        </div>
      </Fld>

      {dayPartLabel ? (
        <Fld label="Preferred shift">
          <div style={valueStyle}>{dayPartLabel}</div>
        </Fld>
      ) : null}

      {recurringStr ? (
        <Fld label="Repeats on">
          <div style={valueStyle}>{recurringStr}</div>
        </Fld>
      ) : null}

      {notes ? (
        <Fld label="Notes">
          <div
            style={{
              ...valueStyle,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {notes}
          </div>
        </Fld>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 16,
        }}
      >
        {mkBtn({ type: "button", className: "mgt-hover-scale", variant: "ghost", onClick: onClose, children: "Close" })}
      </div>

      <p style={{ ...S.muted, marginTop: 12, fontSize: 11 }}>
        Read-only preview. To change this request, open the Requests tab.
      </p>
    </Overlay>
  );
}
