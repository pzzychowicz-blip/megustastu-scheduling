// src/lib/generator.js
// v1.0.0 — Auto-generator. Pure algorithm: data in → new-shifts + summary out.
//
// NO React. NO Firebase. The caller iterates `newShifts` and persists them
// via `actions.upsertShift()` per record. Splitting the algorithm from the
// persistence loop lets us unit-test the algorithm in the future without
// touching Firebase, and keeps the write-guard pattern centralized in
// usePersistence.js (where it belongs).
//
// Locked decisions (see plan + CLAUDE.md):
//   - Fill-empty only — never overwrite an existing shift with an employeeId.
//   - Requests are a HARD block — generator never auto-assigns over a
//     covering day-off / holiday request. Manager retains manual override
//     via the picker modal's "Show staff on day off / holiday" toggle.
//   - Preference is switchable via /settings.generatorStrictPreference.
//     Soft (default): try preferred employees first, fall back to anyone
//     eligible. Hard: only preference-matching employees, otherwise leave
//     the cell empty.
//   - Greedy: at each cell, the best-ranked candidate wins. We do not
//     backtrack. Tight schedules may leave cells empty — manager fills
//     them manually. Locked decision: "leaves cells empty rather than
//     violating rules."
//
// The algorithm mirrors the manual picker's eligibility chain
// (ShiftFormModal.jsx) so a generator-assigned cell matches what a
// careful manager would have picked themselves.
//
// v1.6.1: the per-candidate working-days cap now respects the same
// "effective quota" math the v1.6.0 Shifts-assigned pill shows —
// raw workingDaysPerWeek minus the count of visible-week dates the
// employee has a dayoff/holiday request covering. Single source of
// truth via `daysOffInWeekByEmployee` in schedule-logic.js.
//
// v1.7.0: Regenerate became wipe-and-refill — every shift in the week
// is cleared, then the fill-empty pass runs against an empty map.
// The old `clearInvalidShifts` pre-pass is gone (manager wanted a
// fresh global allocation rather than localized constraint repairs).
// `roleMatches` was lifted into schedule-logic.js as
// `roleMatchesSlot` (now shared with the v1.7.0 Swap mechanic).

import {
  visibleWeekDates,
  weekdayKeyForDate,
  isoDate,
  slotsForDay,
  findShiftForSlot,
  findSameDayShift,
  findRequestConflict,
  findShiftPreferenceMismatch,
  hasConsecutiveDaysOff,
  withinMaxConsecutiveWorkingDays,
  isSlotOpenOnDate,
  daysOffInWeekByEmployee,
  roleMatchesSlot,
} from "./schedule-logic.js";
import { DEFAULT_WORKING_DAYS } from "./constants.js";

// ── Helpers ──────────────────────────────────────────────────────────────

// Read employee.workingDaysPerWeek with the same fallback the form uses.
function workingDaysFor(emp) {
  const v = emp && typeof emp.workingDaysPerWeek === "number" ? emp.workingDaysPerWeek : null;
  if (v === null) return DEFAULT_WORKING_DAYS;
  if (v < 1) return 1;
  if (v > 7) return 7;
  return Math.round(v);
}

// fixedDays gating: when set, the employee may only work on weekdays
// whose key is truthy in the map. Null/undefined fixedDays → no gating.
function fixedDaysAllows(emp, date) {
  if (!emp.fixedDays) return true;
  return Boolean(emp.fixedDays[weekdayKeyForDate(date)]);
}

// Preference match for soft/hard:
//   day slot      ← preference "day"     or "either"
//   evening slot  ← preference "evening" or "either"
//   missing pref  → treated as "either" (safest default)
function preferenceMatches(emp, slotDef) {
  const pref = emp.preference || "either";
  if (pref === "either") return true;
  if (slotDef.isDay) return pref === "day";
  return pref === "evening";
}

// For evening slots where slotDef.defaultRole is null (slot index >= role
// count), pick the first role from the intersection of employee.roles ∩
// slotDef.eligibleRoles. Returns "" if no overlap (shouldn't happen since
// roleMatches already filtered).
function resolveEveningRole(emp, slotDef) {
  if (slotDef.defaultRole) return slotDef.defaultRole;
  const elig = slotDef.eligibleRoles || [];
  const roles = Array.isArray(emp.roles) ? emp.roles : [];
  for (let i = 0; i < elig.length; i++) {
    if (roles.indexOf(elig[i]) !== -1) return elig[i];
  }
  return "";
}

// Count of unique dates this employee is assigned to in the current
// shifts map (existing + pending). Used to enforce workingDaysPerWeek.
function countAssignedDates(shiftsMap, employeeId) {
  if (!employeeId) return 0;
  const seen = {};
  const all = Object.values(shiftsMap || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (!s || s.employeeId !== employeeId || !s.date) continue;
    seen[s.date] = true;
  }
  let n = 0;
  for (const k in seen) if (Object.prototype.hasOwnProperty.call(seen, k)) n++;
  return n;
}

// Map of role → number of active employees holding that role. Used to
// sort the worklist so rarer roles get filled first (constraint
// propagation — fill the hardest slots while options exist).
function buildRoleRarity(employees) {
  const counts = {};
  const all = Object.values(employees || {});
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    if (e.active === false) continue;
    const roles = Array.isArray(e.roles) ? e.roles : [];
    for (let r = 0; r < roles.length; r++) {
      counts[roles[r]] = (counts[roles[r]] || 0) + 1;
    }
  }
  return counts;
}

// Stable worklist ordering:
//   1. v1.5.0: Eligible-candidate count ascending — most-constrained
//      first. A cell with only one qualifying employee gets picked
//      before a cell with five, so versatile candidates are saved for
//      the cells that actually need them. Replaces the static
//      role-rarity heuristic that didn't account for request conflicts,
//      quotas, or consecutive-off rules narrowing the real pool.
//      Pre-computed once at worklist-build time; we don't re-rank
//      after each greedy pick (the problem size is ≤49 cells/week
//      and pre-sort captures the bulk of the benefit).
//   2. Evening slots (specific role) before Day slots (any role).
//   3. Role rarity (static count) — stable tiebreak only.
//   4. Date ascending.
//   5. Slot key (deterministic).
function compareWorklistEntries(a, b, rarity) {
  // v1.5.0: most-constrained-cell first.
  const aCount = typeof a.eligibleCount === "number" ? a.eligibleCount : Infinity;
  const bCount = typeof b.eligibleCount === "number" ? b.eligibleCount : Infinity;
  if (aCount !== bCount) return aCount - bCount;
  const aEve = !a.slot.isDay ? 0 : 1;
  const bEve = !b.slot.isDay ? 0 : 1;
  if (aEve !== bEve) return aEve - bEve;
  if (aEve === 0) {
    // Both evening — compare role rarity as a stable tiebreak.
    const aRole = a.slot.defaultRole || (a.slot.eligibleRoles || [])[0] || "";
    const bRole = b.slot.defaultRole || (b.slot.eligibleRoles || [])[0] || "";
    const ar = rarity[aRole] || 0;
    const br = rarity[bRole] || 0;
    if (ar !== br) return ar - br;
  }
  if (a.dateIso !== b.dateIso) return a.dateIso < b.dateIso ? -1 : 1;
  return a.slot.key < b.slot.key ? -1 : 1;
}

// Candidate ranking (after eligibility filter). Sort key (lowest wins):
//   1. v1.3.0: scheduling priority (true wins). Priority employees fill
//      before any non-priority employee — the manager has marked them as
//      "push toward full hours." Specialists rule + load-balance only
//      tiebreak within the priority and non-priority groups separately.
//   2. Specialists first (roles.length asc).
//   3. Combined load (this week + prior week) ascending.
//   4. Name (lexicographic).
//
// Identical heuristic to ShiftFormModal's picker order (specialists +
// load) so generator-picked employees match what a careful manager would
// pick. Priority is the only generator-specific dimension; the manual
// picker doesn't reorder by it because the manager picks one cell at a
// time and can see priority on the employee row.
//
// v1.1.0 fairness: the combined load includes prior-week shift counts
// so an under-utilized employee from last week gets prioritized this
// week. Two-week totals tend to even out. priorShifts may be `{}` or
// undefined for the first week or when no history is provided —
// `countAssignedDates` returns 0 cleanly in both cases.
function rankCandidates(candidates, currentShifts, priorShifts) {
  const currentCounts = {};
  const priorCounts = {};
  return candidates.slice().sort(function (a, b) {
    const aP = a.schedulingPriority === true ? 0 : 1;
    const bP = b.schedulingPriority === true ? 0 : 1;
    if (aP !== bP) return aP - bP;
    const aR = Array.isArray(a.roles) ? a.roles.length : 0;
    const bR = Array.isArray(b.roles) ? b.roles.length : 0;
    if (aR !== bR) return aR - bR;
    if (currentCounts[a.id] === undefined) currentCounts[a.id] = countAssignedDates(currentShifts, a.id);
    if (currentCounts[b.id] === undefined) currentCounts[b.id] = countAssignedDates(currentShifts, b.id);
    if (priorCounts[a.id] === undefined) priorCounts[a.id] = countAssignedDates(priorShifts, a.id);
    if (priorCounts[b.id] === undefined) priorCounts[b.id] = countAssignedDates(priorShifts, b.id);
    const aCombined = currentCounts[a.id] + priorCounts[a.id];
    const bCombined = currentCounts[b.id] + priorCounts[b.id];
    if (aCombined !== bCombined) return aCombined - bCombined;
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  });
}

// ── Eligibility ──────────────────────────────────────────────────────────
// Returns { eligible: [...], reason: string|null } where `reason` is set
// when the list is empty after filtering — the worst-but-most-actionable
// reason for the manager to see, in order:
//   "no-role-match"     — nobody holds the right role at all
//   "all-on-request"    — would-be candidates are all on day-off / holiday
//   "all-shift-pref"    — v1.2.0: all conflicted with a shift-preference
//                          request that demands the other dayPart
//   "all-conflicted"    — would-be candidates are already on another shift
//                          this date or blocked by fixedDays
//   "all-at-quota"      — would-be candidates have hit workingDaysPerWeek
//                          (v1.6.1: effective cap = raw − days-off-in-week)
//   "no-2-off"          — v1.2.0: adding this shift would leave the
//                          candidate without 2 consecutive days off
//   "preference"        — Hard mode left no preference-matching candidates
//
// v1.6.1: `daysOffByEmp` (optional) is the {[empId]: count} map of
// distinct visible-week dates each employee has covered by a dayoff /
// holiday request. The quota gate uses it to lower each candidate's
// effective cap (max(0, raw − off)). Missing / undefined defaults to
// 0 per-candidate so legacy callers that don't pass it keep raw-cap
// behaviour.
function buildCandidates(
  slotDef, dateIso, date, weekStart,
  employees, requests, currentShifts, strictPreference,
  daysOffByEmp, crossWeekShifts
) {
  const all = Object.values(employees || {});
  if (all.length === 0) return { eligible: [], reason: "no-role-match" };

  // (1) Active + role match.
  const roleOk = all.filter(function (e) {
    if (e.active === false) return false;
    return roleMatchesSlot(e, slotDef);
  });
  if (roleOk.length === 0) return { eligible: [], reason: "no-role-match" };

  // (2) Request conflict — HARD block (dayoff / holiday only; v1.2.0
  // guard inside findRequestConflict skips shift-preference requests).
  const requestOk = roleOk.filter(function (e) {
    return !findRequestConflict(requests, e.id, dateIso);
  });
  if (requestOk.length === 0) return { eligible: [], reason: "all-on-request" };

  // (3) v1.2.0: shift-preference mismatch — HARD block. An employee with a
  // "day only" request for this date cannot be picked for an Evening slot
  // (and vice-versa). Handled separately from findRequestConflict because
  // it's dayPart-scoped, not full-day.
  const prefRequestOk = requestOk.filter(function (e) {
    return !findShiftPreferenceMismatch(requests, e.id, dateIso, slotDef.dayPart);
  });
  if (prefRequestOk.length === 0) return { eligible: [], reason: "all-shift-pref" };

  // (4) Same-day strict + fixedDays gate.
  const dayOk = prefRequestOk.filter(function (e) {
    if (findSameDayShift(currentShifts, e.id, dateIso, null)) return false;
    if (!fixedDaysAllows(e, date)) return false;
    return true;
  });
  if (dayOk.length === 0) return { eligible: [], reason: "all-conflicted" };

  // (5) Working-days quota. v1.6.1: effective cap = raw − dayoff/holiday
  // days in the visible week (Math.max floor at 0 so a fully-on-holiday
  // employee can't be picked). Mirrors WeeklyShiftSummary's pill math.
  const quotaOk = dayOk.filter(function (e) {
    const rawCap = workingDaysFor(e);
    const off = (daysOffByEmp && daysOffByEmp[e.id]) || 0;
    const cap = Math.max(0, rawCap - off);
    return countAssignedDates(currentShifts, e.id) < cap;
  });
  if (quotaOk.length === 0) return { eligible: [], reason: "all-at-quota" };

  // (6) v1.2.0: consecutive 2 days off — HARD block. Simulate adding this
  // shift and check the candidate would still have 2 consecutive off days.
  // v1.8.0 threads `crossWeekShifts` into the helper so the rule sees the
  // prior Sunday and next Monday — a Sun-off + next-Mon-off pattern
  // counts as 2-off even though it straddles the week boundary.
  const restedOk = quotaOk.filter(function (e) {
    const simKey = "__sim_" + e.id;
    const sim = {
      ...currentShifts,
      [simKey]: { employeeId: e.id, date: dateIso, id: simKey },
    };
    return hasConsecutiveDaysOff(e.id, weekStart, sim, undefined, crossWeekShifts);
  });
  if (restedOk.length === 0) return { eligible: [], reason: "no-2-off" };

  // (6.5) v1.8.0: max consecutive working days — HARD block. The 2-off rule
  // above is per-calendar-week and can be satisfied by rest at the EDGES
  // of two adjacent weeks (e.g. week 1 Mon-Tue off + Wed-Sun work, then
  // week 2 Mon-Fri work + Sat-Sun off → 10 days straight, each week
  // independently passes). This filter caps the maximum stretch at 5
  // working days across the 21-day window [prior, focus, next], so an
  // employee gets a rest day at least every 6 days.
  const cappedOk = restedOk.filter(function (e) {
    const simKey = "__sim_" + e.id;
    const sim = {
      ...currentShifts,
      [simKey]: { employeeId: e.id, date: dateIso, id: simKey },
    };
    return withinMaxConsecutiveWorkingDays(e.id, weekStart, sim, undefined, crossWeekShifts);
  });
  if (cappedOk.length === 0) return { eligible: [], reason: "max-consecutive" };

  // (7) Preference. Hard mode = filter and stop; Soft mode = filter, but
  // fall back to `cappedOk` if the preferred set is empty.
  const prefOk = cappedOk.filter(function (e) {
    return preferenceMatches(e, slotDef);
  });
  if (prefOk.length > 0) return { eligible: prefOk, reason: null };
  if (strictPreference) return { eligible: [], reason: "preference" };
  return { eligible: cappedOk, reason: null };
}

// ── Regenerate wipe-pass (v1.7.0, policy-aware v1.8.1) ───────────────────
// In v1.7.0 Regenerate became wipe-and-refill: every shift in the week is
// cleared unconditionally, then the fill-empty pass runs against an empty
// map.
//
// v1.8.1 makes the wipe policy-driven. Two independent flags on the
// confirm modal (default both ON):
//   - preserveTimes:        keep cells where start/end/role differs from
//                           the slot template defaults.
//   - preserveAssignments:  keep cells where employeeId is set (someone
//                           is assigned).
//
// Each axis acts independently — a cell can have its assignment kept
// while its custom times are reset, or vice versa. The wipe pass
// produces three outputs:
//   - cleared:          records to DELETE from Firebase (cell becomes
//                       truly empty after policy applied, OR neither
//                       axis preserved it). Worklist re-fills these.
//   - modified:         records to UPSERT to Firebase with partially
//                       updated fields (employee kept but times reset,
//                       for instance). Already updated in-place in
//                       workingShifts so the worklist skips them.
//   - pendingOverrides: map keyed by `${dateIso}|${slotKey}`. When a
//                       cell's record is deleted but its time/role
//                       override is preserved (preserveTimes ON +
//                       preserveAssignments OFF on an override+
//                       employee cell), fill-empty must apply those
//                       saved values to the new shift it creates.
//
// Cleared records carry the v1.4.0 snapshot shape so GenerateResultsModal
// can still render each row after Firebase deletes the record.
function hasTimeOrRoleOverride(shift, slot) {
  if (!shift || !slot) return false;
  if (shift.start && shift.start !== slot.defaultStart) return true;
  if (shift.end && shift.end !== slot.defaultEnd) return true;
  // Day shifts always have role=null per design — no override possible.
  if (!slot.isDay && shift.role && shift.role !== slot.defaultRole) return true;
  return false;
}

function buildClearedRecord(id, shift, slotKey) {
  return {
    id: id,
    reason: "regenerated",
    date: shift.date || null,
    employeeId: shift.employeeId || null,
    section: shift.section || null,
    dayPart: shift.dayPart || null,
    slotIndex: shift.slotIndex || 0,
    slotKey: slotKey,
  };
}

function wipeShiftsWithPolicy(workingShifts, slotsByKey, policy) {
  const preserveTimes = Boolean(policy && policy.preserveTimes);
  const preserveAssignments = Boolean(policy && policy.preserveAssignments);

  const cleared = [];
  const modified = [];
  const pendingOverrides = {};

  const ids = Object.keys(workingShifts);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const s = workingShifts[id];
    if (!s) { delete workingShifts[id]; continue; }
    const slotKey = s.section + "-" + s.dayPart + "-" + (s.slotIndex || 0);
    const slot = slotsByKey ? slotsByKey[slotKey] : null;
    if (!slot) {
      // Stale record — template changed since this was written. Wipe.
      cleared.push(buildClearedRecord(id, s, slotKey));
      delete workingShifts[id];
      continue;
    }

    const defaultRole = slot.isDay ? null : (slot.defaultRole || null);
    const hasOverride = hasTimeOrRoleOverride(s, slot);
    const hasEmployee = Boolean(s.employeeId);

    // Resolve target fields under policy, per axis.
    const keepTimes = preserveTimes && hasOverride;
    const keepEmployee = preserveAssignments && hasEmployee;
    const nextStart = keepTimes ? s.start : slot.defaultStart;
    const nextEnd = keepTimes ? s.end : slot.defaultEnd;
    const nextRole = keepTimes ? s.role : defaultRole;
    const nextEmpId = keepEmployee ? s.employeeId : null;

    if (nextEmpId) {
      // Cell remains assigned. Apply any field modifications in place.
      const fieldsChanged = nextStart !== s.start
        || nextEnd !== s.end
        || nextRole !== s.role
        || nextEmpId !== s.employeeId;
      if (fieldsChanged) {
        workingShifts[id] = {
          ...s,
          start: nextStart,
          end: nextEnd,
          role: nextRole,
          employeeId: nextEmpId,
        };
        modified.push(workingShifts[id]);
      }
      // (Worklist will skip this cell because workingShifts still has a
      //  record with employeeId set — exactly what we want.)
      continue;
    }

    // Post-policy state has no employee. Either:
    //   (a) preserveTimes preserved a time/role override — record the
    //       override under pendingOverrides so fill-empty applies it to
    //       the new record it creates for this cell.
    //   (b) no overrides preserved — vanilla wipe.
    // Either way the existing record is deleted so the cell becomes
    // worklist-fillable.
    if (keepTimes) {
      pendingOverrides[s.date + "|" + slotKey] = {
        start: nextStart,
        end: nextEnd,
        role: nextRole,
      };
    }
    cleared.push(buildClearedRecord(id, s, slotKey));
    delete workingShifts[id];
  }

  return { cleared: cleared, modified: modified, pendingOverrides: pendingOverrides };
}

// ── Main entry point ─────────────────────────────────────────────────────
// `mode` is "fill-empty" (default, v1.0.0 behaviour) or "regenerate"
// (v1.7.0 wipe-and-refill — clears every shift in the week, then fills
// empties fresh). The return shape carries `clearedShiftIds: [...]` so
// the GenerateButton caller knows which records to delete from Firebase.

export function generateWeek(args) {
  const mode = args.mode === "regenerate" ? "regenerate" : "fill-empty";
  const weekStart = args.weekStart;
  const employees = args.employees || {};
  const requests = args.requests || {};
  const shiftTemplate = args.shiftTemplate;
  const openingDays = args.openingDays;
  const strictPreference = Boolean(args.strictPreference);
  // v1.1.0 fairness: prior 7-day window shifts. Defaults to {} when the
  // caller doesn't supply one (first week, or tests). `countAssignedDates`
  // returns 0 for empty maps, so the ranking degrades cleanly.
  const priorWeekShifts = args.priorWeekShifts || {};
  // v1.8.0: next 7-day window shifts, used by hasConsecutiveDaysOff to
  // detect a 2-off run that straddles Sun ↔ next-Mon. Optional — when
  // omitted, the helper defaults the next-Mon boundary day to "worked"
  // and behaves like the pre-v1.8.0 Mon..Sun-only scan at the trailing
  // boundary.
  const nextWeekShifts = args.nextWeekShifts || {};
  const crossWeekShifts = { priorWeekShifts: priorWeekShifts, nextWeekShifts: nextWeekShifts };

  // v1.8.1: preserve-on-regenerate policy. Both flags default ON so the
  // common case is "don't lose my edits." When both are true, Regenerate
  // degenerates into Fill-empty (only truly empty cells get filled).
  // The caller (GenerateConfirmModal) provides explicit values.
  const policy = {
    preserveTimes: args.preserveTimes !== false,
    preserveAssignments: args.preserveAssignments !== false,
  };

  // No template → nothing meaningful to do. Caller should ensure this is
  // populated (AppShell waits for `ready`), but stay defensive.
  if (!shiftTemplate) {
    return {
      newShifts: [],
      clearedShiftIds: [],
      summary: { filled: 0, unfilled: 0, total: 0, cleared: 0, unfilledCells: [] },
    };
  }

  const slots = slotsForDay(shiftTemplate);
  const slotsByKey = {};
  for (let i = 0; i < slots.length; i++) slotsByKey[slots[i].key] = slots[i];
  const dates = visibleWeekDates(weekStart, openingDays);
  const rarity = buildRoleRarity(employees);

  // v1.6.1: per-employee count of visible-week dates blocked by a dayoff/
  // holiday request. Computed once and threaded through buildCandidates
  // so the quota gate matches the effective cap the UI advertises.
  const daysOffByEmp = daysOffInWeekByEmployee(requests, dates);

  // workingShifts starts as a shallow clone so we never mutate caller data.
  // v1.7.0: in regenerate mode, the wipe-pass empties it entirely; in
  // fill-empty mode the clone preserves all existing shifts so the
  // worklist skips already-filled cells.
  const workingShifts = { ...(args.weekShifts || {}) };
  let clearedRecords = [];
  let modifiedRecords = [];
  let pendingOverrides = {};
  if (mode === "regenerate") {
    const wipeResult = wipeShiftsWithPolicy(workingShifts, slotsByKey, policy);
    clearedRecords = wipeResult.cleared;
    modifiedRecords = wipeResult.modified;
    pendingOverrides = wipeResult.pendingOverrides;
  }

  // Build the worklist: every (date, slot) pair on open days where the
  // slot's dayPart is open on that date, with no existing shift in
  // workingShifts. (Existing records — assigned or unassigned — block
  // fill-empty in v1.0.0. Regenerate clears unassigned records in its
  // pre-pass, so they become fillable here.)
  //
  // v1.3.0: a slot whose dayPart is closed on that date is skipped
  // entirely — the cell is not part of the rota that day.
  //
  // v1.5.0: each entry carries `eligibleCount` — the size of the
  // candidate pool returned by buildCandidates() against the
  // post-clearance workingShifts. Used by compareWorklistEntries as
  // the primary sort key (most-constrained first). We compute the
  // count against `workingShifts` (not `pendingShifts`) because at
  // sort time no pending picks exist yet — every cell sees the same
  // starting state.
  const work = [];
  for (let d = 0; d < dates.length; d++) {
    const date = dates[d];
    const dIso = isoDate(date);
    for (let s = 0; s < slots.length; s++) {
      const slot = slots[s];
      if (!isSlotOpenOnDate(date, slot, openingDays)) continue;
      const existing = findShiftForSlot(workingShifts, dIso, slot);
      if (existing) continue;
      const built = buildCandidates(
        slot, dIso, date, weekStart,
        employees, requests, workingShifts, strictPreference, daysOffByEmp,
        crossWeekShifts
      );
      work.push({
        dateIso: dIso,
        date: date,
        slot: slot,
        eligibleCount: built.eligible.length,
      });
    }
  }
  work.sort(function (a, b) { return compareWorklistEntries(a, b, rarity); });

  // pendingShifts is the working map plus this run's additions. Used for
  // same-day strict + quota checks during candidate building.
  const pendingShifts = { ...workingShifts };
  const newShifts = [];
  const unfilledCells = [];
  let filled = 0;

  for (let i = 0; i < work.length; i++) {
    const entry = work[i];
    const slot = entry.slot;
    const built = buildCandidates(
      slot, entry.dateIso, entry.date, weekStart,
      employees, requests, pendingShifts, strictPreference, daysOffByEmp,
      crossWeekShifts
    );
    if (built.eligible.length === 0) {
      unfilledCells.push({
        dateIso: entry.dateIso,
        slotKey: slot.key,
        reason: built.reason || "no-eligible",
      });
      continue;
    }
    const ranked = rankCandidates(built.eligible, pendingShifts, priorWeekShifts);
    const winner = ranked[0];

    // v1.8.1: if the wipe-pass preserved a time/role override for this
    // cell (preserveTimes ON, preserveAssignments OFF on an
    // override+employee cell), apply the saved values to the new
    // record. Falls through to template defaults when no override
    // was saved.
    const overrideKey = entry.dateIso + "|" + slot.key;
    const override = pendingOverrides[overrideKey];
    const role = override
      ? override.role
      : (slot.isDay ? null : (resolveEveningRole(winner, slot) || null));
    const payload = {
      date: entry.dateIso,
      section: slot.section,
      dayPart: slot.dayPart,
      slotIndex: slot.slotIndex,
      role: role,
      start: override ? override.start : slot.defaultStart,
      end: override ? override.end : slot.defaultEnd,
      employeeId: winner.id,
    };
    newShifts.push(payload);

    const pendKey = "__pending_" + i;
    pendingShifts[pendKey] = { ...payload, id: pendKey };
    filled++;
  }

  return {
    newShifts: newShifts,
    clearedShiftIds: clearedRecords.map(function (c) { return c.id; }),
    modifiedShifts: modifiedRecords,
    summary: {
      filled: filled,
      unfilled: unfilledCells.length,
      total: work.length,
      cleared: clearedRecords.length,
      modified: modifiedRecords.length,
      unfilledCells: unfilledCells,
      clearedReasons: clearedRecords,
    },
  };
}
