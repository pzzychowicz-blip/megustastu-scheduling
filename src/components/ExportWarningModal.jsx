// src/components/ExportWarningModal.jsx
// v15.2.0 — Confirm dialog shown when the manager clicks Export PDF on an
// INCOMPLETE week while the `allowIncompleteExport` setting is on. Without
// that setting the Export button stays disabled (the locked v1 behaviour);
// with it on, this modal warns that the printed rota will have blank slots
// before producing the PDF.
//
// Reuses Overlay (the single source of backdrop blur per the ≤4-blur-
// instances rule). The actual export runs in the parent's onConfirm
// handler (ExportButton) — this component is dumb.
//
// Props:
//   open        (bool)
//   emptyCount  (number)  — empty open cells on the visible week
//   isMobile    (bool)
//   onClose     (fn)      — Cancel / backdrop click
//   onConfirm   (fn)      — "Export anyway" → parent runs the PDF export

import { S } from "../lib/constants.js";
import { Overlay, mkBtn } from "./atoms.jsx";

export default function ExportWarningModal({
  open, emptyCount, isMobile, onClose, onConfirm,
}) {
  if (!open) return null;

  const n = typeof emptyCount === "number" ? emptyCount : 0;
  const cellWord = n === 1 ? "cell" : "cells";

  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={onClose}
      title="Export an incomplete schedule?"
    >
      <p style={{ ...S.body, margin: "0 0 12px 0" }}>
        This week has{" "}
        <strong>
          {n} empty {cellWord}
        </strong>{" "}
        with no one assigned. The PDF will print those slots blank.
      </p>
      <p style={{ ...S.muted, margin: "0 0 16px 0", fontSize: 12 }}>
        You can fill the remaining cells first, or export now and hand-write
        the gaps later.
      </p>

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
          children: "Cancel",
        })}
        {mkBtn({
          type: "button",
          className: "mgt-hover-scale",
          variant: "primary",
          onClick: onConfirm,
          children: "Export anyway",
        })}
      </div>
    </Overlay>
  );
}
