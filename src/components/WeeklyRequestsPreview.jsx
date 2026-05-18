// src/components/WeeklyRequestsPreview.jsx
// v1.6.0 — Footer panel under WeeklyShiftSummary on the Schedule grid.
// Lists every request whose date range overlaps the displayed week,
// so the manager can see who's off / on holiday / preference-constrained
// without leaving the Schedule tab.
//
// Sort: by dateFrom ascending (chronological across the week).
// Row format: "<employee name> — <type label> — <range>". Compact.
// Notes are intentionally NOT shown here (per v1.6.0 ask). Manager opens
// the Requests tab when they want the full context.
//
// Empty week (no overlapping requests) → render nothing rather than an
// empty placeholder. The grid already has enough chrome.
//
// Props:
//   requests   ({ [id]: request })   — full map
//   employees  ({ [id]: employee })  — for resolving employeeId → name
//   weekStart  (Date)                — Monday of the displayed week
//   isMobile   (bool)

import { S, REQUEST_TYPES } from "../lib/constants.js";
import { addDays, isoDate, parseIsoDate } from "../lib/schedule-logic.js";

// Local copy of the RequestsList row formatter so we don't introduce a
// cross-component import dependency. Small enough to duplicate; if a
// third caller appears, lift to schedule-logic.js or a new dateFormat helper.
const SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatRange(fromIso, toIso) {
  if (!fromIso) return "";
  const from = parseIsoDate(fromIso);
  const effectiveTo = toIso || fromIso;
  if (fromIso === effectiveTo) {
    return from.getDate() + " " + SHORT_MONTH[from.getMonth()];
  }
  const to = parseIsoDate(effectiveTo);
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return from.getDate() + "–" + to.getDate() + " " + SHORT_MONTH[to.getMonth()];
  }
  return from.getDate() + " " + SHORT_MONTH[from.getMonth()] + "–" +
         to.getDate() + " " + SHORT_MONTH[to.getMonth()];
}

function typeMeta(key) {
  for (let i = 0; i < REQUEST_TYPES.length; i++) {
    if (REQUEST_TYPES[i].key === key) return REQUEST_TYPES[i];
  }
  return { key: key, label: key, palette: null };
}

export default function WeeklyRequestsPreview({ requests, employees, weekStart, isMobile }) {
  const weekStartIso = isoDate(weekStart);
  const weekEndIso = isoDate(addDays(weekStart, 6));

  // Filter: any request whose [dateFrom..dateTo] intersects the displayed
  // week. Single-date requests fall back to dateFrom on both ends.
  const all = Object.values(requests || {});
  const rows = [];
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    if (!r || !r.dateFrom) continue;
    const from = r.dateFrom;
    const to = r.dateTo || r.dateFrom;
    // Interval overlap: [from..to] ∩ [weekStartIso..weekEndIso] != ∅
    if (to < weekStartIso || from > weekEndIso) continue;
    const emp = employees ? employees[r.employeeId] : null;
    rows.push({
      id: r.id,
      employeeName: emp ? (emp.name || "(unnamed)") : "(unknown)",
      archived: emp ? emp.active === false : false,
      type: r.type,
      typeLabel: typeMeta(r.type).label,
      palette: typeMeta(r.type).palette,
      range: formatRange(from, to),
      dateFrom: from,
    });
  }

  if (rows.length === 0) return null;

  rows.sort(function (a, b) {
    if (a.dateFrom !== b.dateFrom) return a.dateFrom < b.dateFrom ? -1 : 1;
    return (a.employeeName || "").localeCompare(b.employeeName || "", undefined, { sensitivity: "base" });
  });

  return (
    <div
      style={{
        ...S.surfaceSoft,
        marginTop: 12,
        padding: 12,
      }}
    >
      <div style={{ ...S.h2, margin: 0, marginBottom: 8, fontSize: 14 }}>
        Requests this week
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {rows.map(function (r) {
          return (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                fontSize: 12,
                color: "var(--text-primary)",
                opacity: r.archived ? 0.55 : 1,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  textDecoration: r.archived ? "line-through" : "none",
                }}
              >
                {r.employeeName}
              </span>
              <span
                style={{
                  padding: "1px 8px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                  background: r.palette ? r.palette.bg : "var(--bg-pill)",
                  color: r.palette ? r.palette.text : "var(--text-secondary)",
                  border: r.palette ? ("1px solid " + r.palette.border) : "1px solid var(--hairline-strong)",
                }}
              >
                {r.typeLabel}
              </span>
              <span style={{ ...S.muted, fontSize: 12 }}>
                {r.range}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
