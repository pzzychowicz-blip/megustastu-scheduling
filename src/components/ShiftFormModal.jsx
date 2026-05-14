// src/components/ShiftFormModal.jsx
// Create / edit a single shift slot.
//
// Props:
//   open        (bool)
//   dateIso     (string)        — "YYYY-MM-DD" of the cell being edited
//   slotDef     (object)        — slot definition from slotsForDay()
//   shift       (object | null) — existing shift record, or null if cell is empty
//   employees   ({ [id]: employee }) — for the assignee picker
//   requests    ({ [id]: request })  — for the conflict filter / banner
//   weekShifts  ({ [id]: shift })    — full week (v0.8.0); same-day filter
//   isMobile    (bool)
//   onClose     (fn)
//   onSave      (fn)            — receives the shift payload
//   onDelete    (fn)            — receives shiftId; only call when shift exists
//
// Behaviour:
//   - Defaults pulled from slotDef (template values).
//   - Existing shift values override the defaults.
//   - "Reset to template defaults" button restores defaults for start/end/role.
//   - Day-shift slots (slotDef.isDay) hide the role picker and show
//     "covers Bar + Floor" / "covers Chef + Plating + Pot" instead.
//   - "Unassigned" is a valid choice — leaves employeeId=null but keeps the
//     record if start/end/role were edited.
//   - v0.8.0: evening slots prefill `form.role` with `slotDef.defaultRole`
//     for NEW shifts. Existing shift records keep their stored role (even
//     if empty — manager may have deliberately cleared it).
//   - v0.8.0: the assignee dropdown applies three stacked filters:
//       (a) role match — when the slot has a role, only employees with
//           that role appear. Day slots match against the section's role
//           list (any one of the section's roles suffices).
//       (b) same-date exclusion (STRICT) — anyone already on another
//           shift this date is hidden. Picker filter + save-time guard.
//       (c) request conflict — anyone with a day-off/holiday request
//           covering the date is hidden by default. A "Show staff on day
//           off / holiday" toggle restores them and brings back the yellow
//           warning banner. Toggle only renders when at least one
//           employee is currently hidden by this filter.

import { useEffect, useMemo, useState } from "react";
import { S, BTN, ROLE_COLORS, REQUEST_TYPES } from "../lib/constants.js";
import { Overlay, Fld, mkInp, mkBtn } from "./atoms.jsx";
import {
  formatDayHeader,
  parseIsoDate,
  findRequestConflict,
  findSameDayShift,
} from "../lib/schedule-logic.js";

// Lookup once per render — REQUEST_TYPES is small.
function requestTypeLabel(key) {
  for (let i = 0; i < REQUEST_TYPES.length; i++) {
    if (REQUEST_TYPES[i].key === key) return REQUEST_TYPES[i].label;
  }
  return key;
}

// Build the initial form state from slotDef + shift.
//
// v0.8.0: for NEW evening shifts (no existing record) we prefill `role`
// from `slotDef.defaultRole`. Existing records always win — even if the
// stored role is empty, that's a manager-set state we shouldn't silently
// overwrite.
function initialForm(slotDef, shift) {
  const isNew = !shift;
  const prefillRole = isNew && !slotDef.isDay ? (slotDef.defaultRole || "") : "";
  return {
    employeeId: (shift && shift.employeeId) || "",
    role: (shift && shift.role) || prefillRole,             // "" === none selected
    start: (shift && shift.start) || slotDef.defaultStart,
    end:   (shift && shift.end)   || slotDef.defaultEnd,
  };
}

export default function ShiftFormModal({
  open, dateIso, slotDef, shift, employees, requests, weekShifts, isMobile,
  onClose, onSave, onDelete,
}) {
  const [form, setForm] = useState(function () { return initialForm(slotDef || {}, shift); });
  // v0.8.0: when on, the picker stops hiding employees who have a covering
  // day-off / holiday request — they reappear with the yellow banner so
  // the manager can deliberately override. Resets to OFF whenever the
  // modal is re-targeted.
  const [showRequestBlocked, setShowRequestBlocked] = useState(false);
  // v0.8.0: terminal banner shown when the save-time same-day guard fires.
  // (The picker filter normally prevents this — the guard is belt + braces
  // against a stale dropdown state.)
  const [saveError, setSaveError] = useState("");

  // Re-init when the modal opens (or the target cell changes).
  //
  // v0.8.0: if the existing shift's assignee has a covering request,
  // auto-flip `showRequestBlocked` ON so they remain visible in the
  // dropdown. Without this the select would render with a value that
  // isn't in its option list — broken state. Manager can untoggle to
  // hide them again.
  useEffect(function () {
    if (open && slotDef) {
      setForm(initialForm(slotDef, shift));
      const existingConflict = shift && shift.employeeId
        ? findRequestConflict(requests, shift.employeeId, dateIso)
        : null;
      setShowRequestBlocked(!!existingConflict);
      setSaveError("");
    }
  }, [open, slotDef, shift, requests, dateIso]);

  // ── Eligible employees for this slot ───────────────────────────────────
  // v0.8.0: a single derived list applies three stacked filters in one
  // pass over the employees map. We also track how many were hidden by
  // the request filter so the "Show staff on day off / holiday" toggle
  // only renders when it has an effect.
  //
  // The same-day filter excludes the shift currently being edited (by id),
  // so the assignment doesn't conflict with itself.
  const currentShiftId = shift && shift.id ? shift.id : null;
  const eligible = useMemo(function () {
    if (!slotDef) return { list: [], requestHiddenCount: 0 };
    const all = Object.values(employees || {});
    const eligibleRoles = slotDef.isDay
      ? (slotDef.coversRoles || [])
      : (slotDef.eligibleRoles || []);

    // (a) active + role match — same as v0.5–0.7 behaviour.
    const roleOk = all.filter(function (e) {
      if (e.active === false) return false;
      const roles = Array.isArray(e.roles) ? e.roles : [];
      return roles.some(function (r) { return eligibleRoles.indexOf(r) !== -1; });
    });

    // (b) STRICT same-date exclusion. Exclude the current shift's own id
    //     so "edit assignee on slot X" doesn't fight itself.
    const sameDayOk = roleOk.filter(function (e) {
      return !findSameDayShift(weekShifts, e.id, dateIso, currentShiftId);
    });

    // (c) request conflict — hidden by default; toggle restores them.
    let requestHiddenCount = 0;
    const requestOk = sameDayOk.filter(function (e) {
      const conflict = findRequestConflict(requests, e.id, dateIso);
      if (conflict && !showRequestBlocked) {
        requestHiddenCount++;
        return false;
      }
      return true;
    });

    // v0.9.0: specialists-first sort. An employee with fewer total roles
    // is treated as "more suitable" for any single-role slot — they don't
    // have other roles competing for their attention across the week.
    // Tiebreak alphabetical by name. Falls out naturally for day shifts
    // too: a 1-role employee (eligible because their single role is one
    // of the section's) ranks above multi-role employees, putting the
    // tightest fit on top.
    function roleCount(e) {
      return Array.isArray(e.roles) ? e.roles.length : 0;
    }
    requestOk.sort(function (a, b) {
      const rc = roleCount(a) - roleCount(b);
      if (rc !== 0) return rc;
      return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
    });

    return { list: requestOk, requestHiddenCount: requestHiddenCount };
  }, [slotDef, employees, requests, weekShifts, dateIso, currentShiftId, showRequestBlocked]);

  const eligibleEmployees = eligible.list;

  if (!open || !slotDef) return null;

  // ── Field setters ────────────────────────────────────────────────────
  function setField(key, value) {
    setForm(function (prev) { return { ...prev, [key]: value }; });
    // v0.8.0: clear the same-day save guard banner as soon as the user
    // changes any field — keeps the error from lingering after the fix.
    if (saveError) setSaveError("");
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

    // v0.8.0 STRICT guard. The picker filter already excludes anyone on
    // another shift this date, but a stale dropdown (e.g., the modal was
    // opened, another tab assigned the same person, this modal didn't
    // re-render) could still produce a same-day double-booking. Refuse
    // the save and surface a red banner so the manager can pick again.
    if (form.employeeId) {
      const clash = findSameDayShift(weekShifts, form.employeeId, dateIso, currentShiftId);
      if (clash) {
        setSaveError("This employee is already on another shift this date. Pick someone else or clear the existing shift first.");
        return;
      }
    }

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

  // v0.8.0: the empty-list note now has to account for THREE filters
  // (role, same-day, request). Surface the most actionable explanation
  // for the manager. The same-day filter is the strictest — if it's the
  // one that emptied the list, mention it. Otherwise fall back to the
  // role-based message.
  const noEligibleNote = eligibleEmployees.length === 0
    ? (
      <p style={{ ...S.muted, marginTop: 6, fontSize: 11 }}>
        {eligible.requestHiddenCount > 0
          ? "No eligible employees left after filtering same-day shifts and day-off / holiday requests. Toggle the option below to include staff with requests, or clear another shift on this date."
          : "No active employees have a role that fits this slot, or everyone eligible is already scheduled this date."}
      </p>
    )
    : null;

  // v0.8.0: toggle reveals employees hidden by the request filter. Only
  // render when at least one was hidden — keeps the modal clean when no
  // requests cover this date.
  const requestToggle = eligible.requestHiddenCount > 0 || showRequestBlocked
    ? (
      <label
        style={{
          display: "flex", alignItems: "center", gap: 6,
          marginTop: 8, fontSize: 12, color: "#3a3a3c", cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={showRequestBlocked}
          onChange={function (e) { setShowRequestBlocked(e.target.checked); }}
        />
        Show staff on day off / holiday
        {!showRequestBlocked && eligible.requestHiddenCount > 0
          ? <span style={S.muted}> ({eligible.requestHiddenCount} hidden)</span>
          : null}
      </label>
    )
    : null;

  // v0.8.0: red banner when the save guard refused the picked combo.
  const saveErrorBanner = saveError
    ? (
      <div
        style={{
          marginTop: 6,
          padding: "8px 10px",
          background: "rgba(255,59,48,0.12)",
          border: "1px solid rgba(255,59,48,0.45)",
          color: "#9a1f17",
          borderRadius: 10,
          fontSize: 12,
        }}
      >
        {saveError}
      </div>
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
        {requestToggle}
        {conflictBanner}
        {saveErrorBanner}
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
