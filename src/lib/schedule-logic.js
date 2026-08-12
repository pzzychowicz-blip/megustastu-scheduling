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

import {
  SECTIONS,
  OPERATING_HOURS,
  DEFAULT_DAY_REQUIRED_ROLES,
  DEFAULT_SHIFT_TEMPLATE,
  DEFAULT_OPENING_DAYS,
} from "./constants.js";

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
// Exported since v16.0.0: `generator.js` needs the same all-seven-weekday
// ladder that `unionSlotCountForBlock` / `isLiveShiftForTemplate` use, so
// that "this slot row exists" means one thing everywhere. See the note on
// the `slotsForWeek` call in generateWeek.
export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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

// v15.3.0: true iff any shift on `dateIso` carries an assignee. Used to
// rescue past/orphan assignments from being hidden when their weekday is
// closed in the CURRENT openingDays (a closed day-part renders "Closed"
// and a fully-closed day drops from the grid entirely — but the shift
// record still lives in Firebase). Requires a truthy employeeId so an
// empty record can't resurrect a day with nothing to show.
export function dateHasAnyShift(weekShifts, dateIso) {
  const all = Object.values(weekShifts || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (s && s.date === dateIso && s.employeeId) return true;
  }
  return false;
}

// v15.3.0: like visibleWeekDates, but ALSO keeps any weekday that carries a
// real shift even when it's fully closed in the current schedule. Principle:
// never hide a real assignment. Mon..Sun order preserved. When openingDays
// is undefined every day is open (isDateOpen normalizes to all-open), so
// this collapses to weekDates — identical to the visibleWeekDates fallback.
export function weekDatesWithShifts(startDate, openingDays, weekShifts) {
  const dates = weekDates(startDate);
  return dates.filter(function (d) {
    if (isDateOpen(openingDays, d)) return true;
    return dateHasAnyShift(weekShifts, isoDate(d));
  });
}

// ── Effective-dated config revisions (v15.1.0) ───────────────────────────
// /configRevisions/{pushId} → { effectiveFrom: "YYYY-MM-DD" (an ISO
// Monday), openingDays?: {...}, shiftTemplate?: {...} }. PER-AXIS PARTIAL
// records — a revision may carry one or both axes. Partial-by-axis avoids
// the full-snapshot update anomaly: editing one axis for week X never
// freezes a stale copy of the other axis into a later revision.
//
// Resolution for a focus week, per axis INDEPENDENTLY: among revisions
// whose effectiveFrom <= the week's Monday AND that carry the axis
// (non-null), pick the greatest effectiveFrom (tiebreak: greatest push
// id — deterministic if duplicate Mondays ever appear via hand-edits;
// Settings merges per-Monday so it shouldn't happen). No matching
// revision → that axis falls back to the legacy live singletons
// (/settings.openingDays and /shiftTemplate), which act as the FROZEN
// BASE. Zero revisions ⇒ behaviour is byte-identical to pre-v15.1.0.
//
// Returns references (no clones) and possibly-null axes — consumers keep
// their own `|| DEFAULT_*` fallbacks (and GenerateButton's `!shiftTemplate`
// disable semantics stay intact). The matched revision ids ride along so
// Settings can tell "editing an existing scheduled change" from "next
// edit creates one".
export function resolveConfigForWeek(configRevisions, settings, shiftTemplate, weekStart) {
  const mondayIso = isoDate(startOfWeek(weekStart));
  let bestOpening = null;
  let bestTemplate = null;
  const map = configRevisions || {};
  for (const id in map) {
    const rev = map[id];
    if (!rev || !rev.effectiveFrom) continue;
    if (rev.effectiveFrom > mondayIso) continue;
    if (rev.openingDays) {
      if (
        !bestOpening ||
        rev.effectiveFrom > bestOpening.effectiveFrom ||
        (rev.effectiveFrom === bestOpening.effectiveFrom && id > bestOpening.id)
      ) {
        bestOpening = { id: id, effectiveFrom: rev.effectiveFrom, value: rev.openingDays };
      }
    }
    if (rev.shiftTemplate) {
      if (
        !bestTemplate ||
        rev.effectiveFrom > bestTemplate.effectiveFrom ||
        (rev.effectiveFrom === bestTemplate.effectiveFrom && id > bestTemplate.id)
      ) {
        bestTemplate = { id: id, effectiveFrom: rev.effectiveFrom, value: rev.shiftTemplate };
      }
    }
  }
  return {
    openingDays: bestOpening ? bestOpening.value : (settings && settings.openingDays) || null,
    shiftTemplate: bestTemplate ? bestTemplate.value : shiftTemplate || null,
    openingDaysRevisionId: bestOpening ? bestOpening.id : null,
    shiftTemplateRevisionId: bestTemplate ? bestTemplate.id : null,
  };
}

// ── Per-week config resolver (v15.4.0) ───────────────────────────────────
// The fairness aggregates (build28DayAggregates, buildCalendarMonthAggregates,
// buildEmployeeFairnessDetail) scan a multi-week window. Config is
// effective-dated (v15.1.0 /configRevisions), so a revision can land mid-window
// and the template / openingDays that applied differ week-by-week. This helper
// resolves config PER WEEK, cached by Monday, so a 28-day window resolves at
// most 4 times.
//
// Two consumers:
//  • `cfgForDate(date)` → the resolved { shiftTemplate, openingDays } for that
//    date's week. Used to weight `avgShiftHours` per week (per-week hours target).
//  • `isLiveShift(shift)` → false when the shift sits at a slot index that no
//    longer exists in the config resolved for its OWN week ("orphan", created
//    before the manager dropped that slot's count). Orphans stay in Firebase so
//    a count bump-back restores them, but must not pollute fairness counts.
//
// When `configRevisions` is empty/undefined the resolver returns the base config
// for every week → byte-identical to the pre-v15.4.0 single-config behaviour.
export function makeWeekConfigResolver(configRevisions, settings, baseShiftTemplate) {
  const cache = {};
  function cfgForDate(date) {
    const monday = isoDate(startOfWeek(date));
    if (!cache[monday]) {
      const r = resolveConfigForWeek(configRevisions, settings, baseShiftTemplate, date);
      cache[monday] = {
        shiftTemplate: r.shiftTemplate || DEFAULT_SHIFT_TEMPLATE,
        openingDays: r.openingDays || DEFAULT_OPENING_DAYS,
      };
    }
    return cache[monday];
  }
  return {
    cfgForDate: cfgForDate,
    // v16.0.0: compares against the UNION count (base + every weekday
    // override) rather than the base count alone, via the shared
    // isLiveShiftForTemplate.
    //
    // Why the union: the grid renders a union ladder, so a row exists
    // visually iff SOME weekday needs it. Tying "counts" to that same
    // condition keeps "renders ⟺ counts" exactly true. Comparing against
    // the base count would drop a legitimately-generated shift sitting at
    // an index only a weekday override creates; comparing against that
    // date's own count would strip fairness credit for work already done,
    // just because the manager later trimmed one weekday. Both are worse.
    //
    // For templates with no weekday overrides the union IS the base count,
    // so this is a strict widening — pre-v16.0.0 behaviour is unchanged.
    isLiveShift: function (shift) {
      if (!shift || !shift.section || !shift.dayPart || !shift.date) return true;
      const tmpl = cfgForDate(parseIsoDate(shift.date)).shiftTemplate;
      return isLiveShiftForTemplate(shift, tmpl);
    },
  };
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
// `saveShiftTemplate(..., true /* isSilent */)`.
//
// v15.4.0: the read-side legacy fallback in `slotTimeFor` was REMOVED now
// that the eager migration guarantees every live doc carries `times`.
// `materializeShiftTemplateBlock` / `isBlockMigrated` below STILL read the
// legacy shape — they are the migration itself and must convert it.
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
  // v15.1.0: optional `soloTimes` axis (per-open-mode times). ABSENT is
  // fine (feature off — most blocks). Present-but-malformed (not an array
  // of {start,end} of length `count`) flags the block so the migration
  // pass repairs it. A valid soloTimes array must NOT flag the block, or
  // the eager migration would rewrite the doc every session.
  if ("soloTimes" in block && block.soloTimes !== null) {
    const solo = block.soloTimes;
    if (!Array.isArray(solo)) return false;
    if (solo.length !== block.count) return false;
    for (let i = 0; i < solo.length; i++) {
      const t = solo[i];
      if (!t || !t.start || !t.end) return false;
    }
  }
  // v16.0.0: optional `weekdays` axis (per-weekday count + times overrides).
  // Same contract as soloTimes above — ABSENT is the normal case and must
  // NOT flag; present-and-valid must NOT flag either, or the eager
  // migration in AppShell rewrites /shiftTemplate on every single session.
  // Only genuinely malformed shapes flag for repair.
  if ("weekdays" in block && block.weekdays !== null) {
    const wd = block.weekdays;
    if (typeof wd !== "object" || Array.isArray(wd)) return false;
    const keys = Object.keys(wd);
    // {} would have been stripped to null by RTDB on write, so an in-memory
    // empty object means a hand-edit or a bug — clean it up.
    if (keys.length === 0) return false;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (WEEKDAY_KEYS.indexOf(k) === -1) return false;
      const e = wd[k];
      if (!e || typeof e !== "object") return false;
      if (typeof e.count !== "number" || !Number.isFinite(e.count) || e.count < 0) return false;
      if (e.count === 0) {
        // count 0 means "this row doesn't run today" — there is nothing to
        // time, and an empty times array is unrepresentable in RTDB.
        if ("times" in e) return false;
      } else {
        if (!Array.isArray(e.times) || e.times.length !== e.count) return false;
        for (let j = 0; j < e.times.length; j++) {
          const t = e.times[j];
          if (!t || !t.start || !t.end) return false;
        }
      }
      // soloTimes is a block-level axis only; per-weekday overrides win over
      // solo outright, so a per-weekday soloTimes would be meaningless.
      if ("soloTimes" in e) return false;
    }
  }
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

  // v15.1.0: preserve the optional `soloTimes` axis (per-open-mode times,
  // used on weekdays where this block's day-part is the ONLY open one).
  // Length-synced to count: missing entries extend from soloTimes' last
  // valid entry, falling back to the normal times[i]. Absent / empty /
  // non-array soloTimes → the key is OMITTED from the output entirely
  // (never write [] — Firebase RTDB strips empty arrays to null, and an
  // explicit-null round-trip would defeat the "absent = off" semantic).
  const rawSolo = Array.isArray(block.soloTimes) ? block.soloTimes : null;
  const out = { count: count, times: times };
  if (rawSolo && rawSolo.length > 0) {
    const soloTimes = [];
    let lastValid = null;
    for (let i = 0; i < count; i++) {
      const t = rawSolo[i];
      if (t && t.start && t.end) {
        soloTimes.push({ start: t.start, end: t.end });
        lastValid = t;
        continue;
      }
      const seed = lastValid || times[i];
      soloTimes.push({ start: seed.start, end: seed.end });
    }
    out.soloTimes = soloTimes;
  }

  // v16.0.0: canonicalise the optional `weekdays` axis. Walked in Mon..Sun
  // order so the stored object has a stable key order (readable diffs in
  // the Firebase console); unknown keys are dropped; each entry's `times`
  // is length-synced to that weekday's own count using the same
  // last-entry-extend rule the block uses, seeded from the block's times.
  //
  // A weekday whose override happens to equal the inherited value is
  // deliberately NOT normalised away — the manager explicitly set it, and
  // silently dropping it would make the Settings pill flip from "override"
  // back to "inherits" after a Firebase round-trip.
  //
  // Result with zero surviving keys → the key is OMITTED entirely, never
  // written as {} or null (RTDB strips empty collections; see the v1.12.0
  // Chef-pill bug).
  const rawWeekdays = block.weekdays && typeof block.weekdays === "object" && !Array.isArray(block.weekdays)
    ? block.weekdays
    : null;
  if (rawWeekdays) {
    const wd = {};
    for (let k = 0; k < WEEKDAY_KEYS.length; k++) {
      const key = WEEKDAY_KEYS[k];
      const e = rawWeekdays[key];
      if (!e || typeof e !== "object") continue;
      if (!Number.isFinite(e.count) || e.count < 0) continue;
      const c = Math.round(e.count);
      if (c === 0) { wd[key] = { count: 0 }; continue; }
      const src = Array.isArray(e.times) ? e.times : [];
      const list = [];
      let lastValid = null;
      for (let i = 0; i < c; i++) {
        const t = src[i];
        if (t && t.start && t.end) {
          list.push({ start: t.start, end: t.end });
          lastValid = t;
          continue;
        }
        const seed = lastValid || times[i] || times[times.length - 1]
          || { start: OPERATING_HOURS.start, end: OPERATING_HOURS.end };
        list.push({ start: seed.start, end: seed.end });
      }
      wd[key] = { count: c, times: list };
    }
    if (Object.keys(wd).length > 0) out.weekdays = wd;
  }

  return out;
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

// v1.9.0: pull per-slot default times from a block via the `times` array.
//
// v15.4.0: the legacy v0.5.0 read-side fallback (single `start`/`end` per
// block + FoH-evening `secondPersonStart` for slot 1+) was REMOVED. The eager
// migration (v1.10.1, AppShell) rewrites any pre-v1.9.0 doc to the per-slot
// `{count, times:[...]}` shape once per session after persistence is ready, so
// every live doc carries `times`. The only way to reach the fallback below is
// an unmigrated doc rendered in the brief window before the eager write lands
// (unreachable in PROD — already migrated). In that case return safe operating-
// window defaults rather than legacy fields; the migrated values snap in a frame
// later. `materializeShiftTemplateBlock` / `isBlockMigrated` still read the
// legacy shape — they have to, to PERFORM the migration; only this read path
// dropped it. `sectionKey`/`dayPart`/`index` are retained for the array lookup.
function slotTimeFor(block, sectionKey, dayPart, index) {
  if (Array.isArray(block.times)) {
    const t = block.times[index];
    if (t && t.start && t.end) return { start: t.start, end: t.end };
  }
  return { start: OPERATING_HOURS.start, end: OPERATING_HOURS.end };
}

// v15.1.0: per-open-mode ("solo") times. A block may carry an optional
// `soloTimes` array (same length as count) holding the times used on
// weekdays where this block's day-part is the ONLY open one (the sibling
// day-part is closed). Returns the {start, end} for the slot index, or
// null when the block has no usable solo entry — callers then fall back
// to the normal per-slot times.
function slotSoloTimeFor(block, index) {
  if (!Array.isArray(block.soloTimes)) return null;
  const t = block.soloTimes[index];
  if (t && t.start && t.end) return { start: t.start, end: t.end };
  return null;
}

// ── Per-weekday overrides (v16.0.0) ──────────────────────────────────────
// A block may carry an optional `weekdays` map keyed by the seven weekday
// strings, each entry `{count, times: [{start,end}, ...]}` (or `{count: 0}`
// for "this row doesn't run that weekday"). Absent = the block behaves
// exactly as it did pre-v16.0.0.
//
// Resolution precedence for a slot's times on a given date is:
//   per-weekday override → soloTimes → flat block defaults
// See `slotTimesForDate`.

// The effective slot count for a block on one weekday.
function blockCountForWeekday(block, weekdayKey) {
  const wd = block && block.weekdays;
  const e = wd && weekdayKey ? wd[weekdayKey] : null;
  if (e && Number.isFinite(e.count) && e.count >= 0) return e.count;
  return Number.isFinite(block && block.count) ? block.count : 0;
}

// The WIDEST ladder this block produces across `keys`. Passing null (or no
// keys) yields the base count, which is what makes `slotsForDay` a
// byte-identical wrapper for every pre-v16.0.0 caller.
function blockUnionCount(block, keys) {
  let max = Number.isFinite(block && block.count) ? block.count : 0;
  if (!keys || keys.length === 0) return max;
  for (let i = 0; i < keys.length; i++) {
    const c = blockCountForWeekday(block, keys[i]);
    if (c > max) max = c;
  }
  return max;
}

// The override times for one (weekday, slot index), or null.
function slotWeekdayTimeFor(block, weekdayKey, index) {
  const wd = block && block.weekdays;
  const e = wd ? wd[weekdayKey] : null;
  if (!e || !Array.isArray(e.times)) return null;
  const t = e.times[index];
  if (t && t.start && t.end) return { start: t.start, end: t.end };
  return null;
}

// v16.0.0: the widest ladder a block can EVER produce (base + all seven
// weekday overrides). Used by the orphan-shift predicate: the grid renders
// a union ladder, so "this shift's row exists somewhere in the week" is
// exactly the condition under which it renders — and therefore exactly the
// condition under which it should count. Collapses to `block.count` when
// there are no overrides.
export function unionSlotCountForBlock(block) {
  return blockUnionCount(block, WEEKDAY_KEYS);
}

// v16.0.0: shared orphan-shift predicate. A shift whose slotIndex no longer
// exists anywhere in the resolved template is an orphan — it doesn't render
// and must not inflate counts or hours. Lifted here so the fairness
// aggregates and WeeklyShiftSummary read ONE definition; they previously
// carried separate copies that would now disagree (one keyed on base count,
// one on the union).
export function isLiveShiftForTemplate(shift, template) {
  if (!template) return true;
  if (!shift || !shift.section || !shift.dayPart) return true;
  const sec = template[shift.section];
  const block = sec && sec[shift.dayPart];
  return (shift.slotIndex || 0) < unionSlotCountForBlock(block);
}

// Build the per-weekday axes attached to one slot: the times each weekday
// overrides for this index, and the weekdays on which this index doesn't
// run at all. Both are null when the block has no overrides, which keeps
// the slot object shape identical to pre-v16.0.0 for untouched templates.
function weekdayAxesForSlot(block, index, keys) {
  if (!block || !block.weekdays || !keys || keys.length === 0) {
    return { weekdayTimes: null, weekdayOff: null, firstOverrideTime: null };
  }
  let times = null;
  let off = null;
  let firstOverrideTime = null;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (blockCountForWeekday(block, key) <= index) {
      if (!off) off = {};
      off[key] = true;
      continue;
    }
    const t = slotWeekdayTimeFor(block, key, index);
    if (t) {
      if (!times) times = {};
      times[key] = t;
      if (!firstOverrideTime) firstOverrideTime = t;
    }
  }
  return { weekdayTimes: times, weekdayOff: off, firstOverrideTime: firstOverrideTime };
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
// v16.0.0: `slotsForDay` is now a thin wrapper over `slotsForWeek`, which
// takes the list of weekday keys actually on display and returns the UNION
// ladder — the widest slot list any of those weekdays needs.
//
// Why a union rather than a per-date ladder: the desktop grid is one CSS
// grid with a shared left label column and `display: contents` rows, and
// the PDF is one autotable row per slot. Neither can be ragged. So the
// ladder stays uniform for the week and dates where a row doesn't run
// render an inert "—" placeholder, reusing the same machinery that already
// handles closed day-parts. This also keeps `slotsByKey`, ClearConfirmModal's
// "by shift row" scope, GenerateResultsModal's labels and the generator's
// stale-record lookup working with no changes at all.
//
// Passing no weekday keys yields the base counts — byte-identical output to
// pre-v16.0.0 for every existing caller.
export function slotsForDay(template, dayRequiredRolesOverride) {
  return slotsForWeek(template, dayRequiredRolesOverride, null);
}

export function slotsForWeek(template, dayRequiredRolesOverride, weekdayKeys) {
  const slots = [];

  const kitchenRequired = resolveDayRequiredRoles(dayRequiredRolesOverride, "kitchen");
  const fohRequired = resolveDayRequiredRoles(dayRequiredRolesOverride, "foh");

  // Shared per-slot construction. `ladderCount` is the union across the
  // visible weekdays, so `i` can exceed the block's own count — an "extra"
  // row that exists only because some weekday asks for it.
  function baseSlot(block, sectionKey, dayPart, i, ladderCount) {
    const axes = weekdayAxesForSlot(block, i, weekdayKeys);
    const flat = slotTimeFor(block, sectionKey, dayPart, i);
    const isExtraSlot = i >= (Number.isFinite(block.count) ? block.count : 0);
    // An extra row has no entry in the flat `times` array, so slotTimeFor
    // returns the OPERATING_HOURS fallback. Prefer the first weekday
    // override that actually defines this index — otherwise the PDF row
    // label and the grid's reference column would advertise 11:00–23:00 for
    // a slot that never runs at those hours.
    const defaults = isExtraSlot && axes.firstOverrideTime ? axes.firstOverrideTime : flat;
    const st = slotSoloTimeFor(block, i);
    return {
      key: sectionKey + "-" + dayPart + "-" + i,
      section: sectionKey,
      dayPart: dayPart,
      slotIndex: i,
      defaultStart: defaults.start,
      defaultEnd: defaults.end,
      // v15.1.0: per-open-mode times — non-null only when the block carries
      // a valid soloTimes entry for this index. `slotTimesForDate` picks.
      soloStart: st ? st.start : null,
      soloEnd: st ? st.end : null,
      // v16.0.0: per-weekday axes. Both null when the block has no
      // overrides, keeping the slot shape identical to pre-v16.0.0.
      weekdayTimes: axes.weekdayTimes,
      weekdayOff: axes.weekdayOff,
      isExtraSlot: isExtraSlot,
      sectionLabel: SECTIONS[sectionKey].label,
      ladderCount: ladderCount,
    };
  }

  // Numbering follows the LADDER length, not the block's own count — a
  // base-1 block with a weekday override of 2 must not produce two rows
  // both labelled "Kitchen Day" (they'd be indistinguishable in
  // ClearConfirmModal's by-row scope and in the PDF row headers).
  function dayLabel(prefix, i, ladderCount) {
    return ladderCount > 1 ? prefix + " " + (i + 1) : prefix;
  }

  // Kitchen day
  const kitDay = template.kitchen.day;
  const kitDayN = blockUnionCount(kitDay, weekdayKeys);
  for (let i = 0; i < kitDayN; i++) {
    slots.push({
      ...baseSlot(kitDay, "kitchen", "day", i, kitDayN),
      defaultRole: null,
      dayPartLabel: "Day",
      // Day-shift roles are null in the data model (one person covers all
      // section roles). We still surface the roles list to the modal so it
      // can show "covers Chef + Plating + Pot".
      coversRoles: SECTIONS.kitchen.roles,
      // v1.1.0: required role(s) for this day slot. When set, the picker
      // and generator demand the employee hold AT LEAST ONE of these
      // roles (not just any of coversRoles). Empty / undefined keeps the
      // permissive "any of coversRoles" v1.0 behaviour.
      // v1.11.0: resolved from /settings override when present.
      requiredRoles: kitchenRequired,
      isDay: true,
      humanLabel: dayLabel("Kitchen Day", i, kitDayN),
    });
  }

  // Kitchen evening
  const kitEve = template.kitchen.evening;
  const kitEveN = blockUnionCount(kitEve, weekdayKeys);
  for (let i = 0; i < kitEveN; i++) {
    slots.push({
      ...baseSlot(kitEve, "kitchen", "evening", i, kitEveN),
      defaultRole: defaultRoleForSlot("kitchen", "evening", i),
      dayPartLabel: "Evening",
      eligibleRoles: SECTIONS.kitchen.roles,  // Chef / Plating / Pot
      isDay: false,
      humanLabel: "Kitchen Evening " + (i + 1),
    });
  }

  // FoH day
  const fohDay = template.foh.day;
  const fohDayN = blockUnionCount(fohDay, weekdayKeys);
  for (let i = 0; i < fohDayN; i++) {
    slots.push({
      ...baseSlot(fohDay, "foh", "day", i, fohDayN),
      defaultRole: null,
      dayPartLabel: "Day",
      coversRoles: SECTIONS.foh.roles,
      // v1.1.0: FoH has no dayRequiredRoles → empty list keeps the
      // permissive "any of Bar/Floor" rule.
      // v1.11.0: resolved from /settings override when present.
      requiredRoles: fohRequired,
      isDay: true,
      humanLabel: dayLabel("FoH Day", i, fohDayN),
    });
  }

  // FoH evening. v1.9.0: per-slot times via slotTimeFor.
  const fohEve = template.foh.evening;
  const fohEveN = blockUnionCount(fohEve, weekdayKeys);
  for (let i = 0; i < fohEveN; i++) {
    slots.push({
      ...baseSlot(fohEve, "foh", "evening", i, fohEveN),
      defaultRole: defaultRoleForSlot("foh", "evening", i),
      dayPartLabel: "Evening",
      eligibleRoles: SECTIONS.foh.roles,   // Bar or Floor — pick one
      isDay: false,
      humanLabel: "FoH Evening " + (i + 1),
    });
  }

  return slots;
}

// v16.0.0: does this slot's row run on `date` at all? False only when a
// per-weekday override reduced that weekday's count below this slot index.
//
// Deliberately independent of openingDays: `isSlotOpenOnDate` answers "is
// the restaurant open for this day-part", this answers "does this row exist
// today". Callers check both.
export function isSlotScheduledOnDate(slot, date) {
  if (!slot || !slot.weekdayOff) return true;
  return slot.weekdayOff[weekdayKeyForDate(date)] !== true;
}

// ── Per-date slot times (v15.1.0) ────────────────────────────────────────
// Resolve the default {start, end} a slot runs on a SPECIFIC date. When the
// slot carries solo times (soloStart/soloEnd from the template's soloTimes
// axis) AND the date's weekday has the slot's day-part open while the
// SIBLING day-part is closed (restaurant runs afternoon-only or
// evening-only that weekday), the solo times win. Every other case —
// no solo times configured, both day-parts open, or even the slot's own
// day-part closed (callers gate on isSlotOpenOnDate upstream, so that
// branch is unreachable in practice) — returns the flat template defaults.
//
// Consumers: ScheduleGrid's renderCell (builds an "effective slot" whose
// defaultStart/defaultEnd are per-date, which then flows into the cell
// display, the * override marker, and ShiftFormModal via cellClick) and
// generator.js (new-shift payload times + the Regenerate wipe pass's
// override detection). PDF export deliberately does NOT use this — solo
// cells printing their actual times as two-line cells is a feature.
// v16.0.0: a THIRD tier sits above solo — per-weekday overrides. Full
// precedence is now:
//   1. per-weekday override for this exact weekday   (v16.0.0)
//   2. solo times, when this day-part is the only one open  (v15.1.0)
//   3. flat block defaults
// A weekday that carries an override therefore ignores soloTimes even if it
// happens to be a solo day — the more specific setting wins, which is the
// locked precedence.
//
// The SIGNATURE IS UNCHANGED, which is what makes this cheap: ScheduleGrid's
// renderCell, both generator call sites, ShiftFormModal's initial/reset
// times and the swap/move payload all inherit per-weekday times with no
// edits of their own.
export function slotTimesForDate(slot, date, openingDays) {
  const wk = weekdayKeyForDate(date);

  if (slot.weekdayTimes) {
    const t = slot.weekdayTimes[wk];
    if (t) return { start: t.start, end: t.end };
  }

  if (!slot.soloStart || !slot.soloEnd) {
    return { start: slot.defaultStart, end: slot.defaultEnd };
  }
  const norm = normalizeOpeningDays(openingDays);
  const entry = norm[wk];
  const sibling = slot.dayPart === "day" ? "evening" : "day";
  if (entry && entry[slot.dayPart] === true && entry[sibling] === false) {
    return { start: slot.soloStart, end: slot.soloEnd };
  }
  return { start: slot.defaultStart, end: slot.defaultEnd };
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

// ── Same-day shift lookup (v0.8.0; semantics changed in v16.0.0) ─────────
// Finds other shifts the employee already holds on the same date.
//
// v0.8.0–v15.4.1 this backed a STRICT rule: one employee could never hold
// two shifts on one date, enforced by hiding them from the picker AND by a
// refusal in the save handler.
//
// **v16.0.0 — split shifts are allowed, MANUALLY.** The same person may now
// work day AND evening on one date. What changed is only who enforces it:
//
//   - Manual picker (ShiftFormModal) — SOFT. Same-day staff are hidden by
//     default behind a toggle (mirroring the day-off / holiday toggle), and
//     choosing one raises a yellow warning. The save goes through.
//   - Swap / Move (ScheduleGrid) — SOFT, but confirmed. A landing that
//     would create a split opens a confirm dialog first.
//   - Auto-generator (generator.js step 4) — still HARD. The generator must
//     never produce a split on its own; a 12-hour straight day is a
//     deliberate manager decision, not something to stumble into.
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

// v16.0.0: the plural form. Under the old strict rule there could only ever
// be one clash, so returning the first was enough. Now that splits are
// legal, a warning wants to NAME every shift the employee already holds
// that date — and a third assignment on one date, while unlikely, is no
// longer impossible and should read as such rather than silently
// mentioning only one.
//
// Returns an array (possibly empty), in the map's iteration order.
export function findSameDayShifts(shiftsMap, employeeId, dateIso, excludeShiftId) {
  const out = [];
  if (!employeeId || !dateIso) return out;
  const all = Object.values(shiftsMap || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (!s.employeeId || s.employeeId !== employeeId) continue;
    if (s.date !== dateIso) continue;
    if (excludeShiftId && s.id === excludeShiftId) continue;
    out.push(s);
  }
  return out;
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
// Private ladder cache for avgShiftHours. The full seven-weekday ladder
// depends ONLY on (shiftTemplate, dayRequiredRoles), but avgShiftHours is
// called once per employee per week from blendedAvgShiftHours — so a
// 10-employee, 4-week window rebuilt one identical list 40 times, and did it
// again for the calendar-month aggregate, on every re-run of either memo.
//
// WeakMap keyed on the template object: the config resolver caches its
// per-Monday results, so those identities are stable across the walk, and
// entries drop on their own when a revision is superseded. The second-level
// identity check on dayRequiredRoles covers the settings object changing
// under a template that didn't.
//
// Safe to share the array because avgShiftHours only READS the slots. Do not
// hand these out to a caller that might mutate them.
const avgSlotsCache = new WeakMap();
function fullWeekSlotsFor(shiftTemplate, dayRequiredRoles) {
  const hit = avgSlotsCache.get(shiftTemplate);
  if (hit && hit.roles === dayRequiredRoles) return hit.slots;
  const slots = slotsForWeek(shiftTemplate, dayRequiredRoles, WEEKDAY_KEYS);
  avgSlotsCache.set(shiftTemplate, { roles: dayRequiredRoles, slots: slots });
  return slots;
}

export function avgShiftHours(emp, shiftTemplate, dayRequiredRoles, openingDays) {
  if (!shiftTemplate || !emp) return 0;
  // v16.0.0: the FULL seven-weekday ladder, so every per-weekday override
  // is visible here. (slotsForDay would give the base ladder with the
  // weekday axes stripped, silently ignoring the overrides.) With no
  // overrides this is the same list slotsForDay returns.
  const slots = fullWeekSlotsFor(shiftTemplate, dayRequiredRoles);
  if (slots.length === 0) return 0;
  const pref = emp.preference;
  const wantDay = pref === "day" || pref === "either" || !pref;
  const wantEve = pref === "evening" || pref === "either" || !pref;

  // v16.0.0: the weighting is now a straight per-weekday loop rather than
  // the v15.1.0 two-bucket (both-open / solo) split. Per-weekday overrides
  // can give every weekday a different duration AND a different headcount,
  // so two buckets no longer span the space.
  //
  // For each eligible slot we collect one hours value per weekday the slot
  // actually runs (day-part open, and not dropped by a weekday override),
  // then average across all of them. That is exactly the same "weight each
  // mode by how many weekdays use it" idea, just at per-weekday resolution.
  //
  // BACKWARD-COMPAT (non-negotiable — this feeds the generator's fairness
  // ranking): with no weekday overrides, the weekdays contributing to a
  // slot are precisely the open weekdays for its day-part; they partition
  // into sibling-open (→ hNormal) and sibling-closed (→ hSolo, which equals
  // hNormal when no soloTimes are configured). Their cardinalities are the
  // old cBoth / cSolo, so Σ perDay === hNormal·cBoth + hSolo·cSolo and
  // |perDay| === cBoth + cSolo — term for term identical to v15.1.0.
  const norm = normalizeOpeningDays(openingDays);

  let weightedTotal = 0;
  let weightSum = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.isDay && !wantDay) continue;
    if (!s.isDay && !wantEve) continue;
    if (!roleMatchesSlot(emp, s)) continue;

    const perDay = [];
    for (let k = 0; k < WEEKDAY_KEYS.length; k++) {
      const wk = WEEKDAY_KEYS[k];
      const e = norm[wk];
      if (!e || e[s.dayPart] !== true) continue;        // day-part closed
      if (s.weekdayOff && s.weekdayOff[wk]) continue;   // row doesn't run
      const t = slotTimesForWeekdayKey(s, wk, e);
      perDay.push(hoursBetween(t.start, t.end));
    }
    if (perDay.length === 0) continue;

    // The drop guard is deliberately TWO-PASS: v15.1.0 skipped a slot only
    // when BOTH candidate durations were non-positive. A naive per-weekday
    // `if (h <= 0) continue` is NOT equivalent — with hNormal 6, hSolo 0,
    // five both-open and two solo weekdays, the old maths yields 30/7 while
    // per-weekday skipping yields 30/5. Drop the slot only when every
    // candidate is non-positive; otherwise keep them all, zeros included.
    let anyPositive = false;
    for (let j = 0; j < perDay.length; j++) {
      if (perDay[j] > 0) { anyPositive = true; break; }
    }
    if (!anyPositive) continue;

    for (let j = 0; j < perDay.length; j++) {
      weightedTotal += perDay[j];
      weightSum += 1;
    }
  }
  return weightSum > 0 ? weightedTotal / weightSum : 0;
}

// Sibling of slotTimesForDate that takes a weekday KEY plus that weekday's
// already-normalized opening entry, so avgShiftHours' inner loop doesn't
// allocate seven Date objects per slot. Same three-tier precedence:
// per-weekday override → solo → flat defaults.
function slotTimesForWeekdayKey(slot, weekdayKey, openingEntry) {
  if (slot.weekdayTimes) {
    const t = slot.weekdayTimes[weekdayKey];
    if (t) return { start: t.start, end: t.end };
  }
  if (slot.soloStart && slot.soloEnd && openingEntry) {
    const sibling = slot.dayPart === "day" ? "evening" : "day";
    if (openingEntry[slot.dayPart] === true && openingEntry[sibling] === false) {
      return { start: slot.soloStart, end: slot.soloEnd };
    }
  }
  return { start: slot.defaultStart, end: slot.defaultEnd };
}

// v15.3.0: clamp a contiguous date window to an employee's tenure
// (activeFrom / activeUntil) so fairness targets pro-rate by the time the
// employee is actually active. Returns the active sub-range (ISO) + its
// inclusive day count. An employee with no tenure bounds yields the full
// window, so targets stay byte-identical to pre-v15.3.0 for untenured staff.
// `days === 0` when the tenure doesn't overlap the window at all.
function activeRangeWithinWindow(emp, windowStartIso, windowEndIso) {
  let fromIso = windowStartIso;
  let toIso = windowEndIso;
  if (emp && emp.activeFrom && emp.activeFrom > fromIso) fromIso = emp.activeFrom;
  if (emp && emp.activeUntil && emp.activeUntil < toIso) toIso = emp.activeUntil;
  if (fromIso > toIso) return { fromIso: fromIso, toIso: toIso, days: 0 };
  const ms = parseIsoDate(toIso).getTime() - parseIsoDate(fromIso).getTime();
  const days = Math.round(ms / 86400000) + 1;
  return { fromIso: fromIso, toIso: toIso, days: days };
}

// v15.4.0: per-week-weighted average shift hours across a window. Replaces the
// single avgShiftHours call that used the focus-week config across the whole
// window — when a config revision lands mid-window, each week's avgShiftHours
// (which depends on the template's slot times + openingDays weighting) can
// differ, so we blend per week. Each week's avg is weighted by the employee's
// tenure-active days within that week ∩ window. A window with uniform config
// (no revision boundary inside it) collapses to the same single value as
// before — byte-identical to pre-v15.4.0. `shiftsTarget` is config-independent
// (tenure + holidays only), so only `hoursTarget` consumes this.
function blendedAvgShiftHours(resolver, emp, dayRequiredRoles, windowStartIso, windowEndIso) {
  let wTotal = 0;
  let wSum = 0;
  let cur = startOfWeek(parseIsoDate(windowStartIso));
  // Walk each Mon-aligned week overlapping the window. ISO date strings
  // compare lexicographically, so the string guard is safe.
  while (isoDate(cur) <= windowEndIso) {
    const wkSunIso = isoDate(addDays(cur, 6));
    const curIso = isoDate(cur);
    const segFromIso = curIso < windowStartIso ? windowStartIso : curIso;
    const segToIso = wkSunIso > windowEndIso ? windowEndIso : wkSunIso;
    const active = activeRangeWithinWindow(emp, segFromIso, segToIso).days;
    if (active > 0) {
      const cfg = resolver.cfgForDate(cur);
      const wkAvg = avgShiftHours(emp, cfg.shiftTemplate, dayRequiredRoles, cfg.openingDays);
      wTotal += wkAvg * active;
      wSum += active;
    }
    cur = addDays(cur, 7);
  }
  return wSum > 0 ? wTotal / wSum : 0;
}

export function build28DayAggregates(args) {
  const out = {};
  if (!args || !args.employees || !args.weekStart) return out;
  const shifts = args.shifts || {};
  const employees = args.employees;
  const weekStart = args.weekStart;
  const requests = args.requests || {};
  // v1.14.0 follow-up: per-section dayRequiredRoles override drives
  // slotsForDay inside avgShiftHours so the eligible-slot list
  // matches what the generator sees. Optional — bare callers fall
  // back to SECTIONS defaults via slotsForDay's existing path.
  const dayRequiredRoles = args.dayRequiredRoles || null;
  // v15.4.0: per-week config resolver. `args.shiftTemplate` is now the BASE
  // singleton (not pre-resolved); the resolver picks the right template +
  // openingDays for each week in the window via /configRevisions. Replaces
  // the v1.15.0 single `args.shiftTemplate` + `args.openingDays` inputs —
  // they're subsumed by the per-week resolution (drives both the orphan
  // filter below and the blended hours target). Empty configRevisions →
  // base config every week → identical to pre-v15.4.0.
  const resolver = makeWeekConfigResolver(args.configRevisions, args.settings, args.shiftTemplate || null);

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
    // v15.4.0: skip orphan shifts — a slot index that no longer exists in the
    // config resolved for that shift's own week (manager dropped the slot
    // count). They don't render on the grid and must not inflate fairness.
    if (!resolver.isLiveShift(s)) continue;
    accum[s.employeeId].shiftDates[s.date] = true;
    accum[s.employeeId].hours += hoursBetween(s.start, s.end);
  }

  // v15.3.0: targets pro-rate by the employee's tenure (activeFrom /
  // activeUntil) within the window, and holidays are counted only inside
  // that active sub-range — so a mid-window hire / leaver gets a fair
  // (smaller) target instead of a full-window one. Per-employee now (the
  // active sub-range differs by employee), so the window-wide
  // holidayDaysInWeekByEmployee call is replaced by the per-employee
  // holidayDayCountForEmployeeInRange over [range.fromIso, range.toIso].
  const windowStartIso = isoDate(dates[0]);
  const windowEndIso = isoDate(dates[dates.length - 1]);

  empList.forEach(function (e) {
    const a = accum[e.id];
    const shiftsCount = Object.keys(a.shiftDates).length;
    const hoursTotal = a.hours;
    const wpw = Number.isFinite(e.workingDaysPerWeek) && e.workingDaysPerWeek >= 1
      ? Math.min(7, Math.round(e.workingDaysPerWeek))
      : 5;
    const range = activeRangeWithinWindow(e, windowStartIso, windowEndIso);
    const holiday = holidayDayCountForEmployeeInRange(requests, e.id, range.fromIso, range.toIso);
    // wpw × activeDays/7 − holidays. Full-window tenure (days === 28) →
    // round(wpw × 4) = wpw × 4, identical to pre-v15.3.0.
    const shiftsTarget = range.days > 0
      ? Math.max(0, Math.round(wpw * range.days / 7) - holiday)
      : 0;
    // v15.4.0: hours target uses a per-week-blended avgShiftHours so a
    // mid-window config revision is reflected (was: focus-week config across
    // the whole window). Uniform-config windows collapse to the old value.
    const hoursTarget = shiftsTarget * blendedAvgShiftHours(resolver, e, dayRequiredRoles, windowStartIso, windowEndIso);
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
  // v1.14.0 follow-up: per-employee avgShiftHours needs the
  // per-section dayRequiredRoles configuration so eligibility
  // filtering matches the generator. Optional; bare callers fall
  // back to SECTIONS defaults via slotsForDay's existing path.
  const dayRequiredRoles = args.dayRequiredRoles || null;
  // v15.4.0: per-week config resolver (see build28DayAggregates). `args.
  // shiftTemplate` is the BASE singleton; the resolver picks per-week config
  // via /configRevisions for both the orphan filter and the blended hours
  // target. Empty configRevisions → base config every week → identical to
  // pre-v15.4.0.
  const resolver = makeWeekConfigResolver(args.configRevisions, args.settings, args.shiftTemplate || null);

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
    // v15.4.0: skip orphan shifts (slot index dropped from the resolved
    // config for that week) — see build28DayAggregates.
    if (!resolver.isLiveShift(s)) continue;
    accum[s.employeeId].shiftDates[s.date] = true;
    accum[s.employeeId].hours += hoursBetween(s.start, s.end);
  }

  // v15.3.0: pro-rate by tenure within the month, holidays counted only in
  // the active sub-range (per-employee — replaces the window-wide
  // holidayDaysInWeekByEmployee).
  const windowStartIso = isoDate(dates[0]);
  const windowEndIso = isoDate(dates[dates.length - 1]);

  empList.forEach(function (e) {
    const a = accum[e.id];
    const shiftsCount = Object.keys(a.shiftDates).length;
    const hoursTotal = a.hours;
    const wpw = Number.isFinite(e.workingDaysPerWeek) && e.workingDaysPerWeek >= 1
      ? Math.min(7, Math.round(e.workingDaysPerWeek))
      : 5;
    const range = activeRangeWithinWindow(e, windowStartIso, windowEndIso);
    const holiday = holidayDayCountForEmployeeInRange(requests, e.id, range.fromIso, range.toIso);
    // Pro-rated target: workingDaysPerWeek averaged across the employee's
    // active days in the month. Full-month tenure (range.days === monthLength)
    // → round(wpw × monthLength/7), identical to pre-v15.3.0. Floored at 0.
    const shiftsTarget = range.days > 0
      ? Math.max(0, Math.round(wpw * range.days / 7) - holiday)
      : 0;
    // v15.4.0: per-week-blended hours target (see build28DayAggregates).
    const hoursTarget = shiftsTarget * blendedAvgShiftHours(resolver, e, dayRequiredRoles, windowStartIso, windowEndIso);
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

// v15.4.0: optional `isLiveShift` predicate skips orphan shifts (slot index
// dropped from the resolved config for that shift's week). Omitting it keeps
// the pre-v15.4.0 "count everything" behaviour for any bare caller.
function aggregateShiftsInRange(shiftsMap, empId, fromIso, toIso, isLiveShift) {
  const seenDates = {};
  let hours = 0;
  const all = Object.values(shiftsMap || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (!s || s.employeeId !== empId || !s.date) continue;
    if (s.date < fromIso || s.date > toIso) continue;
    if (isLiveShift && !isLiveShift(s)) continue;
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
  // v1.14.0 follow-up: forwarded into avgShiftHours so the helper's
  // eligible-slot list matches what the generator's eligibility
  // filter sees (configurable per-section day-role rules).
  const dayRequiredRoles = args.dayRequiredRoles || null;
  // v15.4.0: per-week config resolver. `args.shiftTemplate` is the BASE
  // singleton; the resolver picks per-week config via /configRevisions for
  // both the orphan filter (aggregateShiftsInRange) and the per-window blended
  // hours target. Empty configRevisions → base config every week → identical
  // to pre-v15.4.0.
  const resolver = makeWeekConfigResolver(args.configRevisions, args.settings, args.shiftTemplate || null);

  const wpw = wpwOf(employee);

  // ── rolling28 ──
  const r28From = addDays(weekStart, -21);
  const r28To = addDays(weekStart, 6);
  const r28FromIso = isoDate(r28From);
  const r28ToIso = isoDate(r28To);
  const r28Agg = aggregateShiftsInRange(shifts, employee.id, r28FromIso, r28ToIso, resolver.isLiveShift);
  // v15.3.0: pro-rate by tenure-active days within the window; holidays
  // counted only inside the active sub-range.
  const r28Range = activeRangeWithinWindow(employee, r28FromIso, r28ToIso);
  const r28Holiday = holidayDayCountForEmployeeInRange(requests, employee.id, r28Range.fromIso, r28Range.toIso);
  const r28ShiftsTarget = r28Range.days > 0
    ? Math.max(0, Math.round(wpw * r28Range.days / 7) - r28Holiday)
    : 0;
  // v15.4.0: per-week-blended avg shift hours (was a single focus-week value).
  const r28Avg = blendedAvgShiftHours(resolver, employee, dayRequiredRoles, r28FromIso, r28ToIso);
  const r28HoursTarget = r28ShiftsTarget * r28Avg;

  // ── calendarMonth (the month containing weekStart's Monday) ──
  const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  const monthEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
  const monthStartIso = isoDate(monthStart);
  const monthEndIso = isoDate(monthEnd);
  const monthDayCount = monthEnd.getDate();
  const monthAgg = aggregateShiftsInRange(shifts, employee.id, monthStartIso, monthEndIso, resolver.isLiveShift);
  // v15.3.0: pro-rate by tenure-active days within the month.
  const monthRange = activeRangeWithinWindow(employee, monthStartIso, monthEndIso);
  const monthHoliday = holidayDayCountForEmployeeInRange(requests, employee.id, monthRange.fromIso, monthRange.toIso);
  // Pro-rated target: workingDaysPerWeek averaged across the employee's
  // active days in the month. Full-month tenure → round(wpw × monthLen/7),
  // identical to pre-v15.3.0.
  const monthShiftsTarget = monthRange.days > 0
    ? Math.max(0, Math.round(wpw * monthRange.days / 7) - monthHoliday)
    : 0;
  // v15.4.0: per-week-blended avg shift hours across the month's weeks.
  const monthAvg = blendedAvgShiftHours(resolver, employee, dayRequiredRoles, monthStartIso, monthEndIso);
  const monthHoursTarget = monthShiftsTarget * monthAvg;
  const monthLabel = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  // ── perWeek (4 buckets ending at focus week's Sunday) ──
  const perWeek = [];
  for (let offset = -3; offset <= 0; offset++) {
    const wkStart = addDays(weekStart, offset * 7);
    const wkEnd = addDays(wkStart, 6);
    const wkFromIso = isoDate(wkStart);
    const wkToIso = isoDate(wkEnd);
    const agg = aggregateShiftsInRange(shifts, employee.id, wkFromIso, wkToIso, resolver.isLiveShift);
    // v15.3.0: pro-rate by tenure-active days in the bucket week.
    const wkRange = activeRangeWithinWindow(employee, wkFromIso, wkToIso);
    const wkHoliday = holidayDayCountForEmployeeInRange(requests, employee.id, wkRange.fromIso, wkRange.toIso);
    const wkTarget = wkRange.days > 0
      ? Math.max(0, Math.round(wpw * wkRange.days / 7) - wkHoliday)
      : 0;
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
      // v15.3.0: active days in this bucket (7 when fully tenured).
      activeDays: wkRange.days,
    });
  }

  return {
    rolling28: {
      shiftsCount: r28Agg.shiftsCount,
      hoursTotal: r28Agg.hoursTotal,
      shiftsTarget: r28ShiftsTarget,
      hoursTarget: r28HoursTarget,
      // v15.4.0: per-week-blended avg shift hours used for hoursTarget, so the
      // Reasoning view's "shifts target × avg = hoursTarget" stays consistent.
      avgShiftHours: r28Avg,
      holidayDays: r28Holiday,
      dateFromIso: r28FromIso,
      dateToIso: r28ToIso,
      // v15.3.0: active (in-tenure) days in the 28-day window, and the
      // full window length, so the Reasoning view can show the pro-rating.
      activeDays: r28Range.days,
      windowDays: 28,
    },
    calendarMonth: {
      monthLabel: monthLabel,
      monthStartIso: monthStartIso,
      monthEndIso: monthEndIso,
      shiftsCount: monthAgg.shiftsCount,
      hoursTotal: monthAgg.hoursTotal,
      shiftsTarget: monthShiftsTarget,
      hoursTarget: monthHoursTarget,
      // v15.4.0: per-week-blended avg shift hours used for hoursTarget.
      avgShiftHours: monthAvg,
      holidayDays: monthHoliday,
      // v15.3.0: active (in-tenure) days in the month + full month length.
      activeDays: monthRange.days,
      windowDays: monthDayCount,
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
      // v16.0.0: a per-weekday override can drop this row on this weekday.
      // Without this gate every extra union-ladder row would read as an
      // unfilled cell on every non-overriding weekday — which would keep
      // isWeekComplete permanently false (Export PDF disabled forever) and
      // wildly inflate the incomplete-export warning count.
      if (!isSlotScheduledOnDate(slot, dates[d])) continue;
      const shift = findShiftForSlot(weekShifts, dIso, slot);
      if (!shift || !shift.employeeId) return false;
    }
  }
  return true;
}

// ── Empty-cell count (v15.2.0) ───────────────────────────────────────────
// Mirrors isWeekComplete's loop but counts (rather than short-circuits)
// every OPEN cell on an OPEN dayPart that has no assignee. Used by the
// incomplete-export warning modal so the manager sees exactly how many
// slots will print blank before confirming. Closed days / closed dayParts
// never count (they're not cells the manager is expected to fill).
export function countEmptyCells(weekShifts, weekStartDate, slots, openingDays) {
  const dates = visibleWeekDates(weekStartDate, openingDays);
  let count = 0;
  for (let d = 0; d < dates.length; d++) {
    const dIso = isoDate(dates[d]);
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      if (!isSlotOpenOnDate(dates[d], slot, openingDays)) continue;
      // v16.0.0: a per-weekday override can drop this row on this weekday.
      // Without this gate every extra union-ladder row would read as an
      // unfilled cell on every non-overriding weekday — which would keep
      // isWeekComplete permanently false (Export PDF disabled forever) and
      // wildly inflate the incomplete-export warning count.
      if (!isSlotScheduledOnDate(slot, dates[d])) continue;
      const shift = findShiftForSlot(weekShifts, dIso, slot);
      if (!shift || !shift.employeeId) count += 1;
    }
  }
  return count;
}

// ── Employee tenure (v15.2.0) ────────────────────────────────────────────
// Optional `activeFrom` / `activeUntil` ISO-date strings bracket each
// employee's employment window. An employee is schedulable on a given date
// iff they're not archived AND the date sits inside the (possibly open-
// ended) window. Absent endpoint = unbounded on that side. String compares
// work because the format is fixed-width zero-padded "YYYY-MM-DD" (same
// trick used throughout this file).
//
// Single source of truth for the rule — consumed by the generator's
// candidate filter, the manual picker (ShiftFormModal), and (via the
// week-level helper below) the WeeklyShiftSummary + MonthlyFairnessPanel
// visibility skips. Tenure gates ELIGIBILITY + VISIBILITY.
//
// v15.3.0 update: tenure ALSO pro-rates the 28-day / calendar-month / weekly
// fairness TARGET math now — see `activeRangeWithinWindow` and its callers in
// the three aggregate builders. (The original v15.2.0 simplification that left
// targets un-prorated no longer applies.)
// v15.4.0 update: the aggregate windows resolve config PER WEEK
// (`makeWeekConfigResolver`), so the v15.1.0 "focus-week config across the whole
// window" shortcut this comment used to reference is also gone.
export function isEmployeeActiveOnDate(emp, dateIso) {
  if (!emp || emp.active === false) return false;
  if (emp.activeFrom && dateIso < emp.activeFrom) return false;
  if (emp.activeUntil && dateIso > emp.activeUntil) return false;
  return true;
}

// True iff the employee's tenure (+ active flag) overlaps ANY date in the
// supplied array. `dates` may be Date objects or ISO strings.
export function employeeTenureOverlapsDates(emp, dates) {
  if (!emp || emp.active === false) return false;
  if (!Array.isArray(dates)) return false;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const iso = typeof d === "string" ? d : isoDate(d);
    if (isEmployeeActiveOnDate(emp, iso)) return true;
  }
  return false;
}
