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

import {
  visibleWeekDates,
  weekdayKeyForDate,
  isoDate,
  parseIsoDate,
  slotsForDay,
  findShiftForSlot,
  findSameDayShift,
  findRequestConflict,
  findShiftPreferenceMismatch,
  hasConsecutiveDaysOff,
  isSlotOpenOnDate,
  daysOffInWeekByEmployee,
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

// Day shift: when the slot carries `requiredRoles` (v1.1.0), the
// employee must hold AT LEAST ONE of them. Otherwise (legacy / FoH) any
// of `coversRoles` is enough.
// Evening shift: the slot's specific defaultRole, or any of eligibleRoles
// when defaultRole is null (count > role list — edge case).
function roleMatches(emp, slotDef) {
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
    // Fallback: permissive "any of coversRoles".
    const covers = slotDef.coversRoles || [];
    for (let i = 0; i < roles.length; i++) {
      if (covers.indexOf(roles[i]) !== -1) return true;
    }
    return false;
  }
  // Evening
  if (slotDef.defaultRole) return roles.indexOf(slotDef.defaultRole) !== -1;
  const elig = slotDef.eligibleRoles || [];
  for (let i = 0; i < roles.length; i++) {
    if (elig.indexOf(roles[i]) !== -1) return true;
  }
  return false;
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
  daysOffByEmp
) {
  const all = Object.values(employees || {});
  if (all.length === 0) return { eligible: [], reason: "no-role-match" };

  // (1) Active + role match.
  const roleOk = all.filter(function (e) {
    if (e.active === false) return false;
    return roleMatches(e, slotDef);
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
  // shift and check the candidate would still have 2 consecutive off days
  // this calendar week. We use a synthetic key so the simulated shift
  // participates in `hasConsecutiveDaysOff`'s map walk.
  const restedOk = quotaOk.filter(function (e) {
    const simKey = "__sim_" + e.id;
    const sim = {
      ...currentShifts,
      [simKey]: { employeeId: e.id, date: dateIso, id: simKey },
    };
    return hasConsecutiveDaysOff(e.id, weekStart, sim);
  });
  if (restedOk.length === 0) return { eligible: [], reason: "no-2-off" };

  // (7) Preference. Hard mode = filter and stop; Soft mode = filter, but
  // fall back to `restedOk` if the preferred set is empty.
  const prefOk = restedOk.filter(function (e) {
    return preferenceMatches(e, slotDef);
  });
  if (prefOk.length > 0) return { eligible: prefOk, reason: null };
  if (strictPreference) return { eligible: [], reason: "preference" };
  return { eligible: restedOk, reason: null };
}

// ── Regenerate pre-pass (v1.1.0, extended v1.2.0, v1.3.0) ────────────────
// Walks every existing shift in the week and clears any that no longer
// satisfy the current constraints. Returns the cleared-id list and a
// shallow-cloned weekShifts map with the cleared entries removed; the
// caller passes that working map into the normal fill-empty pass.
//
// Constraint order (mirrors buildCandidates but applied per-existing-shift):
//   1. Shift sits on a fully-closed day (manager toggled the day off).
//   2. v1.3.0: Shift's dayPart was closed on its date (manager opened
//      day-only or evening-only on a previously full-open day).
//   3. Shift record is unassigned (employeeId is empty). v0.7+'s manual
//      flow deletes the record entirely; an orphan unassigned record is
//      effectively an empty cell and should be eligible for refill.
//   4. Slot definition no longer exists (template count was lowered).
//   5. Employee no longer exists, or is archived.
//   6. Employee no longer holds the required role for the slot.
//   7. Employee now has a covering day-off / holiday request on this date.
//   8. v1.2.0: Shift-preference mismatch (slot's dayPart conflicts with
//      the employee's "day only" / "evening only" request for this date).
//   9. Employee's fixedDays no longer allows this date.
//  10. Strict preference mode + employee preference no longer matches.
//  11. Same-day duplicate (rare; would be a pre-existing data drift).
//  12. Workplace quota over-cap — clear the LATEST-date surplus shifts.
//  13. v1.2.0: consecutive-off rule — for each employee not satisfying
//      "2 consecutive days off", clear their LATEST shift and re-check
//      until the rule is satisfied or they have no shifts left.
//
// Quota and consecutive-off are deferred to later passes because they
// depend on which shifts survive the earlier per-shift filters.
function clearInvalidShifts(workingShifts, args, slotsByKey, visibleDateSet) {
  const employees = args.employees;
  const requests = args.requests;
  const strictPreference = args.strictPreference;
  const weekStart = args.weekStart;
  const openingDays = args.openingDays;
  // v1.6.1: { [empId]: count } of visible-week dates blocked by a dayoff/
  // holiday request. Drives the effective-cap math in step 10.
  const daysOffByEmp = args.daysOffByEmp || {};
  const cleared = [];

  // v1.4.0: capture the pre-clear record fields the result modal needs
  // (date, employeeId, slot identity). Without this snapshot the modal
  // would have no way to display "Anna — Tue, Kitchen Day — archived"
  // for a cleared shift, because once `workingShifts[id]` is deleted and
  // the deleteShift call fires in GenerateButton, the original record is
  // gone from React state too.
  function clear(id, reason) {
    const s = workingShifts[id];
    cleared.push({
      id: id,
      reason: reason,
      date: s ? s.date : null,
      employeeId: s ? s.employeeId : null,
      section: s ? s.section : null,
      dayPart: s ? s.dayPart : null,
      slotIndex: s ? (s.slotIndex || 0) : 0,
      slotKey: s ? (s.section + "-" + s.dayPart + "-" + (s.slotIndex || 0)) : null,
    });
    delete workingShifts[id];
  }

  // Step 1–10: single pass over each existing shift.
  const ids = Object.keys(workingShifts);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const s = workingShifts[id];
    if (!s) { delete workingShifts[id]; continue; }

    if (!visibleDateSet[s.date])           { clear(id, "closed-day"); continue; }
    if (!s.employeeId)                     { clear(id, "unassigned"); continue; }

    const slotKey =
      s.section + "-" + s.dayPart + "-" + (s.slotIndex || 0);
    const slotDef = slotsByKey[slotKey];
    if (!slotDef)                          { clear(id, "slot-removed"); continue; }

    // v1.3.0: the slot's dayPart may have been closed on this date even
    // though the date itself is still open (e.g. manager flipped Mon to
    // day-only after assigning an evening shift). Drop those records so
    // the fill-empty pass doesn't see a stale orphan it can't replace.
    if (openingDays && !isSlotOpenOnDate(parseIsoDate(s.date), slotDef, openingDays)) {
      clear(id, "closed-day-part"); continue;
    }

    const emp = employees[s.employeeId];
    if (!emp)                              { clear(id, "no-employee"); continue; }
    if (emp.active === false)              { clear(id, "archived"); continue; }
    if (!roleMatches(emp, slotDef))        { clear(id, "no-role-match"); continue; }

    if (findRequestConflict(requests, s.employeeId, s.date)) {
      clear(id, "on-request"); continue;
    }
    // v1.2.0: shift-preference mismatch.
    if (findShiftPreferenceMismatch(requests, s.employeeId, s.date, slotDef.dayPart)) {
      clear(id, "shift-preference"); continue;
    }
    if (!fixedDaysAllows(emp, parseIsoDate(s.date))) {
      clear(id, "fixed-days"); continue;
    }
    if (strictPreference && !preferenceMatches(emp, slotDef)) {
      clear(id, "preference"); continue;
    }
  }

  // Step 9: same-employee same-date duplicates. For each (emp, date)
  // group, keep the earliest slot-key entry; clear the rest.
  const byEmpDate = {};
  const remaining = Object.keys(workingShifts);
  for (let i = 0; i < remaining.length; i++) {
    const s = workingShifts[remaining[i]];
    const k = s.employeeId + "|" + s.date;
    if (!byEmpDate[k]) byEmpDate[k] = [];
    byEmpDate[k].push(s);
  }
  for (const k in byEmpDate) {
    const group = byEmpDate[k];
    if (group.length <= 1) continue;
    group.sort(function (a, b) {
      const aKey = a.section + "-" + a.dayPart + "-" + (a.slotIndex || 0);
      const bKey = b.section + "-" + b.dayPart + "-" + (b.slotIndex || 0);
      if (aKey === bKey) return 0;
      return aKey < bKey ? -1 : 1;
    });
    for (let i = 1; i < group.length; i++) clear(group[i].id, "same-day-dup");
  }

  // Step 10: workplace-quota over-cap. Distinct-date count per employee
  // > cap → clear the LATEST-date surplus shifts (deterministic).
  // v1.6.1: cap is the effective quota (raw − dayoff/holiday days in the
  // visible week), matching the buildCandidates gate and the UI pill.
  const byEmployee = {};
  const stillRemaining = Object.keys(workingShifts);
  for (let i = 0; i < stillRemaining.length; i++) {
    const s = workingShifts[stillRemaining[i]];
    if (!byEmployee[s.employeeId]) byEmployee[s.employeeId] = [];
    byEmployee[s.employeeId].push(s);
  }
  for (const empId in byEmployee) {
    const emp = employees[empId];
    if (!emp) continue;
    const rawCap = workingDaysFor(emp);
    const off = daysOffByEmp[empId] || 0;
    const cap = Math.max(0, rawCap - off);
    const empShifts = byEmployee[empId];
    const dateSet = {};
    for (let i = 0; i < empShifts.length; i++) dateSet[empShifts[i].date] = true;
    const distinct = Object.keys(dateSet);
    if (distinct.length <= cap) continue;
    distinct.sort(); // ascending → reverse for latest-first
    distinct.reverse();
    const toClear = {};
    for (let i = 0; i < distinct.length - cap; i++) toClear[distinct[i]] = true;
    for (let i = 0; i < empShifts.length; i++) {
      if (toClear[empShifts[i].date]) clear(empShifts[i].id, "over-quota");
    }
  }

  // Step 12 (v1.2.0): consecutive-off rule. For each employee, if their
  // remaining pattern lacks 2 consecutive off days, clear LATEST-date
  // shifts one at a time and re-check. Stops when satisfied or no shifts
  // remain. Latest-first because the fill-empty pass will refill cells
  // greedily and may pick a different schedule shape entirely.
  if (weekStart) {
    const restRemainingByEmp = {};
    const restAllIds = Object.keys(workingShifts);
    for (let i = 0; i < restAllIds.length; i++) {
      const s = workingShifts[restAllIds[i]];
      if (!s || !s.employeeId) continue;
      if (!restRemainingByEmp[s.employeeId]) restRemainingByEmp[s.employeeId] = [];
      restRemainingByEmp[s.employeeId].push(s);
    }
    for (const empId in restRemainingByEmp) {
      // Sort each employee's shifts by date ascending; we'll clear from the
      // tail (latest-first) until the rule is satisfied.
      const list = restRemainingByEmp[empId].sort(function (a, b) {
        if (a.date === b.date) return 0;
        return a.date < b.date ? -1 : 1;
      });
      // Iterate latest-first.
      for (let i = list.length - 1; i >= 0; i--) {
        if (hasConsecutiveDaysOff(empId, weekStart, workingShifts)) break;
        const s = list[i];
        if (workingShifts[s.id]) clear(s.id, "no-2-off");
      }
    }
  }

  return cleared;
}

// ── Main entry point ─────────────────────────────────────────────────────
// v1.1.0: `mode` is "fill-empty" (default, v1.0.0 behaviour) or
// "regenerate" (clears stale assignments first, then fills empties).
// The return shape gains `clearedShiftIds: [...]` for the regenerate
// caller to loop through `actions.deleteShift`.

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
  const visibleDateSet = {};
  for (let i = 0; i < dates.length; i++) visibleDateSet[isoDate(dates[i])] = true;

  const rarity = buildRoleRarity(employees);

  // v1.6.1: per-employee count of visible-week dates blocked by a dayoff/
  // holiday request. Computed once and threaded through buildCandidates +
  // clearInvalidShifts so both the quota gate and the over-quota clear
  // pass respect the same effective cap the UI advertises.
  const daysOffByEmp = daysOffInWeekByEmployee(requests, dates);

  // workingShifts starts as a shallow clone so we never mutate caller data.
  // In regenerate mode, the pre-pass strips invalid entries; in fill-empty
  // mode, the clone is just a defensive copy.
  const workingShifts = { ...(args.weekShifts || {}) };
  let clearedRecords = [];
  if (mode === "regenerate") {
    clearedRecords = clearInvalidShifts(
      workingShifts,
      {
        employees: employees,
        requests: requests,
        strictPreference: strictPreference,
        weekStart: weekStart,                  // v1.2.0: consecutive-off pass
        openingDays: openingDays,              // v1.3.0: closed-day-part clear
        daysOffByEmp: daysOffByEmp,            // v1.6.1: effective quota cap
      },
      slotsByKey,
      visibleDateSet
    );
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
        employees, requests, workingShifts, strictPreference, daysOffByEmp
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
      employees, requests, pendingShifts, strictPreference, daysOffByEmp
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

    const role = slot.isDay ? null : (resolveEveningRole(winner, slot) || null);
    const payload = {
      date: entry.dateIso,
      section: slot.section,
      dayPart: slot.dayPart,
      slotIndex: slot.slotIndex,
      role: role,
      start: slot.defaultStart,
      end: slot.defaultEnd,
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
    summary: {
      filled: filled,
      unfilled: unfilledCells.length,
      total: work.length,
      cleared: clearedRecords.length,
      unfilledCells: unfilledCells,
      clearedReasons: clearedRecords,
    },
  };
}
