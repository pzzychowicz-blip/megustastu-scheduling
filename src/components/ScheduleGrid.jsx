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

import { useEffect, useMemo, useState, useRef } from "react";
import {
  R, S, BTN, BTN_SIZE, BADGE_SIZE,
  ROLE_COLORS,
  STATUS_COLORS,
  DEFAULT_SHIFT_TEMPLATE,
  DEFAULT_OPENING_DAYS,
  DEFAULT_GENERATOR_STRICT_PREFERENCE,
  DEFAULT_GENERATOR_BANNER_AUTO_DISMISS,
  DEFAULT_GENERATOR_BANNER_DURATION_SEC,
  GENERATOR_BANNER_DURATION_MIN,
  GENERATOR_BANNER_DURATION_MAX,
  DEFAULT_MIN_CONSECUTIVE_DAYS_OFF,
  MIN_CONSECUTIVE_DAYS_OFF_MIN,
  MIN_CONSECUTIVE_DAYS_OFF_MAX,
  DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS,
  MAX_CONSECUTIVE_WORKING_DAYS_MIN,
  MAX_CONSECUTIVE_WORKING_DAYS_MAX,
  DEFAULT_DAY_REQUIRED_ROLES,
  DEFAULT_PAST_WEEKS_LOCKED,
} from "../lib/constants.js";
import {
  startOfWeek,
  weekDatesWithShifts,
  isoDate,
  parseIsoDate,
  formatDayHeader,
  formatWeekRange,
  slotsForWeek,
  isSlotScheduledOnDate,
  weekdayKeyForDate,
  findShiftForSlot,
  deriveCellState,
  shiftsForWeek,
  addDays,
  isSlotOpenOnDate,
  roleMatchesSlot,
  findRequestConflict,
  findShiftPreferenceMismatch,
  findSameDayShift,
  isPastWeek,
  build28DayAggregates,
  buildCalendarMonthAggregates,
  resolveConfigForWeek,
  slotTimesForDate,
} from "../lib/schedule-logic.js";
import { useUndoStack } from "../hooks/useUndoStack.js";
import { isTypingTarget, isAnyOverlayOpen } from "../lib/keyboard.js";
import { ModalPresence, SlideView } from "./atoms.jsx";
import ShiftFormModal from "./ShiftFormModal.jsx";
import SplitConfirmModal from "./SplitConfirmModal.jsx";
import ExportButton from "./ExportButton.jsx";
import GenerateButton from "./GenerateButton.jsx";
import ClearButton from "./ClearButton.jsx";
import SwapButton from "./SwapButton.jsx";
import UndoButton from "./UndoButton.jsx";
import WeeklyShiftSummary from "./WeeklyShiftSummary.jsx";
import WeeklyRequestsPreview from "./WeeklyRequestsPreview.jsx";
import MonthlyFairnessPanel from "./MonthlyFairnessPanel.jsx";
import GenerateResultsModal from "./GenerateResultsModal.jsx";

// Section row dividers (visual grouping in the desktop grid).
function isSectionBoundary(prevSlot, slot) {
  if (!prevSlot) return false;
  return prevSlot.section !== slot.section || prevSlot.dayPart !== slot.dayPart;
}

export default function ScheduleGrid({ shifts, employees, requests, shiftTemplate, settings, configRevisions, actions, isMobile }) {
  // v0.9.0: role-pill visibility on schedule cells. Default ON when
  // /settings hasn't been written yet, OR when the field is missing
  // from an older saved object — only an explicit `false` hides them.
  const showRolePills = !settings || settings.showRolePills !== false;

  // v15.2.0: allow exporting a week with empty cells. Defaults to false
  // (only an explicit `true` opts in), so legacy docs keep the gated
  // Export button. Threaded into <ExportButton>.
  const allowIncompleteExport =
    settings && settings.allowIncompleteExport === true;

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

  // v1.11.0: configurable scheduling rules. Same defensive-read +
  // clamp pattern as the v1.9.4 generator-banner reads above. All three
  // values fall back to defaults that mirror the pre-v1.11.0 hard-coded
  // behaviour, so legacy /settings docs render byte-identically.
  //
  // v1.12.0: dayRequiredRoles shape switched from per-section array of
  // role names to per-section object of role→boolean (so Firebase RTDB
  // preserves "configured empty" — empty arrays get stripped to null).
  // The type-guard `typeof === "object"` accepts both shapes; slotsForDay
  // + resolveDayRequiredRoles in schedule-logic.js handle the per-section
  // shape detection. Missing → DEFAULT_DAY_REQUIRED_ROLES (also the new
  // boolean shape).
  const minConsecutiveDaysOff =
    settings && Number.isFinite(settings.minConsecutiveDaysOff)
      ? Math.max(
          MIN_CONSECUTIVE_DAYS_OFF_MIN,
          Math.min(MIN_CONSECUTIVE_DAYS_OFF_MAX, settings.minConsecutiveDaysOff)
        )
      : DEFAULT_MIN_CONSECUTIVE_DAYS_OFF;
  const maxConsecutiveWorkingDays =
    settings && Number.isFinite(settings.maxConsecutiveWorkingDays)
      ? Math.max(
          MAX_CONSECUTIVE_WORKING_DAYS_MIN,
          Math.min(MAX_CONSECUTIVE_WORKING_DAYS_MAX, settings.maxConsecutiveWorkingDays)
        )
      : DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS;
  const dayRequiredRoles =
    settings && settings.dayRequiredRoles && typeof settings.dayRequiredRoles === "object"
      ? settings.dayRequiredRoles
      : DEFAULT_DAY_REQUIRED_ROLES;

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

  // ── Effective-dated config resolution (v15.1.0) ──────────────────────
  // The focus week's openingDays + shiftTemplate resolve through the
  // /configRevisions list (per-axis: latest revision effective at this
  // week's Monday wins; no match → the live singletons act as the frozen
  // base). EVERYTHING downstream — slots, dates, closed-cell rendering,
  // generator props, ExportButton/PDF, fairness aggregates — reads the
  // resolved values, so navigating across a revision boundary flips the
  // whole grid to the configuration that applies to THAT week, and past
  // weeks keep rendering as they did when they were current.
  const resolvedConfig = useMemo(function () {
    return resolveConfigForWeek(configRevisions, settings, shiftTemplate, weekStart);
  }, [configRevisions, settings, shiftTemplate, weekStart]);

  // Possibly-null resolved template for the focus week.
  const resolvedShiftTemplate = resolvedConfig.shiftTemplate;

  // Active template — resolved values when present, defaults otherwise.
  // This is the EFFECTIVE template every consumer (slots, picker, export,
  // generator) runs on. v15.2.0 fix: GenerateButton now receives this
  // (not the raw resolvedShiftTemplate). When the focus week has no
  // covering shift-template revision AND the base /shiftTemplate singleton
  // is null (frozen-base never set, e.g. a fresh project / DEV sandbox, or
  // the template-carrying revision was removed), resolvedShiftTemplate is
  // null — the grid still renders slots from DEFAULT_SHIFT_TEMPLATE, the
  // picker still assigns, and export still works, but Generate used to go
  // dead ("template not loaded"). Passing the effective template keeps
  // Generate consistent with the rest of the grid. The employeeCount === 0
  // gate still covers the genuine "data not loaded yet" window.
  const template = resolvedShiftTemplate || DEFAULT_SHIFT_TEMPLATE;

  // v0.12.0: opening-days filter; v15.1.0: per-focus-week resolved value.
  // Missing → DEFAULT_OPENING_DAYS (all open) so legacy docs render a
  // full week.
  const openingDays = resolvedConfig.openingDays || DEFAULT_OPENING_DAYS;

  // Narrow the shifts map to this week before the grid scans it. Defined
  // above `dates` so the visible-columns computation can keep any closed
  // weekday that still carries a real shift (v15.3.0).
  const weekShifts = useMemo(function () { return shiftsForWeek(shifts, weekStart); }, [shifts, weekStart]);

  // v15.3.0: visible columns = the open days PLUS any closed weekday that
  // still has an assignment. Changing the opening days then never hides a
  // past/orphan shift (the whole day used to drop out via visibleWeekDates).
  // With no closed-day shifts this is identical to visibleWeekDates.
  const dates = useMemo(
    function () { return weekDatesWithShifts(weekStart, openingDays, weekShifts); },
    [weekStart, openingDays, weekShifts]
  );

  // v16.0.0: which weekdays are actually on display. Feeds slotsForWeek so
  // the ladder is the union of what THESE days need.
  //
  // Deriving from `dates` rather than all seven weekdays is deliberate: a
  // Saturday-only headcount bump must not grow dead rows Mon–Fri when
  // Saturday is closed and empty. And because weekDatesWithShifts keeps a
  // closed weekday that still carries a shift, an orphan sitting at a high
  // index still pulls its day into `dates`, into the union, and therefore
  // stays visible. The two rules compose.
  const visibleWeekdayKeys = useMemo(
    function () { return dates.map(weekdayKeyForDate); },
    [dates]
  );

  // Slot definitions for the week.
  // v1.11.0: pass dayRequiredRoles so the resulting slotDef.requiredRoles
  // reflects the manager's per-section configuration.
  // v16.0.0: slotsForWeek returns the UNION ladder across the visible
  // weekdays — see the design note on slotsForWeek. Defined below `dates`
  // because it now depends on them; neither `weekShifts` nor `dates` reads
  // `slots`, so moving them above introduces no cycle.
  const slots = useMemo(
    function () { return slotsForWeek(template, dayRequiredRoles, visibleWeekdayKeys); },
    [template, dayRequiredRoles, visibleWeekdayKeys]
  );

  // v1.4.0: slot lookup by key for the generator-results modal. Built off
  // the same `slots` array so it stays in sync if the template changes.
  const slotsByKey = useMemo(function () {
    const m = {};
    for (let i = 0; i < slots.length; i++) m[slots[i].key] = slots[i];
    return m;
  }, [slots]);

  // v0.10.2: cache today's ISO once per render so the date-pill loop
  // doesn't restringify a Date on every column.
  const todayIso = useMemo(function () { return isoDate(new Date()); }, []);

  // v1.12.0: past-week lockdown. A week becomes non-editable once its
  // Sunday is strictly before today. The flag gates every write entry
  // point in this component — Generate / Swap / Clear / Undo nav buttons
  // are disabled, swap-mode is short-circuited in cellClick, and
  // ShiftFormModal opens in a read-only mode that hides Save / Move-Swap
  // / Clear. Cells stay viewable; the manager can still inspect historical
  // assignments through the modal. Pill-highlight and jump-to-cell from
  // the generator-results modal also stay live (they're view-only).
  //
  // v15.1.0: the lockdown is switchable via /settings.pastWeeksLocked
  // (Settings → Scheduling rules). Missing field reads as true so legacy
  // docs keep the locked behaviour.
  const pastWeeksLocked =
    settings && typeof settings.pastWeeksLocked === "boolean"
      ? settings.pastWeeksLocked
      : DEFAULT_PAST_WEEKS_LOCKED;
  const isReadOnly = pastWeeksLocked && isPastWeek(weekStart, todayIso);

  // v1.4.0: today's index within the displayed week (or -1 if today is
  // outside the visible range / closed). Consumed by the desktop grid's
  // today-column tint underlay. Computed once per render via dates.

  function goPrev()  { setWeekStart(function (d) { return addDays(d, -7); }); }
  function goNext()  { setWeekStart(function (d) { return addDays(d, 7); }); }
  function goToday() { setWeekStart(startOfWeek(new Date())); }

  // v16.0.0: directional week slide, the ScheduleGrid counterpart to
  // AppShell's tab transition. Forward in time enters from the right,
  // backward from the left — so the motion matches the mental model of a
  // calendar running left-to-right. Driven off the actual timestamp rather
  // than the button pressed, so `goToday`, the keyboard shortcuts (←/→/T)
  // and `jumpToWeek` from the fairness sparkline all animate correctly
  // without each needing to declare a direction.
  //
  // Only the grid itself is wrapped — the nav bar, banners and the summary
  // panels below stay put, which reads as the week's content changing
  // inside a stable frame rather than the whole page lurching.
  const prevWeekRef = useRef(weekStart.getTime());
  const [weekSlide, setWeekSlide] = useState({ key: 0, dir: "mgt-view-in-right" });
  useEffect(function () {
    const t = weekStart.getTime();
    const prev = prevWeekRef.current;
    if (t === prev) return;
    prevWeekRef.current = t;
    setWeekSlide(function (s) {
      return {
        key: s.key + 1,
        dir: t > prev ? "mgt-view-in-right" : "mgt-view-in-left",
      };
    });
  }, [weekStart]);

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

  // v1.12.0: 28-day rolling aggregates per employee. Built once per
  // (shifts, employees, weekStart, requests, shiftTemplate) tuple and
  // shared with both <GenerateButton> (→ generator's rankCandidates
  // hours+shifts-deficit sort) and <MonthlyFairnessPanel> (chip-row
  // visibility surface below the request preview). Computed against
  // the FULL shifts map (not narrowed to the focus week) since the
  // window is wider than one week.
  // v15.4.0: the aggregate builders now resolve config PER WEEK inside their
  // windows (was: focus-week config across the whole window — the v15.1.0
  // simplification). We pass the BASE singletons (shiftTemplate + settings) +
  // configRevisions so the builder can re-resolve for each week it spans. This
  // (a) blends the hours TARGET correctly when a revision lands mid-window, and
  // (b) lets the builder skip orphan shifts (slot index dropped from a week's
  // resolved count) so they don't inflate fairness counts. Actual hours come
  // from the self-contained shift records, unaffected either way.
  const monthlyAggregates = useMemo(function () {
    return build28DayAggregates({
      shifts: shifts,
      employees: employees,
      weekStart: weekStart,
      requests: requests,
      shiftTemplate: shiftTemplate,
      configRevisions: configRevisions,
      settings: settings,
      // v1.14.0 follow-up: per-employee avgShiftHours filters slots by
      // role + preference; the per-section day-role configuration drives
      // slotsForDay → roleMatchesSlot inside the helper.
      dayRequiredRoles: dayRequiredRoles,
    });
  }, [shifts, employees, weekStart, requests, shiftTemplate, configRevisions, settings, dayRequiredRoles]);

  // v1.14.0: calendar-month aggregates per employee. Sibling to
  // monthlyAggregates (28-day rolling) — anchored to the calendar month
  // containing weekStart's Monday. Forwarded only to <GenerateButton>;
  // <MonthlyFairnessPanel> stays visually 28-day. The generator sums
  // both windows' deficits in rankCandidates so balance respects both
  // the rolling-recency view AND the payroll-month boundary.
  const calendarMonthAggregates = useMemo(function () {
    return buildCalendarMonthAggregates({
      shifts: shifts,
      employees: employees,
      weekStart: weekStart,
      requests: requests,
      shiftTemplate: shiftTemplate,
      configRevisions: configRevisions,
      settings: settings,
      dayRequiredRoles: dayRequiredRoles,
    });
  }, [shifts, employees, weekStart, requests, shiftTemplate, configRevisions, settings, dayRequiredRoles]);

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
  // v16.0.0: a swap/move that would create a split shift is held here
  // until the manager confirms it. Shape:
  //   { source, target, sourceEmp, targetEmp, splits: [{name, dateIso, existing}] }
  // Swap/Move commits immediately once confirmed, so unlike the picker —
  // which can warn inline next to a Save button the manager still has to
  // press — this flow needs an explicit dialog. Otherwise two clicks on
  // the grid would silently produce a 12-hour straight day.
  const [pendingSplitSwap, setPendingSplitSwap] = useState(null);

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

  // v1.12.0: if the manager navigates from a current/future week into a
  // past week while swap mode is active, drop the swap state — past
  // weeks can't accept any commit and the lingering swap banner would
  // confuse the read-only context.
  useEffect(function () {
    if (isReadOnly && swapMode) exitSwapMode();
  }, [isReadOnly, swapMode]);

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

  // v15.3.0: imperative handles to the nav-bar action buttons so the
  // keyboard shortcuts (G / C / E) can open their modals / run their flow
  // without lifting each button's internal state into ScheduleGrid.
  const generateRef = useRef(null);
  const clearRef = useRef(null);
  const exportRef = useRef(null);

  // ── Keyboard: Esc chain + schedule shortcuts (v15.3.0) ───────────────
  // Esc priority order: swap-mode → jump-target → sticky pill-highlight.
  // The jump-target is a one-shot affordance, so prioritising it over the
  // pill keeps Esc-to-cancel feeling immediate when the manager has just
  // clicked a results-modal row.
  //
  // v15.3.0 adds the single-key schedule shortcuts (mirroring MGT Bookings):
  // ←/→ week nav, T this week, G/S/U/C/E for Generate/Swap/Undo/Clear/Export.
  // Guards: no modifier, not typing in a field, no modal open (the
  // data-mgt-overlay sentinel). The five action keys are gated on the
  // read-only past-week flag (E export is read-only-safe, so it's allowed).
  // Tab digits + `?` live in AppShell; the two handlers never share a key.
  useEffect(function () {
    function onKey(e) {
      if (e.key === "Escape") {
        // v15.3.0: any open modal owns Esc (each modal closes itself via
        // useEscClose). Yield so a single Esc closes the dialog without also
        // cancelling swap / clearing a highlight underneath it. With no modal
        // open, the swap → jump → pill chain below runs as before.
        if (isAnyOverlayOpen()) return;
        if (swapMode) {
          exitSwapMode();
        } else if (highlightedCellKey) {
          setHighlightedCellKey(null);
        } else if (highlightedEmployeeId) {
          setHighlightedEmployeeId(null);
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (isAnyOverlayOpen()) return;

      switch (e.key) {
        case "ArrowLeft":  goPrev();  break;
        case "ArrowRight": goNext();  break;
        case "t": case "T": goToday(); break;
        case "g": case "G":
          if (!isReadOnly && generateRef.current) generateRef.current.open();
          break;
        case "s": case "S":
          if (!isReadOnly) toggleSwapMode();
          break;
        case "u": case "U":
          if (!isReadOnly) handleUndo();
          break;
        case "c": case "C":
          if (!isReadOnly && clearRef.current) clearRef.current.open();
          break;
        case "e": case "E":
          if (exportRef.current) exportRef.current.open();
          break;
        default: break;
      }
    }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [swapMode, highlightedEmployeeId, highlightedCellKey, modalCell, isReadOnly]);

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

  // ── Undo stack (v1.10.0) ─────────────────────────────────────────────
  // Captures every Clear / Generate / Move / Swap so the manager can roll
  // back a mis-clicked action. Bounded to 5 ops; oldest drops silently
  // once the cap is hit. See useUndoStack.js for the op shape.
  //
  // Capture flow:
  //   - ClearButton + GenerateButton fire onUndoableOp(op) after a
  //     successful mutation.
  //   - The Move + Swap branches in attemptSwap() push directly below
  //     (no intermediate component owns those — they live in this file).
  //
  // Apply flow: handleUndo() pops the latest op, re-upserts restoreShifts
  // (Firebase RTDB accepts writes to any key, even one we just deleted),
  // then deletes removeIds. A banner reports the result.
  const { stack: undoStack, push: pushUndo, pop: popUndo } = useUndoStack();
  function recordUndoableOp(op) { pushUndo(op); }
  function handleUndo() {
    const op = popUndo();
    if (!op) return;
    // Restore first (re-create deleted records), then remove (drop
    // records the original op created). Order matters if any id appears
    // in both lists — shouldn't happen in practice (Move's removeIds is
    // the post-mutation target id; its restoreShifts contains the
    // pre-mutation source + target placeholder, all with disjoint ids).
    for (let i = 0; i < op.restoreShifts.length; i++) {
      actions.upsertShift(op.restoreShifts[i]);
    }
    for (let i = 0; i < op.removeIds.length; i++) {
      actions.deleteShift(op.removeIds[i]);
    }
    setResultBanner({
      kind: "undo",
      label: op.label,
      restored: op.restoreShifts.length,
      removed: op.removeIds.length,
    });
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

  // v1.13.0 polish: navigate to a specific week (called from the
  // EmployeeFairnessModal per-week sparkline). The modal closes itself
  // via its own onJumpToWeek wrapper, so we only need to flip weekStart.
  // No-op if the date string is malformed or the target week equals the
  // current focus week (setWeekStart with the same value is a React
  // no-op anyway, but we skip the parseIsoDate work).
  function jumpToWeek(weekStartIso) {
    if (!weekStartIso) return;
    try {
      const parsed = parseIsoDate(weekStartIso);
      if (!parsed || isNaN(parsed.getTime())) return;
      const normalized = startOfWeek(parsed);
      if (isoDate(normalized) === isoDate(weekStart)) return;
      setWeekStart(normalized);
    } catch (_e) { /* malformed date — silently ignore */ }
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

    // Same-day check. Until v15.4.1 a landing that would double-book
    // someone was REFUSED outright with a red banner. v16.0.0 makes split
    // shifts legal, so this is now a confirm rather than a rejection: we
    // work out who would end up doubled, stash the pending swap, and let
    // <SplitConfirmModal> decide whether to proceed.
    //
    // Still gated on the dates differing. Moving someone from the day cell
    // to the evening cell of the SAME date is a relocation, not a
    // duplication — that path was always allowed and stays untouched.
    const targetShiftId = target.shift ? target.shift.id : null;
    if (target.dateIso !== source.dateIso) {
      const splits = [];
      const sourceEmpClash = findSameDayShift(weekShifts, sourceEmp.id, target.dateIso, targetShiftId);
      if (sourceEmpClash && sourceEmpClash.id !== source.shift.id) {
        splits.push({ name: sourceEmp.name, dateIso: target.dateIso, existing: sourceEmpClash });
      }
      if (targetEmp) {
        const targetEmpClash = findSameDayShift(weekShifts, targetEmp.id, source.dateIso, source.shift.id);
        if (targetEmpClash && targetEmpClash.id !== targetShiftId) {
          splits.push({ name: targetEmp.name, dateIso: source.dateIso, existing: targetEmpClash });
        }
      }
      if (splits.length > 0) {
        // Hold the swap. Note swap mode is cleared here, not on confirm —
        // the decision has moved into the modal, and leaving the grid in
        // target-select mode behind a dialog would be confusing.
        setPendingSplitSwap({
          source: source,
          target: target,
          sourceEmp: sourceEmp,
          targetEmp: targetEmp,
          splits: splits,
        });
        setSwapMode(null);
        return;
      }
    }

    commitSwap(source, target, sourceEmp, targetEmp);
  }

  // v16.0.0: resume a swap the manager confirmed was meant to be a split.
  function confirmPendingSplitSwap() {
    if (!pendingSplitSwap) return;
    const p = pendingSplitSwap;
    setPendingSplitSwap(null);
    commitSwap(p.source, p.target, p.sourceEmp, p.targetEmp);
  }

  // v16.0.0: the commit half of attemptSwap, split out so the split-shift
  // confirm can resume it after the manager says yes. Every validation has
  // already passed by the time this runs.
  function commitSwap(source, target, sourceEmp, targetEmp) {
    // v1.10.0: snapshot pre-mutation records before each branch fires so
    // the undo stack can restore them. Deep-clone via JSON round-trip —
    // shift records are plain data, so this is sufficient and avoids
    // any aliasing with the in-flight render's weekShifts.
    const sourceSnap = source.shift
      ? JSON.parse(JSON.stringify(source.shift))
      : null;
    const targetSnap = target.shift
      ? JSON.parse(JSON.stringify(target.shift))
      : null;
    if (targetEmp) {
      // Swap two assignments. Each cell keeps its own role/start/end.
      actions.upsertShift({ ...source.shift, employeeId: targetEmp.id });
      actions.upsertShift({ ...target.shift, employeeId: sourceEmp.id });
      setSwapBanner({
        tone: "success",
        text: "Swapped " + sourceEmp.name + " ↔ " + targetEmp.name + ".",
      });
      // v1.10.0: undo restores both employees to their original cells
      // (the cells themselves keep their ids — only employeeId moved).
      // No removeIds: nothing was deleted or freshly created.
      const restore = [];
      if (sourceSnap) restore.push(sourceSnap);
      if (targetSnap) restore.push(targetSnap);
      if (restore.length > 0) {
        recordUndoableOp({ label: "Swap", restoreShifts: restore, removeIds: [] });
      }
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
      // v1.10.0: capture the resolved target id so undo can drop a
      // freshly-created record. upsertShift returns:
      //   - target.shift.id when the placeholder branch supplied one
      //   - a fresh push key when there was no placeholder
      //   - null when the write-guard refused (initial load incomplete)
      const newTargetId = actions.upsertShift(targetPayload);
      setSwapBanner({
        tone: "success",
        text: "Moved " + sourceEmp.name + " to " + target.slotDef.humanLabel + ".",
      });
      // v1.10.0: undo logic depends on whether target had an existing
      // record before the move.
      //   - Placeholder existed: restore both snapshots (re-upserting
      //     the target placeholder overwrites the move's payload back
      //     to its original employeeId: null / template times). No
      //     removeIds — the id stayed the same throughout.
      //   - No placeholder: restore source; delete the freshly-created
      //     target record. The cell returns to truly empty.
      const restore = [];
      if (sourceSnap) restore.push(sourceSnap);
      if (targetSnap) restore.push(targetSnap);
      const removeIds = (!targetSnap && newTargetId) ? [newTargetId] : [];
      if (restore.length > 0 || removeIds.length > 0) {
        recordUndoableOp({ label: "Move", restoreShifts: restore, removeIds: removeIds });
      }
    }
    setSwapMode(null);
  }

  // Cell-click router. Routes to swap mechanic when swap mode is on, else
  // to the regular picker modal.
  function cellClick(dateIso, slotDef, shift) {
    // v1.12.0: past weeks bypass swap mode entirely. The cell still opens
    // (in ShiftFormModal's read-only mode) so the manager can inspect the
    // historical record. SwapButton is disabled in past weeks so this is
    // mostly defensive — but if the manager entered swap mode in the
    // current week and then navigated backward, swapMode state survives.
    if (isReadOnly) {
      openCell(dateIso, slotDef, shift);
      return;
    }
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
  // v16.0.0: `label` distinguishes the two inert cases — "Closed" (the
  // restaurant isn't open for this day-part) vs "—" (it is open, but a
  // per-weekday override means this row doesn't run today). Defaults to
  // "Closed" so every pre-v16.0.0 call site is unchanged.
  function renderClosedCell(date, slot, label) {
    const dIso = isoDate(date);
    return (
      <div
        key={slot.key + "-" + dIso + "-closed"}
        aria-hidden="true"
        style={{
          width: "100%",
          minHeight: 60,
          borderRadius: R.inset,
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
        {label || "Closed"}
      </div>
    );
  }

  // v15.3.0: closed-slot router. When a slot's day-part is closed on `date`
  // but a real shift still lives there (past week, or an orphan left after
  // the manager closed the slot), render the assignment with the "closed"
  // flag rather than the inert placeholder — never hide who worked. Empty
  // closed slots keep the placeholder. Shared by the desktop + mobile gates
  // so they stay in lockstep with the PDF export's identical rule.
  // v16.0.0: the same router for a slot the day's per-weekday override
  // drops. Identical rule — a real shift is never hidden behind a
  // placeholder — but the empty case reads "—" rather than "Closed", since
  // the restaurant IS open; it's this row that doesn't run today.
  function renderUnscheduledSlotCell(date, slot) {
    const s = findShiftForSlot(weekShifts, isoDate(date), slot);
    // "not today", NOT "closed" — the restaurant IS open on this date; it's
    // this row that a per-weekday override drops. Saying "closed" here told
    // the manager they were shut on a day they were trading.
    if (s && s.employeeId) return renderCell(date, slot, "not today");
    return renderClosedCell(date, slot, "—");
  }

  function renderClosedSlotCell(date, slot) {
    const closedShift = findShiftForSlot(weekShifts, isoDate(date), slot);
    if (closedShift && closedShift.employeeId) return renderCell(date, slot, "closed");
    return renderClosedCell(date, slot);
  }

  // ── Cell renderer (shared between layouts) ───────────────────────────
  // v15.3.0: `inertTag` — set when this cell would otherwise have been an
  // inert placeholder but a real shift still lives here (a past week, or an
  // assignment left behind by a config change). The cell renders normally
  // (assignee + times stay visible) but gains a dashed amber border and a
  // small tag naming WHY it's flagged.
  // Principle: never hide a real shift behind a placeholder.
  //
  // v16.0.0: two distinct reasons, so the tag takes its text from the
  // caller rather than being hard-coded:
  //   "closed"    — the restaurant isn't open for this day-part that date.
  //   "not today" — it IS open; a per-weekday override means this ROW
  //                 doesn't run that weekday.
  // Conflating them told the manager the restaurant was shut on a day it
  // was trading. Matches the empty-cell split ("Closed" vs "—") that
  // renderClosedCell and pdf-export.js already make.
  function renderCell(date, slot, inertTag) {
    const dIso = isoDate(date);
    // v15.1.0: effectivize the slot for THIS date — solo times apply on
    // weekdays where the slot's day-part is the only open one. The
    // effective slot flows into the cell display, the * override marker,
    // and cellClick (→ ShiftFormModal's initial/reset times + the swap/
    // move payload), so every downstream consumer sees per-date defaults
    // without further changes. Same-reference shortcut when the times
    // match keeps the common no-solo path allocation-free.
    const effTimes = slotTimesForDate(slot, date, openingDays);
    const effSlot =
      effTimes.start !== slot.defaultStart || effTimes.end !== slot.defaultEnd
        ? { ...slot, defaultStart: effTimes.start, defaultEnd: effTimes.end }
        : slot;
    const existing = findShiftForSlot(weekShifts, dIso, effSlot);
    const cell = deriveCellState(existing, effSlot);
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
            // v16.0.0: a pill, and SOLID like every other role label.
            // BADGE_SIZE.cell, not .base — this chip sits INSIDE a ~110px
            // grid cell next to the assignee name, and standalone-label
            // metrics push the name onto a second line. The fill is what
            // makes it read as a label. (phase 24: the same two literals,
            // now shared with the inert closed/not-today tag below.)
            ...BADGE_SIZE.cell,
            borderRadius: R.pill,
            background: "rgb(" + roleRgb + ")",
            color: "var(--text-on-accent)",
            border: "1px solid var(--border-overlay-sheet)",
            marginLeft: 6,
          }}
        >
          {cell.role}
        </span>
      )
      : null;

    // v15.1.0: compare against the per-date effective defaults — a cell
    // stored at solo times on a solo weekday is NOT a manual override.
    const timeOverridden =
      cell.hasRecord && (cell.start !== effSlot.defaultStart || cell.end !== effSlot.defaultEnd);

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
    // v15.3.0: inert-but-occupied cells get a dashed amber border. Swap /
    // highlight states win (they own the border), so the flag only paints
    // when the cell is at rest.
    const showClosedFlag = Boolean(inertTag) && !isSwapSource && !isAnyHighlight;
    const effBorderColor = showClosedFlag ? "var(--border-warning-tint)" : baseBorder;
    const borderDash = showClosedFlag ? "dashed" : "solid";
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
        className="mgt-hover-scale mgt-press"
        onClick={function () { cellClick(dIso, effSlot, existing); }}
        style={{
          width: "100%",
          textAlign: "left",
          background: baseBg,
          border: baseBorderWidth + "px " + borderDash + " " + effBorderColor,
          borderRadius: R.inset,
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span>{cell.start}–{cell.end}{timeOverridden ? " *" : ""}</span>
            {showClosedFlag ? (
              <span
                style={{
                  // v16.0.0 (phase 24): was 1px 5px / 9 next to a role
                  // chip at 1px 6px / 10 — two in-cell micro tags that
                  // differed by a pixel each. Both are BADGE_SIZE.cell now.
                  ...BADGE_SIZE.cell,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  borderRadius: R.pill,
                  background: "var(--bg-warning-tint)",
                  color: "var(--text-warning)",
                  border: "1px solid var(--border-warning-tint)",
                }}
              >
                {inertTag}
              </span>
            ) : null}
          </span>
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
          borderRadius: R.card,
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
        <button onClick={goPrev}  className="mgt-hover-scale mgt-press" style={{ ...BTN.base, ...BTN.ghost, ...BTN_SIZE.md }}>‹ Prev</button>
        <button onClick={goToday} className="mgt-hover-scale mgt-press" style={{ ...BTN.base, ...BTN.secondary, ...BTN_SIZE.md }}>Today</button>
        <button onClick={goNext}  className="mgt-hover-scale mgt-press" style={{ ...BTN.base, ...BTN.ghost, ...BTN_SIZE.md }}>Next ›</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          {formatWeekRange(weekStart)}
        </div>
        <GenerateButton
          ref={generateRef}
          weekStart={weekStart}
          weekShifts={weekShifts}
          priorWeekShifts={priorWeekShifts}
          nextWeekShifts={nextWeekShifts}
          employees={employees}
          requests={requests}
          shiftTemplate={template}
          openingDays={openingDays}
          strictPreference={strictPreference}
          minConsecutiveDaysOff={minConsecutiveDaysOff}
          maxConsecutiveWorkingDays={maxConsecutiveWorkingDays}
          dayRequiredRoles={dayRequiredRoles}
          monthlyAggregates={monthlyAggregates}
          calendarMonthAggregates={calendarMonthAggregates}
          isMobile={isMobile}
          actions={actions}
          onResult={handleGenerateResult}
          onUndoableOp={recordUndoableOp}
          disabled={isReadOnly}
        />
        <SwapButton
          active={Boolean(swapMode)}
          phase={swapMode ? swapMode.phase : undefined}
          isMobile={isMobile}
          onToggle={toggleSwapMode}
          disabled={isReadOnly}
        />
        <UndoButton
          stack={undoStack}
          onUndo={handleUndo}
          isMobile={isMobile}
          disabled={isReadOnly}
        />
        <ClearButton
          ref={clearRef}
          weekStart={weekStart}
          weekDates={dates}
          weekShifts={weekShifts}
          slots={slots}
          isMobile={isMobile}
          actions={actions}
          onResult={handleClearResult}
          onUndoableOp={recordUndoableOp}
          disabled={isReadOnly}
        />
        <ExportButton
          ref={exportRef}
          weekStart={weekStart}
          slots={slots}
          weekShifts={weekShifts}
          employees={employees}
          openingDays={openingDays}
          allowIncompleteExport={allowIncompleteExport}
          isMobile={isMobile}
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
              borderRadius: R.card,
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
                // v16.0.0 (phase 24): was 6px 8px / 12, which matched
                // nothing. It is a chip in a row directly under the week
                // nav, so it takes BTN_SIZE.sm — same font size it already
                // had, now on the scale. Stays a <div>: it is a column
                // HEADER with no action, so it must not be focusable.
                ...BTN_SIZE.sm,
                fontWeight: 600,
                borderRadius: R.pill,
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
                  borderRadius: R.inset,
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
                {/* v15.1.0: deliberately the FLAT template times — this is
                    the reference column (mirrors the PDF row label). Solo
                    weekdays show their per-date times inside the cells.
                    v16.0.0: per-weekday overrides make that divergence more
                    common, so the row now says "· varies" when at least one
                    visible weekday runs this slot at different times. The
                    real hours stay per-cell; this just stops the reference
                    column reading as though it applied to the whole row. */}
                <div style={{ ...S.muted, fontSize: 11, marginTop: 2 }}>
                  {slot.defaultStart}–{slot.defaultEnd}
                  {slot.weekdayTimes ? " · varies" : ""}
                </div>
              </div>
              {dates.map(function (d) {
                // v1.3.0: a slot whose dayPart is closed on this date
                // renders an inert "Closed" placeholder so the grid keeps
                // its row alignment across columns.
                // v15.3.0: …unless a real shift still lives in that closed
                // slot, in which case the assignment stays visible.
                // v16.0.0: closed-ness is checked FIRST — a closed
                // day-part keeps the stronger "Closed" signal even if a
                // per-weekday override would also have dropped the row.
                if (!isSlotOpenOnDate(d, slot, openingDays)) {
                  return renderClosedSlotCell(d, slot);
                }
                if (!isSlotScheduledOnDate(slot, d)) {
                  return renderUnscheduledSlotCell(d, slot);
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
                // v16.0.0: same three-way branch as desktop. Note the slot
                // list is NOT pre-filtered — isSectionBoundary reads the
                // full array, and filtering is exactly what broke the
                // section headers back in v1.3.0.
                const slotRuns = isSlotScheduledOnDate(slot, d);
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
                            borderRadius: R.card,
                            textAlign: "center",
                          }}
                        >
                          {slot.sectionLabel} · {slot.dayPartLabel}
                        </div>
                      )
                      : null}
                    {!slotOpen
                      ? renderClosedSlotCell(d, slot)
                      : (slotRuns ? renderCell(d, slot) : renderUnscheduledSlotCell(d, slot))}
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

  // v1.0.0 + v1.1.0 + v1.10.0: result banner copy. Four shapes:
  //   - Clear result: { cleared, kind } → "Cleared N shifts (week / day)."
  //   - Generator fill-empty: "Filled X cells, Y left empty for <range>."
  //   - Generator regenerate: "Cleared X stale, filled Y, Z left empty for <range>."
  //   - Undo result: { kind: "undo", label, restored, removed } → "Undid: <label>."
  // "Nothing to fill" reads better than "Filled 0, left 0" when the week
  // was already complete on a generator run.
  let bannerCopy = "";
  if (resultBanner) {
    const r = resultBanner;
    if (r.kind === "undo") {
      // Undo result. Single-line confirmation; the cell-level effect
      // is already visible in the grid.
      bannerCopy = "Undid: " + r.label + ".";
    } else if (r.kind === "week" || r.kind === "day") {
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
          borderRadius: R.card,
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
              className="mgt-hover-scale mgt-press"
              onClick={function () { setShowResultsModal(true); }}
              style={{
                ...BTN.base,
                ...BTN.ghost,
                ...BTN_SIZE.xs,
                lineHeight: 1.4,
                boxShadow: "none",
              }}
            >
              Details
            </button>
          ) : null}
          <button
            type="button"
            className="mgt-hover-scale mgt-press"
            onClick={dismissResultBanner}
            aria-label="Dismiss"
            style={{
              ...BTN.base,
              ...BTN.ghost,
              ...BTN_SIZE.xs,
              // GLYPH EXCEPTION (see BTN_SIZE): xs padding keeps the banner
              // row height, but an 11px "×" is an unhittable speck.
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
          borderRadius: R.card,
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
            className="mgt-hover-scale mgt-press"
            onClick={swapMode ? exitSwapMode : function () { setSwapBanner(null); }}
            aria-label={swapMode ? "Cancel" : "Dismiss"}
            style={{
              ...BTN.base,
              ...BTN_SIZE.xs,
              background: "var(--btn-danger-bg)",
              color: "var(--text-on-accent)",
              border: "1px solid var(--btn-danger-border)",
              // GLYPH EXCEPTION (see BTN_SIZE): the label is "×" or the one
              // word "Cancel"; keep the glyph legible at xs padding.
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
      {/* v1.12.0: past-week lockdown banner. Sits between the nav bar and
          the swap / generator banners (which only show transiently while
          their respective actions are armed/active). Persistent —
          dismissable only by navigating to a non-past week. Uses the
          warning palette to match the SwapButton-active visual language
          without screaming "error". */}
      {isReadOnly ? (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            background: "var(--bg-warning-tint)",
            border: "1px solid var(--border-warning-tint)",
            color: "var(--text-warning)",
            borderRadius: R.card,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
            boxShadow: "var(--shadow-soft)",
          }}
        >
          <span aria-hidden="true">🔒</span>
          <span>
            This week is in the past. Cells are read-only — switch to the
            current or a future week to make edits.
          </span>
        </div>
      ) : null}
      {swapBannerView}
      {generateBanner}
      {allClosedNotice}
      {dates.length > 0 ? (
        <SlideView key={weekSlide.key} dir={weekSlide.dir}>
          {isMobile ? mobileStack : desktopGrid}
        </SlideView>
      ) : null}

      <p style={{ ...S.muted, marginTop: 12, fontSize: 11 }}>
        Click any cell to assign someone or edit the time / role. Cells marked
        with “*” have times that differ from the template defaults. The
        assignee dropdown hides staff with a day-off or holiday request on
        that date, and staff already working that date — a toggle in the
        modal restores either. Picking someone who already works that date
        creates a split shift, which is allowed manually but never produced
        by the auto-generator.
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
        // v15.4.0: focus-week resolved template so the pill count skips orphan
        // shifts (slot index dropped below the resolved count). All `dates` are
        // in one week → a single resolved template applies.
        template={template}
      />

      <WeeklyRequestsPreview
        requests={requests}
        employees={employees}
        weekStart={weekStart}
        isMobile={isMobile}
      />

      <MonthlyFairnessPanel
        employees={employees}
        monthlyAggregates={monthlyAggregates}
        shifts={shifts}
        requests={requests}
        weekStart={weekStart}
        shiftTemplate={shiftTemplate}
        configRevisions={configRevisions}
        settings={settings}
        dayRequiredRoles={dayRequiredRoles}
        openingDays={openingDays}
        highlightedEmployeeId={highlightedEmployeeId}
        onHighlight={onHighlight}
        onJumpToWeek={jumpToWeek}
        isMobile={isMobile}
      />

      <ModalPresence show={modalCell !== null}>
        {modalCell !== null ? (
          <ShiftFormModal
            open
            dateIso={modalCell ? modalCell.dateIso : ""}
            slotDef={modalCell ? modalCell.slotDef : null}
            shift={modalCell ? modalCell.shift : null}
            employees={employees}
            requests={requests}
            weekShifts={weekShifts}
            priorWeekShifts={priorWeekShifts}
            nextWeekShifts={nextWeekShifts}
            minConsecutiveDaysOff={minConsecutiveDaysOff}
            maxConsecutiveWorkingDays={maxConsecutiveWorkingDays}
            isMobile={isMobile}
            readOnly={isReadOnly}
            onClose={closeModal}
            onSave={handleSave}
            onDelete={handleDelete}
            onStartSwap={enterSwapTargetFromModal}
          />
        ) : null}
      </ModalPresence>

      {/* v1.4.0: generator-results "Details" modal. Open state is
          independent of the banner so closing the modal lets the banner
          resume its auto-dismiss countdown. */}
      {/* v16.0.0: split-shift confirm for the Swap / Move mechanic. Unlike
          the picker, Swap commits on the second cell click, so the warning
          has to be a dialog rather than an inline banner. */}
      <ModalPresence show={pendingSplitSwap !== null}>
        {pendingSplitSwap !== null ? (
          <SplitConfirmModal
            open
            splits={pendingSplitSwap.splits}
            isMobile={isMobile}
            onClose={function () { setPendingSplitSwap(null); }}
            onConfirm={confirmPendingSplitSwap}
          />
        ) : null}
      </ModalPresence>

      <ModalPresence show={showResultsModal}>
        {showResultsModal ? (
          <GenerateResultsModal
            open
            onClose={function () { setShowResultsModal(false); }}
            summary={resultBanner}
            employees={employees}
            slotsByKey={slotsByKey}
            onJumpToCell={jumpToCell}
            isMobile={isMobile}
          />
        ) : null}
      </ModalPresence>
    </div>
  );
}
