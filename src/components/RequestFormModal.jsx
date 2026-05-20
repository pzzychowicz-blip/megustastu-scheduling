// src/components/RequestFormModal.jsx
// Add / edit a single day-off or holiday request, rendered inside <Overlay>.
//
// Manager-entered records — staff communicate via WhatsApp / in person and
// the manager transcribes. No staff portal in v1 (locked decision).
//
// Props:
//   open       (bool)
//   request    (obj?)                — existing record for edit, or null for "add new"
//   employees  ({ [id]: employee })  — for the assignee picker
//   isMobile   (bool)
//   onClose    (fn)
//   onSave     (fn)                  — called with the request payload
//   onDelete   (fn)                  — called with request.id on Delete (only when editing)
//
// Form fields:
//   - employeeId (required)
//   - type       ("dayoff" | "holiday") — segmented control
//   - dateFrom   (required, "YYYY-MM-DD")
//   - dateTo     (required, "YYYY-MM-DD"), must be >= dateFrom
//   - notes      (optional, free text)
//
// Validation:
//   Save disabled until employeeId, type, dateFrom, dateTo are all set
//   AND dateTo >= dateFrom (lexicographic compare on "YYYY-MM-DD" works).

import { useEffect, useState } from "react";
import { S, BTN, REQUEST_TYPES, WEEKDAYS } from "../lib/constants.js";
import { Overlay, Fld, mkInp, mkBtn } from "./atoms.jsx";

// ── Defaults ─────────────────────────────────────────────────────────────
// v1.2.0: `preferredDayPart` ("day" | "evening" | "") only meaningful when
// type === "shift-preference". For other types the field is dropped on
// save and ignored on read.
// v1.8.2: `recurringDaysOfWeek` (array of WEEKDAYS keys) also only
// meaningful for shift-preference. Empty list = every date in the range
// (legacy behaviour). Non-empty list = only those weekdays inside the
// range are covered.
function emptyForm() {
  return {
    employeeId: "",
    type: "dayoff",
    dateFrom: "",
    dateTo: "",
    preferredDayPart: "day",
    recurringDaysOfWeek: [],
    notes: "",
  };
}

function formFromRequest(req) {
  if (!req) return emptyForm();
  return {
    employeeId: req.employeeId || "",
    type: req.type || "dayoff",
    dateFrom: req.dateFrom || "",
    dateTo: req.dateTo || "",
    preferredDayPart: req.preferredDayPart || "day",
    recurringDaysOfWeek: Array.isArray(req.recurringDaysOfWeek)
      ? req.recurringDaysOfWeek.slice()
      : [],
    notes: req.notes || "",
  };
}

// Sort active employees alphabetically for the picker.
function activeEmployeeList(employees) {
  return Object.values(employees || {})
    .filter(function (e) { return e.active !== false; })
    .sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
    });
}

// ── Component ────────────────────────────────────────────────────────────
export default function RequestFormModal({
  open, request, employees, isMobile, onClose, onSave, onDelete,
}) {
  const isEdit = Boolean(request && request.id);
  const [form, setForm] = useState(emptyForm);

  useEffect(function () {
    if (open) setForm(formFromRequest(request));
  }, [open, request]);

  if (!open) return null;

  // ── Field setters ────────────────────────────────────────────────────
  function setField(key, value) {
    setForm(function (prev) { return { ...prev, [key]: value }; });
  }

  // Auto-bump dateTo when the user picks a dateFrom that's after the
  // current dateTo — common case is a single-day request (from = to).
  function setDateFrom(value) {
    setForm(function (prev) {
      const next = { ...prev, dateFrom: value };
      if (!prev.dateTo || prev.dateTo < value) next.dateTo = value;
      return next;
    });
  }

  // v1.8.2: weekday pill toggle for the recurring shift-preference picker.
  // Preserves WEEKDAYS source order in the stored array so the row renders
  // Mon..Sun consistently regardless of click order.
  function toggleRecurringDay(key) {
    setForm(function (prev) {
      const current = prev.recurringDaysOfWeek || [];
      const idx = current.indexOf(key);
      let next;
      if (idx === -1) {
        next = WEEKDAYS
          .map(function (w) { return w.key; })
          .filter(function (k) { return current.indexOf(k) !== -1 || k === key; });
      } else {
        next = current.filter(function (k) { return k !== key; });
      }
      return { ...prev, recurringDaysOfWeek: next };
    });
  }

  // ── Validation ───────────────────────────────────────────────────────
  // v1.2.0: shift-preference requires a preferredDayPart (Day or Evening).
  // Default is "day" so the field is always populated; the explicit check
  // is defensive against future "neither" sentinels.
  const datesValid =
    Boolean(form.dateFrom) && Boolean(form.dateTo) && form.dateFrom <= form.dateTo;
  const dayPartValid =
    form.type !== "shift-preference" ||
    form.preferredDayPart === "day" ||
    form.preferredDayPart === "evening";
  const valid = Boolean(form.employeeId) && Boolean(form.type) && datesValid && dayPartValid;

  // ── Handlers ─────────────────────────────────────────────────────────
  function handleSave() {
    if (!valid) return;
    const notesTrimmed = form.notes.trim();
    const payload = {
      id: isEdit ? request.id : undefined,
      employeeId: form.employeeId,
      type: form.type,
      dateFrom: form.dateFrom,
      dateTo: form.dateTo,
      notes: notesTrimmed || null,
    };
    // v1.2.0: only attach preferredDayPart for the shift-preference type.
    // v1.8.2: same for recurringDaysOfWeek — only stored when the type
    // supports it AND the manager actually picked weekdays. Empty list
    // is saved as null (Firebase reads null as "remove this field") so
    // legacy records without the field stay backwards-compatible on
    // read and the matcher's "no weekdays = every date" path kicks in.
    if (form.type === "shift-preference") {
      payload.preferredDayPart = form.preferredDayPart;
      const recurring = (form.recurringDaysOfWeek || []).filter(function (k) {
        return WEEKDAYS.some(function (w) { return w.key === k; });
      });
      payload.recurringDaysOfWeek = recurring.length > 0 ? recurring : null;
    }
    onSave(payload);
  }

  function handleDelete() {
    if (!isEdit) return;
    const ok = window.confirm(
      "Delete this request?\n\n" +
      "This is permanent. Any conflict warnings tied to it will disappear."
    );
    if (ok) onDelete(request.id);
  }

  // ── Sub-renders ──────────────────────────────────────────────────────
  const employeeOptions = [
    <option key="__none__" value="">— Pick employee —</option>,
    ...activeEmployeeList(employees).map(function (e) {
      return <option key={e.id} value={e.id}>{e.name}</option>;
    }),
  ];

  const typeSegments = (
    <div
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        background: "var(--bg-segment-strong)",
        borderRadius: 10,
        padding: 3,
      }}
    >
      {REQUEST_TYPES.map(function (t) {
        const on = form.type === t.key;
        return (
          <button
            key={t.key}
            type="button"
            className="mgt-hover-scale"
            onClick={function () { setField("type", t.key); }}
            style={{
              ...BTN.base,
              padding: "6px 14px",
              fontSize: 13,
              borderRadius: 8,
              background: on ? "var(--accent)" : "transparent",
              color: on ? "var(--text-on-accent)" : "var(--text-primary)",
              border: "1px solid transparent",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  // v1.2.0: Day / Evening sub-choice — only rendered for shift-preference.
  // Stored separately as `preferredDayPart`. Defaults to "day" via
  // emptyForm; the manager can flip to "evening". The HARD enforcement
  // lives in the generator + manual picker via
  // findShiftPreferenceMismatch.
  const dayPartSegments = form.type === "shift-preference"
    ? (
      <Fld label="Preferred shift">
        <div
          style={{
            display: "inline-flex",
            background: "var(--bg-segment-strong)",
            borderRadius: 10,
            padding: 3,
          }}
        >
          {[
            { key: "day", label: "Day shifts only" },
            { key: "evening", label: "Evening shifts only" },
          ].map(function (opt) {
            const on = form.preferredDayPart === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                className="mgt-hover-scale"
                onClick={function () { setField("preferredDayPart", opt.key); }}
                style={{
                  ...BTN.base,
                  padding: "6px 14px",
                  fontSize: 13,
                  borderRadius: 8,
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--text-on-accent)" : "var(--text-primary)",
                  border: "1px solid transparent",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <p style={{ ...S.muted, marginTop: 6, fontSize: 11 }}>
          Generator + manual picker will refuse to assign this employee to
          the other shift type on these dates.
        </p>
      </Fld>
    )
    : null;

  // v1.8.2: recurring weekday narrowing. Empty selection (default) means
  // "every date in the range" — matches pre-v1.8.2 behaviour. Picking
  // weekdays narrows the request to those days only (e.g. "every Sat/Sun
  // in this range").
  const recurringDaysPicker = form.type === "shift-preference"
    ? (
      <Fld label="Repeat on weekdays (optional)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {WEEKDAYS.map(function (w) {
            const on = (form.recurringDaysOfWeek || []).indexOf(w.key) !== -1;
            return (
              <button
                key={w.key}
                type="button"
                className="mgt-hover-scale"
                onClick={function () { toggleRecurringDay(w.key); }}
                style={{
                  ...BTN.base,
                  padding: "6px 12px",
                  fontSize: 13,
                  borderRadius: 8,
                  background: on ? "var(--accent)" : "var(--bg-segment-strong)",
                  color: on ? "var(--text-on-accent)" : "var(--text-primary)",
                  border: "1px solid transparent",
                }}
              >
                {w.label}
              </button>
            );
          })}
        </div>
        <p style={{ ...S.muted, marginTop: 6, fontSize: 11 }}>
          Leave empty to cover every date in the range. Pick weekdays to
          restrict the preference to those days only (e.g. "every Sat/Sun").
        </p>
      </Fld>
    )
    : null;

  const dateError = (form.dateFrom && form.dateTo && form.dateTo < form.dateFrom)
    ? (
      <p style={{ ...S.muted, color: "var(--text-danger)", fontSize: 12, marginTop: -4 }}>
        End date must be on or after start date.
      </p>
    )
    : null;

  const deleteButton = isEdit
    ? mkBtn({ type: "button", className: "mgt-hover-scale", variant: "danger", onClick: handleDelete, children: "Delete" })
    : null;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={onClose}
      title={isEdit ? "Edit request" : "Add request"}
    >
      <Fld label="Employee">
        <select
          value={form.employeeId}
          onChange={function (e) { setField("employeeId", e.target.value); }}
          style={{ ...S.inputBase, paddingRight: 28 }}
        >
          {employeeOptions}
        </select>
      </Fld>

      <Fld label="Type">
        {typeSegments}
      </Fld>

      {dayPartSegments}

      {recurringDaysPicker}

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Fld label="From">
            {mkInp({
              type: "date",
              value: form.dateFrom,
              onChange: function (e) { setDateFrom(e.target.value); },
            })}
          </Fld>
        </div>
        <div style={{ flex: 1 }}>
          <Fld label="To">
            {mkInp({
              type: "date",
              value: form.dateTo,
              min: form.dateFrom || undefined,
              onChange: function (e) { setField("dateTo", e.target.value); },
            })}
          </Fld>
        </div>
      </div>

      {dateError}

      <Fld label="Notes (optional)">
        <textarea
          value={form.notes}
          onChange={function (e) { setField("notes", e.target.value); }}
          rows={2}
          placeholder="e.g. medical appointment, family event"
          style={{ ...S.inputBase, resize: "vertical", fontFamily: "inherit" }}
        />
      </Fld>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 16,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {deleteButton}
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          {mkBtn({ type: "button", className: "mgt-hover-scale", variant: "ghost", onClick: onClose, children: "Cancel" })}
          {mkBtn({
            type: "button",
            className: "mgt-hover-scale",
            variant: "primary",
            onClick: handleSave,
            disabled: !valid,
            style: { opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" },
            children: isEdit ? "Save changes" : "Add request",
          })}
        </div>
      </div>
    </Overlay>
  );
}
