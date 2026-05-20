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
//   strictPref    (bool)    — current /settings.generatorStrictPreference
//   busy          (bool)    — disables both action buttons during a run
//   isMobile      (bool)
//   onClose       (fn)
//   onConfirm     (fn)      — fill-empty: onConfirm("fill-empty")
//                              regenerate: onConfirm("regenerate",
//                                {preserveTimes, preserveAssignments})

import { useEffect, useState } from "react";
import { S } from "../lib/constants.js";
import { Overlay, Toggle, mkBtn } from "./atoms.jsx";

export default function GenerateConfirmModal({
  open, weekLabel, strictPref, busy, isMobile, onClose, onConfirm,
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

  if (!open) return null;

  const prefHint = strictPref
    ? "Hard — only preference-matching employees considered. Cells may be left empty if no preferred candidate fits."
    : "Soft — preferred employees tried first; falls back to anyone eligible if none match.";

  // v1.8.1: regenerate is "destructive" when either preserve flag is OFF.
  // Drives the button variant (red vs blue) and the explainer copy.
  const destructive = !preserveTimes || !preserveAssignments;

  let regenExplainer;
  if (preserveTimes && preserveAssignments) {
    regenExplainer = "Re-fills only the truly empty cells. Existing shifts stay as-is.";
  } else if (preserveTimes && !preserveAssignments) {
    regenExplainer = "Reassigns staff but keeps your custom start/end times and evening roles.";
  } else if (!preserveTimes && preserveAssignments) {
    regenExplainer = "Keeps existing employees on each cell but resets start/end times and roles to template defaults.";
  } else {
    regenExplainer = "Clears every shift in this week and re-allocates the whole rota fresh.";
  }

  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={busy ? undefined : onClose}
      title={"Auto-fill empty cells for " + weekLabel + "?"}
    >
      <p style={{ ...S.body, margin: "0 0 12px 0" }}>
        The generator will fill empty cells respecting the same rules the
        manual picker enforces.
      </p>

      <ul style={{ ...S.body, margin: "0 0 12px 16px", padding: 0, fontSize: 13 }}>
        <li>Role match + same-day strict + working-days quota.</li>
        <li>Skips any cell that's already assigned.</li>
        <li>
          Never auto-assigns over a day-off or holiday request — you can
          override manually from the cell modal afterwards.
        </li>
        <li>Respects each employee's fixed working days when set.</li>
        <li>
          Leaves the cell <em>empty</em> if no eligible employee is
          available — no rules are bent.
        </li>
      </ul>

      <div
        style={{
          ...S.surfaceSoft,
          padding: "8px 10px",
          marginBottom: 12,
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 600 }}>Preference mode: </span>
        <span style={{ color: "var(--text-secondary)" }}>{prefHint}</span>
        <div style={{ ...S.muted, marginTop: 4, fontSize: 11 }}>
          Change this in Settings → Auto-generator.
        </div>
      </div>

      {/* v1.1.0: Fill-empty vs Regenerate explainer.
          v1.7.0: Regenerate explicit destructive-by-default copy.
          v1.8.1: explainer + Regenerate label colour adapt to the
                  preserve toggles' state. */}
      <div
        style={{
          ...S.surfaceSoft,
          padding: "8px 10px",
          marginBottom: 12,
          fontSize: 12,
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontWeight: 600 }}>Fill empty</span>
          <span style={{ color: "var(--text-secondary)" }}>
            {" — only fills cells that are currently empty. Existing assignments untouched."}
          </span>
        </div>
        <div>
          <span
            style={{
              fontWeight: 600,
              color: destructive ? "var(--text-danger)" : "var(--text-primary)",
            }}
          >
            Regenerate
          </span>
          <span style={{ color: "var(--text-secondary)" }}>
            {" — "}
            {destructive
              ? (
                <strong>{regenExplainer}</strong>
              )
              : regenExplainer}
          </span>
        </div>
      </div>

      {/* v1.8.1: preserve-overrides toggles. Both default ON each open;
          control the policy passed into onConfirm("regenerate", ...). */}
      <div
        style={{
          ...S.surfaceSoft,
          padding: "8px 10px",
          marginBottom: 12,
        }}
      >
        <div style={{ ...S.muted, fontSize: 11, marginBottom: 6 }}>
          On Regenerate:
        </div>
        <Toggle
          label="Preserve manual time/role edits"
          helper="Cells where you've changed start/end times or the evening role stay as-is."
          checked={preserveTimes}
          onChange={setPreserveTimes}
          disabled={busy}
          className="mgt-hover-scale"
        />
        <div style={{ height: 6 }} />
        <Toggle
          label="Preserve existing assignments"
          helper="Cells with an assigned employee stay as-is."
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
