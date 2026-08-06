// src/components/WeeklyShiftSummary.jsx
// v1.2.0 — Footer panel under the Schedule grid. One compact pill per
// active employee: "Maria · 3 / 5". Lets the manager spot under- or
// over-utilized staff at a glance without clicking each cell.
//
// v1.6.0 — Effective-quota awareness. The quota displayed is the raw
// workingDaysPerWeek MINUS the count of distinct visible-week dates the
// employee has a day-off / holiday request covering. Shift-preference
// requests do NOT subtract (they constrain the dayPart, not whether the
// person works). The pill shows just the reduced number — the "why" is
// surfaced separately by the WeeklyRequestsPreview panel below.
//
// v1.6.1 — Effective-quota math lifted into
// `daysOffInWeekByEmployee` in schedule-logic.js. Single source of
// truth now shared with the auto-generator's quota gate.
//
// v1.9.0 — Quota subtraction narrowed to `holiday` requests only.
// `dayoff` requests no longer decrement the cap — the framing is now
// "holiday = away, subtract from quota" vs "dayoff = preferred-off, the
// employee can still work their full quota across the remaining dates."
// The helper was renamed to `holidayDaysInWeekByEmployee` in lockstep.
// HARD per-date blocking for dayoff is unchanged (handled in
// findRequestConflict + the picker hide-by-default toggle).
//
// v1.7.0 — Pills are now clickable. Clicking a pill highlights every
// cell assigned to that employee on the Schedule grid; clicking again
// (or pressing Esc) clears the highlight. State lives in ScheduleGrid
// because it owns both the pills (via this component) and the cells.
//
// Sort order: under-utilization ratio asc (most-under first), then by
// name. Helps the manager triage who needs more shifts when they
// scroll the panel left-to-right.
//
// Archived employees with shifts in this week are shown too so the
// manager notices the orphan assignment.
//
// Props:
//   employees             ({ [id]: employee })  — full map
//   weekShifts            ({ [id]: shift })     — narrowed to the displayed week
//   requests              ({ [id]: request })   — full map; v1.6.0
//   dates                 (Date[])              — visible week dates (closed days
//                                                  already filtered out); v1.6.0
//   weekLabel             (string)              — e.g. "12–18 May 2026"
//   isMobile              (bool)
//   highlightedEmployeeId (string|null)         — v1.7.0; currently lit pill
//   onHighlight           (fn(id|null))         — v1.7.0; click handler

import { R, S, BTN, DEFAULT_WORKING_DAYS } from "../lib/constants.js";
import {
  holidayDaysInWeekByEmployee,
  isLiveShiftForTemplate,
  employeeTenureOverlapsDates,
  isEmployeeActiveOnDate,
  isoDate,
} from "../lib/schedule-logic.js";

// v15.3.0: count the visible-week dates that fall inside the employee's
// tenure (activeFrom / activeUntil). A fully-tenured week returns the full
// visible-day count, so the quota cap below is a no-op for untenured staff.
function activeVisibleDayCount(emp, dates) {
  if (!Array.isArray(dates)) return 0;
  let n = 0;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const iso = typeof d === "string" ? d : isoDate(d);
    if (isEmployeeActiveOnDate(emp, iso)) n++;
  }
  return n;
}

function rawQuotaFor(emp) {
  const v = emp && typeof emp.workingDaysPerWeek === "number" ? emp.workingDaysPerWeek : null;
  if (v === null) return DEFAULT_WORKING_DAYS;
  if (v < 1) return 1;
  if (v > 7) return 7;
  return Math.round(v);
}

// One pass over the week's shifts producing BOTH per-employee tallies.
//
//   counts[empId]  — unique DATES worked. Two shifts on one date collapse to
//                    one, matching `countAssignedDates` in generator.js and
//                    deliberately so: `workingDaysPerWeek` is a count of
//                    DAYS, so a split shift consumes one day of quota, not
//                    two. (v16.0.0: that collapse used to be described as
//                    defensive, because same-day-strict meant it couldn't
//                    happen. Split shifts made it load-bearing.)
//   splits[empId]  — the surplus records the collapse above swallows, so the
//                    pill can still surface a 12-hour double. A date with
//                    two shifts contributes 1, a (pathological) three
//                    contributes 2. Absent when zero.
//
// Computed together rather than in two functions: they walk the same records
// and apply the same orphan skip, so one pass halves the work AND makes the
// two numbers consistent by construction instead of by keeping two copies of
// the skip rule in sync.
//
// v15.4.0: `template` is the focus-week resolved shift template. When given,
// orphan shifts — a slot index that no longer exists at its (section, dayPart)
// in the resolved template (the manager dropped the slot count) — are skipped
// so they don't inflate either tally. They already don't render on the grid,
// and a shift that doesn't render must not be reported as half of a split.
function buildWeekTallies(weekShifts, template) {
  const perDate = {};
  const all = Object.values(weekShifts || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (!s || !s.employeeId || !s.date) continue;
    if (!isLiveShiftForTemplate(s, template)) continue;
    if (!perDate[s.employeeId]) perDate[s.employeeId] = {};
    perDate[s.employeeId][s.date] = (perDate[s.employeeId][s.date] || 0) + 1;
  }
  const counts = {};
  const splits = {};
  for (const id in perDate) {
    const dates = perDate[id];
    let days = 0;
    let extra = 0;
    for (const d in dates) {
      days += 1;
      if (dates[d] > 1) extra += dates[d] - 1;
    }
    counts[id] = days;
    if (extra > 0) splits[id] = extra;
  }
  return { counts: counts, splits: splits };
}

export default function WeeklyShiftSummary({
  employees, weekShifts, requests, dates, weekLabel, isMobile,
  highlightedEmployeeId, onHighlight,
  // v15.4.0: focus-week resolved template, drives the orphan-shift skip.
  template,
}) {
  // v16.0.0: split shifts. `counts` deliberately counts DISTINCT DATES, so
  // an employee working day + evening on one Tuesday still reads as one
  // day against their weekly quota — `workingDaysPerWeek` is literally a
  // count of days, and the generator's quota gate and every fairness
  // target agree with that reading. But the pill would then be silent
  // about a 12-hour double, which is exactly the thing a manager scanning
  // this panel wants to notice. So the same pass reports the swallowed
  // surplus separately and it renders as a suffix, without touching any of
  // the quota maths.
  const tallies = buildWeekTallies(weekShifts, template);
  const counts = tallies.counts;
  const splitDays = tallies.splits;
  // v1.6.0: per-employee count of visible-week dates blocked by a
  // request. v1.9.0: narrowed to `holiday` only — `dayoff` no longer
  // decrements the effective cap (it still HARD-blocks the date via
  // findRequestConflict / picker hide-by-default; only the math is
  // changing).
  const holidayDays = holidayDaysInWeekByEmployee(requests, dates || []);

  // Build the row list: every active employee whose tenure overlaps the
  // visible week + any employee (archived or out-of-tenure) who still has
  // shifts this week (so the orphan stays visible). v15.2.0: an employee
  // whose activeFrom / activeUntil window doesn't touch this week is
  // treated like an archived one — hidden unless they already hold shifts.
  const all = Object.values(employees || {});
  const rows = [];
  for (let i = 0; i < all.length; i++) {
    const emp = all[i];
    const count = counts[emp.id] || 0;
    const inWeek = employeeTenureOverlapsDates(emp, dates || []);
    if ((emp.active === false || !inWeek) && count === 0) continue;
    const raw = rawQuotaFor(emp);
    const holiday = holidayDays[emp.id] || 0;
    // v15.3.0: cap the quota at the number of visible-week dates the
    // employee is actually active (tenure), so a mid-week hire / leaver
    // isn't shown as under their full weekly quota. A fully-tenured week
    // → activeVisible >= raw, so min() is a no-op (pre-v15.3.0 behaviour).
    const activeVisible = activeVisibleDayCount(emp, dates || []);
    // Effective quota floors at 0 (can't go negative) and never exceeds
    // the raw cap. The closed-day case is already handled because `dates`
    // excludes closed weekdays, so holiday requests on closed days never
    // enter `holiday`.
    const quota = Math.max(0, Math.min(raw, activeVisible) - holiday);
    rows.push({
      id: emp.id,
      name: emp.name || "(unnamed)",
      archived: emp.active === false,
      count: count,
      quota: quota,
      splits: splitDays[emp.id] || 0,
      // Under-utilization ratio: lower = more under-utilized → sorts first.
      // Quota=0 (someone fully on holiday) collapses to ratio=1 so they
      // don't disturb the under-utilization sort.
      ratio: quota > 0 ? count / quota : 1,
    });
  }
  rows.sort(function (a, b) {
    if (a.ratio !== b.ratio) return a.ratio - b.ratio;
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  });

  // Empty restaurant: nothing to summarise.
  if (rows.length === 0) return null;

  return (
    <div
      style={{
        ...S.surfaceSoft,
        marginTop: 12,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ ...S.h2, margin: 0, fontSize: 14 }}>
          Shifts assigned
        </div>
        <span style={{ ...S.muted, fontSize: 11 }}>{weekLabel}</span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {rows.map(function (r) {
          // Visual cues:
          //   0 / quota → low-opacity, manager attention
          //   under quota → soft accent tint
          //   at or above quota → neutral
          // v1.7.0: when this pill is the highlighted one, override the
          // tint with a stronger accent fill + accent border so it reads
          // as "selected" regardless of the under/at/over-quota state.
          const isZero = r.count === 0;
          const isUnder = r.count > 0 && r.count < r.quota;
          const isSelected = highlightedEmployeeId === r.id;
          // v1.7.0: selected pill paints in green (reusing the iOS-green
          // "active toggle on" tokens) so it stands out clearly from the
          // accent-blue used elsewhere on the schedule grid. Matches the
          // green cell highlight on the grid — single visual identity
          // ties the pill to the cells it lights up.
          const tint = isSelected
            ? {
                background: "var(--bg-active-on)",
                color: "var(--text-primary)",
              }
            : isZero
              ? { background: "var(--bg-pill)", color: "var(--text-muted)" }
              : isUnder
                ? { background: "var(--accent-tint-soft)", color: "var(--accent-on-tint)" }
                : { background: "var(--bg-pill)", color: "var(--text-primary)" };
          const borderColor = isSelected
            ? "var(--border-active-on)"
            : "var(--hairline-strong)";
          const interactive = typeof onHighlight === "function";
          return (
            <button
              key={r.id}
              type="button"
              className="mgt-hover-scale"
              onClick={interactive
                ? function () { onHighlight(isSelected ? null : r.id); }
                : undefined}
              style={{
                ...BTN.base,
                padding: "4px 10px",
                fontSize: 12,
                cursor: interactive ? "pointer" : "default",
                border: "1px solid " + borderColor,
                opacity: r.archived ? 0.55 : 1,
                ...tint,
                boxShadow: isSelected ? "0 0 0 2px var(--bg-active-on)" : undefined,
                fontWeight: isSelected ? 700 : undefined,
              }}
              title={
                (r.archived ? r.name + " (archived)" : r.name)
                + (r.splits > 0
                  ? " — " + r.splits + " split shift" + (r.splits === 1 ? "" : "s")
                    + " this week (day + evening on the same date)"
                  : "")
              }
            >
              <span
                style={{
                  fontWeight: 600,
                  textDecoration: r.archived ? "line-through" : "none",
                }}
              >
                {r.name}
              </span>
              <span style={{ marginLeft: 6, opacity: 0.85 }}>
                {r.count} / {r.quota}
              </span>
              {/* v16.0.0: split-shift marker. The count to its left is a
                  count of DAYS, so a split is invisible there by design —
                  this is what tells the manager the day was a double. In
                  the warning palette because a 12-hour straight day is
                  worth a second look, not because it's an error. */}
              {r.splits > 0 ? (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 5px",
                    borderRadius: R.pill,
                    background: "var(--bg-warning-tint)",
                    border: "1px solid var(--border-warning-tint)",
                    color: "var(--text-warning)",
                  }}
                >
                  {r.splits === 1 ? "split" : r.splits + " splits"}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
