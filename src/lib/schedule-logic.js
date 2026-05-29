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

import { SECTIONS, OPERATING_HOURS, DEFAULT_DAY_REQUIRED_ROLES } from "./constants.js";

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

// v1.12.0: a week is "past" iff its Sunday is strictly before today.
// `weekStart` is the Monday-anchored Date; `todayIso` is the canonical
// "YYYY-MM-DD" string of today's date. ISO date strings compare
// lexicographically the same as chronologically, so direct < works.
//
// Used by ScheduleGrid to gate write paths (Generate / Swap / Clear /
// Undo buttons + ShiftFormModal save) when the manager has navigated
// to a historical week. Cells stay viewable; only mutations are blocked.
// The current week stays editable for the whole Mon..Sun span; the
// gate flips the first moment the manager moves forward into a new
// week (Monday morning their local time).
export function isPastWeek(weekStart, todayIso) {
  const sundayIso = isoDate(addDays(weekStart, 6));
  return sundayIso < todayIso;
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

// ── Shift template migration (v1.10.1) ───────────────────────────────────
// v1.9.0 changed the /shiftTemplate per-block shape from
//   { count, start, end, secondPersonStart? }
// to the per-slot form
//   { count, times: [{start, end}, ...] }
// Pre-v1.10.1, migration was lazy — `slotTimeFor` below reads either shape,
// and Settings.jsx rewrote the doc to the new shape on the next manual
// Save click. That left untouched legacy docs sitting in Firebase
// indefinitely (DEV projects, project clones, restored backups), each
// quietly relying on the read-side fallback.
//
// v1.10.1 ships an EAGER migration. `AppShell` calls
// `materializeShiftTemplate(data.shiftTemplate)` once per session after
// the persistence layer reports ready; if `isShiftTemplateMigrated`
// returns false, the canonicalised doc is written back via
// `saveShiftTemplate(..., true /* isSilent */)`. The legacy fallback in
// `slotTimeFor` stays in place — defensive belt for in-flight reads
// before the eager write completes, and for any future legacy state we
// don't anticipate (manual Firebase console edits, etc.).
//
// `materializeShiftTemplate` matches Settings.jsx's `materializeBlock`
// byte-for-byte (this file is the single source of truth as of v1.10.1
// — Settings.jsx now imports and delegates). Both helpers below treat a
// null template as "nothing to migrate"; callers shouldn't synthesise
// defaults here (that's the consumer's job via DEFAULT_SHIFT_TEMPLATE).

function isBlockMigrated(block) {
  if (!block || typeof block !== "object") return false;
  if (typeof block.count !== "number") return false;
  if (!Array.isArray(block.times)) return false;
  if (block.times.length !== block.count) return false;
  for (let i = 0; i < block.times.length; i++) {
    const t = block.times[i];
    if (!t || !t.start || !t.end) return false;
  }
  // Lingering legacy fields would be dropped by a rewrite — flag them so
  // the eager migration cleans the record even if `times` is also valid.
  if ("start" in block || "end" in block || "secondPersonStart" in block) return false;
  return true;
}

export function isShiftTemplateMigrated(template) {
  if (!template || typeof template !== "object") return true;
  return (
    isBlockMigrated(template.foh && template.foh.day) &&
    isBlockMigrated(template.foh && template.foh.evening) &&
    isBlockMigrated(template.kitchen && template.kitchen.day) &&
    isBlockMigrated(template.kitchen && template.kitchen.evening)
  );
}

export function materializeShiftTemplateBlock(block, sectionKey, dayPart) {
  if (!block || typeof block !== "object") {
    return { count: 1, times: [{ start: OPERATING_HOURS.start, end: OPERATING_HOURS.end }] };
  }
  const rawCount = block.count;
  const count = Number.isFinite(rawCount) && rawCount >= 1 ? Math.round(rawCount) : 1;
  const existing = Array.isArray(block.times) ? block.times : [];
  const fallbackStart = block.start || OPERATING_HOURS.start;
  const fallbackEnd = block.end || OPERATING_HOURS.end;
  const fohEveningSecondStart = sectionKey === "foh" && dayPart === "evening" && block.secondPersonStart
    ? block.secondPersonStart
    : null;
  const times = [];
  for (let i = 0; i < count; i++) {
    const t = existing[i];
    if (t && t.start && t.end) {
      times.push({ start: t.start, end: t.end });
      continue;
    }
    const legacyStart = i > 0 && fohEveningSecondStart ? fohEveningSecondStart : fallbackStart;
    times.push({ start: legacyStart, end: fallbackEnd });
  }
  return { count: count, times: times };
}

export function materializeShiftTemplate(template) {
  if (!template || typeof template !== "object") return null;
  return {
    foh: {
      day: materializeShiftTemplateBlock(template.foh && template.foh.day, "foh", "day"),
      evening: materializeShiftTemplateBlock(template.foh && template.foh.evening, "foh", "evening"),
    },
    kitchen: {
      day: materializeShiftTemplateBlock(template.kitchen && template.kitchen.day, "kitchen", "day"),
      evening: materializeShiftTemplateBlock(template.kitchen && template.kitchen.evening, "kitchen", "evening"),
    },
  };
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

// v1.9.0: pull per-slot default times from a block. Reads from the new
// `times` array when present; falls back to the legacy v0.5.0 shape
// (single `start`/`end` per block, plus FoH-evening `secondPersonStart`
// for slot 1+) when the saved doc predates the per-slot model. Settings
// migrates on save, so legacy reads should be rare — but `slotsForDay`
// is the read path for every consumer (grid, modal, generator, PDF
// export) so the fallback has to live here, not just in Settings.
function slotTimeFor(block, sectionKey, dayPart, index) {
  if (Array.isArray(block.times)) {
    const t = block.times[index];
    if (t && t.start && t.end) return { start: t.start, end: t.end };
  }
  // Legacy fallback. FoH evening slot 1+ honours secondPersonStart.
  let start = block.start;
  if (sectionKey === "foh" && dayPart === "evening" && index > 0 && block.secondPersonStart) {
    start = block.secondPersonStart;
  }
  return { start: start, end: block.end };
}

// v1.12.0: resolver that takes a /settings.dayRequiredRoles value (which may
// be a v1.12.0 per-role boolean object, a v1.11.0 array of role names, or
// missing entirely) and returns the canonical array of required role names
// for a single section. Used by `slotsForDay` and by Settings.jsx so both
// stay in lockstep about how to interpret the saved value.
//
// Why this exists: v1.11.0 stored dayRequiredRoles as `{foh: [...],
// kitchen: [...]}`. Firebase RTDB strips empty arrays to null on write,
// so when the manager deselected Chef (Kitchen → []) Firebase wrote
// nothing back, the resolver fell back to `DEFAULT_DAY_REQUIRED_ROLES`
// (which had `kitchen: ["Chef"]`), and the pill sprang back into the
// selected state on next render. v1.12.0 swaps to per-role booleans
// (`{foh: {Bar: false, Floor: false}, kitchen: {Chef: false, ...}}`).
// Firebase preserves `false`, so the configured-but-permissive state
// survives a round-trip. The legacy v1.11.0 array shape stays readable
// here for back-compat — first write from the new pill UI replaces it
// with the boolean object.
//
// Returns role names in SECTIONS source order so the array is canonical.
export function resolveDayRequiredRoles(settingsValue, sectionKey) {
  const sectionRoles = (SECTIONS[sectionKey] && SECTIONS[sectionKey].roles) || [];
  const raw = settingsValue && typeof settingsValue === "object"
    ? settingsValue[sectionKey]
    : null;

  // v1.12.0: per-role boolean object.
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return sectionRoles.filter(function (role) { return raw[role] === true; });
  }
  // v1.11.0 legacy: array of role names. Filter to SECTIONS source order
  // so consumers don't have to.
  if (Array.isArray(raw)) {
    return sectionRoles.filter(function (role) { return raw.indexOf(role) !== -1; });
  }
  // Missing — fall back to DEFAULT_DAY_REQUIRED_ROLES, which is itself the
  // new per-role boolean shape. Same filter pattern.
  const fallback = DEFAULT_DAY_REQUIRED_ROLES[sectionKey];
  if (fallback && typeof fallback === "object" && !Array.isArray(fallback)) {
    return sectionRoles.filter(function (role) { return fallback[role] === true; });
  }
  if (Array.isArray(fallback)) {
    return sectionRoles.filter(function (role) { return fallback.indexOf(role) !== -1; });
  }
  return [];
}

// v1.11.0: optional second arg `dayRequiredRolesOverride` lets callers pass
// a configured per-section required-role map (from /settings.dayRequiredRoles).
//
// v1.12.0: accepts BOTH the v1.12.0 per-role boolean object shape
// (`{foh: {Bar: false, Floor: false}, kitchen: {Chef: true, ...}}`) and
// the legacy v1.11.0 array shape (`{foh: [...], kitchen: [...]}`) via
// the shared `resolveDayRequiredRoles` helper. The schema flipped to
// per-role booleans because Firebase RTDB strips empty arrays to null,
// which broke v1.11.0's "configured empty" state for Kitchen (the Chef
// pill kept springing back). Booleans survive the round-trip.
//
// When the override is null/undefined OR a section's entry is neither
// an array nor a boolean object, the resolver falls back to
// `DEFAULT_DAY_REQUIRED_ROLES[section]` — which mirrors the pre-v1.11.0
// SECTIONS hard-coded default. Bare callers (tests, legacy code paths)
// continue to work without modification.
export function slotsForDay(template, dayRequiredRolesOverride) {
  const slots = [];

  const kitchenRequired = resolveDayRequiredRoles(dayRequiredRolesOverride, "kitchen");
  const fohRequired = resolveDayRequiredRoles(dayRequiredRolesOverride, "foh");

  // Kitchen day
  const kitDay = template.kitchen.day;
  for (let i = 0; i < kitDay.count; i++) {
    const t = slotTimeFor(kitDay, "kitchen", "day", i);
    slots.push({
      key: "kitchen-day-" + i,
      section: "kitchen",
      dayPart: "day",
      slotIndex: i,
      defaultStart: t.start,
      defaultEnd: t.end,
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
      // v1.11.0: resolved from /settings override when present; falls back
      // to SECTIONS.kitchen.dayRequiredRoles otherwise.
      requiredRoles: kitchenRequired,
      isDay: true,
      humanLabel: kitDay.count > 1 ? "Kitchen Day " + (i + 1) : "Kitchen Day",
    });
  }

  // Kitchen evening
  const kitEve = template.kitchen.evening;
  for (let i = 0; i < kitEve.count; i++) {
    const t = slotTimeFor(kitEve, "kitchen", "evening", i);
    slots.push({
      key: "kitchen-evening-" + i,
      section: "kitchen",
      dayPart: "evening",
      slotIndex: i,
      defaultStart: t.start,
      defaultEnd: t.end,
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
    const t = slotTimeFor(fohDay, "foh", "day", i);
    slots.push({
      key: "foh-day-" + i,
      section: "foh",
      dayPart: "day",
      slotIndex: i,
      defaultStart: t.start,
      defaultEnd: t.end,
      defaultRole: null,
      sectionLabel: SECTIONS.foh.label,
      dayPartLabel: "Day",
      coversRoles: SECTIONS.foh.roles,
      // v1.1.0: FoH has no dayRequiredRoles → empty list keeps the
      // permissive "any of Bar/Floor" rule.
      // v1.11.0: resolved from /settings override when present.
      requiredRoles: fohRequired,
      isDay: true,
      humanLabel: fohDay.count > 1 ? "FoH Day " + (i + 1) : "FoH Day",
    });
  }

  // FoH evening. v1.9.0: per-slot times via slotTimeFor (legacy
  // secondPersonStart still honoured for backward-compat reads).
  const fohEve = template.foh.evening;
  for (let i = 0; i < fohEve.count; i++) {
    const t = slotTimeFor(fohEve, "foh", "evening", i);
    slots.push({
      key: "foh-evening-" + i,
      section: "foh",
      dayPart: "evening",
      slotIndex: i,
      defaultStart: t.start,
      defaultEnd: t.end,
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

// ── Role-match for an employee filling a slot (v1.7.0; lifted) ──────────
// Day slot: when the slot carries `requiredRoles`, the employee must hold
// AT LEAST ONE of them. Otherwise (legacy / FoH) any of `coversRoles` is
// enough. Evening slot: the slot's specific `defaultRole`, or any of
// `eligibleRoles` when defaultRole is null (slot index > role count edge
// case).
//
// Two callers: the auto-generator's eligibility filter (generator.js
// `buildCandidates`) and the v1.7.0 Swap/Move mechanic in ScheduleGrid.
// Single definition keeps the rule consistent across surfaces.
//
// Returns boolean. Empty roles list → false (the employee can't fill any
// role-restricted cell).
export function roleMatchesSlot(emp, slotDef) {
  if (!emp || !slotDef) return false;
  const roles = Array.isArray(emp.roles) ? emp.roles : [];
  if (roles.length === 0) return false;
  if (slotDef.isDay) {
    const required = slotDef.requiredRoles || [];
    if (required.length > 0) {
      for (let i = 0; i < roles.length; i++) {
        if (required.indexOf(roles[i]) !== -1) return true;
      }
      return false;
    }
    const covers = slotDef.coversRoles || [];
    for (let i = 0; i < roles.length; i++) {
      if (covers.indexOf(roles[i]) !== -1) return true;
    }
    return false;
  }
  if (slotDef.defaultRole) return roles.indexOf(slotDef.defaultRole) !== -1;
  const elig = slotDef.eligibleRoles || [];
  for (let i = 0; i < roles.length; i++) {
    if (elig.indexOf(roles[i]) !== -1) return true;
  }
  return false;
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
// v1.8.2: optional `recurringDaysOfWeek` array narrows the range to
// specific weekdays. Empty / missing list → every date in the range
// (legacy behaviour preserved). Non-empty list → only dates whose
// weekday key is in the list count; other dates in the range are NOT
// covered by the request.
//
// Returns the FIRST mismatching request, or null. A matching preference
// request (preferredDayPart === dayPart) returns null too — the request
// is satisfied, no conflict.
export function findShiftPreferenceMismatch(requestsMap, employeeId, dateIso, dayPart) {
  if (!employeeId || !dateIso || !dayPart) return null;
  const all = Object.values(requestsMap || {});
  let weekdayKey = null; // computed lazily — most calls don't reach the recurring branch
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (r.employeeId !== employeeId) continue;
    if (r.type !== "shift-preference") continue;
    if (!r.preferredDayPart) continue; // defensive: malformed request → skip
    if (!r.dateFrom || !r.dateTo) continue;
    if (r.dateFrom <= dateIso && dateIso <= r.dateTo) {
      // v1.8.2: weekday narrowing. Skip if the request specifies a
      // recurring weekday list and this date's weekday isn't in it.
      const recurring = Array.isArray(r.recurringDaysOfWeek) ? r.recurringDaysOfWeek : null;
      if (recurring && recurring.length > 0) {
        if (weekdayKey === null) weekdayKey = weekdayKeyForDate(parseIsoDate(dateIso));
        if (recurring.indexOf(weekdayKey) === -1) continue;
      }
      if (r.preferredDayPart !== dayPart) return r;
    }
  }
  return null;
}

// ── Holiday days in week (v1.6.0 as daysOffInWeekByEmployee; renamed v1.9.0) ─
// Per-employee count of distinct dates in `dates` that are covered by a
// `holiday` request. Two consumers:
//   - WeeklyShiftSummary — drives the effective-quota number on the
//     "Shifts assigned" pill (raw workingDaysPerWeek − this count).
//   - generator.js — applies the same effective cap in the candidate
//     quota gate so the algorithm and the UI agree on the cap.
//
// v1.9.0 scope narrowing: `dayoff` requests are intentionally NOT
// counted any more. The semantic shift: holiday = "I'm away, don't
// schedule me at all" (subtract from the weekly cap); dayoff = "I'd
// prefer this specific date off" (still HARD-blocks that date via
// findRequestConflict, but the employee remains available for their
// full quota across the remaining open dates). The WeeklyRequestsPreview
// panel still surfaces every dayoff request so the manager retains full
// visibility into the "why" without the math being wrong.
//
// `shift-preference` requests are also skipped — they constrain which
// dayPart the employee can work, not whether they work that day.
// Closed weekdays are already absent from `dates` (callers pass the
// post-filter `visibleWeekDates(...)` list), so requests covering
// closed days don't inflate the count.
//
// Returns { [employeeId]: count }. Employees with no matching dates
// are absent from the map (callers treat missing as 0). `dates` is a
// JS Date[]; we ISO-format internally for the YYYY-MM-DD string
// compare against `dateFrom` / `dateTo`.
export function holidayDaysInWeekByEmployee(requestsMap, dates) {
  const out = {};
  if (!requestsMap) return out;
  const dateIsos = [];
  for (let i = 0; i < dates.length; i++) dateIsos.push(isoDate(dates[i]));
  const all = Object.values(requestsMap);
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (!r || !r.employeeId || !r.dateFrom) continue;
    if (r.type !== "holiday") continue;
    const from = r.dateFrom;
    const to = r.dateTo || r.dateFrom;
    let hits = out[r.employeeId];
    if (!hits) hits = out[r.employeeId] = {};
    for (let d = 0; d < dateIsos.length; d++) {
      const iso = dateIsos[d];
      if (iso >= from && iso <= to) hits[iso] = true;
    }
  }
  // Collapse the per-employee set to a count.
  const counts = {};
  for (const id in out) counts[id] = Object.keys(out[id]).length;
  return counts;
}

// ── 28-day rolling fairness aggregates (v1.12.0) ────────────────────────
// Rolling 28-day window ending at the focus week's Sunday. Window =
// [weekStart - 21d, ..., weekStart + 6d] = 28 dates. Smooth across
// month boundaries (no calendar reset); divides cleanly into the
// existing 7-day fairness window so the generator's prior-week deficit
// cap and this longer-horizon ranking compose without weird gaps.
//
// Returns { [empId]: { shiftsCount, hoursTotal, shiftsTarget, hoursTarget,
//                       shiftsDeficit, hoursDeficit } }.
//
// Used in two places:
//   1. generator.js `rankCandidates` — hours-deficit-desc (primary) +
//      shifts-deficit-desc (tiebreak) replace the v1.1.0 combined-load
//      tiebreaker. Employees who fell behind on hours/shifts over the
//      last 4 weeks get picked first this week.
//   2. MonthlyFairnessPanel — same map drives the chip-row visibility
//      surface below the weekly request preview. Single source so the
//      panel and the generator stay in lockstep.
//
// Targets per employee:
//   shiftsTarget = workingDaysPerWeek × 4 − holiday days in the 28-day
//                  window (Math.max floor at 0). Holiday subtraction
//                  mirrors v1.9.0's per-week effective-cap math.
//   hoursTarget  = shiftsTarget × avgShiftHours(emp, shiftTemplate,
//                  dayRequiredRoles, openingDays)  (v1.15.0: per-employee
//                  eligible-slot average, weighted by day-part open
//                  frequency — see avgShiftHours above)
//
// Deficits are non-negative (max(0, target − actual)). Over-target
// employees register 0 deficit; they sort with the same "no fairness
// claim" weight as employees exactly at target.
function timeToMinutes(s) {
  if (!s) return 0;
  const parts = String(s).split(":");
  if (parts.length !== 2) return 0;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function hoursBetween(startStr, endStr) {
  const minutes = timeToMinutes(endStr) - timeToMinutes(startStr);
  return minutes > 0 ? minutes / 60 : 0;
}

// Average hours per shift this employee would actually be assigned to,
// given their role-set, preference, and the active template. Filters
// the slot list to ONLY the slots the employee can fill via the same
// role + preference rules the generator uses (roleMatchesSlot from
// above), then averages those slot durations. Returns 0 when no
// slots are eligible — fairness target collapses to zero, which is
// correct (an employee with no viable assignments has no hours
// expectation).
//
// Pre-v1.14.0 follow-up: this function used to take just the
// preference string and average across every slot in the matching
// dayParts, flattening per-slot variation (e.g. FoH Evening 1 = 6h
// vs FoH Evening 2 = 5h would BOTH go into the average even for a
// Bar-only employee, who would also count Kitchen evening's Chef /
// Plating / Pot slots — none of which they could fill). The
// flattened number drove the hours-deficit signal in
// rankCandidates, distorting fairness for any employee whose
// role-set was narrower than the section's full coverage.
//
// dayRequiredRoles is optional — when present, threaded into
// slotsForDay so per-section day-role configuration matches what
// the generator's eligibility filter sees. Bare callers (passing
// undefined) get the SECTIONS defaults via slotsForDay's existing
// fallback.
//
// v1.15.0 (2nd commit): opening-day weighting. The mean is no longer
// flat — each eligible slot's hours are weighted by how many weekdays
// its day-part is open in the standing /settings.openingDays schedule.
// A shift that runs every day (evening open Mon–Sun → weight 7) counts
// more than one that runs twice a week (day open Sat–Sun → weight 2),
// so the hours-target reflects the expected hours-per-shift the
// employee will actually be scheduled for. Opening days are per-
// dayPart (day / evening), not per-section, so every day slot shares
// one weight and every evening slot shares another.
//
// Backward-compat: `openingDays` is optional. When undefined,
// normalizeOpeningDays defaults every weekday to both-open → all
// weights = 7 → the result is identical to the pre-v1.15.0(2) flat
// mean. A fully-closed day-part gives its slots weight 0 → they drop
// out of the average ("when they are off"). If every eligible slot
// has weight 0 → returns 0.
export function avgShiftHours(emp, shiftTemplate, dayRequiredRoles, openingDays) {
  if (!shiftTemplate || !emp) return 0;
  const slots = slotsForDay(shiftTemplate, dayRequiredRoles);
  if (slots.length === 0) return 0;
  const pref = emp.preference;
  const wantDay = pref === "day" || pref === "either" || !pref;
  const wantEve = pref === "evening" || pref === "either" || !pref;

  // Open-weekday counts per day-part. normalizeOpeningDays handles the
  // legacy boolean shape AND a missing arg (defaults to both-open).
  const norm = normalizeOpeningDays(openingDays);
  let dayOpenCount = 0;
  let eveOpenCount = 0;
  for (let i = 0; i < WEEKDAY_KEYS.length; i++) {
    const e = norm[WEEKDAY_KEYS[i]];
    if (e && e.day) dayOpenCount++;
    if (e && e.evening) eveOpenCount++;
  }

  let weightedTotal = 0;
  let weightSum = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.isDay && !wantDay) continue;
    if (!s.isDay && !wantEve) continue;
    if (!roleMatchesSlot(emp, s)) continue;
    const h = hoursBetween(s.defaultStart, s.defaultEnd);
    if (h <= 0) continue;
    const weight = s.dayPart === "day" ? dayOpenCount : eveOpenCount;
    weightedTotal += h * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? weightedTotal / weightSum : 0;
}

export function build28DayAggregates(args) {
  const out = {};
  if (!args || !args.employees || !args.weekStart) return out;
  const shifts = args.shifts || {};
  const employees = args.employees;
  const weekStart = args.weekStart;
  const requests = args.requests || {};
  const shiftTemplate = args.shiftTemplate || null;
  // v1.14.0 follow-up: per-section dayRequiredRoles override drives
  // slotsForDay inside avgShiftHours so the eligible-slot list
  // matches what the generator sees. Optional — bare callers fall
  // back to SECTIONS defaults via slotsForDay's existing path.
  const dayRequiredRoles = args.dayRequiredRoles || null;
  // v1.15.0 (2nd commit): openingDays weights avgShiftHours by how
  // often each day-part runs. Optional — undefined → flat mean.
  const openingDays = args.openingDays || null;

  const empList = Object.values(employees);
  if (empList.length === 0) return out;

  // 28 dates ending at this focus week's Sunday.
  const dates = [];
  for (let i = -21; i <= 6; i++) dates.push(addDays(weekStart, i));
  const dateIsoSet = {};
  for (let i = 0; i < dates.length; i++) dateIsoSet[isoDate(dates[i])] = true;

  // Per-employee accumulators. Initialize for every passed-in employee
  // so the returned map is dense — consumers can iterate `employees`
  // and never miss a row. Archived employees are skipped at the shift
  // loop (their map entry stays at zero, which the panel can filter).
  const accum = {};
  empList.forEach(function (e) { accum[e.id] = { shiftDates: {}, hours: 0 }; });

  const allShifts = Object.values(shifts);
  for (let i = 0; i < allShifts.length; i++) {
    const s = allShifts[i];
    if (!s || !s.employeeId || !s.date) continue;
    if (!dateIsoSet[s.date]) continue;
    if (!accum[s.employeeId]) continue;
    accum[s.employeeId].shiftDates[s.date] = true;
    accum[s.employeeId].hours += hoursBetween(s.start, s.end);
  }

  // 28-day holiday subtraction uses the existing helper — its
  // signature is `(requestsMap, dates)` and it works for any date
  // array, not just one week.
  const holidayCounts = holidayDaysInWeekByEmployee(requests, dates);

  empList.forEach(function (e) {
    const a = accum[e.id];
    const shiftsCount = Object.keys(a.shiftDates).length;
    const hoursTotal = a.hours;
    const wpw = Number.isFinite(e.workingDaysPerWeek) && e.workingDaysPerWeek >= 1
      ? Math.min(7, Math.round(e.workingDaysPerWeek))
      : 5;
    const holiday = holidayCounts[e.id] || 0;
    const shiftsTarget = Math.max(0, wpw * 4 - holiday);
    const hoursTarget = shiftsTarget * avgShiftHours(e, shiftTemplate, dayRequiredRoles, openingDays);
    out[e.id] = {
      shiftsCount: shiftsCount,
      hoursTotal: hoursTotal,
      shiftsTarget: shiftsTarget,
      hoursTarget: hoursTarget,
      shiftsDeficit: Math.max(0, shiftsTarget - shiftsCount),
      hoursDeficit: Math.max(0, hoursTarget - hoursTotal),
    };
  });
  return out;
}

// ── Calendar-month fairness aggregates (v1.14.0) ────────────────────────
// Parallel to build28DayAggregates, but anchored to the calendar month
// containing the focus week's Monday (1st → last day of that month).
// Same return shape so consumers stay symmetric: both maps key off
// employeeId and expose { shiftsCount, hoursTotal, shiftsTarget,
// hoursTarget, shiftsDeficit, hoursDeficit }.
//
// Target formula mirrors the calendarMonth block in
// buildEmployeeFairnessDetail so the drill-down modal's numbers and
// the generator's input stay in lockstep:
//
//   monthShiftsTargetRaw = workingDaysPerWeek × monthLength / 7
//   monthShiftsTarget    = max(0, round(monthShiftsTargetRaw) − monthHolidays)
//   monthHoursTarget     = monthShiftsTarget × avgShiftHours(emp,
//                          shiftTemplate, dayRequiredRoles, openingDays)
//                          (v1.15.0: weighted by day-part open frequency)
//
// Holiday handling: only `type === "holiday"` requests subtract from
// the target (v1.9.0 decision). Day-OFF requests still HARD-block
// the date at assignment time via findRequestConflict but DO NOT
// shrink the monthly cap. Identical to the rolling-28 path.
//
// Consumed by generator.js → rankCandidates alongside the rolling-28
// aggregates so both windows' deficits feed the candidate sort. The
// MonthlyFairnessPanel stays visually 28-day-rolling and does NOT
// consume this map.
export function buildCalendarMonthAggregates(args) {
  const out = {};
  if (!args || !args.employees || !args.weekStart) return out;
  const shifts = args.shifts || {};
  const employees = args.employees;
  const weekStart = args.weekStart;
  const requests = args.requests || {};
  const shiftTemplate = args.shiftTemplate || null;
  // v1.14.0 follow-up: per-employee avgShiftHours needs the
  // per-section dayRequiredRoles configuration so eligibility
  // filtering matches the generator. Optional; bare callers fall
  // back to SECTIONS defaults via slotsForDay's existing path.
  const dayRequiredRoles = args.dayRequiredRoles || null;
  // v1.15.0 (2nd commit): openingDays weights avgShiftHours by
  // day-part open frequency. Optional — undefined → flat mean.
  const openingDays = args.openingDays || null;

  const empList = Object.values(employees);
  if (empList.length === 0) return out;

  // Month containing weekStart's Monday. monthLength is the
  // number of days; we build a dense ISO set so the shift loop is
  // a single O(shifts) pass with O(1) date membership tests.
  const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  const monthEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
  const monthLength = monthEnd.getDate();
  const dates = [];
  for (let i = 0; i < monthLength; i++) dates.push(addDays(monthStart, i));
  const dateIsoSet = {};
  for (let i = 0; i < dates.length; i++) dateIsoSet[isoDate(dates[i])] = true;

  // Dense per-employee accumulators. Match build28DayAggregates so
  // callers can iterate `employees` and never miss a row.
  const accum = {};
  empList.forEach(function (e) { accum[e.id] = { shiftDates: {}, hours: 0 }; });

  const allShifts = Object.values(shifts);
  for (let i = 0; i < allShifts.length; i++) {
    const s = allShifts[i];
    if (!s || !s.employeeId || !s.date) continue;
    if (!dateIsoSet[s.date]) continue;
    if (!accum[s.employeeId]) continue;
    accum[s.employeeId].shiftDates[s.date] = true;
    accum[s.employeeId].hours += hoursBetween(s.start, s.end);
  }

  // Same helper as build28DayAggregates — works for any dates array,
  // filters `type === "holiday"` only.
  const holidayCounts = holidayDaysInWeekByEmployee(requests, dates);

  empList.forEach(function (e) {
    const a = accum[e.id];
    const shiftsCount = Object.keys(a.shiftDates).length;
    const hoursTotal = a.hours;
    const wpw = Number.isFinite(e.workingDaysPerWeek) && e.workingDaysPerWeek >= 1
      ? Math.min(7, Math.round(e.workingDaysPerWeek))
      : 5;
    const holiday = holidayCounts[e.id] || 0;
    // Pro-rated target: workingDaysPerWeek averaged across the month length.
    // E.g. wpw=5 in a 31-day month → 5 × 31/7 ≈ 22.14 → rounded to 22 → minus
    // holiday days. Floored at 0 so a long holiday can't produce a negative
    // target. Mirrors buildEmployeeFairnessDetail's calendarMonth path.
    const shiftsTargetRaw = wpw * (monthLength / 7);
    const shiftsTarget = Math.max(0, Math.round(shiftsTargetRaw) - holiday);
    const hoursTarget = shiftsTarget * avgShiftHours(e, shiftTemplate, dayRequiredRoles, openingDays);
    out[e.id] = {
      shiftsCount: shiftsCount,
      hoursTotal: hoursTotal,
      shiftsTarget: shiftsTarget,
      hoursTarget: hoursTarget,
      shiftsDeficit: Math.max(0, shiftsTarget - shiftsCount),
      hoursDeficit: Math.max(0, hoursTarget - hoursTotal),
    };
  });
  return out;
}

// ── Per-employee fairness drill-down (v1.13.0) ──────────────────────────
// Powers the EmployeeFairnessModal that opens when the manager clicks a
// row's delta bar on <MonthlyFairnessPanel>. Three views over the same
// underlying shifts + requests data, all anchored on the focus week:
//
//   rolling28    — same 28-day window as build28DayAggregates, but for
//                  a single employee with the holiday-day count exposed.
//   calendarMonth — the month containing the focus week's Monday. Target
//                  is a pro-rated (workingDaysPerWeek / 7) × monthLength,
//                  minus holiday days within the month.
//   perWeek       — four buckets [wk-3, wk-2, wk-1, this wk] each 7 days
//                  ending at the focus week's Sunday. Target per bucket is
//                  the raw workingDaysPerWeek (these are full weeks; the
//                  panel sparkline doesn't pro-rate).
//
// Informational only — never feeds the generator. Built on-demand when
// the modal opens (single employee, small windows, cheap).
function wpwOf(emp) {
  if (!emp) return 5;
  const v = emp.workingDaysPerWeek;
  if (!Number.isFinite(v) || v < 1) return 5;
  return Math.min(7, Math.round(v));
}

function holidayDayCountForEmployeeInRange(requestsMap, empId, fromIso, toIso) {
  if (!requestsMap || !empId) return 0;
  const seen = {};
  const all = Object.values(requestsMap);
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (!r || r.type !== "holiday") continue;
    if (r.employeeId !== empId) continue;
    if (!r.dateFrom) continue;
    const rFrom = r.dateFrom;
    const rTo = r.dateTo || r.dateFrom;
    // Overlap with [fromIso, toIso]
    const lo = rFrom > fromIso ? rFrom : fromIso;
    const hi = rTo < toIso ? rTo : toIso;
    if (lo > hi) continue;
    // Walk the overlap day-by-day. Range is at most ~31 days; cheap.
    let cur = parseIsoDate(lo);
    const stop = parseIsoDate(hi);
    while (isoDate(cur) <= isoDate(stop)) {
      seen[isoDate(cur)] = true;
      cur = addDays(cur, 1);
    }
  }
  return Object.keys(seen).length;
}

function aggregateShiftsInRange(shiftsMap, empId, fromIso, toIso) {
  const seenDates = {};
  let hours = 0;
  const all = Object.values(shiftsMap || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (!s || s.employeeId !== empId || !s.date) continue;
    if (s.date < fromIso || s.date > toIso) continue;
    seenDates[s.date] = true;
    hours += hoursBetween(s.start, s.end);
  }
  return { shiftsCount: Object.keys(seenDates).length, hoursTotal: hours };
}

export function buildEmployeeFairnessDetail(args) {
  if (!args || !args.employee || !args.weekStart) return null;
  const shifts = args.shifts || {};
  const employee = args.employee;
  const weekStart = args.weekStart;
  const requests = args.requests || {};
  const shiftTemplate = args.shiftTemplate || null;
  // v1.14.0 follow-up: forwarded into avgShiftHours so the helper's
  // eligible-slot list matches what the generator's eligibility
  // filter sees (configurable per-section day-role rules).
  const dayRequiredRoles = args.dayRequiredRoles || null;
  // v1.15.0 (2nd commit): openingDays weights avgShiftHours by
  // day-part open frequency. Optional — undefined → flat mean.
  const openingDays = args.openingDays || null;

  const wpw = wpwOf(employee);
  const avgHours = avgShiftHours(employee, shiftTemplate, dayRequiredRoles, openingDays);

  // ── rolling28 ──
  const r28From = addDays(weekStart, -21);
  const r28To = addDays(weekStart, 6);
  const r28FromIso = isoDate(r28From);
  const r28ToIso = isoDate(r28To);
  const r28Agg = aggregateShiftsInRange(shifts, employee.id, r28FromIso, r28ToIso);
  const r28Holiday = holidayDayCountForEmployeeInRange(requests, employee.id, r28FromIso, r28ToIso);
  const r28ShiftsTarget = Math.max(0, wpw * 4 - r28Holiday);
  const r28HoursTarget = r28ShiftsTarget * avgHours;

  // ── calendarMonth (the month containing weekStart's Monday) ──
  const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  const monthEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
  const monthStartIso = isoDate(monthStart);
  const monthEndIso = isoDate(monthEnd);
  const monthDayCount = monthEnd.getDate();
  const monthAgg = aggregateShiftsInRange(shifts, employee.id, monthStartIso, monthEndIso);
  const monthHoliday = holidayDayCountForEmployeeInRange(requests, employee.id, monthStartIso, monthEndIso);
  // Pro-rated target: workingDaysPerWeek averaged across the month length.
  // E.g. wpw=5 in a 31-day month → 5 × 31/7 ≈ 22.14 → rounded to 22.
  const monthShiftsTargetRaw = wpw * (monthDayCount / 7);
  const monthShiftsTarget = Math.max(0, Math.round(monthShiftsTargetRaw) - monthHoliday);
  const monthHoursTarget = monthShiftsTarget * avgHours;
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // ── perWeek (4 buckets ending at focus week's Sunday) ──
  const perWeek = [];
  for (let offset = -3; offset <= 0; offset++) {
    const wkStart = addDays(weekStart, offset * 7);
    const wkEnd = addDays(wkStart, 6);
    const wkFromIso = isoDate(wkStart);
    const wkToIso = isoDate(wkEnd);
    const agg = aggregateShiftsInRange(shifts, employee.id, wkFromIso, wkToIso);
    const wkHoliday = holidayDayCountForEmployeeInRange(requests, employee.id, wkFromIso, wkToIso);
    const wkTarget = Math.max(0, wpw - wkHoliday);
    perWeek.push({
      label: offset === 0 ? "this wk" : "wk " + offset,
      weekStartIso: wkFromIso,
      weekEndIso: wkToIso,
      shiftsCount: agg.shiftsCount,
      hoursTotal: agg.hoursTotal,
      shiftsTarget: wkTarget,
      // v1.14.0: expose the per-bucket holiday count so the Reasoning
      // view can show "wpw (5) − holiday (2) = target (3)" inline.
      // Recovering this from shiftsTarget alone is lossy (wkHoliday ≥ wpw
      // floors target at 0 and loses the original count).
      holidayDays: wkHoliday,
    });
  }

  return {
    rolling28: {
      shiftsCount: r28Agg.shiftsCount,
      hoursTotal: r28Agg.hoursTotal,
      shiftsTarget: r28ShiftsTarget,
      hoursTarget: r28HoursTarget,
      holidayDays: r28Holiday,
      dateFromIso: r28FromIso,
      dateToIso: r28ToIso,
    },
    calendarMonth: {
      monthLabel: monthLabel,
      monthStartIso: monthStartIso,
      monthEndIso: monthEndIso,
      shiftsCount: monthAgg.shiftsCount,
      hoursTotal: monthAgg.hoursTotal,
      shiftsTarget: monthShiftsTarget,
      hoursTarget: monthHoursTarget,
      holidayDays: monthHoliday,
    },
    perWeek: perWeek,
  };
}

// ── Consecutive days off check (v1.2.0, cross-week v1.8.0) ───────────────
// Labour wellness rule: every employee needs at least N consecutive days
// off per calendar week (Mon..Sun). v1.2.0 ships with N=2.
//
// Algorithm (v1.8.0 extended window):
//   - Build a 9-element array: [priorSun, Mon..Sun, nextMon]. Each cell =
//     true if the employee is working that day, false if off.
//   - The focus week is indices 1..7. Index 0 = the Sunday before
//     `weekStart`, index 8 = the Monday after.
//   - Closed days count as off (no shift assigned → false).
//   - Scan for any run of >= min consecutive off cells. A run COUNTS only
//     if it overlaps the focus week (at least one cell at index 1..7).
//     This drops the "prior Sat-Sun off, focus all worked" case from
//     counting — that rest happened LAST week, not this one.
//
// `options.priorWeekShifts` and `options.nextWeekShifts` are optional
// shiftsMaps for the adjacent weeks. When provided, prior Sun and next
// Mon are resolved from those maps (working iff a matching shift exists);
// when missing, the boundary days default to WORKING. The default is
// conservative — without authoritative cross-week data, we don't
// extend boundary runs and the helper degrades to ~Mon..Sun-only
// behaviour, matching the pre-v1.8.0 result for callers that haven't
// adopted the new option bag.
//
// `shiftsMap` may include the proposed shift (caller simulates the
// assignment) so the generator can test "would adding this break the
// rule?" without mutating state.
export function hasConsecutiveDaysOff(employeeId, weekStart, shiftsMap, minConsecutive, options) {
  if (!employeeId || !weekStart) return true;
  const min = minConsecutive || 2;
  const opts = options || {};

  // Build working booleans for the 9-day window:
  //   index 0     = prior Sunday  (weekStart - 1)
  //   index 1..7  = Mon..Sun      (weekStart .. weekStart + 6)
  //   index 8     = next Monday   (weekStart + 7)
  // Defaults to true (working) so that missing cross-week data does NOT
  // artificially extend boundary off-runs.
  const isWorking = [true, false, false, false, false, false, false, false, true];

  const dates = weekDates(weekStart);
  const focusIsoToIndex = {};
  for (let i = 0; i < 7; i++) focusIsoToIndex[isoDate(dates[i])] = i + 1;
  const priorSunIso = isoDate(addDays(weekStart, -1));
  const nextMonIso = isoDate(addDays(weekStart, 7));

  // Focus-week shifts populate indices 1..7 (initial false = off).
  const focusShifts = Object.values(shiftsMap || {});
  for (let i = 0; i < focusShifts.length; i++) {
    const s = focusShifts[i];
    if (!s || s.employeeId !== employeeId) continue;
    const idx = focusIsoToIndex[s.date];
    if (idx === undefined) continue;
    isWorking[idx] = true;
  }

  // Resolve prior Sunday from priorWeekShifts when available; otherwise
  // keep the default true (worked) → no artificial run extension.
  if (opts.priorWeekShifts) {
    const priorShifts = Object.values(opts.priorWeekShifts);
    let found = false;
    for (let i = 0; i < priorShifts.length; i++) {
      const s = priorShifts[i];
      if (!s || s.employeeId !== employeeId) continue;
      if (s.date === priorSunIso) { found = true; break; }
    }
    isWorking[0] = found;
  }

  // Resolve next Monday from nextWeekShifts when available.
  if (opts.nextWeekShifts) {
    const nextShifts = Object.values(opts.nextWeekShifts);
    let found = false;
    for (let i = 0; i < nextShifts.length; i++) {
      const s = nextShifts[i];
      if (!s || s.employeeId !== employeeId) continue;
      if (s.date === nextMonIso) { found = true; break; }
    }
    isWorking[8] = found;
  }

  // Scan for a run of `min` consecutive off cells. Track the current
  // run's start index so we can verify it overlaps the focus week
  // (any index in 1..7) before accepting.
  let run = 0;
  let runStart = -1;
  for (let i = 0; i < 9; i++) {
    if (!isWorking[i]) {
      if (run === 0) runStart = i;
      run++;
      if (run >= min) {
        const runEnd = i;
        // Run overlaps focus week iff its span [runStart..runEnd]
        // intersects [1..7].
        if (runStart <= 7 && runEnd >= 1) return true;
      }
    } else {
      run = 0;
    }
  }
  return false;
}

// ── Max consecutive working days (v1.8.0 amendment) ──────────────────────
// Labour wellness rule (companion to hasConsecutiveDaysOff): a single
// employee must never be scheduled for more than `max` consecutive
// working days. Default cap = 5, so an employee gets a rest day at
// least every 6 days. Catches the "rest at the edges of two weeks"
// pattern that the per-calendar-week 2-off rule misses (e.g. Wed–Sun
// of week 1 + Mon–Fri of week 2 = 10 days straight, each week
// independently passes the 2-off rule, but the combined stretch is
// unhealthy).
//
// Window: 21 days = [prior Mon..Sun, focus Mon..Sun, next Mon..Sun].
// We compute working booleans across the full window, find the
// longest run of `true` cells, and reject the proposal if any run
// > max overlaps the focus week (indices 7..13). Pre-existing
// long runs entirely outside the focus week aren't this proposal's
// problem to fix — they're the manager's state from earlier.
//
// Missing prior/next week maps default the adjacent cells to FALSE
// (not working). Conservative direction here is opposite to
// hasConsecutiveDaysOff: we don't want to over-report long runs
// when we lack data.
export function withinMaxConsecutiveWorkingDays(employeeId, weekStart, shiftsMap, max, options) {
  if (!employeeId || !weekStart) return true;
  const cap = max == null ? 5 : max;
  const opts = options || {};

  // 21 cells, all default to false (= off).
  const isWorking = new Array(21).fill(false);

  const priorStart = addDays(weekStart, -7);
  const nextStart = addDays(weekStart, 7);
  const dateToIndex = {};
  for (let i = 0; i < 7; i++) {
    dateToIndex[isoDate(addDays(priorStart, i))] = i;
    dateToIndex[isoDate(addDays(weekStart, i))] = i + 7;
    dateToIndex[isoDate(addDays(nextStart, i))] = i + 14;
  }

  function ingest(map) {
    if (!map) return;
    const all = Object.values(map);
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (!s || s.employeeId !== employeeId) continue;
      const idx = dateToIndex[s.date];
      if (idx === undefined) continue;
      isWorking[idx] = true;
    }
  }
  ingest(opts.priorWeekShifts);
  ingest(shiftsMap);
  ingest(opts.nextWeekShifts);

  // Scan for any run of working > cap that overlaps focus week (7..13).
  let run = 0;
  let runStart = -1;
  for (let i = 0; i < 21; i++) {
    if (isWorking[i]) {
      if (run === 0) runStart = i;
      run++;
      if (run > cap && runStart <= 13 && i >= 7) return false;
    } else {
      run = 0;
    }
  }
  return true;
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
