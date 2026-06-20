// src/components/ConnectionStatus.jsx
// v15.2.0 — Firebase connection status dot for the AppShell header, sat
// next to the Sign out button.
//
// A round indicator that illuminates GREEN when the Realtime Database
// socket is connected and RED when it's disrupted (see
// useFirebaseConnection → `.info/connected`). Clicking it opens a small
// popover showing the connection status AND the currently signed-in user
// (the email moved here from the old header line in v15.2.0).
//
// Anchored via a relative wrapper + absolute popover, matching the
// Settings open-days popover pattern. Closes on outside-click + Esc.
//
// Props:
//   connected  (bool)    — from useFirebaseConnection()
//   userEmail  (string)  — currently signed-in user's email
//   isMobile   (bool)    — nudges the popover so it doesn't clip off-screen

import { useEffect, useRef, useState } from "react";
import { S } from "../lib/constants.js";

export default function ConnectionStatus({ connected, userEmail, isMobile }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on outside-click + Esc (mirrors Settings.jsx open-day popover).
  useEffect(function () {
    if (!open) return undefined;
    function onDocMouseDown(e) {
      const node = wrapRef.current;
      if (node && !node.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return function () {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dotColor = connected ? "var(--status-online)" : "var(--status-offline)";
  const statusText = connected ? "Connected" : "Connection lost";

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        className="mgt-hover-scale"
        onClick={function () { setOpen(function (v) { return !v; }); }}
        title={connected ? "Connected to Firebase" : "Firebase connection lost"}
        aria-label={connected ? "Connected to Firebase" : "Firebase connection lost"}
        style={{
          appearance: "none",
          border: "none",
          background: "transparent",
          padding: 6,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          lineHeight: 0,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: dotColor,
            // Soft glow in the matching colour so it reads as "illuminated".
            boxShadow: "0 0 0 3px " + (connected
              ? "rgba(52,199,89,0.25)"
              : "rgba(255,59,48,0.25)"),
          }}
        />
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: isMobile ? "auto" : 0,
            left: isMobile ? 0 : "auto",
            zIndex: 30,
            minWidth: 220,
            padding: 12,
            background: "var(--bg-overlay-sheet)",
            border: "1px solid var(--border-card)",
            borderRadius: 12,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: dotColor,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {statusText}
            </span>
          </div>
          <div style={{ ...S.muted, fontSize: 11, marginBottom: 8 }}>
            {connected
              ? "Realtime Database is connected."
              : "Lost connection to the Realtime Database. Changes will sync when it reconnects."}
          </div>
          <div style={{ borderTop: "1px solid var(--border-soft)", paddingTop: 8 }}>
            <div style={{ ...S.muted, fontSize: 11, marginBottom: 2 }}>Signed in as</div>
            <div style={{ fontSize: 13, color: "var(--text-primary)", wordBreak: "break-all" }}>
              {userEmail || "—"}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
