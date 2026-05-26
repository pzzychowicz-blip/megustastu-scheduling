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

import { S } from "../lib/constants.js";
import { Overlay, Section, mkBtn } from "./atoms.jsx";
import { buildEmployeeFairnessDetail, parseIsoDate } from "../lib/schedule-logic.js";

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
// becomes a `<button>` (`.mgt-hover-scale .mgt-hover-soft` — subtle
// half-opacity hover card, no shadow) that navigates ScheduleGrid to
// the bar's week. The parent modal then auto-closes via its own
// onJumpToWeek wrapper.
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
        className="mgt-hover-scale mgt-hover-soft"
        onClick={onClick}
        title={rowTitle}
        aria-label={"Open " + rangeStr + " in the schedule"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          fontSize: 12,
          padding: "4px 8px",
          borderRadius: 8,
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
  open, employee, weekStart, shifts, requests, shiftTemplate, isMobile, onClose,
  onJumpToWeek,
}) {
  if (!open || !employee || !weekStart) return null;

  const detail = buildEmployeeFairnessDetail({
    shifts: shifts,
    employee: employee,
    weekStart: weekStart,
    requests: requests,
    shiftTemplate: shiftTemplate,
  });
  if (!detail) return null;

  const empName = employee.name || "(unnamed)";
  const empArchived = employee.active === false;
  const title = empName + " · fairness detail";

  const r28 = detail.rolling28;
  const cm = detail.calendarMonth;

  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={onClose}
      title={title}
    >
      {empArchived ? (
        <div style={{ ...S.muted, fontSize: 12, marginTop: -6, marginBottom: 12 }}>
          Archived employee — counts include any orphaned assignments still on the roster.
        </div>
      ) : null}

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
        <div style={{ ...S.muted, fontSize: 11, marginTop: 6 }}>
          Target pro-rated as workingDaysPerWeek × {(cm.monthEndIso ? parseIsoDate(cm.monthEndIso).getDate() : 0)} / 7.
        </div>
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
        <div style={{ ...S.muted, fontSize: 11, marginTop: 8 }}>
          Each bar is shifts worked vs the raw workingDaysPerWeek for that week.
          Red = under, neutral = at, green = at-or-over target.
          {typeof onJumpToWeek === "function"
            ? " Click a bar to open that week in the schedule."
            : null}
        </div>
      </Section>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginTop: 8,
        }}
      >
        {mkBtn({ type: "button", className: "mgt-hover-scale", variant: "ghost", onClick: onClose, children: "Close" })}
      </div>

      <p style={{ ...S.muted, marginTop: 12, fontSize: 11 }}>
        Informational only. To change shifts or requests, use the Schedule or Requests tabs.
      </p>
    </Overlay>
  );
}
