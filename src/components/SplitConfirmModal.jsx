// src/components/SplitConfirmModal.jsx
// v16.0.0 — confirm dialog for a Swap / Move that would create a split
// shift (the same employee working twice on one date).
//
// Why this exists as a dialog rather than an inline warning:
// ShiftFormModal can warn next to a Save button the manager still has to
// press, so an inline banner is enough there. The Swap / Move mechanic
// commits the moment the second cell is clicked — there is no Save step to
// attach a warning to. Without this dialog, two ordinary grid clicks could
// silently produce a 12-hour straight day.
//
// Deliberately NOT wired to Enter (via useEnterSubmit): this is a
// destructive-ish confirm whose whole purpose is to interrupt a two-click
// flow, so it should cost a deliberate click. Esc cancels, matching every
// other modal.
//
// Props:
//   open        (bool)
//   splits      (array)  — [{ name, dateIso, existing }] one entry per
//                          employee who would end up doubled. `existing` is
//                          the shift record they already hold that date.
//   isMobile    (bool)
//   onClose     (fn)     — cancel; the swap is discarded
//   onConfirm   (fn)     — proceed with the swap/move

import { S, BTN, SECTIONS } from "../lib/constants.js";
import { Overlay, mkBtn } from "./atoms.jsx";
import { useEscClose } from "../hooks/useEscClose.js";

// Describe the shift the employee already holds, e.g. "Kitchen Day
// (11:00–16:00)". Falls back gracefully if a record is missing fields —
// this is warning copy, it must never throw.
function describeShift(shift) {
  if (!shift) return "another shift";
  const section = shift.section && SECTIONS[shift.section]
    ? SECTIONS[shift.section].label
    : shift.section;
  const part = shift.dayPart === "day" ? "Day" : (shift.dayPart === "evening" ? "Evening" : "");
  const label = [section, part].filter(Boolean).join(" ") || "another shift";
  const time = shift.start && shift.end ? " (" + shift.start + "–" + shift.end + ")" : "";
  return label + time;
}

export default function SplitConfirmModal({ open, splits, isMobile, onClose, onConfirm }) {
  useEscClose(open, onClose);

  if (!open) return null;

  const list = Array.isArray(splits) ? splits : [];
  const plural = list.length > 1;

  const footer = (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
      {mkBtn({
        type: "button",
        className: "mgt-hover-scale",
        variant: "ghost",
        onClick: onClose,
        children: "Cancel",
      })}
      {mkBtn({
        type: "button",
        className: "mgt-hover-scale",
        variant: "primary",
        onClick: onConfirm,
        children: plural ? "Create split shifts" : "Create split shift",
      })}
    </div>
  );

  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={onClose}
      title={plural ? "This creates split shifts" : "This creates a split shift"}
      footer={footer}
    >
      <p style={{ ...S.body, marginTop: 0 }}>
        {plural
          ? "These people would end up working twice on the same date:"
          : "This person would end up working twice on the same date:"}
      </p>

      <div
        style={{
          ...S.surfaceSoft,
          background: "var(--bg-warning-tint)",
          border: "1px solid var(--border-warning-tint)",
          color: "var(--text-warning)",
          marginTop: 8,
        }}
      >
        {list.map(function (sp, i) {
          return (
            <div key={i} style={{ fontSize: 13, marginTop: i === 0 ? 0 : 8 }}>
              ⚠ <strong>{sp.name}</strong> is already on{" "}
              <strong>{describeShift(sp.existing)}</strong> on {sp.dateIso}.
            </div>
          );
        })}
      </div>

      <p style={{ ...S.muted, marginTop: 10, fontSize: 12 }}>
        Split shifts are allowed, but the auto-generator will never create
        one — so this stays exactly as you set it until you change it.
        Undo is available afterwards if this wasn't what you meant.
      </p>
    </Overlay>
  );
}
