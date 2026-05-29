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
import { S } from "../lib/constants.js";
import { Overlay, Section, mkBtn } from "./atoms.jsx";
import { buildEmployeeFairnessDetail, parseIsoDate, avgShiftHours } from "../lib/schedule-logic.js";

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
        className="mgt-hover-scale"
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

// v1.14.0: small helper for the Reasoning view's emphasised numbers.
// Keeps the formula prose readable — bolded values stand out from the
// muted formula glue ("=", "×", "−") around them.
function Num({ children }) {
  return (
    <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{children}</span>
  );
}

// v1.14.0: formula line with prose label on the left, formula on the
// right. Wraps on narrow screens. Each line reads as one self-contained
// step in the derivation.
function FormulaRow({ label, formula }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "4px 0",
        fontSize: 12,
        flexWrap: "wrap",
      }}
    >
      <span style={{ ...S.muted, fontSize: 11, minWidth: 120 }}>{label}</span>
      <span style={{ color: "var(--text-primary)", flex: 1, minWidth: 0 }}>{formula}</span>
    </div>
  );
}

export default function EmployeeFairnessModal({
  open, employee, weekStart, shifts, requests, shiftTemplate,
  // v1.14.0 follow-up: per-employee avgShiftHours needs the
  // per-section dayRequiredRoles configuration so the eligible-slot
  // list matches what the generator's eligibility filter sees.
  // Optional — bare callers fall back to SECTIONS defaults via
  // slotsForDay's existing path.
  dayRequiredRoles,
  // v1.15.0 (2nd commit): weights avgShiftHours by day-part open
  // frequency so the Reasoning view matches the generator.
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
  const [view, setView] = useState("data");

  if (!open || !employee || !weekStart) return null;

  const detail = buildEmployeeFairnessDetail({
    shifts: shifts,
    employee: employee,
    weekStart: weekStart,
    requests: requests,
    shiftTemplate: shiftTemplate,
    dayRequiredRoles: dayRequiredRoles,
    openingDays: openingDays,
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
  const avgHours = avgShiftHours(employee, shiftTemplate, dayRequiredRoles, openingDays);
  const prefLabel = employee.preference === "day"
    ? "day shifts only"
    : employee.preference === "evening"
      ? "evening shifts only"
      : "either day or evening";
  const monthLength = cm && cm.monthEndIso ? parseIsoDate(cm.monthEndIso).getDate() : 0;
  const monthShiftsTargetRaw = wpw * (monthLength / 7);

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
        <div style={{ ...S.muted, fontSize: 11, marginTop: 6 }}>
          Target pro-rated as workingDaysPerWeek × {monthLength} / 7.
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
    </>
  );

  // v1.14.0: reasoning view. Three Section blocks aligned with the
  // data view so the manager can mental-map between the two. Each
  // section shows the formula with the employee's actual numbers
  // plugged in. Single source of truth per number — the values come
  // from the same `detail` object the data view reads from.
  const reasoningView = (
    <>
      <Section title="Last 28 days — how the numbers were derived" style={{ marginBottom: 12 }}>
        <div style={{ ...S.muted, fontSize: 11, marginTop: -4, marginBottom: 8 }}>
          Window: {fmtRangeShort(r28.dateFromIso, r28.dateToIso)} (28 days).
          {employee.preference ? " Preference: " + prefLabel + "." : null}
        </div>
        <FormulaRow
          label="Shifts target"
          formula={
            <>
              workingDaysPerWeek (<Num>{wpw}</Num>) × <Num>4</Num> weeks
              {" − "}holiday days (<Num>{r28.holidayDays}</Num>)
              {" = "}<Num>{r28.shiftsTarget}</Num>
              {r28.shiftsTarget === 0 ? " (floored at 0)" : ""}
            </>
          }
        />
        <FormulaRow
          label="Hours target"
          formula={
            <>
              shifts target (<Num>{r28.shiftsTarget}</Num>) × avg shift hours (<Num>{fmtHours(avgHours)}</Num>)
              {" = "}<Num>{fmtHours(r28.hoursTarget)}</Num>
            </>
          }
        />
        <FormulaRow
          label="Actual"
          formula={
            <>
              <Num>{r28.shiftsCount}</Num> shifts worked, <Num>{fmtHours(r28.hoursTotal)}</Num> in window.
            </>
          }
        />
        <FormulaRow
          label="Hours deficit"
          formula={
            <>
              max(0, target (<Num>{fmtHours(r28.hoursTarget)}</Num>)
              {" − "}actual (<Num>{fmtHours(r28.hoursTotal)}</Num>))
              {" = "}<Num>{fmtHours(Math.max(0, r28.hoursTarget - r28.hoursTotal))}</Num>
            </>
          }
        />
        <div style={{ ...S.muted, fontSize: 11, marginTop: 6 }}>
          Only <em>holiday</em> requests subtract from the target — day-off requests
          still HARD-block their dates but the employee remains available for the
          full quota across the remaining open dates (v1.9.0 rule). Avg shift hours
          is the mean duration of the slots <em>this employee can actually fill</em> —
          slots where their roles match AND the dayPart matches their preference. A
          Chef-only evening employee's avg uses only the Kitchen Evening Chef slot;
          a Bar-only evening employee averages just the FoH Evening slots. Each
          slot is weighted by how many days a week its day-part is open, so a shift
          that runs every day counts more than one that runs twice a week. Both
          hours-deficit and shifts-deficit feed the auto-generator's ranking —
          most-behind picks first.
        </div>
      </Section>

      <Section title="Calendar month — how the numbers were derived" style={{ marginBottom: 12 }}>
        <div style={{ ...S.muted, fontSize: 11, marginTop: -4, marginBottom: 8 }}>
          Month: {cm.monthLabel} ({fmtDateShort(cm.monthStartIso)} – {fmtDateShort(cm.monthEndIso)}, {monthLength} days).
        </div>
        <FormulaRow
          label="Pro-rated raw"
          formula={
            <>
              workingDaysPerWeek (<Num>{wpw}</Num>) × month length (<Num>{monthLength}</Num>) / <Num>7</Num>
              {" = "}<Num>{(Math.round(monthShiftsTargetRaw * 100) / 100)}</Num>
              {" → round → "}<Num>{Math.round(monthShiftsTargetRaw)}</Num>
            </>
          }
        />
        <FormulaRow
          label="Shifts target"
          formula={
            <>
              <Num>{Math.round(monthShiftsTargetRaw)}</Num>
              {" − "}holiday days (<Num>{cm.holidayDays}</Num>)
              {" = "}<Num>{cm.shiftsTarget}</Num>
              {cm.shiftsTarget === 0 ? " (floored at 0)" : ""}
            </>
          }
        />
        <FormulaRow
          label="Hours target"
          formula={
            <>
              shifts target (<Num>{cm.shiftsTarget}</Num>) × avg shift hours (<Num>{fmtHours(avgHours)}</Num>)
              {" = "}<Num>{fmtHours(cm.hoursTarget)}</Num>
            </>
          }
        />
        <FormulaRow
          label="Actual so far"
          formula={
            <>
              <Num>{cm.shiftsCount}</Num> shifts worked, <Num>{fmtHours(cm.hoursTotal)}</Num> this month.
            </>
          }
        />
        <div style={{ ...S.muted, fontSize: 11, marginTop: 6 }}>
          The generator's ranking sums this window's deficits with the rolling
          28-day window's deficits — recent days appear in both, weighting
          recent under-utilization more heavily. (v1.14.0)
        </div>
      </Section>

      <Section title="Per-week pattern — how each bar's target was derived" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {detail.perWeek.map(function (row) {
            const holiday = Number.isFinite(row.holidayDays) ? row.holidayDays : 0;
            return (
              <FormulaRow
                key={row.weekStartIso}
                label={row.label + " (" + fmtRangeShort(row.weekStartIso, row.weekEndIso) + ")"}
                formula={
                  <>
                    wpw (<Num>{wpw}</Num>)
                    {" − "}holiday (<Num>{holiday}</Num>)
                    {" = "}target <Num>{row.shiftsTarget}</Num>
                    {", worked "}<Num>{row.shiftsCount}</Num>
                    {" ("}<Num>{fmtHours(row.hoursTotal)}</Num>{")"}
                  </>
                }
              />
            );
          })}
        </div>
        <div style={{ ...S.muted, fontSize: 11, marginTop: 6 }}>
          Per-bucket targets are NOT pro-rated — each bar is a full 7-day window
          measured against the raw weekly quota.
        </div>
      </Section>
    </>
  );

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

      {/* v1.15.0: inner scroll wrapper. The Overlay desktop sheet uses
          overflow:visible (v1.9.0 hover-scale fix) so any content
          taller than maxHeight:80vh spills past the sheet. The
          Reasoning view's multi-line formulas + 4 per-week rows is
          taller than the data view and overflows. Cap the body
          height and re-introduce internal scroll for the Section
          stack only. empArchived note + footer + footnote stay
          OUTSIDE the scroller so they always stick to the visible
          sheet's top/bottom edges. Negative horizontal margin +
          matching padding gives hover-scaled rows 16 px of clip
          breathing room (same pattern as ScheduleGrid's outer
          wrapper and GenerateResultsModal's section wrapper). */}
      <div
        style={{
          maxHeight: isMobile ? "55vh" : "min(60vh, 480px)",
          overflowY: "auto",
          padding: "4px 16px",
          margin: "0 -16px",
        }}
      >
        {view === "data" ? dataView : reasoningView}
      </div>

      {/* v1.14.0: footer with the Reasoning toggle on the left and
          Close on the right. justify-content: space-between achieves
          the layout without an absolute-positioned spacer. Reasoning
          button label flips between "Reasoning" and "Show data" so the
          manager always sees the action they can take next, not the
          state they're already in. */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        {mkBtn({
          type: "button",
          className: "mgt-hover-scale",
          variant: "ghost",
          onClick: function () { setView(view === "data" ? "reasoning" : "data"); },
          children: view === "data" ? "Reasoning" : "Show data",
          title: view === "data"
            ? "Show how these numbers were calculated"
            : "Back to the data view",
        })}
        {mkBtn({ type: "button", className: "mgt-hover-scale", variant: "ghost", onClick: onClose, children: "Close" })}
      </div>

      <p style={{ ...S.muted, marginTop: 12, fontSize: 11 }}>
        Informational only. To change shifts or requests, use the Schedule or Requests tabs.
      </p>
    </Overlay>
  );
}
