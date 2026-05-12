// src/components/ShiftFormModal.jsx
// Create / edit a single shift slot.
//
// Props:
//   open       (bool)
//   dateIso    (string)        — "YYYY-MM-DD" of the cell being edited
//   slotDef    (object)        — slot definition from slotsForDay()
//   shift      (object | null) — existing shift record, or null if cell is empty
//   employees  ({ [id]: employee }) — for the assignee picker
//   requests   ({ [id]: request })  — for the conflict-warning banner
//   isMobile   (bool)
//   onClose    (fn)
//   onSave     (fn)            — receives the shift payload
//   onDelete   (fn)            — receives shiftId; only call when shift exists
//
// Behaviour:
//   - Defaults pulled from slotDef (template values).
//   - Existing shift values override the defaults.
//   - "Reset to template defaults" button restores defaults for start/end/role.
//   - Day-shift slots (slotDef.isDay) hide the role picker and show
//     "covers Bar + Floor" / "covers Chef + Plating + Pot" instead.
//   - "Unassigned" is a valid choice — leaves employeeId=null but keeps the
//     record if start/end/role were edited.

import { useEffect, useMemo, useState } from "react";
import { S, BTN, ROLE_COLORS, REQUEST_TYPES } from "../lib/constants.js";
import { Overlay, Fld, mkInp, mkBtn } from "./atoms.jsx";
import { formatDayHeader, parseIsoDate, findRequestConflict } from "../lib/schedule-logic.js";

// Lookup once per render — REQUEST_TYPES is small.
function requestTypeLabel(key) {
  for (let i = 0; i < REQUEST_TYPES.length; i++) {
    if (REQUEST_TYPES[i].key === key) return REQUEST_TYPES[i].label;
  }
  return key;
}

// Build the initial form state from slotDef + shift.
function initialForm(slotDef, shift) {
  return {
    employeeId: (shift && shift.employeeId) || "",
    role: (shift && shift.role) || "",                       // "" === none selected
    start: (shift && shift.start) || slotDef.defaultStart,
    end:   (shift && shift.end)   || slotDef.defaultEnd,
  };
}

export default function ShiftFormModal({
  open, dateIso, slotDef, shift, employees, requests, isMobile,
  onClose, onSave, onDelete,
}) {
  const [form, setForm] = useState(function () { return initialForm(slotDef || {}, shift); });

  // Re-init when the modal opens (or the target cell changes).
  useEffect(function () {
    if (open && slotDef) setForm(initialForm(slotDef, shift));
  }, [open, slotDef, shift]);

  // ── Eligible employees for this slot ───────────────────────────────────
  // Filter by: active === true; AND (if evening) the employee has at least
  // one of the slot's eligible roles; (if day) the employee can fill any
  // of the section's roles (we don't enforce coverage of ALL of them — a
  // manager might assign someone with just one role to a day shift on
  // operational reality).
  const eligibleEmployees = useMemo(function () {
    if (!slotDef) return [];
    const list = Object.values(employees || {}).filter(function (e) { return e.active !== false; });
    const eligibleRoles = slotDef.isDay
      ? (slotDef.coversRoles || [])
      : (slotDef.eligibleRoles || []);
    return list.filter(function (e) {
      const roles = Array.isArray(e.roles) ? e.roles : [];
      return roles.some(function (r) { return eligibleRoles.indexOf(r) !== -1; });
    }).sort(function (a, b) {
      return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
    });
  }, [slotDef, employees]);

  if (!open || !slotDef) return null;

  // ── Field setters ────────────────────────────────────────────────────
  function setField(key, value) {
    setForm(function (prev) { return { ...prev, [key]: value }; });
  }

  function resetToDefaults() {
    setForm(function (prev) {
      return {
        ...prev,
        role: "",
        start: slotDef.defaultStart,
        end: slotDef.defaultEnd,
      };
    });
  }

  // ── Validation ───────────────────────────────────────────────────────
  // Valid when:
  //   - times are non-empty strings
  //   - end > start (lexicographic compare works for HH:MM)
  //   - for evening slots, EITHER no employee is assigned (still editable)
  //     OR a role is chosen
  const timesValid = form.start && form.end && form.start < form.end;
  const eveningNeedsRole = !slotDef.isDay && form.employeeId && !form.role;
  const valid = timesValid && !eveningNeedsRole;

  // ── Handlers ─────────────────────────────────────────────────────────
  function handleSave() {
    if (!valid) return;
    const payload = {
      id: (shift && shift.id) || undefined,
      date: dateIso,
      section: slotDef.section,
      dayPart: slotDef.dayPart,
      slotIndex: slotDef.slotIndex,
      role: slotDef.isDay ? null : (form.role || null),
      start: form.start,
      end: form.end,
      employeeId: form.employeeId || null,
    };
    onSave(payload);
  }

  function handleDelete() {
    if (!shift || !shift.id) return;
    const ok = window.confirm("Clear this shift slot? Times return to template defaults and the assignee is removed.");
    if (ok) onDelete(shift.id);
  }

  // ── Subrenders ───────────────────────────────────────────────────────
  const dateObj = parseIsoDate(dateIso);
  const headerTitle = slotDef.humanLabel + " · " + formatDayHeader(dateObj);

  // Employee picker — native <select>. Includes "Unassigned" option and
  // a separate "no eligible employee" note when the active list is empty.
  const employeeOptions = [
    <option key="__none__" value="">— Unassigned —</option>,
    ...eligibleEmployees.map(function (e) {
      const rolesStr = (e.roles || []).join(", ");
      return (
        <option key={e.id} value={e.id}>
          {e.name + (rolesStr ? "  (" + rolesStr + ")" : "")}
        </option>
      );
    }),
  ];

  const noEligibleNote = eligibleEmployees.length === 0
    ? (
      <p style={{ ...S.muted, marginTop: 6, fontSize: 11 }}>
        No active employees have a role that fits this slot. Add or edit
        employees on the Employees tab.
      </p>
    )
    : null;

  // Conflict-warning banner. Yellow, non-blocking — manager judgment overrides
  // (locked v1 decision: warn, do NOT block saves).
  const conflict = form.employeeId
    ? findRequestConflict(requests, form.employeeId, dateIso)
    : null;

  const conflictBanner = conflict
    ? (
      <div
        style={{
          marginTop: 6,
          padding: "8px 10px",
          background: "rgba(255,204,0,0.18)",
          border: "1px solid rgba(255,159,10,0.55)",
          color: "#7a4d00",
          borderRadius: 10,
          fontSize: 12,
        }}
      >
        ⚠ This employee has a <strong>{requestTypeLabel(conflict.type)}</strong> request
        covering {dateIso}{conflict.notes ? " — " + conflict.notes : ""}. You can
        still save; this is just a warning.
      </div>
    )
    : null;

  // Role picker (evening only) — chip group.
  const rolePicker = slotDef.isDay
    ? (
      <Fld label="Role">
        <p style={S.muted}>
          Day shift covers {(slotDef.coversRoles || []).join(" + ")}.
        </p>
      </Fld>
    )
    : (
      <Fld label="Role">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {(slotDef.eligibleRoles || []).map(function (r) {
            const on = form.role === r;
            const c = ROLE_COLORS[r] || "#8E8E93";
            return (
              <button
                key={r}
                type="button"
                onClick={function () { setField("role", on ? "" : r); }}
                style={{
                  ...BTN.base,
                  padding: "6px 12px",
                  fontSize: 13,
                  borderRadius: 999,
                  background: on ? c : "rgba(255,255,255,0.7)",
                  color: on ? "#fff" : "#1c1c1e",
                  border: "1px solid " + (on ? c : "rgba(0,0,0,0.12)"),
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
        {eveningNeedsRole
          ? <p style={{ ...S.muted, color: "#9a1f17", marginTop: 6, fontSize: 11 }}>
              Pick a role for the assigned employee.
            </p>
          : null}
      </Fld>
    );

  const deleteButton = (shift && shift.id)
    ? mkBtn({ type: "button", variant: "danger", onClick: handleDelete, children: "Clear" })
    : null;

  return (
    <Overlay open={open} isMobile={isMobile} onClose={onClose} title={headerTitle}>
      <Fld label="Assignee">
        <select
          value={form.employeeId}
          onChange={function (e) { setField("employeeId", e.target.value); }}
          style={{ ...S.inputBase, paddingRight: 28 }}
        >
          {employeeOptions}
        </select>
        {noEligibleNote}
        {conflictBanner}
      </Fld>

      {rolePicker}

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Fld label="Start">
            {mkInp({
              type: "time",
              value: form.start,
              onChange: function (e) { setField("start", e.target.value); },
            })}
          </Fld>
        </div>
        <div style={{ flex: 1 }}>
          <Fld label="End">
            {mkInp({
              type: "time",
              value: form.end,
              onChange: function (e) { setField("end", e.target.value); },
            })}
          </Fld>
        </div>
      </div>

      {!timesValid
        ? <p style={{ ...S.muted, color: "#9a1f17", fontSize: 12, marginTop: -4 }}>
            End time must be after start time.
          </p>
        : null}

      <div style={{ marginTop: 4 }}>
        <button
          type="button"
          onClick={resetToDefaults}
          style={{ ...BTN.base, ...BTN.ghost, padding: "6px 10px", fontSize: 12 }}
        >
          Reset times & role to template defaults
        </button>
      </div>

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
          {mkBtn({ type: "button", variant: "ghost",   onClick: onClose,    children: "Cancel" })}
          {mkBtn({
            type: "button",
            variant: "primary",
            onClick: handleSave,
            disabled: !valid,
            style: { opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" },
            children: "Save",
          })}
        </div>
      </div>
    </Overlay>
  );
}
