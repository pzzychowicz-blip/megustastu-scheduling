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
// v1.13.0:
//   - Highlight sync. The name+counts area is now a `<button>` that
//     toggles the shared `highlightedEmployeeId` axis owned by
//     ScheduleGrid. Selected rows paint with the same iOS-green tokens
//     as the "Shifts assigned" pill + lit cells — clicking either
//     surface lights up the other for free.
//   - Delta bar overhaul. Bigger (10 px tall, 160 px wide), stronger
//     fill colours with an inset micro-border for definition, and a
//     min-2-px fill so small deficits stay visible. Centre divider
//     is a vertically-centred notch instead of a full-height hairline.
//   - Drill-down popover. The delta bar lives in its own `<button>`
//     sibling next to the name button (no nested buttons — invalid
//     HTML). Click opens <EmployeeFairnessModal> — pure informational,
//     three sections (28-day rolling, calendar month, per-week
//     sparkline).
//
// Props:
//   employees             ({ [id]: employee })
//   monthlyAggregates     ({ [empId]: { shiftsCount, hoursTotal,
//                            shiftsTarget, hoursTarget, shiftsDeficit,
//                            hoursDeficit } })
//   shifts                ({ [id]: shift })       — v1.13.0; full map for
//                                                    the drill-down helper
//   requests              ({ [id]: request })     — v1.13.0; full map
//   weekStart             (Date)                  — v1.13.0; focus week's Monday
//   shiftTemplate         (obj?)                  — v1.13.0; for avgShiftHours
//   highlightedEmployeeId (string|null)           — v1.13.0; lit row
//   onHighlight           (fn(id|null))           — v1.13.0; toggle handler
//   isMobile              (bool)

import { useState } from "react";
import { S } from "../lib/constants.js";
import EmployeeFairnessModal from "./EmployeeFairnessModal.jsx";

export default function MonthlyFairnessPanel({
  employees, monthlyAggregates, shifts, requests, weekStart, shiftTemplate,
  highlightedEmployeeId, onHighlight, isMobile,
}) {
  const empMap = employees || {};
  const aggMap = monthlyAggregates || {};

  const [detailEmployeeId, setDetailEmployeeId] = useState(null);

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

  // Delta-bar geometry (v1.13.0): 10×160 px container with a stronger
  // fill palette, a small centred notch divider, and a min-2 px fill so
  // tiny deficits don't collapse to "looks at-target." Zero-target
  // employees keep the empty-bar fallback — no fill direction makes
  // sense without a target to measure against.
  function deltaBar(row) {
    const W = 160;
    const H = 10;
    const halfPx = W / 2;
    const target = row.hoursTarget;
    if (!Number.isFinite(target) || target <= 0) {
      return (
        <div
          style={{
            width: W,
            height: H,
            background: "var(--bg-pill)",
            borderRadius: 5,
            border: "1px solid var(--hairline-strong)",
            boxSizing: "border-box",
          }}
          title="No target — nothing to deviate from"
        />
      );
    }
    const delta = row.hoursTotal - target;          // negative = under, positive = over
    const pct = Math.min(1, Math.abs(delta) / target);
    const rawFillPx = Math.round(halfPx * pct);
    const fillPx = rawFillPx > 0 ? Math.max(2, rawFillPx) : 0;
    const isUnder = delta < 0;
    const fillBg = isUnder ? "var(--btn-danger-bg)" : "var(--bg-active-on)";
    const fillBorder = isUnder ? "var(--btn-danger-fg)" : "var(--border-active-on)";
    return (
      <div
        style={{
          width: W,
          height: H,
          background: "var(--bg-pill)",
          borderRadius: 5,
          position: "relative",
          overflow: "hidden",
          border: "1px solid var(--hairline-strong)",
          boxSizing: "border-box",
        }}
        title={(delta >= 0 ? "+" : "") + fmtHours(delta) + " vs target — click for details"}
      >
        {/* Centre notch — short vertical mark, doesn't dominate */}
        <div
          style={{
            position: "absolute",
            left: halfPx - 1,
            top: 2,
            bottom: 2,
            width: 2,
            background: "var(--text-primary)",
            opacity: 0.55,
            borderRadius: 1,
          }}
        />
        {/* Fill from centre outward — left for under-utilised, right for over */}
        {fillPx > 0 ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              background: fillBg,
              borderRadius: 4,
              left: isUnder ? halfPx - fillPx : halfPx,
              width: fillPx,
              boxShadow: "inset 0 0 0 1px " + fillBorder,
            }}
          />
        ) : null}
      </div>
    );
  }

  const interactiveHighlight = typeof onHighlight === "function";
  const canDrillDown = Boolean(weekStart);
  const detailEmployee = detailEmployeeId ? empMap[detailEmployeeId] : null;

  // Style helpers — applied identically to whichever sub-element acts as
  // the highlight target (the name-button when interactive, the row-div
  // when not). Keeps the visual identity in one place.
  const baseRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 12,
    color: "var(--text-primary)",
    flexWrap: "wrap",
    padding: "6px 8px",
    borderRadius: 8,
    border: "1px solid transparent",
    width: "100%",
    boxSizing: "border-box",
  };

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

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map(function (r) {
          const isSelected = highlightedEmployeeId === r.id;
          // Selected row paints in the same green identity the v1.7.0
          // pill + cell highlights use — single visual language so the
          // pill ↔ row link is unmistakable.
          const selectedStyle = isSelected
            ? {
                background: "var(--bg-active-on)",
                border: "1px solid var(--border-active-on)",
                boxShadow: "0 0 0 2px var(--bg-active-on)",
              }
            : {};

          // Inner layout: a name+counts cluster (highlight-toggle target)
          // and a delta-bar cluster (drill-down target) — two sibling
          // buttons inside an unstyled flex wrapper. Avoids nested
          // <button> tags (invalid HTML, React warns).
          const nameBlock = (
            <span style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
              <span
                style={{
                  fontWeight: isSelected ? 700 : 600,
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
            </span>
          );

          const barBlock = canDrillDown ? (
            <button
              type="button"
              className="mgt-hover-scale"
              onClick={function () { setDetailEmployeeId(r.id); }}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                display: "inline-block",
                lineHeight: 0,
                flexShrink: 0,
              }}
              title={"Click for monthly stats — " + r.name}
              aria-label={"Open monthly stats for " + r.name}
            >
              {deltaBar(r)}
            </button>
          ) : (
            <span style={{ flexShrink: 0 }}>{deltaBar(r)}</span>
          );

          const wrapStyle = {
            ...baseRowStyle,
            opacity: r.archived ? 0.6 : 1,
            ...selectedStyle,
          };

          if (interactiveHighlight) {
            // Name area is the highlight-toggle button; delta bar is a
            // sibling button outside it. The row itself is a div wrapper
            // so the green tint paints across the full width.
            return (
              <div key={r.id} style={wrapStyle}>
                <button
                  type="button"
                  className="mgt-hover-scale"
                  onClick={function () { onHighlight(isSelected ? null : r.id); }}
                  aria-pressed={isSelected ? "true" : "false"}
                  title={(r.archived ? r.name + " (archived)" : r.name) + " — click to highlight"}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    cursor: "pointer",
                    color: "inherit",
                    fontFamily: "inherit",
                    fontSize: "inherit",
                    textAlign: "left",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {nameBlock}
                </button>
                {barBlock}
              </div>
            );
          }
          return (
            <div key={r.id} style={wrapStyle}>
              {nameBlock}
              {barBlock}
            </div>
          );
        })}
      </div>

      <EmployeeFairnessModal
        open={detailEmployee !== null}
        employee={detailEmployee}
        weekStart={weekStart}
        shifts={shifts}
        requests={requests}
        shiftTemplate={shiftTemplate}
        isMobile={isMobile}
        onClose={function () { setDetailEmployeeId(null); }}
      />
    </div>
  );
}
