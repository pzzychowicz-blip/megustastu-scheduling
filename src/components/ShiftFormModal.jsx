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
//   priorWeekShifts ({ [id]: shift })— v1.8.0 cross-week 2-off check. Used
//                                       only by hasConsecutiveDaysOff to
//                                       resolve prior Sunday's worked state.
//                                       Optional — missing degrades to the
//                                       pre-v1.8.0 Mon..Sun-only scan.
//   nextWeekShifts  ({ [id]: shift })— v1.8.0 cross-week 2-off check.
//                                       Used to resolve next Monday's
//                                       worked state. Optional.
//   isMobile    (bool)
//   onClose     (fn)
//   onSave      (fn)            — receives the shift payload
//   onDelete    (fn)            — receives shiftId; only call when shift exists
//   onStartSwap (fn?)           — v1.7.0. Fires with {dateIso, slotDef, shift}
//                                  when the manager clicks "Move/Swap to…".
//                                  Caller closes the modal and enters
//                                  swap-target-select mode. Only rendered
//                                  when shift has an employeeId.
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
import { Overlay, Fld, Toggle, mkInp, mkBtn } from "./atoms.jsx";
import {
  formatDayHeader,
  parseIsoDate,
  startOfWeek,
  findRequestConflict,
  findSameDayShift,
  findShiftPreferenceMismatch,
  hasConsecutiveDaysOff,
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
  open, dateIso, slotDef, shift, employees, requests, weekShifts,
  priorWeekShifts, nextWeekShifts, isMobile,
  onClose, onSave, onDelete, onStartSwap,
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
    // v1.1.0: day slots may declare `requiredRoles` — when present, the
    // employee must hold AT LEAST ONE of them (stricter than the
    // permissive coversRoles "any of" check). Empty / undefined keeps
    // the v1.0 behaviour. Evening slots are unchanged.
    const dayRequired = slotDef.isDay ? (slotDef.requiredRoles || []) : [];
    const eligibleRoles = slotDef.isDay
      ? (slotDef.coversRoles || [])
      : (slotDef.eligibleRoles || []);

    // (a) active + role match.
    const roleOk = all.filter(function (e) {
      if (e.active === false) return false;
      const roles = Array.isArray(e.roles) ? e.roles : [];
      if (dayRequired.length > 0) {
        // Strict: employee must hold one of the required roles.
        return roles.some(function (r) { return dayRequired.indexOf(r) !== -1; });
      }
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

  // v1.7.0: hand the cell off to the parent's swap-target-select mode.
  // The modal closes; the next cell-click on the grid completes the
  // move (target empty) or swap (target filled).
  function handleStartSwap() {
    if (!onStartSwap || !shift || !shift.id || !shift.employeeId) return;
    onStartSwap({ dateIso: dateIso, slotDef: slotDef, shift: shift });
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
  // v0.10.1: converted to Toggle atom for consistency with the v0.10.0
  // Settings Display toggle. Hidden-count moved into the `helper` slot.
  const requestToggle = eligible.requestHiddenCount > 0 || showRequestBlocked
    ? (
      <div style={{ marginTop: 8 }}>
        <Toggle
          checked={showRequestBlocked}
          onChange={setShowRequestBlocked}
          label="Show staff on day off / holiday"
          helper={
            !showRequestBlocked && eligible.requestHiddenCount > 0
              ? eligible.requestHiddenCount + " hidden"
              : null
          }
        />
      </div>
    )
    : null;

  // v0.8.0: red banner when the save guard refused the picked combo.
  const saveErrorBanner = saveError
    ? (
      <div
        style={{
          marginTop: 6,
          padding: "8px 10px",
          background: "var(--bg-danger-tint)",
          border: "1px solid var(--border-danger-tint)",
          color: "var(--text-danger)",
          borderRadius: 10,
          fontSize: 12,
        }}
      >
        {saveError}
      </div>
    )
    : null;

  // ── Soft warning banners (yellow, non-blocking) ──────────────────────
  // v1.2.0 adds two more warnings alongside the existing dayoff / holiday
  // conflict: shift-preference mismatch and consecutive-2-off rule break.
  // All three are SOFT — manager judgment overrides (locked v1 decision:
  // warn, do NOT block saves). Multiple may fire at once; we render each
  // as its own yellow banner stacked under the picker.
  const conflict = form.employeeId
    ? findRequestConflict(requests, form.employeeId, dateIso)
    : null;
  const prefMismatch = form.employeeId
    ? findShiftPreferenceMismatch(requests, form.employeeId, dateIso, slotDef.dayPart)
    : null;

  // Consecutive-off check: simulate the post-save shifts map and ask
  // schedule-logic.hasConsecutiveDaysOff. The simulation drops the
  // currently-edited shift's record (if any) so we don't count its OLD
  // state, then injects a synthetic "proposed" record reflecting the
  // current form's pick. weekStart is derived from the cell's date —
  // ShiftFormModal isn't told the current week-anchor explicitly.
  //
  // v1.8.0 threads priorWeekShifts + nextWeekShifts into the helper so a
  // Sun-off + next-Mon-off straddle counts as 2 consecutive off days.
  let restWarning = false;
  if (form.employeeId) {
    const weekStart = startOfWeek(parseIsoDate(dateIso));
    const sim = { ...weekShifts };
    if (currentShiftId) delete sim[currentShiftId];
    sim["__sim_preview"] = {
      id: "__sim_preview",
      employeeId: form.employeeId,
      date: dateIso,
    };
    restWarning = !hasConsecutiveDaysOff(form.employeeId, weekStart, sim, undefined, {
      priorWeekShifts: priorWeekShifts,
      nextWeekShifts: nextWeekShifts,
    });
  }

  const warningBoxStyle = {
    marginTop: 6,
    padding: "8px 10px",
    background: "var(--bg-warning-tint)",
    border: "1px solid var(--border-warning-tint)",
    color: "var(--text-warning)",
    borderRadius: 10,
    fontSize: 12,
  };

  const conflictBanner = conflict
    ? (
      <div style={warningBoxStyle}>
        ⚠ This employee has a <strong>{requestTypeLabel(conflict.type)}</strong> request
        covering {dateIso}{conflict.notes ? " — " + conflict.notes : ""}. You can
        still save; this is just a warning.
      </div>
    )
    : null;

  const prefMismatchBanner = prefMismatch
    ? (
      <div style={warningBoxStyle}>
        ⚠ This employee has requested{" "}
        <strong>
          {prefMismatch.preferredDayPart === "day" ? "day shifts only" : "evening shifts only"}
        </strong>{" "}
        on this date. You can still save; this is just a warning.
      </div>
    )
    : null;

  const restWarningBanner = restWarning
    ? (
      <div style={warningBoxStyle}>
        ⚠ Saving this would leave this employee without 2 consecutive
        days off this calendar week. You can still save; this is just a
        warning.
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
            const rgb = ROLE_COLORS[r] || "var(--role-fallback-rgb)";
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
                  background: on ? "rgb(" + rgb + ")" : "var(--bg-pill)",
                  color: on ? "var(--text-on-accent)" : "var(--text-primary)",
                  border: "1px solid " + (on ? "rgb(" + rgb + ")" : "var(--btn-ghost-border)"),
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
        {eveningNeedsRole
          ? <p style={{ ...S.muted, color: "var(--text-danger)", marginTop: 6, fontSize: 11 }}>
              Pick a role for the assigned employee.
            </p>
          : null}
      </Fld>
    );

  const deleteButton = (shift && shift.id)
    ? mkBtn({ type: "button", variant: "danger", onClick: handleDelete, children: "Clear" })
    : null;

  // v1.7.0: Move/Swap entry. Only visible when an assignment exists AND
  // the parent supplied an onStartSwap handler. Hidden for fresh / empty
  // cells (nothing to move) and for legacy callers without the prop.
  const swapButton = (shift && shift.id && shift.employeeId && onStartSwap)
    ? mkBtn({
        type: "button",
        variant: "secondary",
        onClick: handleStartSwap,
        children: "Move / Swap…",
      })
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
        {prefMismatchBanner}
        {restWarningBanner}
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
        ? <p style={{ ...S.muted, color: "var(--text-danger)", fontSize: 12, marginTop: -4 }}>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {deleteButton}
          {swapButton}
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
