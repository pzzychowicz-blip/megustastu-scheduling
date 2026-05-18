// src/components/GenerateResultsModal.jsx
// v1.4.0 — "Why didn't X fill?" modal opened from the generator result
// banner. Lists unfilled cells and (for Regenerate) cleared shifts,
// grouped by reason with human-readable labels.
//
// Pure presentational — owns no state beyond `open` (controlled by
// ScheduleGrid). Reads the summary captured at generator-run time.
//
// Props:
//   open       (bool)         — overlay open state
//   onClose    (fn)           — overlay close handler
//   summary    (object|null)  — the resultBanner state from ScheduleGrid:
//                               { mode, filled, unfilled, total, cleared?,
//                                 unfilledCells: [{dateIso, slotKey, reason}],
//                                 clearedReasons: [{id, reason, date,
//                                                   employeeId, section,
//                                                   dayPart, slotIndex,
//                                                   slotKey}] }
//   employees  ({[id]:emp})   — for cleared-reason rows (employee name)
//   slotsByKey ({[key]:slot}) — for reason rows (slot humanLabel)
//   isMobile   (bool)
//
// Reason → human label lives in constants.GENERATOR_REASONS; we don't
// embed labels here so adding a new code only touches one file.

import { Overlay, Section, TBadge } from "./atoms.jsx";
import { S, BTN, GENERATOR_REASONS } from "../lib/constants.js";
import { parseIsoDate, formatDayHeader } from "../lib/schedule-logic.js";

// Group an array of { reason, ... } entries by reason. Returns an array
// of { reason, label, items } in INSERTION order (first-seen reason wins).
// Insertion-order grouping keeps the reason-row layout stable across runs
// — managers scanning the modal twice see reasons in the same place.
function groupByReason(entries) {
  const buckets = {};
  const order = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const r = e.reason || "no-eligible";
    if (!buckets[r]) {
      buckets[r] = [];
      order.push(r);
    }
    buckets[r].push(e);
  }
  return order.map(function (r) {
    return {
      reason: r,
      label: GENERATOR_REASONS[r] || r,
      items: buckets[r],
    };
  });
}

// Pretty date label: "Tue 19" — short enough to fit in compact list rows.
function shortDate(dateIso) {
  if (!dateIso) return "—";
  const d = parseIsoDate(dateIso);
  if (!d || isNaN(d.getTime())) return dateIso;
  return formatDayHeader(d);
}

function slotLabel(slotKey, slotsByKey) {
  if (!slotKey) return "—";
  const slot = slotsByKey ? slotsByKey[slotKey] : null;
  if (!slot) return slotKey;
  // humanLabel already includes the section name (e.g. "Kitchen Evening 2");
  // skip a separate sectionLabel prefix to keep rows narrow on mobile.
  return slot.humanLabel || slotKey;
}

function employeeName(employeeId, employees) {
  if (!employeeId) return "Unassigned";
  const emp = employees ? employees[employeeId] : null;
  if (!emp) return "(deleted employee)";
  return emp.name || "(unnamed)";
}

// Reason-badge palette. Soft warning tint for unfilled, neutral grey for
// cleared — cleared shifts are informational ("this is what changed");
// unfilled are the actionable items ("this is what didn't get done").
const UNFILLED_PALETTE = {
  bg: "var(--status-cancelled-bg)",
  text: "var(--status-cancelled-text)",
  border: "var(--status-cancelled-border)",
};
const CLEARED_PALETTE = {
  bg: "var(--bg-chip)",
  text: "var(--text-secondary)",
  border: "var(--hairline)",
};

function ReasonGroup({ label, items, paletteVariant, renderItem }) {
  const palette = paletteVariant === "unfilled" ? UNFILLED_PALETTE : CLEARED_PALETTE;
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <TBadge palette={palette}>{label}</TBadge>
        <span style={{ ...S.muted, fontSize: 11 }}>
          {items.length} {items.length === 1 ? "cell" : "cells"}
        </span>
      </div>
      <ul
        style={{
          margin: 0,
          padding: "0 0 0 16px",
          listStyle: "disc",
          color: "var(--text-primary)",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        {items.map(function (item, i) {
          return <li key={paletteVariant + "-" + i}>{renderItem(item)}</li>;
        })}
      </ul>
    </div>
  );
}

export default function GenerateResultsModal({
  open, onClose, summary, employees, slotsByKey, isMobile,
}) {
  if (!summary) return null;

  const mode = summary.mode || "fill-empty";
  const titleMode = mode === "regenerate" ? "Regenerate" : "Fill empty";
  const title = "Generator details — " + titleMode;

  const unfilledCells = Array.isArray(summary.unfilledCells) ? summary.unfilledCells : [];
  const clearedReasons = Array.isArray(summary.clearedReasons) ? summary.clearedReasons : [];

  const unfilledGroups = groupByReason(unfilledCells);
  const clearedGroups = groupByReason(clearedReasons);

  const hasUnfilled = unfilledGroups.length > 0;
  const hasCleared = clearedGroups.length > 0 && mode === "regenerate";

  return (
    <Overlay open={open} onClose={onClose} title={title} isMobile={isMobile}>
      {hasUnfilled ? (
        <Section title={"Left empty (" + unfilledCells.length + ")"} style={{ marginBottom: 12 }}>
          {unfilledGroups.map(function (g) {
            return (
              <ReasonGroup
                key={"unf-" + g.reason}
                label={g.label}
                items={g.items}
                paletteVariant="unfilled"
                renderItem={function (item) {
                  return shortDate(item.dateIso) + " — " + slotLabel(item.slotKey, slotsByKey);
                }}
              />
            );
          })}
        </Section>
      ) : null}

      {hasCleared ? (
        <Section title={"Cleared (" + clearedReasons.length + ")"} style={{ marginBottom: 12 }}>
          {clearedGroups.map(function (g) {
            return (
              <ReasonGroup
                key={"clr-" + g.reason}
                label={g.label}
                items={g.items}
                paletteVariant="cleared"
                renderItem={function (item) {
                  return (
                    employeeName(item.employeeId, employees) +
                    " — " +
                    shortDate(item.date) +
                    " — " +
                    slotLabel(item.slotKey, slotsByKey)
                  );
                }}
              />
            );
          })}
        </Section>
      ) : null}

      {!hasUnfilled && !hasCleared ? (
        <p style={{ ...S.body, marginTop: 0 }}>
          Nothing to report — everything fell within the rules.
        </p>
      ) : null}

      <p style={{ ...S.muted, marginTop: 8 }}>
        Filled {summary.filled || 0} new shift{(summary.filled || 0) === 1 ? "" : "s"}
        {mode === "regenerate" && summary.cleared
          ? ", cleared " + summary.cleared + " stale"
          : ""}
        .
      </p>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
        <button
          type="button"
          onClick={onClose}
          style={{ ...BTN.base, ...BTN.secondary, padding: "8px 14px", fontSize: 13 }}
        >
          Close
        </button>
      </div>
    </Overlay>
  );
}
