// src/components/ShortcutsModal.jsx
// v15.3.0 — Keyboard-shortcut cheatsheet, opened with `?` from anywhere in
// the app (handler lives in AppShell). Read-only: a sectioned list of every
// shortcut plus a single Close button.
//
// Ported from MGT Bookings' Shortcuts.jsx pattern (ShortcutRow +
// SHORTCUT_SECTIONS), rewritten for this app's keys. SINGLE SOURCE OF TRUTH
// for the shortcut documentation — when a new key is wired into AppShell or
// ScheduleGrid, add its row here so the help overlay stays accurate. The
// list and the handlers are kept in sync manually.
//
// Reuses Overlay (the only backdrop blur in the app) and the Kbd atom.

import { Fragment } from "react";
import { S } from "../lib/constants.js";
import { Overlay, mkBtn, Kbd } from "./atoms.jsx";
import { useEscClose } from "../hooks/useEscClose.js";

// ── One row: keycap(s) + label ───────────────────────────────────────────
function ShortcutRow({ keys, label }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 0",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div
        style={{
          minWidth: 96,
          display: "flex",
          gap: 2,
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        {keys.map(function (k, i) {
          return (
            <Fragment key={i}>
              {i > 0 ? (
                <span style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 3px" }}>/</span>
              ) : null}
              <Kbd k={k} />
            </Fragment>
          );
        })}
      </div>
      <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{label}</span>
    </div>
  );
}

// Module-local canonical list. Adding a shortcut = a row here AND the key
// wired in AppShell.jsx / ScheduleGrid.jsx.
const SHORTCUT_SECTIONS = [
  {
    title: "Navigation",
    rows: [
      { keys: ["←", "→"], label: "Previous / next week" },
      { keys: ["T"], label: "Jump to this week" },
      { keys: ["1", "2", "3", "4"], label: "Schedule / Employees / Requests / Settings" },
      { keys: ["?"], label: "Show this help" },
    ],
  },
  {
    title: "Schedule actions",
    rows: [
      { keys: ["G"], label: "Generate" },
      { keys: ["S"], label: "Swap mode" },
      { keys: ["U"], label: "Undo" },
      { keys: ["C"], label: "Clear" },
      { keys: ["E"], label: "Export PDF" },
    ],
  },
  {
    title: "Universal",
    rows: [
      { keys: ["Esc"], label: "Close window / cancel swap / clear highlight" },
      { keys: ["Enter"], label: "Save / confirm the open form" },
    ],
  },
];

export default function ShortcutsModal({ open, isMobile, onClose }) {
  // v15.3.0: Esc-to-close via the shared hook (was a local effect). The
  // Overlay atom has no key handling, so each modal owns its dismissal.
  useEscClose(open, onClose);

  if (!open) return null;

  return (
    <Overlay open={open} isMobile={isMobile} onClose={onClose} title="Keyboard shortcuts">
      <p style={{ ...S.muted, margin: "0 0 14px 0", fontSize: 12 }}>
        Single-key shortcuts — they don't fire while you're typing in a field
        or while another window is open.
      </p>

      <div>
        {SHORTCUT_SECTIONS.map(function (sec, si) {
          return (
            <div
              key={si}
              style={{ marginBottom: si < SHORTCUT_SECTIONS.length - 1 ? 14 : 0 }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--accent)",
                  marginBottom: 4,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {sec.title}
              </div>
              <div>
                {sec.rows.map(function (r, ri) {
                  return <ShortcutRow key={ri} keys={r.keys} label={r.label} />;
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        {mkBtn({
          type: "button",
          className: "mgt-hover-scale",
          variant: "ghost",
          onClick: onClose,
          children: "Close",
        })}
      </div>
    </Overlay>
  );
}
