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
//   - Highlight sync. The name+counts area is a `<button>` that
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
// v1.13.0 polish (in-DEV review feedback, final state after five
// iteration rounds):
//   - Row layout & density. Wrapper carries the selected green tint
//     at full row width but NO padding of its own — the name button
//     alone carries the 4×10 px padding (matching the
//     <WeeklyShiftSummary> pill rhythm), so the row height matches
//     the Shifts assigned section. Earlier rounds stacked wrapper
//     padding + button padding which doubled the visual mass.
//   - Hover snug around content. The name button is content-sized
//     (not flex:1), so .mgt-hover-scale's hover card fits snugly
//     around just name+counts. The delta bar is pushed right via
//     `marginLeft: auto`.
//   - Per-week sparkline jump-to-week. New `onJumpToWeek` prop
//     (forwarded by ScheduleGrid). When set, the modal's WeekBars
//     become clickable buttons that navigate the schedule to the
//     chosen week. We wrap the upstream handler locally so a
//     successful jump also auto-closes the modal — the manager
//     wants to see the week they picked.
//   - Active-only. The row-build loop now skips every archived
//     employee (was: skip-archived-with-zero-shifts). Orphan-shift
//     visibility lives on <WeeklyShiftSummary> already; this surface
//     is for active-roster balancing.
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
//   onJumpToWeek          (fn(weekStartIso)?)     — v1.13.0 polish;
//                                                    fired from the modal's
//                                                    per-week sparkline.
//                                                    When omitted, bars
//                                                    render as plain text.
//   isMobile              (bool)

import { useState } from "react";
import { S } from "../lib/constants.js";
import EmployeeFairnessModal from "./EmployeeFairnessModal.jsx";

export default function MonthlyFairnessPanel({
  employees, monthlyAggregates, shifts, requests, weekStart, shiftTemplate,
  highlightedEmployeeId, onHighlight, onJumpToWeek, isMobile,
}) {
  const empMap = employees || {};
  const aggMap = monthlyAggregates || {};

  const [detailEmployeeId, setDetailEmployeeId] = useState(null);

  // Build row models. v1.13.0 polish (round 3): the panel is now
  // active-only — archived employees are skipped entirely, even when
  // they still have orphan shifts in the 28-day window. The manager
  // is using this surface to balance the CURRENT roster, and a
  // strikethrough archived row was just visual noise. Orphan-shift
  // detection still happens at the WeeklyShiftSummary panel which
  // intentionally surfaces them on the active week.
  const rows = [];
  const ids = Object.keys(empMap);
  for (let i = 0; i < ids.length; i++) {
    const emp = empMap[ids[i]];
    if (!emp) continue;
    if (emp.active === false) continue;
    const agg = aggMap[emp.id];
    if (!agg) continue;
    rows.push({
      id: emp.id,
      name: emp.name || "(unnamed)",
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

  // Per-week jump (v1.13.0 polish round). The modal's per-week
  // sparkline becomes clickable when ScheduleGrid provides a
  // navigation handler. We wrap it locally so a successful jump
  // also auto-closes the modal — the manager wants to *see* the
  // chosen week, and the modal would block it.
  function handleJumpToWeekFromModal(weekStartIso) {
    if (typeof onJumpToWeek === "function") {
      onJumpToWeek(weekStartIso);
    }
    setDetailEmployeeId(null);
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

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map(function (r) {
          const isSelected = highlightedEmployeeId === r.id;

          // v1.13.0 polish (second pass — in-DEV review feedback):
          //   - The selected green tint lives on the wrapper again so it
          //     extends across the full row width (matches the first
          //     v1.13.0 commit, restored at the manager's request).
          //   - Row padding bumped from the original 6×8 → 8×12 for a
          //     little more breathing room without making the row tall.
          //   - The name button gets `.mgt-hover-scale .mgt-hover-soft`
          //     — the soft variant (defined in index.html) halves the
          //     usual opaque hover-card fill and drops the shadow,
          //     giving a subtle "I'm hovered" cue instead of the
          //     strong card-pop reported as too loud.
          //   - The name button stays `flex: 1` so the hover surface
          //     covers the click target. The delta bar sits on the
          //     right, with its own (regular) hover-scale.
          // v1.13.0 polish round 5: the row's total height now matches
          // a <WeeklyShiftSummary> pill (~25 px). Achieved by REMOVING
          // the wrapper's outer padding entirely — the name button
          // alone carries the visual padding (4 × 10 px, matching the
          // pill's BTN.base + padding), so the row stops adding a
          // second padding shell on top of the button. The wrapper is
          // now just a flex container that hosts the selected green
          // tint at full row width; the button's hover stays snug
          // around name+counts only.
          const nameContent = (
            <span style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span
                style={{
                  fontWeight: isSelected ? 700 : 600,
                  minWidth: 110,
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

          const nameBtnStyle = {
            background: "transparent",
            border: "none",
            padding: "4px 10px",
            margin: 0,
            cursor: "pointer",
            color: "inherit",
            fontFamily: "inherit",
            fontSize: "inherit",
            textAlign: "left",
            borderRadius: 8,
          };

          const nameNode = interactiveHighlight ? (
            <button
              type="button"
              className="mgt-hover-scale"
              onClick={function () { onHighlight(isSelected ? null : r.id); }}
              aria-pressed={isSelected ? "true" : "false"}
              title={r.name + " — click to highlight"}
              style={nameBtnStyle}
            >
              {nameContent}
            </button>
          ) : (
            <div style={{ padding: "4px 10px" }}>{nameContent}</div>
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
                marginLeft: "auto",
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
            <span style={{ marginLeft: "auto", flexShrink: 0 }}>{deltaBar(r)}</span>
          );

          // Wrapper: no padding (the name button carries it). Selected
          // green tint paints flush across the full row width; the
          // box-shadow ring (when selected) extends just outside the
          // wrapper bounds so the highlight still reads clearly.
          const wrapStyle = {
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            width: "100%",
            padding: 0,
            borderRadius: 8,
            border: isSelected ? "1px solid var(--border-active-on)" : "1px solid transparent",
            background: isSelected ? "var(--bg-active-on)" : "transparent",
            boxShadow: isSelected ? "0 0 0 2px var(--bg-active-on)" : "none",
            boxSizing: "border-box",
          };

          return (
            <div key={r.id} style={wrapStyle}>
              {nameNode}
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
        onJumpToWeek={typeof onJumpToWeek === "function" ? handleJumpToWeekFromModal : undefined}
      />
    </div>
  );
}
