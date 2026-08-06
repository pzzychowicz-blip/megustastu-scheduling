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
//   minConsecutiveDaysOff      (number) — v1.11.0. From /settings, clamped
//                                       1..3, default 2. Drives the yellow
//                                       restWarning banner copy and the
//                                       hasConsecutiveDaysOff call.
//                                       Optional — falls back to undefined
//                                       so the helper's default (2) applies.
//   maxConsecutiveWorkingDays  (number) — v1.11.0. From /settings, clamped
//                                       3..14, default 5. Drives the yellow
//                                       maxConsecutiveBanner copy and the
//                                       withinMaxConsecutiveWorkingDays
//                                       call. Optional.
//   isMobile    (bool)
//   readOnly    (bool)          — v1.12.0. Hides Save / Move-Swap / Clear
//                                  and disables every editable input. The
//                                  ScheduleGrid past-week lockdown passes
//                                  this so historical assignments stay
//                                  inspectable without giving the manager
//                                  a chance to mutate them. Warning
//                                  banners stay visible — useful context.
//                                  Optional; defaults to false.
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
//       (a) role match (HARD) — when the slot has a role, only employees
//           with that role appear. Day slots match against the section's
//           role list (any one of the section's roles suffices). Also
//           HARD-hides archived and out-of-tenure staff.
//       (b) same-date (SOFT since v16.0.0) — anyone already working this
//           date is hidden BY DEFAULT, revealed by the "Show staff already
//           working this date" toggle, and picking one raises the yellow
//           split-shift banner. Until v15.4.1 this was a hard exclusion
//           plus a save-time refusal; split shifts are now a legitimate
//           manual action, so the refusal is gone and only the warning
//           remains. The auto-generator keeps its own HARD same-day filter.
//       (c) request conflict (SOFT) — anyone with a day-off/holiday request
//           covering the date is hidden by default. A "Show staff on day
//           off / holiday" toggle restores them and brings back the yellow
//           warning banner.
//     Both SOFT toggles only render when they actually have something to
//     reveal (or are already on because the current assignee needs them).

import { useEffect, useMemo, useRef, useState } from "react";
import { R, S, BTN, BTN_SIZE, SECTIONS, ROLE_COLORS, REQUEST_TYPES } from "../lib/constants.js";
import { Overlay, Fld, Toggle, mkInp, mkBtn, usePresence, Reveal } from "./atoms.jsx";
import {
  formatDayHeader,
  parseIsoDate,
  startOfWeek,
  findRequestConflict,
  findSameDayShift,
  findSameDayShifts,
  findShiftPreferenceMismatch,
  hasConsecutiveDaysOff,
  withinMaxConsecutiveWorkingDays,
  isEmployeeActiveOnDate,
} from "../lib/schedule-logic.js";
import { useEnterSubmit } from "../hooks/useEnterSubmit.js";
import { useEscClose } from "../hooks/useEscClose.js";

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
  priorWeekShifts, nextWeekShifts,
  minConsecutiveDaysOff, maxConsecutiveWorkingDays,
  isMobile, readOnly,
  onClose, onSave, onDelete, onStartSwap,
}) {
  const [form, setForm] = useState(function () { return initialForm(slotDef || {}, shift); });
  // v0.8.0: when on, the picker stops hiding employees who have a covering
  // day-off / holiday request — they reappear with the yellow banner so
  // the manager can deliberately override. Resets to OFF whenever the
  // modal is re-targeted.
  const [showRequestBlocked, setShowRequestBlocked] = useState(false);
  // v16.0.0: same idea for staff already working this date. Split shifts
  // are legal now, but they should take two deliberate steps — reveal, then
  // pick — rather than being one mis-click away in a long dropdown.
  const [showSameDayStaff, setShowSameDayStaff] = useState(false);
  // v16.0.0: the `saveError` state and its red banner are GONE. Their only
  // ever trigger was the v0.8.0 same-day save refusal, which this version
  // deleted when split shifts became legal — leaving a state slot that was
  // initialised to "", reset to "" on open, and never assigned anything
  // else, plus ~20 lines of unreachable banner markup. If a save-time
  // refusal is ever needed again it should be added with its trigger, not
  // kept warm without one.

  // Re-init when the modal opens (or the target cell changes).
  //
  // v0.8.0: if the existing shift's assignee has a covering request,
  // auto-flip `showRequestBlocked` ON so they remain visible in the
  // dropdown. Without this the select would render with a value that
  // isn't in its option list — broken state. Manager can untoggle to
  // hide them again.
  //
  // v16.0.0: the identical problem exists for the new same-day toggle. If
  // this cell is already half of a split shift, its assignee has another
  // shift that date and would be filtered out of the dropdown, so the toggle
  // is auto-flipped ON here too. (The dropdown ALSO never filters out the
  // currently-selected employee — see the eligible memo below — so this is
  // now about showing the toggle in the honest state, not about correctness.)
  //
  // `requests` and `weekShifts` are read through a ref rather than listed as
  // dependencies, and that is load-bearing. This effect calls
  // `setForm(initialForm(...))`, so re-running it DISCARDS whatever the
  // manager has typed. `weekShifts` gets a fresh identity on every write to
  // /shifts — an undo, a second device, the manager's own Firebase echo — so
  // depending on it would silently revert an in-progress edit mid-typing.
  // Both values are only ever needed for the one-shot read at open.
  const latestData = useRef({ requests: requests, weekShifts: weekShifts });
  latestData.current = { requests: requests, weekShifts: weekShifts };
  useEffect(function () {
    if (open && slotDef) {
      const snap = latestData.current;
      setForm(initialForm(slotDef, shift));
      const existingConflict = shift && shift.employeeId
        ? findRequestConflict(snap.requests, shift.employeeId, dateIso)
        : null;
      setShowRequestBlocked(!!existingConflict);
      const existingSameDay = shift && shift.employeeId
        ? findSameDayShift(snap.weekShifts, shift.employeeId, dateIso, shift.id)
        : null;
      setShowSameDayStaff(!!existingSameDay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requests / weekShifts are read via latestData on purpose; see above
  }, [open, slotDef, shift, dateIso]);

  // ── Eligible employees for this slot ───────────────────────────────────
  // v0.8.0: a single derived list applies three stacked filters in one
  // pass over the employees map. We also track how many were hidden by
  // the request filter so the "Show staff on day off / holiday" toggle
  // only renders when it has an effect.
  //
  // The same-day filter excludes the shift currently being edited (by id),
  // so the assignment doesn't conflict with itself.
  const currentShiftId = shift && shift.id ? shift.id : null;
  // v16.0.0: whoever is selected RIGHT NOW is never filtered out. Both soft
  // filters below are toggle-reversible, and a manager who reveals hidden
  // staff, picks one, then flips the toggle back would otherwise leave the
  // <select> holding a value with no matching <option> — it renders blank,
  // reading as "Unassigned", while `form.employeeId` still carries the id, so
  // Save writes an assignment the UI said wasn't there. Pinning the selection
  // keeps "the select's value is always in its options" true by construction,
  // for both toggles, in every order of operations. The auto-flip in the open
  // effect above handles the initial state; this handles everything after.
  const selectedEmployeeId = form.employeeId || null;
  const eligible = useMemo(function () {
    if (!slotDef) return { list: [], requestHiddenCount: 0, sameDayHiddenCount: 0 };
    const all = Object.values(employees || {});
    // v1.1.0: day slots may declare `requiredRoles` — when present, the
    // employee must hold AT LEAST ONE of them (stricter than the
    // permissive coversRoles "any of" check). Empty / undefined keeps
    // the v1.0 behaviour. Evening slots are unchanged.
    const dayRequired = slotDef.isDay ? (slotDef.requiredRoles || []) : [];
    const eligibleRoles = slotDef.isDay
      ? (slotDef.coversRoles || [])
      : (slotDef.eligibleRoles || []);

    // (a) active + tenure + role match. v15.2.0: an employee whose
    //     activeFrom / activeUntil window doesn't cover this cell's date
    //     is HARD-hidden, same as an archived employee.
    const roleOk = all.filter(function (e) {
      if (e.active === false) return false;
      if (!isEmployeeActiveOnDate(e, dateIso)) return false;
      const roles = Array.isArray(e.roles) ? e.roles : [];
      if (dayRequired.length > 0) {
        // Strict: employee must hold one of the required roles.
        return roles.some(function (r) { return dayRequired.indexOf(r) !== -1; });
      }
      return roles.some(function (r) { return eligibleRoles.indexOf(r) !== -1; });
    });

    // (b) v16.0.0: same-date staff are HIDDEN BY DEFAULT, not excluded.
    //     Split shifts (day + evening on one date) are legal now, but only
    //     as a deliberate act — so this mirrors the day-off / holiday
    //     treatment in (c): hide by default, reveal behind a toggle, warn
    //     when one is actually picked. Under the strict rule (v0.8.0) this
    //     was an unconditional exclusion.
    //     Exclude the current shift's own id so "edit assignee on slot X"
    //     doesn't fight itself.
    let sameDayHiddenCount = 0;
    const sameDayOk = roleOk.filter(function (e) {
      const clash = findSameDayShift(weekShifts, e.id, dateIso, currentShiftId);
      if (clash && !showSameDayStaff) {
        sameDayHiddenCount++;
        // Counted as hidden (the toggle's helper text should still say so)
        // but kept in the list when they're the current selection.
        return e.id === selectedEmployeeId;
      }
      return true;
    });

    // (c) request conflict — hidden by default; toggle restores them.
    let requestHiddenCount = 0;
    const requestOk = sameDayOk.filter(function (e) {
      const conflict = findRequestConflict(requests, e.id, dateIso);
      if (conflict && !showRequestBlocked) {
        requestHiddenCount++;
        return e.id === selectedEmployeeId;
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

    return {
      list: requestOk,
      requestHiddenCount: requestHiddenCount,
      sameDayHiddenCount: sameDayHiddenCount,
    };
  }, [slotDef, employees, requests, weekShifts, dateIso, currentShiftId, showRequestBlocked, showSameDayStaff, selectedEmployeeId]);

  const eligibleEmployees = eligible.list;

  // v15.3.0: Enter saves the shift. Mirror of the Save button's
  // `disabled={!valid}` gate plus the readOnly hide, computed null-safe so
  // this hook can sit above the `!slotDef` early return (hooks run
  // unconditionally). handleSave (below, hoisted) re-checks validity + the
  // same-day guard, so this is belt-and-braces.
  const enterCanSave =
    open && !readOnly && Boolean(slotDef) &&
    Boolean(form.start && form.end && form.start < form.end) &&
    !((slotDef && !slotDef.isDay) && form.employeeId && !form.role);
  // v16.0.0: during ModalPresence's 200ms exit the cached element still
  // carries open={true}, so a stray Enter would re-fire the primary
  // action on a modal that is already closing. Gate on !leaving.
  const { leaving } = usePresence();
  useEnterSubmit(open && !leaving, enterCanSave, handleSave);
  // v15.3.0: Esc closes the cell editor (read-only mode included — the
  // footer there is a single Close, and onClose is the same handler).
  useEscClose(open, onClose);

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

    // v16.0.0: the v0.8.0 same-day refusal used to live here — it hard-
    // blocked the save when the chosen employee already worked this date.
    // Split shifts are now a legitimate manual action, so the block is
    // gone; `splitShiftBanner` below warns instead and the save proceeds.
    // The auto-generator keeps its own HARD same-day filter, so it can
    // still never create a split by itself.

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

  // v0.8.0: the empty-list note has to account for three filters (role,
  // same-day, request). Surface the most actionable explanation.
  // v16.0.0: both the same-day and request filters are now reversible via
  // toggles, so the copy points at whichever one is actually hiding people
  // rather than implying the list is final.
  const anyHidden = eligible.requestHiddenCount > 0 || eligible.sameDayHiddenCount > 0;
  const noEligibleNote = eligibleEmployees.length === 0
    ? (
      <p style={{ ...S.muted, marginTop: 6, fontSize: 11 }}>
        {anyHidden
          ? "Everyone who fits this slot is hidden by a filter below — they're either already working this date or have a day-off / holiday request. Use the toggles to include them."
          : "No active employees have a role that fits this slot."}
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
          className="mgt-hover-scale"
        />
      </div>
    )
    : null;

  // v16.0.0: the split-shift counterpart. Same shape as the request toggle
  // above — only rendered when it has something to reveal (or is already
  // on, which happens when this cell is one half of an existing split).
  const sameDayToggle = eligible.sameDayHiddenCount > 0 || showSameDayStaff
    ? (
      <div style={{ marginTop: 8 }}>
        <Toggle
          checked={showSameDayStaff}
          onChange={setShowSameDayStaff}
          label="Show staff already working this date"
          helper={
            !showSameDayStaff && eligible.sameDayHiddenCount > 0
              ? eligible.sameDayHiddenCount + " hidden — picking one creates a split shift"
              : null
          }
          className="mgt-hover-scale"
        />
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
  let maxConsecutiveWarning = false;
  if (form.employeeId) {
    const weekStart = startOfWeek(parseIsoDate(dateIso));
    const sim = { ...weekShifts };
    if (currentShiftId) delete sim[currentShiftId];
    sim["__sim_preview"] = {
      id: "__sim_preview",
      employeeId: form.employeeId,
      date: dateIso,
    };
    const opts = {
      priorWeekShifts: priorWeekShifts,
      nextWeekShifts: nextWeekShifts,
    };
    // v1.11.0: pass configured min/max into the helpers. Both fall back
    // to the helper's own defaults (2 and 5) when the prop is missing
    // — preserves pre-v1.11.0 callers' behaviour.
    restWarning = !hasConsecutiveDaysOff(
      form.employeeId, weekStart, sim, minConsecutiveDaysOff, opts
    );
    // v1.8.0 amendment: companion wellness check — max N consecutive
    // working days across the 21-day [prior, focus, next] window.
    maxConsecutiveWarning = !withinMaxConsecutiveWorkingDays(
      form.employeeId, weekStart, sim, maxConsecutiveWorkingDays, opts
    );
  }

  const warningBoxStyle = {
    marginTop: 6,
    padding: "8px 10px",
    background: "var(--bg-warning-tint)",
    border: "1px solid var(--border-warning-tint)",
    color: "var(--text-warning)",
    borderRadius: R.card,
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

  // v16.0.0: split-shift warning. Fires whenever the currently-selected
  // assignee already holds another shift on this date — which, since
  // v16.0.0, is allowed rather than refused. Named so the manager can see
  // exactly what they're stacking onto (e.g. "Kitchen Day, 11:00–16:00"),
  // because the whole risk here is an accidental 12-hour straight day.
  //
  // No simulation needed, unlike the rest/max-consecutive warnings below:
  // the clash is a fact about existing records, not about what this
  // assignment would imply.
  const sameDayShifts = form.employeeId
    ? findSameDayShifts(weekShifts, form.employeeId, dateIso, currentShiftId)
    : [];
  const splitShiftBanner = sameDayShifts.length > 0
    ? (
      <div style={warningBoxStyle}>
        ⚠ <strong>Split shift.</strong> This employee is already on{" "}
        {sameDayShifts.map(function (s, i) {
          const def = s.section && s.dayPart
            ? (SECTIONS[s.section] ? SECTIONS[s.section].label : s.section)
              + " " + (s.dayPart === "day" ? "Day" : "Evening")
            : "another shift";
          const time = s.start && s.end ? " (" + s.start + "–" + s.end + ")" : "";
          return (
            <span key={s.id || i}>
              {i > 0 ? " and " : ""}<strong>{def}</strong>{time}
            </span>
          );
        })}{" "}
        on {dateIso}. Saving gives them both. You can still save; this is
        just a warning.
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

  // v1.11.0: copy uses the configured min/max instead of hard-coding
  // "2" and "5". Falls back to the helper defaults when the prop is
  // missing, keeping the message accurate even for legacy callers.
  const minOffForCopy = Number.isFinite(minConsecutiveDaysOff) ? minConsecutiveDaysOff : 2;
  const maxConsecForCopy = Number.isFinite(maxConsecutiveWorkingDays) ? maxConsecutiveWorkingDays : 5;
  const restWarningBanner = restWarning
    ? (
      <div style={warningBoxStyle}>
        ⚠ Saving this would leave this employee without {minOffForCopy} consecutive
        day{minOffForCopy === 1 ? "" : "s"} off this calendar week. You can still save; this is just a
        warning.
      </div>
    )
    : null;

  const maxConsecutiveBanner = maxConsecutiveWarning
    ? (
      <div style={warningBoxStyle}>
        ⚠ Saving this would put this employee at more than {maxConsecForCopy} consecutive
        working days. You can still save; this is just a warning.
      </div>
    )
    : null;

  // Role picker (evening only) — chip group.
  // v1.12.0: in readOnly mode the pills render as static badges (no
  // onClick, no scale-on-hover, opacity dimmed) so the historical role
  // is visible without inviting a click.
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
                className={readOnly ? undefined : "mgt-hover-scale mgt-press"}
                disabled={readOnly}
                onClick={readOnly ? undefined : function () { setField("role", on ? "" : r); }}
                style={{
                  ...BTN.base,
                  ...BTN_SIZE.md,
                  borderRadius: R.pill,
                  background: on ? "rgb(" + rgb + ")" : "var(--bg-pill)",
                  color: on ? "var(--text-on-accent)" : "var(--text-primary)",
                  border: "1px solid " + (on ? "rgb(" + rgb + ")" : "var(--btn-ghost-border)"),
                  opacity: readOnly && !on ? 0.6 : 1,
                  cursor: readOnly ? "default" : "pointer",
                }}
              >
                {r}
              </button>
            );
          })}
        </div>
        {eveningNeedsRole && !readOnly
          ? <p style={{ ...S.muted, color: "var(--text-danger)", marginTop: 6, fontSize: 11 }}>
              Pick a role for the assigned employee.
            </p>
          : null}
      </Fld>
    );

  const deleteButton = (shift && shift.id)
    ? mkBtn({ type: "button", className: "mgt-hover-scale", variant: "danger", onClick: handleDelete, children: "Clear" })
    : null;

  // v1.7.0: Move/Swap entry. Only visible when an assignment exists AND
  // the parent supplied an onStartSwap handler. Hidden for fresh / empty
  // cells (nothing to move) and for legacy callers without the prop.
  const swapButton = (shift && shift.id && shift.employeeId && onStartSwap)
    ? mkBtn({
        type: "button",
        className: "mgt-hover-scale",
        variant: "secondary",
        onClick: handleStartSwap,
        children: "Move / Swap…",
      })
    : null;

  return (
    <Overlay open={open} isMobile={isMobile} onClose={onClose} title={headerTitle}>
      <Fld label="Assignee">
        <select
          className={readOnly ? undefined : "mgt-hover-scale"}
          value={form.employeeId}
          onChange={function (e) { setField("employeeId", e.target.value); }}
          disabled={readOnly}
          style={{ ...S.inputBase, paddingRight: 28, opacity: readOnly ? 0.8 : 1 }}
        >
          {employeeOptions}
        </select>
        {noEligibleNote}
        {readOnly ? null : sameDayToggle}
        {readOnly ? null : requestToggle}
        {/* v16.0.0: the split banner leads the stack — it describes the
            single most consequential thing about this assignment (a
            12-hour straight day), so it should be the first thing read.

            phase 31: each banner gets its OWN Reveal rather than one
            around the stack. They appear and disappear independently as
            the manager changes the assignee, and a single wrapper would
            only ease the group as a whole — swapping one banner for
            another inside it would still snap. Per-banner, every case is
            smooth and the container height is just their sum.

            Each of these consts is already an element-or-null, so
            `show={Boolean(x)}` needs no change to how they're built, and
            Reveal replays the cached element through the collapse. */}
        <Reveal show={Boolean(splitShiftBanner)}>{splitShiftBanner}</Reveal>
        <Reveal show={Boolean(conflictBanner)}>{conflictBanner}</Reveal>
        <Reveal show={Boolean(prefMismatchBanner)}>{prefMismatchBanner}</Reveal>
        <Reveal show={Boolean(restWarningBanner)}>{restWarningBanner}</Reveal>
        <Reveal show={Boolean(maxConsecutiveBanner)}>{maxConsecutiveBanner}</Reveal>
      </Fld>

      {rolePicker}

      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <Fld label="Start">
            {mkInp({
              type: "time",
              className: readOnly ? undefined : "mgt-hover-scale",
              value: form.start,
              onChange: function (e) { setField("start", e.target.value); },
              disabled: readOnly,
              style: readOnly ? { opacity: 0.8 } : undefined,
            })}
          </Fld>
        </div>
        <div style={{ flex: 1 }}>
          <Fld label="End">
            {mkInp({
              type: "time",
              className: readOnly ? undefined : "mgt-hover-scale",
              value: form.end,
              onChange: function (e) { setField("end", e.target.value); },
              disabled: readOnly,
              style: readOnly ? { opacity: 0.8 } : undefined,
            })}
          </Fld>
        </div>
      </div>

      {!timesValid && !readOnly
        ? <p style={{ ...S.muted, color: "var(--text-danger)", fontSize: 12, marginTop: -4 }}>
            End time must be after start time.
          </p>
        : null}

      {/* v1.12.0: reset-to-defaults button is hidden in read-only mode —
          no point offering a mutation affordance the manager can't act on. */}
      {readOnly ? null : (
        <div style={{ marginTop: 4 }}>
          <button
            type="button"
            className="mgt-hover-scale mgt-press"
            onClick={resetToDefaults}
            style={{ ...BTN.base, ...BTN.ghost, ...BTN_SIZE.sm }}
          >
            Reset times & role to template defaults
          </button>
        </div>
      )}

      {/* v1.12.0: bottom action row branches on readOnly. Read-only weeks
          collapse the row to a single Close button so historical inspection
          stays cleanly view-only; current/future weeks render the full
          Clear / Move-Swap / Cancel / Save set as before. */}
      {readOnly ? (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          {mkBtn({ type: "button", className: "mgt-hover-scale", variant: "primary", onClick: onClose, children: "Close" })}
        </div>
      ) : (
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
            {mkBtn({ type: "button", className: "mgt-hover-scale", variant: "ghost", onClick: onClose, children: "Cancel" })}
            {mkBtn({
              type: "button",
              className: "mgt-hover-scale",
              variant: "primary",
              onClick: handleSave,
              disabled: !valid,
              style: { opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" },
              children: "Save",
            })}
          </div>
        </div>
      )}
    </Overlay>
  );
}
