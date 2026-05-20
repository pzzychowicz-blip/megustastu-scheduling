// src/components/WeeklyRequestsPreview.jsx
// v1.6.0 — Footer panel under WeeklyShiftSummary on the Schedule grid.
// Lists every request whose date range overlaps the displayed week,
// so the manager can see who's off / on holiday / preference-constrained
// without leaving the Schedule tab.
//
// Sort: by dateFrom ascending (chronological across the week).
// Row format: "<employee name> — <type label> — <range>". Compact.
// Notes are intentionally NOT shown inline (per v1.6.0 ask) — the v1.9.0
// preview modal surfaces them when the manager clicks the type pill.
//
// Empty week (no overlapping requests) → render nothing rather than an
// empty placeholder. The grid already has enough chrome.
//
// v1.9.0 — The colored type pill is now clickable. Clicking it opens a
// READ-ONLY preview modal (RequestPreviewModal) showing the full record
// details — employee, type, full date range, preferred dayPart (for
// shift-preference), recurring weekdays (for shift-preference with
// recurring), and notes (when set). Edit access stays on the Requests
// tab; this surface is for at-a-glance context only. Hover effect on
// the pill is a subtle CSS `transform: scale(1.08)` — real `:hover`
// pseudo-class via an inline <style> block (mirrors the v1.7.0
// swap-pulse keyframes pattern in ScheduleGrid). The row container
// stays inert — no row-level hover border, no row-level click target.
//
// Props:
//   requests   ({ [id]: request })   — full map
//   employees  ({ [id]: employee })  — for resolving employeeId → name
//   weekStart  (Date)                — Monday of the displayed week
//   isMobile   (bool)

import { useState } from "react";
import { S, REQUEST_TYPES } from "../lib/constants.js";
import { addDays, isoDate, parseIsoDate } from "../lib/schedule-logic.js";
import RequestPreviewModal from "./RequestPreviewModal.jsx";

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
  // v1.9.0: local state for the read-only preview modal. Stores the full
  // original request record (not the derived row object) so the modal
  // can render fields the row doesn't carry (notes, dayPart, recurring
  // weekdays). null means closed; setting a record opens the modal.
  const [previewRequest, setPreviewRequest] = useState(null);

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
      // v1.9.0: keep the original record so the pill click can pass it
      // directly to the preview modal without a second lookup.
      record: r,
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
              {/* v1.9.0: the colored type pill is the ONLY clickable
                  element in the row. Default button chrome stripped
                  (background = palette bg, border = palette border,
                  font inherit, padding kept consistent with the v1.6.0
                  span style). Click opens the read-only preview.
                  Hover-scale comes from the shared `.mgt-hover-scale`
                  class defined in index.html (one rule for every
                  primary interactive surface in the app). */}
              <button
                type="button"
                className="mgt-hover-scale"
                onClick={function () { setPreviewRequest(r.record); }}
                title="Preview request"
                style={{
                  padding: "1px 8px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 500,
                  background: r.palette ? r.palette.bg : "var(--bg-pill)",
                  color: r.palette ? r.palette.text : "var(--text-secondary)",
                  border: r.palette ? ("1px solid " + r.palette.border) : "1px solid var(--hairline-strong)",
                  font: "inherit",
                  lineHeight: 1.4,
                  cursor: "pointer",
                }}
              >
                {r.typeLabel}
              </button>
              <span style={{ ...S.muted, fontSize: 12 }}>
                {r.range}
              </span>
            </div>
          );
        })}
      </div>

      {/* v1.9.0: read-only preview modal. Owned locally — ScheduleGrid
          doesn't see this state. The modal closes via Close button,
          backdrop click, or Esc (handled by the Overlay atom). */}
      <RequestPreviewModal
        open={previewRequest !== null}
        request={previewRequest}
        employees={employees}
        isMobile={isMobile}
        onClose={function () { setPreviewRequest(null); }}
      />
    </div>
  );
}
