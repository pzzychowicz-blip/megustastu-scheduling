// src/components/EmployeeFairnessModal.jsx
// v1.13.0 — Read-only drill-down popover opened from a MonthlyFairnessPanel
// row's delta-bar click. Pure display, no edit affordance.
//
// Surfaces three views over the same shifts + requests data:
//   - 28-day rolling — mirrors the panel row but with full numbers
//     (shifts/target, hours/target, holidays subtracted, window dates).
//   - Calendar month — the month containing the focus week's Monday.
//     Pro-rated target (workingDaysPerWeek × monthLength/7) minus holidays.
//   - Per-week sparkline — 4 horizontal bars [wk-3, wk-2, wk-1, this wk],
//     each shifts-vs-workingDaysPerWeek ratio with under/at/over tint.
//
// Data comes from `buildEmployeeFairnessDetail` in schedule-logic.js;
// the modal calls it on open so we don't compute when closed. Single
// employee, four small windows — cheap.
//
// Props:
//   open          (bool)
//   employee      (obj?)                       — full employee record
//   weekStart     (Date?)                      — focus week's Monday
//   shifts        ({ [id]: shift })            — full map (helper filters by empId)
//   requests      ({ [id]: request })          — full map
//   shiftTemplate (obj?)                       — for avgShiftHours
//   isMobile      (bool)
//   onClose       (fn)                         — backdrop / Close button
//   onJumpToWeek  (fn(weekStartIso)?)          — v1.13.0 polish; when set,
//                                                  the per-week sparkline
//                                                  rows become clickable
//                                                  buttons that navigate
//                                                  the schedule to that
//                                                  week. Parent
//                                                  (<MonthlyFairnessPanel>)
//                                                  wraps the upstream
//                                                  handler so a successful
//                                                  jump also closes this
//                                                  modal.
//
// Visual: matches RequestPreviewModal's vertical Section stack so the
// read-only nature reads as "details panel" rather than a form.

import { useState } from "react";
import { R, S } from "../lib/constants.js";
import { Overlay, Section, mkBtn } from "./atoms.jsx";
import { buildEmployeeFairnessDetail, parseIsoDate } from "../lib/schedule-logic.js";
import { useEscClose } from "../hooks/useEscClose.js";

const SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun",
                     "Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtHours(h) {
  if (!Number.isFinite(h)) return "0h";
  const r = Math.round(h * 10) / 10;
  return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)) + "h";
}

function fmtDateShort(iso) {
  if (!iso) return "";
  const d = parseIsoDate(iso);
  return d.getDate() + " " + SHORT_MONTH[d.getMonth()];
}

function fmtRangeShort(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  const fromStr = from.getDate() + " " + SHORT_MONTH[from.getMonth()];
  const toStr = to.getDate() + " " + SHORT_MONTH[to.getMonth()] + " " + to.getFullYear();
  return fromStr + " – " + toStr;
}

function fmtSignedShifts(actual, target) {
  const delta = actual - target;
  if (delta === 0) return "on target";
  return (delta > 0 ? "+" : "") + delta + " vs target";
}

function fmtSignedHours(actual, target) {
  const delta = actual - target;
  if (Math.abs(delta) < 0.05) return "on target";
  return (delta > 0 ? "+" : "") + fmtHours(delta) + " vs target";
}

// Pair-of-stats row: bold value on the left, muted delta on the right.
function StatRow({ label, value, delta }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "4px 0",
        fontSize: 13,
      }}
    >
      <span style={{ ...S.muted, fontSize: 12, minWidth: 110 }}>{label}</span>
      <span style={{ fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>{value}</span>
      {delta ? <span style={{ ...S.muted, fontSize: 12 }}>{delta}</span> : null}
    </div>
  );
}

// One horizontal bar in the per-week sparkline. Width is proportional
// to the shifts count vs the bar's target (capped at 100%). Tint: red
// when under-target, green when at-or-over (handles target=0 too — a
// surplus on a fully-held week still reads green).
//
// v1.13.0 polish: optional `onClick` prop. When provided the whole row
// becomes a `<button>` (`.mgt-hover-scale`, which after v1.13.0 round 3
// uses an 80% color-mix hover bg — softer than the original near-opaque
// card without going as ghostly as a half-opacity overlay) that
// navigates ScheduleGrid to the bar's week. The parent modal then
// auto-closes via its own onJumpToWeek wrapper.
function WeekBar({ row, onClick }) {
  const target = row.shiftsTarget;
  const actual = row.shiftsCount;
  // Bar width: 0..1 ratio. Use max(target, actual, 1) so a non-zero
  // actual against target=0 (full-holiday week with a worked shift)
  // still renders something visible.
  const denom = Math.max(target, actual, 1);
  const pct = Math.min(1, actual / denom);
  const isUnder = target > 0 && actual < target;
  const isAt = target > 0 && actual === target;
  const fillColor = isUnder
    ? "var(--btn-danger-bg)"
    : isAt
      ? "var(--bg-pill)"
      : "var(--bg-active-on)";
  const fillBorder = isUnder
    ? "var(--btn-danger-fg)"
    : isAt
      ? "var(--hairline-strong)"
      : "var(--border-active-on)";

  const rangeStr = fmtRangeShort(row.weekStartIso, row.weekEndIso);
  const baseTitle = row.shiftsCount + " / " + row.shiftsTarget + " shifts (" + rangeStr + ")";
  const interactive = typeof onClick === "function";
  const rowTitle = interactive ? baseTitle + " — click to open this week" : baseTitle;

  const inner = (
    <>
      <span style={{ ...S.muted, fontSize: 11, minWidth: 56 }}>{row.label}</span>
      <div
        style={{
          flex: 1,
          height: 12,
          background: "var(--bg-pill)",
          borderRadius: 6,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: Math.max(2, Math.round(pct * 100)) + "%",
            background: fillColor,
            borderRadius: 6,
            boxShadow: "inset 0 0 0 1px " + fillBorder,
          }}
        />
      </div>
      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          minWidth: 56,
          textAlign: "right",
          fontSize: 12,
          color: "var(--text-primary)",
        }}
      >
        {row.shiftsCount} / {row.shiftsTarget}
      </span>
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className="mgt-hover-scale mgt-press"
        onClick={onClick}
        title={rowTitle}
        aria-label={"Open " + rangeStr + " in the schedule"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
          padding: "4px 8px",
          borderRadius: R.pill,
          background: "transparent",
          border: "1px solid transparent",
          color: "inherit",
          fontFamily: "inherit",
          cursor: "pointer",
          textAlign: "left",
          width: "100%",
        }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        padding: "2px 0",
      }}
      title={rowTitle}
    >
      {inner}
    </div>
  );
}

export default function EmployeeFairnessModal({
  // v15.4.0: `shiftTemplate` is now the BASE singleton (not pre-resolved);
  // buildEmployeeFairnessDetail resolves per-week config itself via
  // configRevisions + settings (per-week blended hours target + orphan filter).
  open, employee, weekStart, shifts, requests, shiftTemplate,
  configRevisions, settings,
  // v1.14.0 follow-up: per-employee avgShiftHours needs the
  // per-section dayRequiredRoles configuration so the eligible-slot
  // list matches what the generator's eligibility filter sees.
  // Optional — bare callers fall back to SECTIONS defaults via
  // slotsForDay's existing path.
  dayRequiredRoles,
  // v15.4.0: openingDays still forwarded for callers that read it, but
  // buildEmployeeFairnessDetail now derives per-week openingDays from the
  // resolved config; the prop is retained for back-compat.
  openingDays,
  isMobile, onClose,
  onJumpToWeek,
}) {
  // v1.14.0: in-place toggle between "data" (the original three stat
  // sections) and "reasoning" (formula explainers with the same
  // employee's actual numbers plugged in). Single Overlay, single
  // Close — the Reasoning button sits in the footer's left slot and
  // flips the view state. Pure render switch — no new computation,
  // no nested overlay, no prop change.
  //
  // Hooks must be called unconditionally — React hook rules forbid
  // early-return-then-useState. The body's "no employee" guard moved
  // below the useState line.

  // v15.3.0: Esc closes the drill-down (above the early return — hooks run
  // unconditionally).
  useEscClose(open, onClose);

  if (!open || !employee || !weekStart) return null;

  const detail = buildEmployeeFairnessDetail({
    shifts: shifts,
    employee: employee,
    weekStart: weekStart,
    requests: requests,
    shiftTemplate: shiftTemplate,
    configRevisions: configRevisions,
    settings: settings,
    dayRequiredRoles: dayRequiredRoles,
  });
  if (!detail) return null;

  const empName = employee.name || "(unnamed)";
  const empArchived = employee.active === false;
  const title = empName + " · fairness detail";

  const r28 = detail.rolling28;
  const cm = detail.calendarMonth;

  // Reasoning view derived values. Computed inline (cheap; only when
  // the modal is mounted) so the data view stays byte-identical to
  // v1.13.0 in its render path. wpw mirrors wpwOf() — defensive
  // clamp to [1..7] with a 5 fallback.
  const wpwRaw = employee.workingDaysPerWeek;
  const wpw = Number.isFinite(wpwRaw) && wpwRaw >= 1 ? Math.min(7, Math.round(wpwRaw)) : 5;
  const monthLength = cm && cm.monthEndIso ? parseIsoDate(cm.monthEndIso).getDate() : 0;
  // v15.3.0: targets pro-rate by tenure-active days within the window. When
  // the employee is active for the WHOLE window these collapse to the
  // pre-v15.3.0 numbers (activeDays === windowDays), so the formula display
  // only switches to the active-days wording when tenure actually clips it.
  const cmActiveDays = Number.isFinite(cm.activeDays) ? cm.activeDays : monthLength;
  const cmPartial = cmActiveDays < (cm.windowDays || monthLength);
  const monthShiftsTargetRaw = wpw * (cmActiveDays / 7);

  const dataView = (
    <>
      <Section title="Last 28 days" style={{ marginBottom: 12 }}>
        <div style={{ ...S.muted, fontSize: 11, marginTop: -4, marginBottom: 8 }}>
          {fmtRangeShort(r28.dateFromIso, r28.dateToIso)}
        </div>
        <StatRow
          label="Shifts"
          value={r28.shiftsCount + " / " + r28.shiftsTarget}
          delta={r28.shiftsTarget > 0 ? fmtSignedShifts(r28.shiftsCount, r28.shiftsTarget) : null}
        />
        <StatRow
          label="Hours"
          value={fmtHours(r28.hoursTotal) + " / " + fmtHours(r28.hoursTarget)}
          delta={r28.hoursTarget > 0 ? fmtSignedHours(r28.hoursTotal, r28.hoursTarget) : null}
        />
        <StatRow
          label="Holidays"
          value={r28.holidayDays + " day" + (r28.holidayDays === 1 ? "" : "s")}
          delta={r28.holidayDays > 0 ? "subtracted from target" : null}
        />
      </Section>

      <Section title={"Calendar month · " + cm.monthLabel} style={{ marginBottom: 12 }}>
        <div style={{ ...S.muted, fontSize: 11, marginTop: -4, marginBottom: 8 }}>
          {fmtDateShort(cm.monthStartIso)} – {fmtDateShort(cm.monthEndIso)}
        </div>
        <StatRow
          label="Shifts so far"
          value={cm.shiftsCount + " / " + cm.shiftsTarget}
          delta={cm.shiftsTarget > 0 ? fmtSignedShifts(cm.shiftsCount, cm.shiftsTarget) : null}
        />
        <StatRow
          label="Hours so far"
          value={fmtHours(cm.hoursTotal) + " / " + fmtHours(cm.hoursTarget)}
          delta={cm.hoursTarget > 0 ? fmtSignedHours(cm.hoursTotal, cm.hoursTarget) : null}
        />
        <StatRow
          label="Holidays"
          value={cm.holidayDays + " day" + (cm.holidayDays === 1 ? "" : "s")}
          delta={cm.holidayDays > 0 ? "subtracted from target" : null}
        />
        {/* v16.0.0 (phase 40): only the TENURE case gets a caption now. The
            other branch spelled out the plain pro-rating formula, naming an
            internal field at the manager — the target is on the row above
            and the rule is theirs. A clipped window is different: it is the
            one case where the number looks wrong without the reason. */}
        {cmPartial ? (
          <div style={{ ...S.muted, fontSize: 11, marginTop: 6 }}>
            {"Active " + cmActiveDays + " of " + monthLength + " days, target pro-rated"}
          </div>
        ) : null}
      </Section>

      <Section title="Per-week pattern" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {detail.perWeek.map(function (row) {
            const handler = typeof onJumpToWeek === "function"
              ? function () { onJumpToWeek(row.weekStartIso); }
              : null;
            return <WeekBar key={row.weekStartIso} row={row} onClick={handler} />;
          })}
        </div>
        {/* The legend explained the colours, the denominator and that the
            bars are clickable. The counts sit at the end of every bar, the
            colours match the delta bars on the panel these rows were opened
            from, and a clickable row is a button. */}
      </Section>
    </>
  );

  // v16.0.0: action row + footnote live in Overlay's `footer` slot, which
  // pins them to the sheet's bottom edge and bounds the body above them.
  //
  // v16.0.0 (phase 39): this row used to hold a second button, left-aligned
  // opposite Close, flipping the whole modal between "data" and "reasoning".
  // The reasoning view restated each figure as a worked formula with the
  // employee's values substituted in — "workingDaysPerWeek (5) x active
  // days (28) of 28 / 7 - holiday days (2) = 18". That is a system showing
  // its working, which is the shape of an assistant explaining itself
  // rather than of a tool. The numbers it explained are the numbers on
  // screen; the rules behind them are documented, and are the manager's
  // own rules. With one button left there is nothing to align against, so
  // the row is a plain right-aligned Close.
  const footer = (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {mkBtn({ type: "button", className: "mgt-hover-scale mgt-press", variant: "ghost", onClick: onClose, children: "Close" })}
      </div>

      <p style={{ ...S.muted, marginTop: 10, fontSize: 11 }}>
        Informational only
      </p>
    </>
  );

  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={onClose}
      title={title}
      footer={footer}
    >
      {empArchived ? (
        <div style={{ ...S.muted, fontSize: 12, marginTop: -6, marginBottom: 12 }}>
          Archived, including any orphaned assignments
        </div>
      ) : null}

      {dataView}
    </Overlay>
  );
}
