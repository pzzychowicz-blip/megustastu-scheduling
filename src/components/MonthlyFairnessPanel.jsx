// src/components/MonthlyFairnessPanel.jsx
// v1.12.0 — Rolling 28-day fairness summary, rendered below
// WeeklyRequestsPreview on the Schedule tab.
//
// One row per active employee: name, shifts (count / target), hours
// (total / target), and a thin delta bar showing how far off-target
// each employee currently sits. The under-utilised float to the top
// (descending hours-deficit, with shifts-deficit as the tiebreak —
// same sort the auto-generator's rankCandidates uses).
//
// Purpose: give the manager an at-a-glance view of who's been
// under- vs over-utilised over the last 4 weeks, so when they hand-
// edit the rota they have a visible reason to pick one person over
// another. Generator-aware too — the same numbers feed the generator's
// ranking, so what the panel shows is what the generator will act on.
//
// Source data is pre-built in ScheduleGrid via the shared
// build28DayAggregates() helper (in lib/schedule-logic.js) so this
// panel and the generator stay in lockstep. Both consume the same
// memo; the panel just presents it.
//
// Props:
//   employees          ({ [id]: employee })
//   monthlyAggregates  ({ [empId]: { shiftsCount, hoursTotal,
//                          shiftsTarget, hoursTarget, shiftsDeficit,
//                          hoursDeficit } })
//   isMobile           (bool) — reserved for layout tweaks; not used
//                                in v1.12.0 (the row is already
//                                wrap-friendly via flexWrap).

import { S } from "../lib/constants.js";

export default function MonthlyFairnessPanel({ employees, monthlyAggregates, isMobile }) {
  // eslint-disable-next-line no-unused-vars
  void isMobile;

  const empMap = employees || {};
  const aggMap = monthlyAggregates || {};

  // Build row models, skipping employees with no target AND no actual
  // (e.g. archived employees that the 28-day window had zero activity
  // for). An employee with target=0 but actual>0 still shows — they
  // were over-utilised against an empty quota, which is worth seeing.
  const rows = [];
  const ids = Object.keys(empMap);
  for (let i = 0; i < ids.length; i++) {
    const emp = empMap[ids[i]];
    if (!emp) continue;
    const agg = aggMap[emp.id];
    if (!agg) continue;
    if (emp.active === false && agg.shiftsCount === 0) continue;
    rows.push({
      id: emp.id,
      name: emp.name || "(unnamed)",
      archived: emp.active === false,
      shiftsCount: agg.shiftsCount,
      shiftsTarget: agg.shiftsTarget,
      hoursTotal: agg.hoursTotal,
      hoursTarget: agg.hoursTarget,
      hoursDeficit: agg.hoursDeficit,
      shiftsDeficit: agg.shiftsDeficit,
    });
  }

  if (rows.length === 0) return null;

  // Most-behind first. Hours deficit primary, shifts secondary (matches
  // the generator's rankCandidates ordering). Stable ties by name.
  rows.sort(function (a, b) {
    if (a.hoursDeficit !== b.hoursDeficit) return b.hoursDeficit - a.hoursDeficit;
    if (a.shiftsDeficit !== b.shiftsDeficit) return b.shiftsDeficit - a.shiftsDeficit;
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  });

  function fmtHours(h) {
    // Round to one decimal when fractional; whole numbers stay clean.
    if (!Number.isFinite(h)) return "0h";
    const r = Math.round(h * 10) / 10;
    return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)) + "h";
  }

  // Delta-bar geometry: a 120px-wide container split into "under" (left
  // of centre, red) and "over" (right of centre, green). The fill width
  // is proportional to the magnitude of the deviation vs target, clamped
  // at 100% so a wildly-over employee doesn't bleed past the container.
  // Zero-target employees collapse to the centre (no bar — meaningful
  // delta requires a target to measure against).
  function deltaBar(row) {
    const target = row.hoursTarget;
    if (!Number.isFinite(target) || target <= 0) {
      return (
        <div
          style={{
            width: 120,
            height: 6,
            background: "var(--bg-pill)",
            borderRadius: 3,
          }}
        />
      );
    }
    const delta = row.hoursTotal - target;          // negative = under, positive = over
    const pct = Math.min(1, Math.abs(delta) / target);
    const halfPx = 60;
    const fillPx = Math.round(halfPx * pct);
    const isUnder = delta < 0;
    return (
      <div
        style={{
          width: 120,
          height: 6,
          background: "var(--bg-pill)",
          borderRadius: 3,
          position: "relative",
          overflow: "hidden",
        }}
        title={(delta >= 0 ? "+" : "") + fmtHours(delta) + " vs target"}
      >
        {/* Centre divider */}
        <div
          style={{
            position: "absolute",
            left: halfPx - 0.5,
            top: 0,
            bottom: 0,
            width: 1,
            background: "var(--hairline-strong)",
          }}
        />
        {/* Fill from centre outward — left for under-utilised, right for over */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            background: isUnder
              ? "var(--btn-danger-bg)"
              : "var(--bg-active-on)",
            borderRadius: 3,
            left: isUnder ? halfPx - fillPx : halfPx,
            width: fillPx,
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...S.surfaceSoft,
        marginTop: 12,
        padding: 12,
      }}
    >
      <div style={{ ...S.h2, margin: 0, marginBottom: 8, fontSize: 14 }}>
        Last 28 days · fairness
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(function (r) {
          return (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 12,
                color: "var(--text-primary)",
                opacity: r.archived ? 0.55 : 1,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  minWidth: 110,
                  textDecoration: r.archived ? "line-through" : "none",
                }}
              >
                {r.name}
              </span>
              <span style={{ ...S.muted, fontSize: 12 }}>
                {r.shiftsCount} / {r.shiftsTarget} shifts
              </span>
              <span style={{ ...S.muted, fontSize: 12 }}>
                {fmtHours(r.hoursTotal)} / {fmtHours(r.hoursTarget)}
              </span>
              <span style={{ marginLeft: "auto" }}>{deltaBar(r)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
