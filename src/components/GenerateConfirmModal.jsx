// src/components/GenerateConfirmModal.jsx
// v1.0.0 — Confirm dialog for the auto-generator.
// v1.1.0 — Two-button bottom row: Fill empty (primary, v1.0 behaviour) +
//   Regenerate (secondary, re-evaluates current constraints, clears
//   stale assignments first). The mode picked is passed to the parent's
//   onConfirm(mode).
// v1.7.0 — Regenerate became destructive: clears every shift in the
//   week and re-allocates fresh. Explainer copy + button language
//   updated to make the destructive nature explicit.
// v1.8.1 — Two checkboxes on Regenerate: "Preserve manual time/role
//   edits" + "Preserve existing assignments", both default ON. Wires
//   into onConfirm("regenerate", {preserveTimes, preserveAssignments}).
//   The explainer copy + button variant adapt live based on the
//   toggles' state — manager sees danger (red) styling only when at
//   least one preserve flag is OFF.
// v1.9.0 — `preserveAssignments` default flipped to OFF. Per-run
//   default is now "reshuffle staff but keep my custom times" which
//   matches the most common manager intent — they hit Regenerate
//   precisely because they want assignments redone. `preserveTimes`
//   stays default ON (custom times survive). The modal still opens
//   with danger-red Regenerate styling (since at least one preserve
//   flag is OFF), making the destructive default explicit.
//
// Reuses Overlay (the single source of backdrop blur per the
// ≤4-blur-instances rule). The actual algorithm runs in the parent's
// onConfirm handler — this component is dumb.
//
// Props:
//   open          (bool)
//   weekLabel     (string)  — e.g. "12–18 May 2026" from formatWeekRange()
//   busy          (bool)    — disables both action buttons during a run
//   isMobile      (bool)
//   onClose       (fn)
//   onConfirm     (fn)      — fill-empty: onConfirm("fill-empty")
//                              regenerate: onConfirm("regenerate",
//                                {preserveTimes, preserveAssignments})

import { useEffect, useState } from "react";
import { S } from "../lib/constants.js";
import { Overlay, Toggle, mkBtn } from "./atoms.jsx";
import { useEscClose } from "../hooks/useEscClose.js";

export default function GenerateConfirmModal({
  open, weekLabel, busy, isMobile, onClose, onConfirm,
}) {
  // v1.8.1: per-run policy state. Resets each time the modal opens —
  // sticky-across-opens would be a power-user request, default resets
  // keep predictable behaviour. v1.9.0: `preserveAssignments` default
  // flipped to OFF (was ON) — managers hit Regenerate precisely to
  // reshuffle staff, so the default now matches that intent.
  // `preserveTimes` stays default ON so manual time edits survive
  // unless the manager opts to reset them.
  const [preserveTimes, setPreserveTimes] = useState(true);
  const [preserveAssignments, setPreserveAssignments] = useState(false);
  useEffect(function () {
    if (open) {
      setPreserveTimes(true);
      setPreserveAssignments(false);
    }
  }, [open]);

  // v15.3.0: Esc cancels. onClose already no-ops while busy (mid-run), so
  // Esc can't dismiss a generation in progress — matching the disabled Cancel.
  useEscClose(open, onClose);

  if (!open) return null;

  // v1.8.1: regenerate is "destructive" when either preserve flag is OFF.
  // Drives the Regenerate button's variant (red vs blue).
  //
  // v16.0.0 (phase 38): that colour is now the ONLY thing signalling it,
  // and it is enough. This modal also carried an intro paragraph, a
  // five-bullet list of the generator's rules, a card restating the
  // preference mode from Settings, and a pair of explainer sentences that
  // rewrote themselves as the toggles below flipped. All of it described
  // locked behaviour, re-read on every single run, to the one person who
  // decided that behaviour. What is left is the two controls that actually
  // change what the run does, and three buttons.
  const destructive = !preserveTimes || !preserveAssignments;

  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={busy ? undefined : onClose}
      title={"Auto-fill empty cells for " + weekLabel + "?"}
    >
      {/* v1.8.1: preserve-overrides toggles. v1.9.0 default state =
          preserveTimes ON / preserveAssignments OFF (modal opens in
          danger-red Regenerate variant by default).
          v1.9.0 (perslot+ commit, second round): horizontal padding
          bumped from 10 → 16 so scaled Toggle rows (1.08) have
          breathing room inside the card before they visually overflow
          its edges. Matches the schedule-grid clipping fix pattern. */}
      <div
        style={{
          ...S.surfaceSoft,
          padding: "12px 16px",
          marginBottom: 12,
        }}
      >
        <div style={{ ...S.muted, fontSize: 11, marginBottom: 6 }}>
          On Regenerate:
        </div>
        <Toggle
          label="Keep manual time and role edits"
          checked={preserveTimes}
          onChange={setPreserveTimes}
          disabled={busy}
          className="mgt-hover-scale"
        />
        <div style={{ height: 6 }} />
        <Toggle
          label="Keep existing assignments"
          checked={preserveAssignments}
          onChange={setPreserveAssignments}
          disabled={busy}
          className="mgt-hover-scale"
        />
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        {mkBtn({
          type: "button",
          className: "mgt-hover-scale",
          variant: "ghost",
          onClick: onClose,
          disabled: busy,
          style: busy ? { opacity: 0.5, cursor: "not-allowed" } : undefined,
          children: "Cancel",
        })}
        {mkBtn({
          type: "button",
          className: "mgt-hover-scale",
          variant: destructive ? "danger" : "primary",
          onClick: function () {
            onConfirm("regenerate", {
              preserveTimes: preserveTimes,
              preserveAssignments: preserveAssignments,
            });
          },
          disabled: busy,
          style: busy ? { opacity: 0.6, cursor: "wait" } : undefined,
          children: busy ? "Working…" : "Regenerate",
        })}
        {mkBtn({
          type: "button",
          className: "mgt-hover-scale",
          variant: "primary",
          onClick: function () { onConfirm("fill-empty"); },
          disabled: busy,
          style: busy ? { opacity: 0.6, cursor: "wait" } : undefined,
          children: busy ? "Working…" : "Fill empty",
        })}
      </div>
    </Overlay>
  );
}
