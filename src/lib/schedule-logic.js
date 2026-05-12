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

export function slotsForDay(template) {
  const slots = [];

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
      sectionLabel: SECTIONS.foh.label,
      dayPartLabel: "Day",
      // Day-shift roles are null in the data model (one person covers all
      // section roles). We still surface the roles list to the modal so it
      // can show "covers Bar + Floor".
      coversRoles: SECTIONS.foh.roles,
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
      sectionLabel: SECTIONS.foh.label,
      dayPartLabel: "Evening",
      eligibleRoles: SECTIONS.foh.roles,   // Bar or Floor — pick one
      isDay: false,
      humanLabel: "FoH Evening " + (i + 1),
    });
  }

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
      sectionLabel: SECTIONS.kitchen.label,
      dayPartLabel: "Day",
      coversRoles: SECTIONS.kitchen.roles,
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
      sectionLabel: SECTIONS.kitchen.label,
      dayPartLabel: "Evening",
      eligibleRoles: SECTIONS.kitchen.roles,  // Chef / Plating / Pot
      isDay: false,
      humanLabel: "Kitchen Evening " + (i + 1),
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

// ── Request ↔ shift conflict matching ────────────────────────────────────
// A request "covers" a date when dateFrom <= dateIso <= dateTo (inclusive
// on both ends). Half-day requests are NOT supported in v1 — full-day only.
// String compare works for "YYYY-MM-DD" (ISO 8601 lexicographic = chronological).
//
// Returns the FIRST matching request record, or null. We don't surface a
// list because the modal banner shows one record at a time and overlapping
// requests for the same employee+date should not happen in practice.
export function findRequestConflict(requestsMap, employeeId, dateIso) {
  if (!employeeId || !dateIso) return null;
  const all = Object.values(requestsMap || {});
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (r.employeeId !== employeeId) continue;
    if (!r.dateFrom || !r.dateTo) continue;
    if (r.dateFrom <= dateIso && dateIso <= r.dateTo) return r;
  }
  return null;
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
// Returns true iff EVERY (date, slot) in the week has a shift record with
// a non-null employeeId. Used by ExportButton — the locked v1 decision is
// to refuse exporting partial weeks (the printed rota would be misleading).
export function isWeekComplete(weekShifts, weekStartDate, slots) {
  const dates = weekDates(weekStartDate);
  for (let d = 0; d < dates.length; d++) {
    const dIso = isoDate(dates[d]);
    for (let s = 0; s < slots.length; s++) {
      const shift = findShiftForSlot(weekShifts, dIso, slots[s]);
      if (!shift || !shift.employeeId) return false;
    }
  }
  return true;
}
