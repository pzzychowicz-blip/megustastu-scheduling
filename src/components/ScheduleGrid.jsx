// src/components/ScheduleGrid.jsx
// Weekly schedule view. Two layouts:
//   - Desktop (isMobile=false): 7-column grid (Mon..Sun) × slot rows,
//     grouped visually by section/day-part.
//   - Mobile (isMobile=true): vertical stack of 7 day-cards, each card
//     listing the 7 slots inline.
//
// Both layouts call into the same data and open the same ShiftFormModal.
//
// Props:
//   shifts        ({ [id]: shift })       — from usePersistence
//   employees     ({ [id]: employee })
//   shiftTemplate (object | null)         — from usePersistence; falls back
//                                           to DEFAULT_SHIFT_TEMPLATE when null
//   actions       (object)                — usePersistence().actions
//   isMobile      (bool)

import { useEffect, useMemo, useState } from "react";
import {
  S, BTN,
  ROLE_COLORS,
  STATUS_COLORS,
  DEFAULT_SHIFT_TEMPLATE,
  DEFAULT_OPENING_DAYS,
  DEFAULT_GENERATOR_STRICT_PREFERENCE,
  DEFAULT_GENERATOR_BANNER_AUTO_DISMISS,
  DEFAULT_GENERATOR_BANNER_DURATION_SEC,
  GENERATOR_BANNER_DURATION_MIN,
  GENERATOR_BANNER_DURATION_MAX,
} from "../lib/constants.js";
import {
  startOfWeek,
  visibleWeekDates,
  isoDate,
  parseIsoDate,
  formatDayHeader,
  formatWeekRange,
  slotsForDay,
  findShiftForSlot,
  deriveCellState,
  shiftsForWeek,
  addDays,
  isSlotOpenOnDate,
  roleMatchesSlot,
  findRequestConflict,
  findShiftPreferenceMismatch,
  findSameDayShift,
} from "../lib/schedule-logic.js";
import ShiftFormModal from "./ShiftFormModal.jsx";
import ExportButton from "./ExportButton.jsx";
import GenerateButton from "./GenerateButton.jsx";
import ClearButton from "./ClearButton.jsx";
import SwapButton from "./SwapButton.jsx";
import WeeklyShiftSummary from "./WeeklyShiftSummary.jsx";
import WeeklyRequestsPreview from "./WeeklyRequestsPreview.jsx";
import GenerateResultsModal from "./GenerateResultsModal.jsx";

// Section row dividers (visual grouping in the desktop grid).
function isSectionBoundary(prevSlot, slot) {
  if (!prevSlot) return false;
  return prevSlot.section !== slot.section || prevSlot.dayPart !== slot.dayPart;
}

export default function ScheduleGrid({ shifts, employees, requests, shiftTemplate, settings, actions, isMobile }) {
  // Active template — DB-customized values when present, defaults otherwise.
  const template = shiftTemplate || DEFAULT_SHIFT_TEMPLATE;

  // v0.9.0: role-pill visibility on schedule cells. Default ON when
  // /settings hasn't been written yet, OR when the field is missing
  // from an older saved object — only an explicit `false` hides them.
  const showRolePills = !settings || settings.showRolePills !== false;

  // v0.12.0: opening-days filter. Settings.openingDays missing → fall back
  // to DEFAULT_OPENING_DAYS (all true) so legacy /settings docs still
  // render a full week.
  const openingDays = (settings && settings.openingDays) || DEFAULT_OPENING_DAYS;

  // v1.0.0: auto-generator preference-strictness, read fresh on every
  // render. Generator passes it straight through to the algorithm.
  const strictPreference =
    settings && typeof settings.generatorStrictPreference === "boolean"
      ? settings.generatorStrictPreference
      : DEFAULT_GENERATOR_STRICT_PREFERENCE;

  // v1.9.4: result-banner auto-dismiss + duration. Consumed by the
  // useEffect below that schedules the setTimeout. Both fields default
  // to the constants when /settings is missing / wrong shape.
  // Duration is clamped to the constants' min/max range so a bad value
  // in /settings can't drive a 0-ms (instant) or 30-min timeout.
  const bannerAutoDismiss =
    settings && typeof settings.generatorBannerAutoDismiss === "boolean"
      ? settings.generatorBannerAutoDismiss
      : DEFAULT_GENERATOR_BANNER_AUTO_DISMISS;
  const bannerDurationSec =
    settings && Number.isFinite(settings.generatorBannerDurationSec)
      ? Math.max(
          GENERATOR_BANNER_DURATION_MIN,
          Math.min(GENERATOR_BANNER_DURATION_MAX, settings.generatorBannerDurationSec)
        )
      : DEFAULT_GENERATOR_BANNER_DURATION_SEC;

  // Slot definitions for the week (same every day until per-day overrides land).
  const slots = useMemo(function () { return slotsForDay(template); }, [template]);

  // v1.4.0: slot lookup by key for the generator-results modal. Built off
  // the same `slots` array so it stays in sync if the template changes.
  const slotsByKey = useMemo(function () {
    const m = {};
    for (let i = 0; i < slots.length; i++) m[slots[i].key] = slots[i];
    return m;
  }, [slots]);

  // ── Week navigation ──────────────────────────────────────────────────
  // v1.5.0: persist the displayed week across refresh / Vite HMR within
  // the same browser tab via sessionStorage. The stored value is the
  // ISO date of the week's Monday. On read we re-normalize through
  // startOfWeek so any drift (manual edit, stale value) self-heals.
  // First visit / fresh browser tab → current week.
  const [weekStart, setWeekStart] = useState(function () {
    try {
      const stored = sessionStorage.getItem("mgt-sched.weekStart");
      if (stored) {
        const parsed = parseIsoDate(stored);
        if (!isNaN(parsed.getTime())) return startOfWeek(parsed);
      }
    } catch (_e) { /* private-mode safari */ }
    return startOfWeek(new Date());
  });
  useEffect(function () {
    try { sessionStorage.setItem("mgt-sched.weekStart", isoDate(weekStart)); } catch (_e) {}
  }, [weekStart]);
  const dates = useMemo(
    function () { return visibleWeekDates(weekStart, openingDays); },
    [weekStart, openingDays]
  );

  // v0.10.2: cache today's ISO once per render so the date-pill loop
  // doesn't restringify a Date on every column.
  const todayIso = useMemo(function () { return isoDate(new Date()); }, []);

  // v1.4.0: today's index within the displayed week (or -1 if today is
  // outside the visible range / closed). Consumed by the desktop grid's
  // today-column tint underlay. Computed once per render via dates.

  function goPrev()  { setWeekStart(function (d) { return addDays(d, -7); }); }
  function goNext()  { setWeekStart(function (d) { return addDays(d, 7); }); }
  function goToday() { setWeekStart(startOfWeek(new Date())); }

  // Narrow the shifts map to this week before passing into the grid — keeps
  // the per-cell scan cheap.
  const weekShifts = useMemo(function () { return shiftsForWeek(shifts, weekStart); }, [shifts, weekStart]);

  // v1.1.0 fairness: also narrow the PRIOR 7 days. Used by the generator
  // for combined-load ranking so employees who worked many shifts last
  // week get ranked lower this week (load evens out across two-week
  // windows). Cheap to compute and only consumed by GenerateButton.
  const priorWeekShifts = useMemo(function () {
    return shiftsForWeek(shifts, addDays(weekStart, -7));
  }, [shifts, weekStart]);

  // v1.8.0 cross-week consecutive-off: narrow the NEXT 7 days too. The
  // generator and the manual picker pass this into hasConsecutiveDaysOff
  // so a Sun-off + next-Mon-off straddle counts as 2 consecutive days off.
  const nextWeekShifts = useMemo(function () {
    return shiftsForWeek(shifts, addDays(weekStart, 7));
  }, [shifts, weekStart]);

  // ── Modal state ──────────────────────────────────────────────────────
  const [modalCell, setModalCell] = useState(null);  // { dateIso, slotDef, shift } or null

  function openCell(dateIso, slotDef, shift) {
    setModalCell({ dateIso: dateIso, slotDef: slotDef, shift: shift || null });
  }
  function closeModal() { setModalCell(null); }

  // ── Swap / Move mode (v1.7.0) ────────────────────────────────────────
  // Two entry points feed the same mechanic:
  //   - SwapButton in the nav bar → enters "source-select" phase.
  //   - "Move/Swap to…" button in ShiftFormModal → closes the modal and
  //     enters "target-select" phase with `source` preloaded.
  // Cell-click behaviour branches on the phase. See cellClick().
  const [swapMode, setSwapMode] = useState(null);
  // Inline banner shown above the grid: hint while a swap is in progress,
  // or an error when validation blocks the commit. { tone, text }.
  const [swapBanner, setSwapBanner] = useState(null);

  function exitSwapMode() {
    setSwapMode(null);
    setSwapBanner(null);
  }
  function toggleSwapMode() {
    if (swapMode) {
      exitSwapMode();
    } else {
      setSwapMode({ phase: "source-select" });
      setSwapBanner({ tone: "info", text: "Pick a filled cell as the source." });
    }
  }
  function enterSwapTargetFromModal(source) {
    // source = { dateIso, slotDef, shift } from ShiftFormModal.
    closeModal();
    setSwapMode({ phase: "target-select", source: source });
    setSwapBanner({
      tone: "info",
      text: "Pick the target cell to move or swap. Click the source again to cancel.",
    });
  }

  // ── Pill-click highlight (v1.7.0) ────────────────────────────────────
  // Lit when the manager clicks a Shifts-assigned pill; every cell whose
  // shift.employeeId === this id paints with an accent ring. Click the
  // same pill (or press Esc) to clear.
  const [highlightedEmployeeId, setHighlightedEmployeeId] = useState(null);
  function onHighlight(empId) { setHighlightedEmployeeId(empId); }

  // ── Jump-to-cell highlight (v1.9.3) ──────────────────────────────────
  // Lit when the manager clicks an unfilled/cleared row in
  // GenerateResultsModal. Distinct axis from highlightedEmployeeId
  // because unfilled cells have no assignee to key by (and cleared
  // cells' assignee was wiped). Composite `${dateIso}|${slotKey}` keys
  // a single cell uniquely. One-shot — the effect below auto-clears
  // the highlight after the mgt-jump-pulse animation finishes. Esc
  // also clears it (see the keydown handler below).
  const [highlightedCellKey, setHighlightedCellKey] = useState(null);
  useEffect(function () {
    if (!highlightedCellKey) return;
    const t = setTimeout(function () { setHighlightedCellKey(null); }, 1700);
    return function () { clearTimeout(t); };
  }, [highlightedCellKey]);

  // ── Esc key: cancel swap or clear highlight ──────────────────────────
  // Priority order: swap-mode → jump-target → sticky pill-highlight. The
  // jump-target is a one-shot affordance, so prioritising it over the
  // pill keeps Esc-to-cancel feeling immediate when the manager has
  // just clicked a results-modal row.
  useEffect(function () {
    function onKey(e) {
      if (e.key !== "Escape") return;
      // Modal overlay handles its own Esc; don't fight it.
      if (modalCell) return;
      if (swapMode) {
        exitSwapMode();
      } else if (highlightedCellKey) {
        setHighlightedCellKey(null);
      } else if (highlightedEmployeeId) {
        setHighlightedEmployeeId(null);
      }
    }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [swapMode, highlightedEmployeeId, highlightedCellKey, modalCell]);

  // ── Result banner (v1.0.0 generator + v1.1.0 clear) ──────────────────
  // After a Generate run, GenerateButton fires onResult({filled, unfilled,
  // total, cleared, mode, unfilledCells}). After a Clear run, ClearButton
  // fires onResult({cleared, kind}). One banner state handles both —
  // simpler than two parallel states. Auto-dismiss after 5s; manual
  // dismiss via the "×".
  //
  // Shape discrimination: a generator result has `mode` set
  // ("fill-empty" | "regenerate"); a clear result has `kind` set
  // ("week" | "day").
  const [resultBanner, setResultBanner] = useState(null);
  // v1.4.0: the "Details" modal opened from the banner. Holds the same
  // summary; only the open flag is separate so the banner and modal have
  // independent lifecycles (modal can outlive the banner's 5s auto-dismiss
  // — see the effect below — and closing the modal doesn't dismiss the
  // banner).
  const [showResultsModal, setShowResultsModal] = useState(false);
  useEffect(function () {
    if (!resultBanner) return undefined;
    // v1.4.0: hold the auto-dismiss timer while the manager is inspecting
    // the details modal. Otherwise opening "Details", reading the list,
    // and closing the modal would find the banner gone — confusing.
    if (showResultsModal) return undefined;
    // v1.9.4: manager can disable auto-dismiss entirely in
    // Settings → Auto-generator. When OFF the banner stays until they
    // ×-close it or another run replaces it.
    if (!bannerAutoDismiss) return undefined;
    const t = setTimeout(function () { setResultBanner(null); }, bannerDurationSec * 1000);
    return function () { clearTimeout(t); };
  }, [resultBanner, showResultsModal, bannerAutoDismiss, bannerDurationSec]);
  function handleGenerateResult(summary) { setResultBanner(summary); }
  function handleClearResult(summary)    { setResultBanner(summary); }
  function dismissResultBanner() {
    setResultBanner(null);
    // Close the modal too — its summary is gone and rendering against
    // stale state would be a footgun.
    setShowResultsModal(false);
  }

  // v1.9.3: jump-to-cell from GenerateResultsModal. Called with the
  // row's (dateIso, slotKey). Three things happen, in order:
  //   1. If the target date isn't in the visible week, navigate the
  //      grid to the week containing it. Otherwise the cell can't
  //      flash because it isn't rendered.
  //   2. Close the results modal so the cell is visible.
  //   3. Set the cell-key highlight. The auto-clear effect (above)
  //      drops it after 1.7s; the @keyframes mgt-jump-pulse animation
  //      runs once over 1.6s, giving a tiny scale-bounce on top of the
  //      shared green ring tokens.
  // No-ops if the row is malformed.
  function jumpToCell(dateIso, slotKey) {
    if (!dateIso || !slotKey) return;
    try {
      const target = parseIsoDate(dateIso);
      if (target && !isNaN(target.getTime())) {
        const targetStart = startOfWeek(target);
        if (isoDate(targetStart) !== isoDate(weekStart)) {
          setWeekStart(targetStart);
        }
      }
    } catch (_e) { /* malformed date — fall through to highlight set */ }
    setShowResultsModal(false);
    setHighlightedCellKey(dateIso + "|" + slotKey);
  }

  function handleSave(payload) {
    actions.upsertShift(payload);
    closeModal();
  }
  function handleDelete(id) {
    actions.deleteShift(id);
    closeModal();
  }

  // ── Swap commit (v1.7.0) ─────────────────────────────────────────────
  // Validates the source/target pair against role match, request conflicts,
  // shift-preference, and same-day double-booking. On pass:
  //   - move (target empty): deleteShift(source.id) + upsertShift(target
  //     payload with source.employeeId).
  //   - swap (target filled): upsertShift each side, employeeIds swapped.
  // Times and roles stay with the cell — the cell, not the employee, owns
  // those. Failures surface as a red banner; the swap mode exits either way.
  function attemptSwap(source, target) {
    const sourceEmp = employees[source.shift.employeeId];
    const targetEmp = target.shift && target.shift.employeeId
      ? employees[target.shift.employeeId]
      : null;

    if (!sourceEmp) {
      setSwapBanner({ tone: "error", text: "Source employee no longer exists." });
      setSwapMode(null);
      return;
    }

    // Role match for receivers.
    if (!roleMatchesSlot(sourceEmp, target.slotDef)) {
      setSwapBanner({
        tone: "error",
        text: sourceEmp.name + " doesn't hold a role for " + target.slotDef.humanLabel + ".",
      });
      setSwapMode(null);
      return;
    }
    if (targetEmp && !roleMatchesSlot(targetEmp, source.slotDef)) {
      setSwapBanner({
        tone: "error",
        text: targetEmp.name + " doesn't hold a role for " + source.slotDef.humanLabel + ".",
      });
      setSwapMode(null);
      return;
    }

    // Request conflicts on receiving cells.
    if (findRequestConflict(requests, sourceEmp.id, target.dateIso)) {
      setSwapBanner({
        tone: "error",
        text: sourceEmp.name + " has a day-off or holiday on the target date.",
      });
      setSwapMode(null);
      return;
    }
    if (findShiftPreferenceMismatch(requests, sourceEmp.id, target.dateIso, target.slotDef.dayPart)) {
      setSwapBanner({
        tone: "error",
        text: sourceEmp.name + "'s shift-preference request excludes the target day-part.",
      });
      setSwapMode(null);
      return;
    }
    if (targetEmp) {
      if (findRequestConflict(requests, targetEmp.id, source.dateIso)) {
        setSwapBanner({
          tone: "error",
          text: targetEmp.name + " has a day-off or holiday on the source date.",
        });
        setSwapMode(null);
        return;
      }
      if (findShiftPreferenceMismatch(requests, targetEmp.id, source.dateIso, source.slotDef.dayPart)) {
        setSwapBanner({
          tone: "error",
          text: targetEmp.name + "'s shift-preference request excludes the source day-part.",
        });
        setSwapMode(null);
        return;
      }
    }

    // Same-day strict. The source shift is being deleted (move) or its
    // assignee is changing (swap), so we exclude both shifts' ids from the
    // check. After the swap completes, the receiving employee must not be
    // on ANOTHER shift on the receiving date.
    const targetShiftId = target.shift ? target.shift.id : null;
    if (target.dateIso !== source.dateIso) {
      const sourceEmpClash = findSameDayShift(weekShifts, sourceEmp.id, target.dateIso, targetShiftId);
      if (sourceEmpClash && sourceEmpClash.id !== source.shift.id) {
        setSwapBanner({
          tone: "error",
          text: sourceEmp.name + " is already on another shift on " + target.dateIso + ".",
        });
        setSwapMode(null);
        return;
      }
      if (targetEmp) {
        const targetEmpClash = findSameDayShift(weekShifts, targetEmp.id, source.dateIso, source.shift.id);
        if (targetEmpClash && targetEmpClash.id !== targetShiftId) {
          setSwapBanner({
            tone: "error",
            text: targetEmp.name + " is already on another shift on " + source.dateIso + ".",
          });
          setSwapMode(null);
          return;
        }
      }
    }

    // Commit.
    if (targetEmp) {
      // Swap two assignments. Each cell keeps its own role/start/end.
      actions.upsertShift({ ...source.shift, employeeId: targetEmp.id });
      actions.upsertShift({ ...target.shift, employeeId: sourceEmp.id });
      setSwapBanner({
        tone: "success",
        text: "Swapped " + sourceEmp.name + " ↔ " + targetEmp.name + ".",
      });
    } else {
      // Move: delete source, upsert target with source's employee.
      // Reuse target's existing record id if there is one (unassigned
      // placeholder); otherwise upsertShift creates a fresh record.
      const targetPayload = {
        date: target.dateIso,
        section: target.slotDef.section,
        dayPart: target.slotDef.dayPart,
        slotIndex: target.slotDef.slotIndex,
        role: target.slotDef.isDay
          ? null
          : ((target.shift && target.shift.role) || target.slotDef.defaultRole || null),
        start: (target.shift && target.shift.start) || target.slotDef.defaultStart,
        end:   (target.shift && target.shift.end)   || target.slotDef.defaultEnd,
        employeeId: sourceEmp.id,
      };
      if (target.shift && target.shift.id) targetPayload.id = target.shift.id;
      actions.deleteShift(source.shift.id);
      actions.upsertShift(targetPayload);
      setSwapBanner({
        tone: "success",
        text: "Moved " + sourceEmp.name + " to " + target.slotDef.humanLabel + ".",
      });
    }
    setSwapMode(null);
  }

  // Cell-click router. Routes to swap mechanic when swap mode is on, else
  // to the regular picker modal.
  function cellClick(dateIso, slotDef, shift) {
    if (swapMode) {
      // Source-select: only filled cells qualify.
      if (swapMode.phase === "source-select") {
        if (!shift || !shift.employeeId) {
          setSwapBanner({
            tone: "info",
            text: "Pick a filled cell as the source (this cell is empty).",
          });
          return;
        }
        setSwapMode({
          phase: "target-select",
          source: { dateIso: dateIso, slotDef: slotDef, shift: shift },
        });
        setSwapBanner({
          tone: "info",
          text: "Pick the target cell to move or swap. Click the source again to cancel.",
        });
        return;
      }
      // Target-select: click on the source again → cancel.
      const source = swapMode.source;
      const isSourceClick =
        shift && source.shift && shift.id === source.shift.id;
      if (isSourceClick) {
        exitSwapMode();
        return;
      }
      attemptSwap(source, { dateIso: dateIso, slotDef: slotDef, shift: shift || null });
      return;
    }
    openCell(dateIso, slotDef, shift);
  }

  // Auto-dismiss the swap success/error banner after a short delay so the
  // grid stays clean. Info banners (during in-progress swap selection)
  // persist until swap mode exits.
  useEffect(function () {
    if (!swapBanner) return undefined;
    if (swapBanner.tone === "info") return undefined;
    const t = setTimeout(function () { setSwapBanner(null); }, 4000);
    return function () { clearTimeout(t); };
  }, [swapBanner]);

  // v1.3.0: closed-dayPart placeholder. Renders a non-interactive cell so
  // the grid keeps its row/column rhythm but the manager can see the slot
  // is unavailable that day. No click handler, no border-emphasis — a
  // soft dashed muted block reading "—".
  function renderClosedCell(date, slot) {
    const dIso = isoDate(date);
    return (
      <div
        key={slot.key + "-" + dIso + "-closed"}
        aria-hidden="true"
        style={{
          width: "100%",
          minHeight: 60,
          borderRadius: 10,
          border: "1px dashed var(--hairline)",
          background: "var(--bg-row-soft)",
          color: "var(--text-muted)",
          fontSize: 11,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.7,
        }}
      >
        Closed
      </div>
    );
  }

  // ── Cell renderer (shared between layouts) ───────────────────────────
  function renderCell(date, slot) {
    const dIso = isoDate(date);
    const existing = findShiftForSlot(weekShifts, dIso, slot);
    const cell = deriveCellState(existing, slot);
    const emp = cell.employeeId ? employees[cell.employeeId] : null;
    const empArchived = emp && emp.active === false;

    const status = cell.employeeId ? "assigned" : "open";
    const palette = STATUS_COLORS[status];

    // v0.9.0: pill gated by the Settings toggle. `cell.role` is always
    // null for day shifts (per the v1 model) so the toggle only ever
    // affects evening cells.
    // v0.11.0: ROLE_COLORS entries are now `var(--role-x-rgb)` triplets;
    // compose alpha at the use site via rgba()/rgb().
    const roleRgb = ROLE_COLORS[cell.role] || "var(--role-fallback-rgb)";
    const roleChip = cell.role && showRolePills
      ? (
        <span
          style={{
            display: "inline-block",
            fontSize: 10,
            padding: "1px 6px",
            borderRadius: 6,
            background: "rgba(" + roleRgb + ", 0.20)",
            color: "rgb(" + roleRgb + ")",
            border: "1px solid rgba(" + roleRgb + ", 0.40)",
            marginLeft: 6,
          }}
        >
          {cell.role}
        </span>
      )
      : null;

    const timeOverridden =
      cell.hasRecord && (cell.start !== slot.defaultStart || cell.end !== slot.defaultEnd);

    // v1.7.0: visual states layered on top of the status palette.
    //   isHighlighted — this cell's employee is the currently lit pill.
    //                   Strong green tint + 2-px green border + 3-px
    //                   green ring so it reads at a glance against the
    //                   neutral pill / accent-blue palette already on
    //                   the grid. Reuses --bg-active-on / --border-active-on
    //                   (iOS-green) — same tokens as the pill's selected
    //                   state, single visual identity.
    //   isSwapSource  — swap mode picked this cell as the source. Pulsing
    //                   yellow outline via @keyframes mgt-swap-pulse;
    //                   yellow keeps swap visually distinct from green
    //                   pill-highlights and blue accent surfaces.
    // v1.9.3 adds:
    //   isJumpTarget  — this cell is the one-shot focus from a click on
    //                   a GenerateResultsModal row. Shares the green
    //                   palette with isHighlighted (combined into the
    //                   `isAnyHighlight` flag below) — pill-highlight and
    //                   jump-target are visually identical at rest. The
    //                   distinguishing cue is the one-shot
    //                   @keyframes mgt-jump-pulse animation (a tiny
    //                   scale bounce) that plays once when the jump
    //                   fires, drawing the eye. The cell-key state
    //                   auto-clears 1.7s later via the highlight effect.
    const isHighlighted =
      highlightedEmployeeId && existing && existing.employeeId === highlightedEmployeeId;
    const isSwapSource =
      swapMode && swapMode.phase === "target-select" &&
      swapMode.source && existing && existing.id === swapMode.source.shift.id;
    const isJumpTarget = highlightedCellKey === (dIso + "|" + slot.key);
    const isAnyHighlight = isHighlighted || isJumpTarget;

    const baseBg = isAnyHighlight ? "var(--bg-active-on)" : palette.bg;
    const baseBorder = isSwapSource
      ? "var(--border-warning-tint)"
      : isAnyHighlight
        ? "var(--border-active-on)"
        : palette.border;
    const baseBorderWidth = (isSwapSource || isAnyHighlight) ? 2 : 1;
    const ringShadow = isSwapSource
      ? "0 0 0 3px var(--bg-warning-tint), var(--shadow-soft)"
      : isAnyHighlight
        ? "0 0 0 3px var(--bg-active-on), var(--shadow-soft)"
        : "var(--shadow-soft)";
    // v1.9.3: swap pulse takes priority (it's intentionally infinite while
    // swap-mode is armed). Jump pulse plays once; after it ends the
    // cell-key state has likely already auto-cleared.
    const cellAnimation = isSwapSource
      ? "mgt-swap-pulse 1.6s ease-in-out infinite"
      : isJumpTarget
        ? "mgt-jump-pulse 1.6s ease-out 1"
        : undefined;

    return (
      <button
        key={slot.key + "-" + dIso}
        type="button"
        className="mgt-hover-scale"
        onClick={function () { cellClick(dIso, slot, existing); }}
        style={{
          width: "100%",
          textAlign: "left",
          background: baseBg,
          border: baseBorderWidth + "px solid " + baseBorder,
          borderRadius: 10,
          padding: "8px 10px",
          fontSize: 12,
          cursor: "pointer",
          minHeight: 60,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 4,
          boxShadow: ringShadow,
          animation: cellAnimation,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: palette.text,
            fontWeight: 600,
          }}
        >
          <span>{cell.start}–{cell.end}{timeOverridden ? " *" : ""}</span>
          {roleChip}
        </div>
        <div
          style={{
            fontSize: 13,
            color: emp ? "var(--text-primary)" : palette.text,
            fontWeight: emp ? 600 : 500,
            opacity: empArchived ? 0.5 : 1,
            textDecoration: empArchived ? "line-through" : "none",
          }}
        >
          {emp ? emp.name : "Open"}
        </div>
      </button>
    );
  }

  // ── Section-header row for desktop grid ──────────────────────────────
  // v0.10.2: centred banded row spanning all 8 columns. Acts as the
  // visual anchor for the N slot rows below it. `isFirst` controls the
  // top gap so the first section sits flush with the date pill row;
  // subsequent sections get a `marginTop` to create the visible split
  // between groups.
  function renderSectionHeader(slot, isFirst) {
    return (
      <div
        key={"hdr-" + slot.section + "-" + slot.dayPart}
        style={{
          gridColumn: "1 / -1",
          marginTop: isFirst ? 0 : 10,
          padding: "8px 12px",
          background: "var(--bg-band)",
          border: "1px solid var(--hairline)",
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-primary)",
          textAlign: "center",
          boxShadow: "var(--shadow-soft)",
          // v1.4.0 fixup: lift the section banner above the absolutely-
          // positioned column-rule + today-tint underlays so the hairline
          // doesn't slice through the "Kitchen · Day" / "FoH · Evening"
          // text. Without this, positioned (zIndex 0) underlays paint
          // above static elements regardless of source order.
          position: "relative",
          zIndex: 1,
        }}
      >
        {slot.sectionLabel} · {slot.dayPartLabel}
      </div>
    );
  }

  // ── Week-nav bar (shared) ────────────────────────────────────────────
  const navBar = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={goPrev}  className="mgt-hover-scale" style={{ ...BTN.base, ...BTN.ghost, padding: "6px 10px", fontSize: 13 }}>‹ Prev</button>
        <button onClick={goToday} className="mgt-hover-scale" style={{ ...BTN.base, ...BTN.secondary, padding: "6px 12px", fontSize: 13 }}>Today</button>
        <button onClick={goNext}  className="mgt-hover-scale" style={{ ...BTN.base, ...BTN.ghost, padding: "6px 10px", fontSize: 13 }}>Next ›</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {formatWeekRange(weekStart)}
        </div>
        <GenerateButton
          weekStart={weekStart}
          weekShifts={weekShifts}
          priorWeekShifts={priorWeekShifts}
          nextWeekShifts={nextWeekShifts}
          employees={employees}
          requests={requests}
          shiftTemplate={shiftTemplate}
          openingDays={openingDays}
          strictPreference={strictPreference}
          isMobile={isMobile}
          actions={actions}
          onResult={handleGenerateResult}
        />
        <SwapButton
          active={Boolean(swapMode)}
          phase={swapMode ? swapMode.phase : undefined}
          isMobile={isMobile}
          onToggle={toggleSwapMode}
        />
        <ClearButton
          weekStart={weekStart}
          weekDates={dates}
          weekShifts={weekShifts}
          isMobile={isMobile}
          actions={actions}
          onResult={handleClearResult}
        />
        <ExportButton
          weekStart={weekStart}
          slots={slots}
          weekShifts={weekShifts}
          employees={employees}
          openingDays={openingDays}
        />
      </div>
    </div>
  );

  // ── Desktop layout: N-column × M-row grid ────────────────────────────
  // v0.12.0: column count derives from `dates.length` (open days), not a
  // hardcoded 7. minWidth shrinks proportionally so a 5-day week doesn't
  // force a horizontal scrollbar where there's no need.
  //
  // v1.4.0: index of today within the visible dates array; -1 means today
  // is outside the displayed week (or that day is closed). The grid below
  // renders a single full-height tint underlay at that column when set.
  const todayIndex = dates.findIndex(function (d) { return isoDate(d) === todayIso; });

  const desktopGrid = (
    // v1.9.0 (hover-scale fix): the wrapper's `overflowX: auto` clips
    // transformed children at its box boundary — browsers force overflow-y
    // to behave like auto whenever overflow-x is non-visible. Without
    // padding, a Sunday-column cell scaling to 1.08 on hover gets its
    // right edge clipped by the wrapper / surrounding card border.
    // The 8px padding gives every edge cell room to scale (≈5px each
    // direction for a 60px cell) before the clip kicks in. The grid's
    // minWidth is also reduced by the horizontal padding so the
    // horizontal scrollbar threshold is unchanged for narrow viewports.
    <div style={{ overflowX: "auto", padding: 8 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "120px repeat(" + dates.length + ", minmax(120px, 1fr))",
          gap: 6,
          minWidth: 120 + dates.length * 120 - 16,
          // v1.4.0 fixup: containing block for the absolutely-positioned
          // tint + column-rule underlays below. Without this, the underlays
          // would resolve their `gridColumn` against the nearest positioned
          // ancestor (the page), throwing the layout off.
          position: "relative",
        }}
      >
        {/* v1.4.0: today-column tint underlay. `position: absolute` keeps
            it OUT of the grid's auto-flow track allocation — otherwise a
            `gridRow: 1 / -1` grid item would block placement of every
            auto-positioned cell in today's column, shoving content into
            implicit rows. With `top: 0; bottom: 0`, the underlay stretches
            the full grid height regardless of how many rows the slot
            template produces. `gridColumn` still resolves to the right
            column area; `position: absolute` only opts out of cell
            occupation, not grid-area resolution. */}
        {todayIndex >= 0 ? (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              gridColumn: (todayIndex + 2) + " / " + (todayIndex + 3),
              background: "var(--accent-tint-soft)",
              borderRadius: 12,
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
        ) : null}

        {/* Top-left empty + day pills.
            v0.10.2: each date sits in a soft pill so the column header
            row reads as a real anchor for its day. Today's date gets
            the iOS-blue accent. */}
        <div />
        {dates.map(function (d) {
          const dayIso = isoDate(d);
          const isToday = dayIso === todayIso;
          return (
            <div
              key={"day-" + dayIso}
              style={{
                padding: "6px 8px",
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 10,
                textAlign: "center",
                background: isToday ? "var(--accent-tint-soft)" : "var(--bg-pill)",
                border: isToday ? "1px solid var(--accent-tint-strong)" : "1px solid var(--hairline)",
                color: isToday ? "var(--accent-on-tint)" : "var(--text-primary)",
                boxShadow: "var(--shadow-soft)",
              }}
            >
              {formatDayHeader(d)}
            </div>
          );
        })}

        {/* Slot rows, grouped by section/day-part */}
        {slots.map(function (slot, i) {
          const prev = i > 0 ? slots[i - 1] : null;
          const showHeader = i === 0 || isSectionBoundary(prev, slot);
          return (
            <div key={"row-" + slot.key} style={{ display: "contents" }}>
              {showHeader ? renderSectionHeader(slot, i === 0) : null}
              {/* v0.10.2: label cell becomes a soft chip so the left
                  column is a continuous lane instead of bare text on
                  the card. Human label on top, default time muted below. */}
              <div
                style={{
                  background: "var(--bg-chip)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  fontSize: 12,
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  boxShadow: "var(--shadow-soft)",
                }}
              >
                <div>{slot.humanLabel.replace(slot.sectionLabel + " ", "")}</div>
                <div style={{ ...S.muted, fontSize: 11, marginTop: 2 }}>
                  {slot.defaultStart}–{slot.defaultEnd}
                </div>
              </div>
              {dates.map(function (d) {
                // v1.3.0: a slot whose dayPart is closed on this date
                // renders an inert "Closed" placeholder so the grid keeps
                // its row alignment across columns.
                if (!isSlotOpenOnDate(d, slot, openingDays)) {
                  return renderClosedCell(d, slot);
                }
                return renderCell(d, slot);
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Mobile layout: vertical stack of day cards ───────────────────────
  // v1.3.0: per-date, drop slots whose dayPart is closed that day, then
  // re-derive section-boundary flags from the filtered list. A section
  // header doesn't render if its only slots for the day were filtered out.
  // v1.9.5: stop filtering — closed-dayPart slots now render as inert
  // "Closed" placeholders via the shared renderClosedCell helper, mirroring
  // the desktop pattern (lines 899–906). Section headers iterate over the
  // full slots array so partial-closure days keep their canonical slot
  // ladder (e.g. "FoH · Day" header above a Closed placeholder, then the
  // evening section beneath as normal).
  const mobileStack = (
    <div>
      {dates.map(function (d) {
        const dIso = isoDate(d);
        // v1.9.2: mobile counterpart to v1.4.0's desktop today-column
        // tint. When today is the visible day, the whole card gets the
        // accent tint bg + accent-strong border, and the date-header
        // text flips to accent-on-tint. Same three tokens the desktop
        // column underlay + date pill use, so the visual identity for
        // "today" reads the same across breakpoints. No new tokens,
        // no new state — todayIso (line 118) is the existing memo
        // already consumed by the desktop path.
        const isToday = dIso === todayIso;
        return (
          <div
            key={"dayCard-" + dIso}
            style={{
              ...S.surfaceSoft,
              ...(isToday ? {
                background: "var(--accent-tint-soft)",
                border: "1px solid var(--accent-tint-strong)",
              } : null),
              marginBottom: 12,
              padding: 12,
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: isToday ? "var(--accent-on-tint)" : "var(--text-primary)",
                marginBottom: 8,
              }}
            >
              {formatDayHeader(d)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {slots.map(function (slot, i) {
                const prev = i > 0 ? slots[i - 1] : null;
                const showHeader = i === 0 || isSectionBoundary(prev, slot);
                const slotOpen = isSlotOpenOnDate(d, slot, openingDays);
                return (
                  <div key={slot.key + "-" + dIso} style={{ display: "contents" }}>
                    {showHeader
                      ? (
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: "var(--text-primary)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            marginTop: i === 0 ? 0 : 6,
                            padding: "4px 8px",
                            background: "var(--bg-band)",
                            border: "1px solid var(--hairline)",
                            borderRadius: 6,
                            textAlign: "center",
                          }}
                        >
                          {slot.sectionLabel} · {slot.dayPartLabel}
                        </div>
                      )
                      : null}
                    {slotOpen ? renderCell(d, slot) : renderClosedCell(d, slot)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );

  // v0.12.0: defensive empty-state when no days are open. Settings
  // validation blocks the all-closed save, but a hand-edited Firebase doc
  // could still arrive empty — render a small notice instead of a
  // zero-column grid that would look broken.
  const allClosedNotice = dates.length === 0
    ? (
      <div style={{ ...S.surfaceSoft, textAlign: "center", padding: 24 }}>
        <p style={{ ...S.body, marginBottom: 0 }}>
          No open days configured. Open Settings → Operating time and pick at least one day.
        </p>
      </div>
    )
    : null;

  // v1.0.0 + v1.1.0: result banner copy. Three shapes:
  //   - Clear result: { cleared, kind } → "Cleared N shifts (week / day)."
  //   - Generator fill-empty: "Filled X cells, Y left empty for <range>."
  //   - Generator regenerate: "Cleared X stale, filled Y, Z left empty for <range>."
  // "Nothing to fill" reads better than "Filled 0, left 0" when the week
  // was already complete on a generator run.
  let bannerCopy = "";
  if (resultBanner) {
    const r = resultBanner;
    if (r.kind === "week" || r.kind === "day") {
      // Clear result.
      bannerCopy = "Cleared " + r.cleared + " shift" +
        (r.cleared === 1 ? "" : "s") +
        (r.kind === "week" ? " from " + formatWeekRange(weekStart) + "." : ".");
    } else if (r.mode === "regenerate") {
      const c = r.cleared || 0;
      if (r.total === 0 && c === 0) {
        bannerCopy = "Nothing to update — every open-day cell still satisfies the current rules.";
      } else {
        const parts = [];
        if (c > 0) parts.push("Cleared " + c + " stale");
        parts.push("filled " + r.filled);
        parts.push(r.unfilled + " left empty");
        bannerCopy = parts.join(", ") + " for " + formatWeekRange(weekStart) + ".";
      }
    } else {
      // Generator fill-empty (default).
      bannerCopy = r.total === 0
        ? "Nothing to fill — every open-day cell already has a shift."
        : "Filled " + r.filled + " cell" + (r.filled === 1 ? "" : "s") +
          ", " + r.unfilled + " left empty" +
          " for " + formatWeekRange(weekStart) + ".";
    }
  }
  // v1.4.0 → v1.9.4: a "Details" affordance shows for every Generate
  // and Regenerate banner — even clean runs (everything filled, nothing
  // cleared). v1.4.0's original predicate hid the button when both
  // arrays were empty, but the disappearing affordance confused
  // managers who expected a stable entry point to the results modal.
  // For a clean run the modal renders "Nothing to report — everything
  // fell within the rules", which is still useful as confirmation.
  // Clear results still skip Details: their summary carries no
  // unfilledCells / clearedReasons / mode field — they're a different
  // shape entirely ({cleared, kind}), with no detail metadata to show.
  const bannerHasDetails = Boolean(resultBanner && resultBanner.mode);
  const generateBanner = resultBanner
    ? (
      <div
        style={{
          marginBottom: 12,
          padding: "8px 12px",
          background: "var(--accent-tint-soft)",
          border: "1px solid var(--accent-tint-strong)",
          color: "var(--accent-on-tint)",
          borderRadius: 10,
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <span>{bannerCopy}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
          {bannerHasDetails ? (
            <button
              type="button"
              onClick={function () { setShowResultsModal(true); }}
              style={{
                ...BTN.base,
                ...BTN.ghost,
                padding: "2px 10px",
                fontSize: 12,
                lineHeight: 1.4,
                boxShadow: "none",
              }}
            >
              Details
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismissResultBanner}
            aria-label="Dismiss"
            style={{
              ...BTN.base,
              ...BTN.ghost,
              padding: "2px 8px",
              fontSize: 14,
              lineHeight: 1,
              boxShadow: "none",
            }}
          >
            ×
          </button>
        </div>
      </div>
    )
    : null;

  // v1.7.0: swap-mode banner. Three tones:
  //   info    — yellow guidance during in-progress source/target selection
  //   success — yellow confirmation after a commit (same palette so
  //              the manager visually parses swap output as one family)
  //   error   — red banner when validation refused a swap
  const swapBannerView = swapBanner
    ? (
      <div
        style={{
          marginBottom: 12,
          padding: "8px 12px",
          background:
            swapBanner.tone === "error"
              ? "var(--bg-danger-tint)"
              : "var(--bg-warning-tint)",
          border:
            "1px solid " +
            (swapBanner.tone === "error"
              ? "var(--border-danger-tint)"
              : "var(--border-warning-tint)"),
          color:
            swapBanner.tone === "error"
              ? "var(--text-danger)"
              : "var(--text-warning)",
          borderRadius: 10,
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <span>{swapBanner.text}</span>
        {/* v1.7.0: dismiss control. Both the in-progress "Cancel" and
            the end-of-flow "×" use the danger palette tokens
            (`--btn-danger-bg` / `--btn-danger-border` /
            `--text-on-accent`) — the same colors mkBtn(variant:
            "danger") gives the Delete button in EmployeeFormModal —
            but keep the compact banner-button sizing (padding 2/8,
            no shadow) so the row height isn't affected. */}
        {swapMode || swapBanner.tone !== "info" ? (
          <button
            type="button"
            className="mgt-hover-scale"
            onClick={swapMode ? exitSwapMode : function () { setSwapBanner(null); }}
            aria-label={swapMode ? "Cancel" : "Dismiss"}
            style={{
              ...BTN.base,
              background: "var(--btn-danger-bg)",
              color: "var(--text-on-accent)",
              border: "1px solid var(--btn-danger-border)",
              padding: "3px 9px",
              fontSize: 14,
              lineHeight: 1,
              boxShadow: "none",
              flexShrink: 0,
            }}
          >
            {swapMode ? "Cancel" : "×"}
          </button>
        ) : null}
      </div>
    )
    : null;

  return (
    <div>
      {/* v1.7.0: keyframes block for the swap-source pulse (yellow,
          infinite while swap-mode is armed).
          v1.9.3 adds mgt-jump-pulse — a one-shot scale bounce played
          on the cell jumped to from GenerateResultsModal. Transform-
          only so it composes with the box-shadow ring set inline
          (the green palette is applied separately via baseBg /
          baseBorder / ringShadow when isJumpTarget is true). 1.6s
          single iteration so the animation ends just before the
          1.7s state-auto-clear in the highlight effect — the cell
          settles back to its base state without flicker. */}
      <style>{
        "@keyframes mgt-swap-pulse {" +
        "  0%,100% { box-shadow: 0 0 0 3px var(--bg-warning-tint), var(--shadow-soft); }" +
        "  50%     { box-shadow: 0 0 0 6px var(--border-warning-tint), var(--shadow-soft); }" +
        "}" +
        "@keyframes mgt-jump-pulse {" +
        "  0%   { transform: scale(1); }" +
        "  25%  { transform: scale(1.12); }" +
        "  55%  { transform: scale(0.98); }" +
        "  80%  { transform: scale(1.04); }" +
        "  100% { transform: scale(1); }" +
        "}"
      }</style>
      {navBar}
      {swapBannerView}
      {generateBanner}
      {allClosedNotice}
      {dates.length > 0 ? (isMobile ? mobileStack : desktopGrid) : null}

      <p style={{ ...S.muted, marginTop: 12, fontSize: 11 }}>
        Click any cell to assign someone or edit the time / role. Cells marked
        with “*” have times that differ from the template defaults. The
        assignee dropdown hides staff with a day-off or holiday request on
        that date (a toggle in the modal restores them) and anyone already
        scheduled elsewhere on the same date.
      </p>

      <WeeklyShiftSummary
        employees={employees}
        weekShifts={weekShifts}
        requests={requests}
        dates={dates}
        weekLabel={formatWeekRange(weekStart)}
        isMobile={isMobile}
        highlightedEmployeeId={highlightedEmployeeId}
        onHighlight={onHighlight}
      />

      <WeeklyRequestsPreview
        requests={requests}
        employees={employees}
        weekStart={weekStart}
        isMobile={isMobile}
      />

      <ShiftFormModal
        open={modalCell !== null}
        dateIso={modalCell ? modalCell.dateIso : ""}
        slotDef={modalCell ? modalCell.slotDef : null}
        shift={modalCell ? modalCell.shift : null}
        employees={employees}
        requests={requests}
        weekShifts={weekShifts}
        priorWeekShifts={priorWeekShifts}
        nextWeekShifts={nextWeekShifts}
        isMobile={isMobile}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
        onStartSwap={enterSwapTargetFromModal}
      />

      {/* v1.4.0: generator-results "Details" modal. Open state is
          independent of the banner so closing the modal lets the banner
          resume its auto-dismiss countdown. */}
      <GenerateResultsModal
        open={showResultsModal}
        onClose={function () { setShowResultsModal(false); }}
        summary={resultBanner}
        employees={employees}
        slotsByKey={slotsByKey}
        onJumpToCell={jumpToCell}
        isMobile={isMobile}
      />
    </div>
  );
}
