// src/components/GenerateConfirmModal.jsx
// v1.0.0 — Confirm dialog for the auto-generator.
// v1.1.0 — Two-button bottom row: Fill empty (primary, v1.0 behaviour) +
//   Regenerate (secondary, re-evaluates current constraints, clears
//   stale assignments first). The mode picked is passed to the parent's
//   onConfirm(mode).
// v1.7.0 — Regenerate became destructive: clears every shift in the
//   week and re-allocates fresh. Explainer copy + button language
//   updated to make the destructive nature explicit. Mechanic stays
//   the same (onConfirm("regenerate")) — only generator.js + the copy
//   here changed.
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
//   onConfirm     (fn)      — called with "fill-empty" | "regenerate"

import { S, BTN } from "../lib/constants.js";
import { Overlay, mkBtn } from "./atoms.jsx";

export default function GenerateConfirmModal({
  open, weekLabel, strictPref, busy, isMobile, onClose, onConfirm,
}) {
  if (!open) return null;

  const prefHint = strictPref
    ? "Hard — only preference-matching employees considered. Cells may be left empty if no preferred candidate fits."
    : "Soft — preferred employees tried first; falls back to anyone eligible if none match.";

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

      {/* v1.1.0: explainer for Fill empty vs Regenerate.
          v1.7.0: Regenerate copy made destructive-explicit. */}
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
          <span style={{ fontWeight: 600, color: "var(--text-danger)" }}>Regenerate</span>
          <span style={{ color: "var(--text-secondary)" }}>
            {" — "}<strong>clears every shift in this week</strong>{" and re-allocates the whole rota fresh. Use when new requests have landed and you want the generator to plan from scratch."}
          </span>
        </div>
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
          variant: "ghost",
          onClick: onClose,
          disabled: busy,
          style: busy ? { opacity: 0.5, cursor: "not-allowed" } : undefined,
          children: "Cancel",
        })}
        {mkBtn({
          type: "button",
          variant: "danger",
          onClick: function () { onConfirm("regenerate"); },
          disabled: busy,
          style: busy ? { opacity: 0.6, cursor: "wait" } : undefined,
          children: busy ? "Working…" : "Regenerate",
        })}
        {mkBtn({
          type: "button",
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
