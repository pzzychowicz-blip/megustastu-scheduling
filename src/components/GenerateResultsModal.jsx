// src/components/GenerateResultsModal.jsx
// v1.4.0 — "Why didn't X fill?" modal opened from the generator result
// banner. Lists unfilled cells and (for Regenerate) cleared shifts,
// grouped by reason with human-readable labels.
//
// v1.7.0 — Regenerate became wipe-and-refill, so every cleared shift
// now arrives with the single reason "regenerated". groupByReason
// collapses naturally to one bucket; the only change in this file is
// the title's mode label ("Regenerate" still reads correctly).
//
// v1.9.3 — Each reason-group row is now a clickable button. Click
// fires onJumpToCell(dateIso, slotKey); ScheduleGrid closes the modal,
// auto-navigates to the week containing the date if it's outside the
// visible range, and one-shot pulses the cell in v1.7.0 highlight-
// green for ~1.6s. Click target uses the shared .mgt-hover-scale
// utility so the row reads as interactive. When onJumpToCell is
// omitted the rows fall back to plain non-interactive text.
//
// Pure presentational — owns no state beyond `open` (controlled by
// ScheduleGrid). Reads the summary captured at generator-run time.
//
// Props:
//   open         (bool)         — overlay open state
//   onClose      (fn)           — overlay close handler
//   summary      (object|null)  — the resultBanner state from ScheduleGrid:
//                                 { mode, filled, unfilled, total, cleared?,
//                                   unfilledCells: [{dateIso, slotKey, reason}],
//                                   clearedReasons: [{id, reason, date,
//                                                     employeeId, section,
//                                                     dayPart, slotIndex,
//                                                     slotKey}] }
//   employees    ({[id]:emp})   — for cleared-reason rows (employee name)
//   slotsByKey   ({[key]:slot}) — for reason rows (slot humanLabel)
//   onJumpToCell (fn)           — v1.9.3 — (dateIso, slotKey) => void.
//                                 Optional; omit for read-only rows.
//   isMobile     (bool)
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

// v1.9.3: onItemClick (optional) makes each row a button. Click fires
// the handler with the row's `item` payload — caller threads through
// to onJumpToCell(dateIso, slotKey). When absent the rows render as
// plain non-interactive text (v1.4.0 behaviour).
//
// v1.9.4: bullet integrated into the row. v1.9.3 left the bullet on
// the wrapping `<li>` via list-style:disc — when the inner button
// scaled on hover, the bullet stayed anchored and visually detached
// from the rest of the row. The bullet is now a `<span>` INSIDE the
// button (interactive) or inside a flex `<li>` (non-interactive), so
// the whole row reads as one element regardless of state.
function ReasonGroup({ label, items, paletteVariant, renderItem, onItemClick }) {
  const palette = paletteVariant === "unfilled" ? UNFILLED_PALETTE : CLEARED_PALETTE;
  const interactive = typeof onItemClick === "function";
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
          padding: 0,
          listStyle: "none",
          color: "var(--text-primary)",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        {items.map(function (item, i) {
          const key = paletteVariant + "-" + i;
          if (!interactive) {
            // v1.9.4: even the non-interactive fallback uses the
            // bullet-inside-row layout for visual consistency.
            return (
              <li
                key={key}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  padding: "2px 0",
                }}
              >
                <span aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }}>•</span>
                <span>{renderItem(item)}</span>
              </li>
            );
          }
          // v1.9.3 + v1.9.4: clickable row. The button is a flex
          // container with the bullet first, then the text — so the
          // whole row scales together on hover. .mgt-hover-scale gives
          // the lift + soft hover background; cursor:pointer signals
          // interactivity. Padding bumped from v1.9.3's "2px 6px" to
          // "4px 8px" so the hover background reads as a discrete
          // row card rather than hugging the text edge.
          return (
            <li key={key}>
              <button
                type="button"
                className="mgt-hover-scale"
                onClick={function () { onItemClick(item); }}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  width: "100%",
                  padding: "4px 8px",
                  background: "transparent",
                  border: "none",
                  color: "inherit",
                  font: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }}>•</span>
                <span>{renderItem(item)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function GenerateResultsModal({
  open, onClose, summary, employees, slotsByKey, onJumpToCell, isMobile,
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

  // v1.9.3: per-row click handlers. Unfilled cells store the date as
  // `dateIso`; cleared shifts use `date`. Both carry `slotKey`. The
  // handlers are no-ops when onJumpToCell is missing — ReasonGroup
  // also gates interactivity on the callback's presence, so omitting
  // both keeps the rows non-interactive end-to-end.
  const onUnfilledClick = onJumpToCell
    ? function (item) { onJumpToCell(item.dateIso, item.slotKey); }
    : undefined;
  const onClearedClick = onJumpToCell
    ? function (item) { onJumpToCell(item.date, item.slotKey); }
    : undefined;

  return (
    <Overlay open={open} onClose={onClose} title={title} isMobile={isMobile}>
      {/* v1.9.4: scrollable list area. The Overlay desktop sheet uses
          overflow:visible (v1.9.0 hover-scale fix) so hover-scaled
          rows can lift past the sheet border — but that means long
          generator outputs (35+ cleared rows on a Regenerate against
          a busy week) spill off-screen and the Close button below
          becomes unreachable. This inner scroller caps the list height
          and re-introduces internal scroll for the section blocks
          only. The summary line + Close button stay outside the
          scroller, anchored at the modal bottom.
          The negative horizontal margin pulls the box back to the
          Overlay's content edge; the matching padding gives hover-
          scaled rows 16px of breathing room before the scroll
          container clips them (same pattern as ScheduleGrid's outer
          wrapper). max-height adapts to viewport: mobile sheets get
          a percentage; desktop caps at 480px so the dialog fits on
          a typical laptop without filling the whole height.
          The empty-state ("Nothing to report") falls outside the
          scroller — no list to scroll when there's nothing in it. */}
      {(hasUnfilled || hasCleared) ? (
        <div
          style={{
            maxHeight: isMobile ? "55vh" : "min(60vh, 480px)",
            overflowY: "auto",
            padding: "4px 16px",
            margin: "0 -16px",
          }}
        >
          {hasUnfilled ? (
            <Section title={"Left empty (" + unfilledCells.length + ")"} style={{ marginBottom: 12 }}>
              {unfilledGroups.map(function (g) {
                return (
                  <ReasonGroup
                    key={"unf-" + g.reason}
                    label={g.label}
                    items={g.items}
                    paletteVariant="unfilled"
                    onItemClick={onUnfilledClick}
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
                    onItemClick={onClearedClick}
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
        </div>
      ) : (
        <p style={{ ...S.body, marginTop: 0 }}>
          Nothing to report — everything fell within the rules.
        </p>
      )}

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
          className="mgt-hover-scale"
          onClick={onClose}
          style={{ ...BTN.base, ...BTN.secondary, padding: "8px 14px", fontSize: 13 }}
        >
          Close
        </button>
      </div>
    </Overlay>
  );
}
