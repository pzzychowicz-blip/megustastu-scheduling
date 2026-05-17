// src/lib/schedule-logic.js
// Pure helpers for the weekly schedule.
//
// Responsibilities:
//   - Week-date math (Monday-start, ISO formatting).
//   - Slot enumeration from the shift template.
//   - Matching existing shift records to slots.
//   - Deriving display state for a cell.
//
// NO React. NO Firebase. Just data in → data out. Easy to reason about.

import { SECTIONS } from "./constants.js";

// ── ISO date helpers ─────────────────────────────────────────────────────
// We use "YYYY-MM-DD" strings as the canonical date identifier in Firebase
// — timezone-free, sortable, human-readable. JS Date is only used for math
// (week derivation, day-of-week).

export function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

export function parseIsoDate(str) {
  // Parse as local time, NOT UTC. Avoid Date(str) which is UTC-flavoured.
  const parts = String(str).split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

// Monday-start week. JS treats Sunday as day 0; we shift so Monday = 0.
export function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();              // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function weekDates(startDate) {
  const arr = [];
  for (let i = 0; i < 7; i++) arr.push(addDays(startDate, i));
  return arr;
}

// ── Opening-days filter (v0.12.0, per-day-part since v1.3.0) ────────────
// Map a JS Date to the WEEKDAYS key used by /settings.openingDays. We do
// our own table here instead of importing WEEKDAYS to keep this module
// dependency-light (it's loaded by pdf-export which is a lazy chunk).
// Mon = 0 in the WEEKDAYS array; JS getDay() returns 0=Sun..6=Sat.
const WEEKDAY_KEY_FROM_JS_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function weekdayKeyForDate(date) {
  return WEEKDAY_KEY_FROM_JS_DAY[date.getDay()];
}

// v1.3.0: per-day-part opening shape. Each weekday is
// `{ day: bool, evening: bool }`. `normalizeOpeningDays` accepts either
// the new object shape OR the legacy boolean shape (a v0.12.0 settings
// doc) and returns a fully-populated normalized map. Missing weekdays
// fall back to "both open" so a partial doc renders the rest as open.
//
// Legacy migration:
//   true   → { day: true,  evening: true  }  (was: full day open)
//   false  → { day: false, evening: false }  (was: full day closed)
//
// Used by every consumer (visibleWeekDates, isSlotOpenOnDate, Settings,
// PDF export, generator). Cheap — clones the seven entries on every call.
export function normalizeOpeningDays(raw) {
  const out = {};
  for (let i = 0; i < WEEKDAY_KEYS.length; i++) {
    const k = WEEKDAY_KEYS[i];
    const v = raw ? raw[k] : undefined;
    if (v === true) {
      out[k] = { day: true, evening: true };
    } else if (v === false) {
      out[k] = { day: false, evening: false };
    } else if (v && typeof v === "object") {
      out[k] = { day: v.day === true, evening: v.evening === true };
    } else {
      // Missing key → default to fully open. Matches DEFAULT_OPENING_DAYS.
      out[k] = { day: true, evening: true };
    }
  }
  return out;
}

// True iff at least one of (day, evening) is open for the given date.
// Fully-closed days drop out of `visibleWeekDates`.
export function isDateOpen(openingDays, date) {
  const norm = normalizeOpeningDays(openingDays);
  const entry = norm[weekdayKeyForDate(date)];
  return Boolean(entry && (entry.day || entry.evening));
}

// True iff the slot's dayPart is open on the given date. Drives per-cell
// rendering in ScheduleGrid + PDF export and per-cell worklist building
// in the generator. Always reads through `normalizeOpeningDays` so a raw
// settings doc (object or legacy boolean) works without callers caring.
export function isSlotOpenOnDate(date, slot, openingDays) {
  if (!slot || !slot.dayPart) return false;
  const norm = normalizeOpeningDays(openingDays);
  const entry = norm[weekdayKeyForDate(date)];
  if (!entry) return false;
  return entry[slot.dayPart] === true;
}

// Returns the subset of weekDates(startDate) where AT LEAST ONE dayPart
// is open. Undefined / missing openingDays falls back to fully-open
// (legacy behaviour — `normalizeOpeningDays` defaults missing entries to
// both true).
export function visibleWeekDates(startDate, openingDays) {
  const dates = weekDates(startDate);
  if (!openingDays) return dates;
  const norm = normalizeOpeningDays(openingDays);
  return dates.filter(function (d) {
    const entry = norm[weekdayKeyForDate(d)];
    return Boolean(entry && (entry.day || entry.evening));
  });
}

// ── Display formatting ───────────────────────────────────────────────────

const SHORT_DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function formatDayHeader(date) {
  // "Mon 12 May"
  return SHORT_DAY[date.getDay()] + " " + date.getDate() + " " + SHORT_MONTH[date.getMonth()];
}

export function formatWeekRange(startDate) {
  // "12–18 May 2026"   or   "29 Apr–5 May 2026"  when month flips
  const end = addDays(startDate, 6);
  const startMonth = SHORT_MONTH[startDate.getMonth()];
  const endMonth = SHORT_MONTH[end.getMonth()];
  if (startDate.getMonth() === end.getMonth() && startDate.getFullYear() === end.getFullYear()) {
    return startDate.getDate() + "–" + end.getDate() + " " + endMonth + " " + end.getFullYear();
  }
  return startDate.getDate() + " " + startMonth + "–" + end.getDate() + " " + endMonth + " " + end.getFullYear();
}

// ── Slot enumeration ─────────────────────────────────────────────────────
// Given a shift template, return the ordered list of slots that exist on
// each day. Each slot definition has stable identity via
// (section, dayPart, slotIndex) — that's the key we match shift records on.
//
// v0.8.0 order: Kitchen Day → Kitchen Evening → FoH Day → FoH Evening.
// The schedule grid and the PDF export both consume slots in this order;
// flipping it here cascades to both surfaces. Slot record IDs (the
// `key` field) are unchanged so existing /shifts/{id} records still match.
//
// v0.8.0 evening default roles: slot 0 / 1 / 2 of an evening block get a
// `defaultRole` of SECTIONS[section].roles[index], or null when index
// exceeds the section's role list. The shift modal prefills `form.role`
// from this for new shifts; existing shift records' `role` field is
// always preferred.
function defaultRoleForSlot(section, dayPart, index) {
  if (dayPart !== "evening") return null;  // day shifts cover all roles → role stays null
  const roles = SECTIONS[section] && SECTIONS[section].roles;
  if (!Array.isArray(roles)) return null;
  return roles[index] || null;
}

export function slotsForDay(template) {
  const slots = [];

  // Kitchen day
  const kitDay = template.kitchen.day;
  for (let i = 0; i < kitDay.count; i++) {
    slots.push({
      key: "kitchen-day-" + i,
      section: "kitchen",
      dayPart: "day",
      slotIndex: i,
      defaultStart: kitDay.start,
      defaultEnd: kitDay.end,
      defaultRole: null,
      sectionLabel: SECTIONS.kitchen.label,
      dayPartLabel: "Day",
      // Day-shift roles are null in the data model (one person covers all
      // section roles). We still surface the roles list to the modal so it
      // can show "covers Chef + Plating + Pot".
      coversRoles: SECTIONS.kitchen.roles,
      // v1.1.0: required role(s) for this day slot. When set, the picker
      // and generator demand the employee hold AT LEAST ONE of these
      // roles (not just any of coversRoles). Empty / undefined keeps the
      // permissive "any of coversRoles" v1.0 behaviour.
      requiredRoles: SECTIONS.kitchen.dayRequiredRoles || [],
      isDay: true,
      humanLabel: kitDay.count > 1 ? "Kitchen Day " + (i + 1) : "Kitchen Day",
    });
  }

  // Kitchen evening
  const kitEve = template.kitchen.evening;
  for (let i = 0; i < kitEve.count; i++) {
    slots.push({
      key: "kitchen-evening-" + i,
      section: "kitchen",
      dayPart: "evening",
      slotIndex: i,
      defaultStart: kitEve.start,
      defaultEnd: kitEve.end,
      defaultRole: defaultRoleForSlot("kitchen", "evening", i),
      sectionLabel: SECTIONS.kitchen.label,
      dayPartLabel: "Evening",
      eligibleRoles: SECTIONS.kitchen.roles,  // Chef / Plating / Pot
      isDay: false,
      humanLabel: "Kitchen Evening " + (i + 1),
    });
  }

  // FoH day
  const fohDay = template.foh.day;
  for (let i = 0; i < fohDay.count; i++) {
    slots.push({
      key: "foh-day-" + i,
      section: "foh",
      dayPart: "day",
      slotIndex: i,
      defaultStart: fohDay.start,
      defaultEnd: fohDay.end,
      defaultRole: null,
      sectionLabel: SECTIONS.foh.label,
      dayPartLabel: "Day",
      coversRoles: SECTIONS.foh.roles,
      // v1.1.0: FoH has no dayRequiredRoles → empty list keeps the
      // permissive "any of Bar/Floor" rule.
      requiredRoles: SECTIONS.foh.dayRequiredRoles || [],
      isDay: true,
      humanLabel: fohDay.count > 1 ? "FoH Day " + (i + 1) : "FoH Day",
    });
  }

  // FoH evening (position 0 starts at evening.start; position 1+ at secondPersonStart)
  const fohEve = template.foh.evening;
  for (let i = 0; i < fohEve.count; i++) {
    const start = i === 0 ? fohEve.start : (fohEve.secondPersonStart || fohEve.start);
    slots.push({
      key: "foh-evening-" + i,
      section: "foh",
      dayPart: "evening",
      slotIndex: i,
      defaultStart: start,
      defaultEnd: fohEve.end,
      defaultRole: defaultRoleForSlot("foh", "evening", i),
      sectionLabel: SECTIONS.foh.label,
      dayPartLabel: "Evening",
      eligibleRoles: SECTIONS.foh.roles,   // Bar or Floor — pick one
      isDay: false,
      humanLabel: "FoH Evening " + (i + 1),
    });
  }

  return slots;
}

// ── Shift ↔ slot matching ────────────────────────────────────────────────

export function findShiftForSlot(shiftsMap, dateIso, slotDef) {
  // shiftsMap: { [id]: shift }. Linear scan — small N (max ~50/week).
  const all = Object.values(shiftsMap || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (
      s.date === dateIso &&
      s.section === slotDef.section &&
      s.dayPart === slotDef.dayPart &&
      (s.slotIndex || 0) === slotDef.slotIndex
    ) {
      return s;
    }
  }
  return null;
}

// Given the existing shift record (or null) + the slot definition,
// derive what the cell should DISPLAY. Defaults come from the template
// when no record exists.
export function deriveCellState(shift, slotDef) {
  if (shift) {
    return {
      employeeId: shift.employeeId || null,
      start: shift.start || slotDef.defaultStart,
      end: shift.end || slotDef.defaultEnd,
      role: shift.role || null,
      shiftId: shift.id,
      hasRecord: true,
    };
  }
  return {
    employeeId: null,
    start: slotDef.defaultStart,
    end: slotDef.defaultEnd,
    role: null,
    shiftId: null,
    hasRecord: false,
  };
}

// ── Same-day double-booking check (v0.8.0) ───────────────────────────────
// STRICT rule: a single employee cannot hold more than one shift on the
// same date — covers day + evening on the same Tuesday too (a 12-hour
// straight stretch is a labour-law red flag and almost always manager
// error). Enforced both by filtering the picker dropdown AND by a final
// guard in the shift modal's save handler.
//
// `excludeShiftId` lets the caller skip the shift currently being edited
// so the assignment doesn't conflict with itself.
//
// Returns the FIRST matching shift record, or null.
export function findSameDayShift(shiftsMap, employeeId, dateIso, excludeShiftId) {
  if (!employeeId || !dateIso) return null;
  const all = Object.values(shiftsMap || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (!s.employeeId || s.employeeId !== employeeId) continue;
    if (s.date !== dateIso) continue;
    if (excludeShiftId && s.id === excludeShiftId) continue;
    return s;
  }
  return null;
}

// ── Request ↔ shift conflict matching ────────────────────────────────────
// A request "covers" a date when dateFrom <= dateIso <= dateTo (inclusive
// on both ends). Half-day requests are NOT supported in v1 — full-day only.
// String compare works for "YYYY-MM-DD" (ISO 8601 lexicographic = chronological).
//
// v1.2.0: type-guarded. Only `dayoff` and `holiday` block a date entirely.
// The new `shift-preference` type narrows a dayPart instead and is handled
// by `findShiftPreferenceMismatch`. Any future blocking type can be added
// to BLOCKING_REQUEST_TYPES below.
//
// Returns the FIRST matching request record, or null. We don't surface a
// list because the modal banner shows one record at a time and overlapping
// requests for the same employee+date should not happen in practice.
const BLOCKING_REQUEST_TYPES = { dayoff: true, holiday: true };

export function findRequestConflict(requestsMap, employeeId, dateIso) {
  if (!employeeId || !dateIso) return null;
  const all = Object.values(requestsMap || {});
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (r.employeeId !== employeeId) continue;
    if (!BLOCKING_REQUEST_TYPES[r.type]) continue;
    if (!r.dateFrom || !r.dateTo) continue;
    if (r.dateFrom <= dateIso && dateIso <= r.dateTo) return r;
  }
  return null;
}

// v1.2.0: shift-preference mismatch.
//
// A `shift-preference` request says: "only schedule me for Day shifts
// on these dates" (or only Evening). When trying to place this employee
// on a slot whose `dayPart` differs from the request's `preferredDayPart`,
// it's a mismatch — HARD block in the generator, SOFT warning in the
// manual picker.
//
// Returns the FIRST mismatching request, or null. A matching preference
// request (preferredDayPart === dayPart) returns null too — the request
// is satisfied, no conflict.
export function findShiftPreferenceMismatch(requestsMap, employeeId, dateIso, dayPart) {
  if (!employeeId || !dateIso || !dayPart) return null;
  const all = Object.values(requestsMap || {});
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (r.employeeId !== employeeId) continue;
    if (r.type !== "shift-preference") continue;
    if (!r.preferredDayPart) continue; // defensive: malformed request → skip
    if (!r.dateFrom || !r.dateTo) continue;
    if (r.dateFrom <= dateIso && dateIso <= r.dateTo) {
      if (r.preferredDayPart !== dayPart) return r;
    }
  }
  return null;
}

// ── Consecutive days off check (v1.2.0) ──────────────────────────────────
// Labour wellness rule: every employee needs at least N consecutive days
// off per calendar week (Mon..Sun). v1.2.0 ships with N=2.
//
// Algorithm:
//   - Build a 7-element array indexed by day-of-week (Mon=0..Sun=6).
//     Each cell = true if the employee is "off" that day, false if
//     they're working (have a shift in `shiftsMap` on that date).
//   - Closed days count as off (the employee can't work them).
//   - Scan for any run of `minConsecutive` consecutive `true` cells.
//
// The week boundary is Mon..Sun starting at `weekStart`. NO cross-week
// wrapping: Sun ↔ next-Mon doesn't count as consecutive. Keeps the rule
// evaluable per-week independently.
//
// `shiftsMap` may include the proposed shift (caller simulates the
// assignment) so the generator can test "would adding this break the
// rule?" without mutating state.
export function hasConsecutiveDaysOff(employeeId, weekStart, shiftsMap, minConsecutive) {
  if (!employeeId || !weekStart) return true;
  const min = minConsecutive || 2;

  // Build working/off booleans for each day Mon..Sun.
  const isWorking = [false, false, false, false, false, false, false];
  const dates = weekDates(weekStart);
  const dateToIndex = {};
  for (let i = 0; i < 7; i++) dateToIndex[isoDate(dates[i])] = i;

  const all = Object.values(shiftsMap || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (!s || s.employeeId !== employeeId) continue;
    const idx = dateToIndex[s.date];
    if (idx === undefined) continue; // shift outside the week
    isWorking[idx] = true;
  }

  // Scan for a run of `min` consecutive off (= !working) cells.
  let run = 0;
  for (let i = 0; i < 7; i++) {
    if (!isWorking[i]) {
      run++;
      if (run >= min) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

// ── Convenience: filter shifts by week ───────────────────────────────────
// Returns only shift records whose `date` falls within [startDate, startDate+6].
// Useful for the week view — keeps prop sizes small if the DB grows large.
export function shiftsForWeek(shiftsMap, weekStartDate) {
  const dates = weekDates(weekStartDate).map(isoDate);
  const set = new Set(dates);
  const out = {};
  const all = Object.entries(shiftsMap || {});
  for (let i = 0; i < all.length; i++) {
    const entry = all[i];
    if (set.has(entry[1].date)) out[entry[0]] = entry[1];
  }
  return out;
}

// ── Week completeness check (gates PDF export) ───────────────────────────
// Returns true iff EVERY (date, slot) on every OPEN dayPart has a shift
// record with a non-null employeeId. Used by ExportButton — the locked v1
// decision is to refuse exporting partial weeks (the printed rota would
// be misleading).
//
// v0.12.0: `openingDays` (optional) scopes to open days only. Closed days
// don't contribute cells, so they don't need fills. Omitted → all 7 days
// counted.
// v1.3.0: cells where the slot's dayPart is closed on that date are also
// skipped (a Day-only Monday's evening slots no longer need to be filled
// to export). Goes through `isSlotOpenOnDate` so legacy boolean docs
// still work via normalization.
// If every day is closed (visible dates empty), the rota is vacuously
// "empty"; return false so the export button stays disabled rather than
// emitting an empty PDF.
export function isWeekComplete(weekShifts, weekStartDate, slots, openingDays) {
  const dates = visibleWeekDates(weekStartDate, openingDays);
  if (dates.length === 0) return false;
  for (let d = 0; d < dates.length; d++) {
    const dIso = isoDate(dates[d]);
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      if (!isSlotOpenOnDate(dates[d], slot, openingDays)) continue;
      const shift = findShiftForSlot(weekShifts, dIso, slot);
      if (!shift || !shift.employeeId) return false;
    }
  }
  return true;
}
