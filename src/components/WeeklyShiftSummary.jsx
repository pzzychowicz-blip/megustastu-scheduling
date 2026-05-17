// src/components/WeeklyShiftSummary.jsx
// v1.2.0 — Footer panel under the Schedule grid. One compact pill per
// active employee: "Maria · 3 / 5". Lets the manager spot under- or
// over-utilized staff at a glance without clicking each cell.
//
// Sort order: under-utilization ratio asc (most-under first), then by
// name. Helps the manager triage who needs more shifts when they
// scroll the panel left-to-right.
//
// Archived employees with shifts in this week are shown too so the
// manager notices the orphan assignment.
//
// Props:
//   employees   ({ [id]: employee })  — full map
//   weekShifts  ({ [id]: shift })     — already narrowed to the displayed week
//   weekLabel   (string)              — e.g. "12–18 May 2026"
//   isMobile    (bool)

import { S, BTN, DEFAULT_WORKING_DAYS } from "../lib/constants.js";

function quotaFor(emp) {
  const v = emp && typeof emp.workingDaysPerWeek === "number" ? emp.workingDaysPerWeek : null;
  if (v === null) return DEFAULT_WORKING_DAYS;
  if (v < 1) return 1;
  if (v > 7) return 7;
  return Math.round(v);
}

// Count unique dates this employee is on in the week. Two shifts on the
// same date (shouldn't happen per same-day strict, but defensive)
// collapse to one — matches the `countAssignedDates` semantic in
// generator.js.
function buildCountByEmployee(weekShifts) {
  const seen = {};
  const all = Object.values(weekShifts || {});
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    if (!s || !s.employeeId || !s.date) continue;
    if (!seen[s.employeeId]) seen[s.employeeId] = {};
    seen[s.employeeId][s.date] = true;
  }
  const out = {};
  for (const id in seen) {
    out[id] = Object.keys(seen[id]).length;
  }
  return out;
}

export default function WeeklyShiftSummary({ employees, weekShifts, weekLabel, isMobile }) {
  const counts = buildCountByEmployee(weekShifts);

  // Build the row list: every active employee + any archived employee
  // who still has shifts this week (so the orphan is visible).
  const all = Object.values(employees || {});
  const rows = [];
  for (let i = 0; i < all.length; i++) {
    const emp = all[i];
    const count = counts[emp.id] || 0;
    if (emp.active === false && count === 0) continue;
    const quota = quotaFor(emp);
    rows.push({
      id: emp.id,
      name: emp.name || "(unnamed)",
      archived: emp.active === false,
      count: count,
      quota: quota,
      // Under-utilization ratio: lower = more under-utilized → sorts first.
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
          const isZero = r.count === 0;
          const isUnder = r.count > 0 && r.count < r.quota;
          const tint = isZero
            ? { background: "var(--bg-pill)", color: "var(--text-muted)" }
            : isUnder
              ? { background: "var(--accent-tint-soft)", color: "var(--accent-on-tint)" }
              : { background: "var(--bg-pill)", color: "var(--text-primary)" };
          return (
            <span
              key={r.id}
              style={{
                ...BTN.base,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "default",
                border: "1px solid var(--hairline-strong)",
                opacity: r.archived ? 0.55 : 1,
                ...tint,
              }}
              title={r.archived ? r.name + " (archived)" : r.name}
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
            </span>
          );
        })}
      </div>
    </div>
  );
}
