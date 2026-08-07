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
  DEFAULT_MIN_CONSECUTIVE_DAYS_OFF,
  MIN_CONSECUTIVE_DAYS_OFF_MIN,
  MIN_CONSECUTIVE_DAYS_OFF_MAX,
  DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS,
  MAX_CONSECUTIVE_WORKING_DAYS_MIN,
  MAX_CONSECUTIVE_WORKING_DAYS_MAX,
  DEFAULT_DAY_REQUIRED_ROLES,
  DEFAULT_PAST_WEEKS_LOCKED,
  GENERATOR_REASONS,
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
import { ModalPresence, SlideView, Reveal } from "./atoms.jsx";
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

// Section row dividers (visual grouping in the desktop grid).
function isSectionBoundary(prevSlot, slot) {
  if (!prevSlot) return false;
  return prevSlot.section !== slot.section || prevSlot.dayPart !== slot.dayPart;
}

export default function ScheduleGrid({ shifts, employees, requests, shiftTemplate, settings, configRevisions, actions, writeWarning, isMobile }) {
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

  // v1.11.0: configurable scheduling rules. Defensive-read + clamp. All
  // three values fall back to defaults that mirror the pre-v1.11.0
  // hard-coded behaviour, so legacy /settings docs render byte-identically.
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
  // v16.0.0 (phase 37): a refused swap. `{ cellKey, reason }` — the cell that
  // was rejected (so it can shake) and a short noun phrase naming why.
  //
  // This replaces the v1.7.0 `swapBanner`, which carried THREE tones. The
  // other two are gone rather than re-homed:
  //   info    — narrated the phase in prose ("Pick a filled cell as the
  //             source."). The armed SwapButton and the cell cursors say the
  //             same thing without a paragraph.
  //   success — announced a result the grid had already rendered. The two
  //             cells visibly changed hands; saying so as well is the app
  //             talking about itself.
  // Only the refusal survives, because it is the one case with information
  // the grid CANNOT show: nothing moved, and why not is not deducible.
  const [swapReject, setSwapReject] = useState(null);
  // v16.0.0 (phase 42): the success counterpart — `{ cellKeys: [...] }` for
  // the cells that just changed hands. They flash green and shake once.
  //
  // This is NOT the success banner coming back. The banner was a sentence
  // in a different part of the page describing what the grid already showed;
  // this points AT the cells that changed, which is the one thing the grid
  // does not make obvious. A swap moves two names between cells that may sit
  // a column and three rows apart, and after the commit both look exactly
  // like every other filled cell — nothing marks which two just moved. The
  // flash marks them, for a second, and then the grid is just the grid.
  //
  // Swap → both cells. Move → the destination only; the source is empty now
  // and shaking an empty cell green would read as something arriving there.
  const [swapSuccess, setSwapSuccess] = useState(null);
  // v16.0.0 (phase 37): drag-and-drop, the second path into the SAME
  // mechanic. A filled cell is draggable; dropping it on another cell calls
  // attemptSwap with exactly the source/target pair the two-click flow
  // builds, so validation, the split-shift confirm and the undo op are
  // shared and cannot drift.
  //
  // Both paths stay because they answer different questions. Dragging is
  // faster and needs no mode when both cells are on screen together; the
  // two-click flow survives a scroll between picking source and target, is
  // reachable from the `S` shortcut and from ShiftFormModal's "Move / Swap",
  // and is the only one that works without a pointer.
  //
  // `dragSource` mirrors swapMode.source's shape. `dragOverKey` is the cell
  // currently under the pointer, so it can paint the same selected ring the
  // two-click target-select uses.
  const [dragSource, setDragSource] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
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
    setSwapReject(null);
  }
  function toggleSwapMode() {
    if (swapMode) {
      exitSwapMode();
    } else {
      setSwapMode({ phase: "source-select" });
    }
  }
  function enterSwapTargetFromModal(source) {
    // source = { dateIso, slotDef, shift } from ShiftFormModal.
    closeModal();
    setSwapMode({ phase: "target-select", source: source });
  }
  // v16.0.0 (phase 37): refuse a swap. The target cell shakes and a compact
  // chip names the reason; both clear together on a timer. Swap mode drops,
  // matching the pre-existing behaviour on every refusal path.
  function rejectSwap(cellKey, reason) {
    setSwapSuccess(null);
    setSwapReject({ cellKey: cellKey, reason: reason });
    setSwapMode(null);
  }
  // v16.0.0 (phase 42): the success counterpart to rejectSwap. Clears any
  // standing refusal so the two flashes can never overlap on one repaint.
  function flashSwapSuccess(cellKeys) {
    setSwapReject(null);
    setSwapSuccess({ cellKeys: cellKeys });
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
  }, [swapMode, highlightedEmployeeId, modalCell, isReadOnly]);

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
  // v16.0.0 (phase 38): this is now a NO-OP NOTICE, not a result banner.
  //
  // It used to announce the outcome of every Generate / Regenerate / Clear /
  // Undo: "Filled 12 cells, 3 left empty for 3–9 Aug 2026." All of that
  // describes something the manager is already looking at — the cells
  // filled, emptied or changed hands on screen as the sentence appeared.
  // The grid IS the result, and narrating it alongside is the app talking
  // about its own work.
  //
  // The exception, and the only case kept, is a run that changed NOTHING.
  // A Generate over an already-full week and a Clear with nothing to clear
  // both leave the screen identical, so silence is indistinguishable from
  // a dead button. That case gets a short phrase and nothing else.
  //
  // Holds `{ text, tone }` (or null), not the old summary object — no week
  // range, no mode, no reason arrays. The `tone` arrived in phase 42 with
  // the unfilled count, which is a caveat rather than a neutral statement.
  const [runNotice, setRunNotice] = useState(null);
  useEffect(function () {
    if (!runNotice) return undefined;
    const t = setTimeout(function () { setRunNotice(null); }, 2600);
    return function () { clearTimeout(t); };
  }, [runNotice]);

  // ── Unfilled-cell reasons (v1.4.0, deleted phase 38, restored phase 42) ─
  // `{ "2026-08-04|kitchen-evening-0": "all-at-quota", ... }` — every cell the
  // last run considered and could not fill, keyed the same way the grid keys
  // its cells. renderCell reads it to hang a reason badge on the cell itself.
  //
  // Deliberately OUTLIVES the chip. The chip is an announcement and expires
  // in 2600ms; the badges are an annotation on the schedule and stay until
  // the manager navigates away or runs the generator again. That split is
  // the whole point of the phase-42 shape: the count is news, the reasons
  // are reference.
  const [unfilledByCell, setUnfilledByCell] = useState({});
  // Reasons describe one specific week's run, so they cannot survive a week
  // change — the same slot key means a different cell next Monday.
  useEffect(function () {
    // Returning `prev` unchanged when it is already empty keeps this from
    // costing a render on mount, where it would otherwise swap one empty
    // object for another.
    setUnfilledByCell(function (prev) {
      return Object.keys(prev).length === 0 ? prev : {};
    });
  }, [weekStart]);

  // Both callbacks still receive the generator's full summary — the
  // generator's return shape is unchanged, and GenerateButton / ClearButton
  // still build it.
  function handleGenerateResult(summary) {
    if (!summary) return;
    const unfilled = Array.isArray(summary.unfilledCells) ? summary.unfilledCells : [];
    const nextMap = {};
    for (let i = 0; i < unfilled.length; i++) {
      const u = unfilled[i];
      if (u && u.dateIso && u.slotKey) nextMap[u.dateIso + "|" + u.slotKey] = u.reason;
    }
    setUnfilledByCell(nextMap);

    if (unfilled.length > 0) {
      // The count, and only the count. WHICH cells and WHY are on the cells.
      // "unfilled" is an adjective here, not a noun, so it does not pluralise
      // — "1 unfilled" and "3 unfilled" are both right as written.
      setRunNotice({ text: unfilled.length + " unfilled", tone: "warning" });
      return;
    }
    if ((summary.filled || 0) > 0 || (summary.cleared || 0) > 0) {
      // A clean run says nothing: the grid just filled in, on screen.
      setRunNotice(null);
      return;
    }
    // Nothing changed and nothing was blocked — the week was already full,
    // so the run had no work. Without this the button would look dead.
    setRunNotice({ text: "Nothing to fill", tone: "neutral" });
  }
  function handleClearResult(summary) {
    if (!summary) return;
    setRunNotice((summary.cleared || 0) > 0
      ? null
      : { text: "Nothing to clear", tone: "neutral" });
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
  const { stack: undoStack, push: pushUndo, pop: popUndo, clear: clearUndo } = useUndoStack();
  function recordUndoableOp(op) { pushUndo(op); }

  // v16.0.0: drop the whole undo stack the moment ANY write is rejected.
  //
  // `actions.upsertShift` returns its new record's id synchronously, while
  // the Firebase `set()` is still in flight — so a capture site records
  // that id into `removeIds` before anyone knows whether the write landed.
  // If it is then refused (the PERMISSION_DENIED this project hit on
  // /settings), the stack holds ids for records that never existed, and
  // Undo would report "Undid: Regenerate" while deleting nothing.
  //
  // Threading a promise back through every mutation call site would be the
  // thorough fix; this is the honest one. A rejected write means some part
  // of the last operation did not happen, so the stack no longer describes
  // a state we can return to — whichever record failed. Clearing it greys
  // the Undo button out, and the write-failure banner (rendered by
  // AppShell, and the same signal this effect keys on) is already on
  // screen saying why.
  useEffect(function () {
    if (writeWarning) clearUndo();
  }, [writeWarning, clearUndo]);
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
  // those. Swap mode exits either way.
  //
  // v16.0.0 (phase 37): refusals shake the target cell and name the reason as
  // a short noun phrase instead of the v1.7.0 red sentence-banner. The
  // phrasing rule is the one applied across the app in this pass: no trailing
  // period, no em dash, no "you can" framing — a label, not a remark.
  function attemptSwap(source, target) {
    const rejectKey = target.dateIso + "|" + target.slotDef.key;
    const sourceEmp = employees[source.shift.employeeId];
    const targetEmp = target.shift && target.shift.employeeId
      ? employees[target.shift.employeeId]
      : null;

    if (!sourceEmp) {
      rejectSwap(rejectKey, "Source employee no longer exists");
      return;
    }

    // Role match for receivers.
    if (!roleMatchesSlot(sourceEmp, target.slotDef)) {
      rejectSwap(rejectKey, sourceEmp.name + " has no role for " + target.slotDef.humanLabel);
      return;
    }
    if (targetEmp && !roleMatchesSlot(targetEmp, source.slotDef)) {
      rejectSwap(rejectKey, targetEmp.name + " has no role for " + source.slotDef.humanLabel);
      return;
    }

    // Request conflicts on receiving cells.
    if (findRequestConflict(requests, sourceEmp.id, target.dateIso)) {
      rejectSwap(rejectKey, sourceEmp.name + " is off on the target date");
      return;
    }
    if (findShiftPreferenceMismatch(requests, sourceEmp.id, target.dateIso, target.slotDef.dayPart)) {
      rejectSwap(rejectKey, sourceEmp.name + " has a shift preference against that day part");
      return;
    }
    if (targetEmp) {
      if (findRequestConflict(requests, targetEmp.id, source.dateIso)) {
        rejectSwap(rejectKey, targetEmp.name + " is off on the source date");
        return;
      }
      if (findShiftPreferenceMismatch(requests, targetEmp.id, source.dateIso, source.slotDef.dayPart)) {
        rejectSwap(rejectKey, targetEmp.name + " has a shift preference against that day part");
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
    const sourceKey = source.dateIso + "|" + source.slotDef.key;
    const targetKey = target.dateIso + "|" + target.slotDef.key;
    if (targetEmp) {
      // Swap two assignments. Each cell keeps its own role/start/end.
      actions.upsertShift({ ...source.shift, employeeId: targetEmp.id });
      actions.upsertShift({ ...target.shift, employeeId: sourceEmp.id });
      // v16.0.0 (phase 37): no success banner. Both cells just changed hands
      // on screen; announcing it is the app narrating its own output.
      // (phase 42): they DO flash green, both of them — see swapSuccess.
      flashSwapSuccess([sourceKey, targetKey]);
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
      // v16.0.0 (phase 37): no success banner — see the swap branch above.
      // (phase 42): destination only. The source cell is empty now, and a
      // green arrival flash on an emptied cell would say the opposite of
      // what happened there.
      flashSwapSuccess([targetKey]);
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
          // v16.0.0 (phase 37): silent no-op. The cell already renders a
          // `not-allowed` cursor in this phase, which says the same thing at
          // the point of contact and before the click rather than after it.
          return;
        }
        setSwapMode({
          phase: "target-select",
          source: { dateIso: dateIso, slotDef: slotDef, shift: shift },
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

  // v16.0.0 (phase 37): clear a refusal after long enough to read a short
  // phrase. The cell's shake is over in 400ms; the chip carries the reason
  // for the rest of the window. Was 4000ms for a full sentence.
  useEffect(function () {
    if (!swapReject) return undefined;
    const t = setTimeout(function () { setSwapReject(null); }, 2600);
    return function () { clearTimeout(t); };
  }, [swapReject]);

  // v16.0.0 (phase 42): clear the success flash. Shorter than the refusal's
  // 2600ms because there is nothing to read — the shake is done at 400ms and
  // the green only has to outlast it enough to be seen as deliberate. A
  // refusal has to hold long enough for a chip to be read; this does not.
  useEffect(function () {
    if (!swapSuccess) return undefined;
    const t = setTimeout(function () { setSwapSuccess(null); }, 1100);
    return function () { clearTimeout(t); };
  }, [swapSuccess]);

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
    //   isSwapSource  — swap mode (or a drag) picked this cell as the
    //                   source.
    //
    // v16.0.0 (phase 37) restyles isSwapSource. It was a PULSING YELLOW
    // outline, and both halves of that were wrong for what it means:
    //   • Yellow is this app's warning tint — it marks a request conflict, a
    //     rest-rule breach, a cell left open on a closed day-part. A cell the
    //     manager just deliberately picked is not a warning.
    //   • An infinite pulse is an attention-getter. Selection does not need
    //     to keep asking for attention; it needs to stay legible while the
    //     manager reads the rest of the grid to choose a target.
    // It now paints solid `--accent` with an accent ring and no animation —
    // the same ON language phase 23 gave every selectable control via
    // pillTone(true), and the same identity the armed SwapButton wears. The
    // yellow is left to mean only what it means everywhere else.
    const cellKey = dIso + "|" + slot.key;
    const isFilled = Boolean(existing && existing.employeeId);
    const isHighlighted =
      highlightedEmployeeId && existing && existing.employeeId === highlightedEmployeeId;
    // Source of the two-click flow, OR the cell currently being dragged.
    // One flag: the two paths mean the same thing and must look the same.
    const isSwapSource =
      (swapMode && swapMode.phase === "target-select" &&
        swapMode.source && existing && existing.id === swapMode.source.shift.id) ||
      (dragSource && existing && existing.id === dragSource.shift.id);
    // The cell a drag is hovering. Paints the same accent ring as the source
    // so "these two are the pair" reads without any text.
    const isDropTarget = Boolean(dragSource) && dragOverKey === cellKey &&
      !(existing && existing.id === dragSource.shift.id);
    const isRejected = Boolean(swapReject) && swapReject.cellKey === cellKey;
    // v16.0.0 (phase 42): one of the cells a swap/move just committed to.
    // Paints the SAME green as the pill highlight, with the shake as the
    // only distinguishing cue — the identical arrangement v1.9.3 used for
    // the jump target, and for the same reason: "this cell is the focus"
    // should look one way regardless of how the manager got there.
    const isConfirmed =
      Boolean(swapSuccess) && swapSuccess.cellKeys.indexOf(cellKey) !== -1;
    const isAnyHighlight = isHighlighted || isConfirmed;
    const isAccentPicked = isSwapSource || isDropTarget;

    // SOLID accent, not an accent tint. This matters: an ASSIGNED cell's
    // resting background is already `--status-assigned-bg`, which is the
    // accent at 22%. A selection painted in `--accent-tint-soft` (18%) is
    // therefore FAINTER than the cell it is supposed to be highlighting, and
    // reads as no change at all — measured in the browser before this line
    // was written, which is the only reason it was caught.
    //
    // Solid `--accent` is unambiguous against a 22% tint of the same hue,
    // needs no new colour, and is what phase 23's rule actually says: ON is
    // solid accent. The armed SwapButton and the selected cell now wear the
    // identical fill, which is what ties the tool to its selection.
    //
    // (This is the constraint v1.7.0's yellow was working around — that the
    // grid's own palette is accent-blue. Going solid answers it without
    // borrowing the warning colour.)
    const baseBg = isRejected
      ? "var(--bg-danger-tint)"
      : isAccentPicked
        ? "var(--accent)"
        : isAnyHighlight
          ? "var(--bg-active-on)"
          : palette.bg;
    const baseBorder = isRejected
      ? "var(--border-danger-tint)"
      : isAccentPicked
        ? "var(--accent-deep)"
        : isAnyHighlight
          ? "var(--border-active-on)"
          : palette.border;
    // On a solid accent fill the status palette's text colour has no
    // contrast; everything in the cell flips to the on-accent colour.
    const cellText = isAccentPicked ? "var(--text-on-accent)" : palette.text;
    const baseBorderWidth = (isAccentPicked || isAnyHighlight || isRejected) ? 2 : 1;
    // v15.3.0: inert-but-occupied cells get a dashed amber border. Swap /
    // highlight states win (they own the border), so the flag only paints
    // when the cell is at rest.
    const showClosedFlag =
      Boolean(inertTag) && !isAccentPicked && !isAnyHighlight && !isRejected;
    const effBorderColor = showClosedFlag ? "var(--border-warning-tint)" : baseBorder;
    const borderDash = showClosedFlag ? "dashed" : "solid";
    const ringShadow = isRejected
      ? "0 0 0 3px var(--bg-danger-tint), var(--shadow-soft)"
      : isAccentPicked
        ? "0 0 0 3px var(--accent-tint-strong), var(--shadow-soft)"
        : isAnyHighlight
          ? "0 0 0 3px var(--bg-active-on), var(--shadow-soft)"
          : "var(--shadow-soft)";
    // v16.0.0 (phase 37): the only cell animations left are ONE-SHOT
    // reactions to something the manager just did. The infinite swap-source
    // pulse is gone; selection is now a static state, as it is everywhere
    // else in the app.
    //
    // (phase 42): both outcomes of a swap shake — refusal and commit. The
    // sticky pill highlight deliberately does NOT, which is what keeps the
    // two green states apart: a cell lit by clicking a summary pill is a
    // standing filter, a cell that just took an assignment is an event.
    const cellAnimation = (isRejected || isConfirmed)
      ? "mgt-cell-react 400ms ease-in-out 1"
      : undefined;

    // v16.0.0 (phase 37): the cursor carries what the info banner used to
    // say. Armed for a source and hovering an empty cell → `not-allowed`;
    // hovering a filled one → `grab`, which also advertises that the cell
    // can be dragged. This is feedback at the point of contact, before the
    // click, instead of a sentence after it.
    // v16.0.0 (phase 42): the reason the last run left this cell open, if it
    // did. Only meaningful while the cell is still empty — the moment it is
    // filled the question stops being asked.
    const unfilledReason = !isFilled
      ? GENERATOR_REASONS[unfilledByCell[cellKey]] || null
      : null;

    const canDrag = !isReadOnly && isFilled;
    const cellCursor = isReadOnly
      ? "pointer"
      : swapMode && swapMode.phase === "source-select"
        ? (isFilled ? "grab" : "not-allowed")
        : swapMode && swapMode.phase === "target-select"
          ? "pointer"
          : canDrag ? "grab" : "pointer";

    return (
      <button
        key={slot.key + "-" + dIso}
        type="button"
        className="mgt-hover-scale mgt-press"
        onClick={function () { cellClick(dIso, effSlot, existing); }}
        draggable={canDrag}
        onDragStart={canDrag ? function (e) {
          // Some browsers refuse to start a drag with no payload set.
          try { e.dataTransfer.setData("text/plain", existing.id); } catch (_err) { /* ignore */ }
          e.dataTransfer.effectAllowed = "move";
          setDragSource({ dateIso: dIso, slotDef: effSlot, shift: existing });
        } : undefined}
        onDragEnd={canDrag ? function () {
          setDragSource(null);
          setDragOverKey(null);
        } : undefined}
        // The three drop handlers are attached UNCONDITIONALLY (subject only
        // to read-only) and guard on `dragSource` inside. Gating the props
        // themselves on `dragSource` made the cell's ability to receive a
        // drop depend on it having re-rendered since dragstart — which holds
        // in a real drag but is a needless ordering dependency, and it left
        // the element with no handler at all in any frame where the state had
        // been cleared.
        onDragOver={!isReadOnly ? function (e) {
          if (!dragSource) return;
          // preventDefault is what marks this element as a valid drop target.
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOverKey !== cellKey) setDragOverKey(cellKey);
        } : undefined}
        onDragLeave={!isReadOnly ? function () {
          setDragOverKey(function (k) { return k === cellKey ? null : k; });
        } : undefined}
        onDrop={!isReadOnly ? function (e) {
          if (!dragSource) return;
          e.preventDefault();
          const src = dragSource;
          setDragSource(null);
          setDragOverKey(null);
          if (existing && existing.id === src.shift.id) return;
          attemptSwap(src, { dateIso: dIso, slotDef: effSlot, shift: existing || null });
        } : undefined}
        style={{
          width: "100%",
          textAlign: "left",
          background: baseBg,
          border: baseBorderWidth + "px " + borderDash + " " + effBorderColor,
          borderRadius: R.inset,
          padding: "8px 10px",
          fontSize: 12,
          cursor: cellCursor,
          minHeight: 60,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 4,
          boxShadow: ringShadow,
          animation: cellAnimation,
          // The cell being dragged fades, so the pointer's payload reads as
          // "lifted out of here" rather than duplicated.
          opacity: dragSource && existing && existing.id === dragSource.shift.id ? 0.5 : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            color: cellText,
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
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: isAccentPicked
                ? "var(--text-on-accent)"
                : (emp ? "var(--text-primary)" : palette.text),
              fontWeight: emp ? 600 : 500,
              opacity: empArchived ? 0.5 : 1,
              textDecoration: empArchived ? "line-through" : "none",
            }}
          >
            {emp ? emp.name : "Open"}
          </span>
          {/* v16.0.0 (phase 42): why the last generator run left this cell
              open. Sits beside "Open" rather than in the time row because
              that is the line it qualifies — the cell is open, and this is
              the reason it stayed that way. The tag is a mnemonic; the
              `title` carries the actual clause.

              Only ever on an EMPTY cell: `isFilled` gates it, so a cell the
              manager fills by hand afterwards drops its badge with no
              bookkeeping. */}
          {unfilledReason ? (
            <span
              title={unfilledReason.detail}
              style={{
                ...BADGE_SIZE.cell,
                flexShrink: 0,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                borderRadius: R.pill,
                background: "var(--bg-warning-tint)",
                color: "var(--text-warning)",
                border: "1px solid var(--border-warning-tint)",
              }}
            >
              {unfilledReason.tag}
            </span>
          ) : null}
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

  // ── Status chips (v16.0.0 phase 37/38) ───────────────────────────────
  // ONE object serves both remaining pieces of grid-level feedback: a
  // refused swap, and a run that changed nothing. Deliberately NOT a
  // banner — auto-width, pill radius, BADGE_SIZE metrics, so it reads as a
  // label attached to what just happened rather than as the app addressing
  // the manager. No dismiss control: both expire on their own, and a button
  // to acknowledge a two-word phrase is more chrome than the phrase.
  //
  // What used to be here was a full-width result banner announcing the
  // outcome of every run ("Cleared 4 stale, filled 12, 3 left empty for
  // 3-9 Aug 2026.") with a Details button and an x. It is gone; see the
  // runNotice state for which cases still say anything at all.
  //
  // v16.0.0 (phase 42): CENTRED, and up a size to BADGE_SIZE.status. Left-
  // aligned at `base` metrics the chip sat in the same column as the nav
  // bar's Prev button and read as a fourth control rather than as feedback;
  // centred over the grid it has nothing to be mistaken for, and the +30%
  // makes it survive a glance across a 944px week.
  function statusChip(text, tone) {
    const palette = tone === "danger"
      ? {
        bg: "var(--bg-danger-tint)",
        border: "var(--border-danger-tint)",
        fg: "var(--text-danger)",
      }
      : tone === "warning"
        ? {
          bg: "var(--bg-warning-tint)",
          border: "var(--border-warning-tint)",
          fg: "var(--text-warning)",
        }
        : {
          bg: "var(--bg-soft)",
          border: "var(--border-soft)",
          fg: "var(--text-secondary)",
        };
    return (
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        <span
          role="status"
          style={{
            ...BADGE_SIZE.status,
            borderRadius: R.pill,
            background: palette.bg,
            border: "1px solid " + palette.border,
            color: palette.fg,
            fontWeight: 600,
            boxShadow: "var(--shadow-soft)",
          }}
        >
          {text}
        </span>
      </div>
    );
  }

  // The post-run notice: an unfilled count (warning) or a nothing-happened
  // phrase (neutral). Never a success line — a run that worked is visible.
  const runNoticeView = runNotice ? statusChip(runNotice.text, runNotice.tone) : null;

  // The swap-refusal chip. The cell that was refused shakes at the same
  // moment (see cellAnimation), so WHICH cell and WHY arrive together
  // without the text having to name the cell.
  const swapRejectView = swapReject
    ? statusChip(swapReject.reason, "danger")
    : null;

  return (
    <div>
      {/* The grid's only cell keyframe, and it is a ONE-SHOT reaction to a
          manager action. Two others were retired in v16.0.0:
          mgt-swap-pulse (phase 37) when swap-source selection became a
          static accent state, and mgt-jump-pulse (phase 38) along with the
          results modal that was the only thing able to trigger a jump.

          mgt-cell-react — a short horizontal shake, used by BOTH outcomes of
          a swap: refused (danger tint) and committed (green tint). One
          motion, two colours, because the motion means "this cell is what
          your last action was about" and the colour says how it went.
          Named for the reaction rather than the refusal since phase 42 gave
          it a second caller.

          Transform-only, so it composes with the box-shadow ring set inline
          rather than fighting it. Under `prefers-reduced-motion` it
          collapses to no movement; the tint still carries the outcome, so
          nothing is lost, only the motion. */}
      <style>{
        "@keyframes mgt-cell-react {" +
        "  0%,100% { transform: translateX(0); }" +
        "  20%     { transform: translateX(-5px); }" +
        "  40%     { transform: translateX(5px); }" +
        "  60%     { transform: translateX(-3px); }" +
        "  80%     { transform: translateX(3px); }" +
        "}" +
        "@media (prefers-reduced-motion: reduce) {" +
        "  @keyframes mgt-cell-react { 0%,100% { transform: translateX(0); } }" +
        "}"
      }</style>
      {navBar}
      {/* v1.12.0: past-week lockdown banner. Sits between the nav bar and
          the swap / generator banners (which only show transiently while
          their respective actions are armed/active). Persistent —
          dismissable only by navigating to a non-past week. Uses the
          warning palette to match the SwapButton-active visual language
          without screaming "error". */}
      {/* v16.0.0 (phase 40): the past-week notice was a full-width tinted
          banner with a padlock reading "This week is in the past. Cells are
          read-only — switch to the current or a future week to make edits."
          Every nav-bar action is already visibly disabled and every cell
          already refuses to open an editor; the sentence restated that, and
          then instructed the manager to press the Next button they can see.
          It is now the same status chip the rest of this surface uses,
          naming the state and nothing else.

          Reveal-wrapped because this flips on ordinary week navigation —
          the most frequent action in the app — and a hard mount jumped the
          whole grid down and back up on every Prev/Next across the boundary. */}
      <Reveal show={isReadOnly}>
        {isReadOnly ? statusChip("Past week, read-only", "neutral") : null}
      </Reveal>
      <Reveal show={Boolean(swapRejectView)}>{swapRejectView}</Reveal>
      <Reveal show={Boolean(runNoticeView)}>{runNoticeView}</Reveal>
      {allClosedNotice}
      {dates.length > 0 ? (
        <SlideView key={weekSlide.key} dir={weekSlide.dir}>
          {isMobile ? mobileStack : desktopGrid}
        </SlideView>
      ) : null}

      {/* v16.0.0 (phase 40): a paragraph used to sit here explaining that
          clicking a cell edits it, what the "*" marker means, which staff
          the assignee dropdown hides and why, and what a split shift is.
          Six lines of manual, under the grid, on every visit. The click
          target is a button that looks like a button; the picker explains
          its own hidden-staff toggle in place, at the moment it is
          relevant; and the "*" is answered by opening the cell. */}

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

    </div>
  );
}
