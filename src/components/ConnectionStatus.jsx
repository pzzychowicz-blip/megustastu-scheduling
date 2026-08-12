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
// v16.0.0 — THREE states, not two. `connected === false` used to cover both
// "we haven't confirmed a connection yet" and "the connection dropped", so
// the dot flashed RED on every page load before settling green. The new
// `hasConnected` latch from useFirebaseConnection separates them, and the
// pre-first-connect window now reads as amber "Connecting…".
//
// v16.0.0 — anchor-side fix, ported from MGT Bookings v16.2.0, whose source
// flags this exact bug: "NB Scheduling's copy has the same latent bug —
// port this fix on its next touch." The anchor side is now MEASURED at open
// time instead of guessed from `isMobile`. The dot's x position depends on
// header flex-wrap, not on viewport width, so a left-anchored popover from a
// right-edge dot ran off-screen at ~599px (isMobile true, header unwrapped).
// Prefer right-anchoring (grows leftward, the desktop look) and flip to
// left-anchoring only when there is no room on the left.
//
// Props:
//   connected     (bool)   — from useFirebaseConnection()
//   hasConnected  (bool)   — from useFirebaseConnection(); latches on first connect
//   userEmail     (string) — currently signed-in user's email

import { useEffect, useRef, useState } from "react";
import { R, S } from "../lib/constants.js";

// Rendered popover width: minWidth 220 + 2×12 padding + 2×1 border.
const POPOVER_W = 246;

export default function ConnectionStatus({ connected, hasConnected, userEmail }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(true);
  const wrapRef = useRef(null);

  function toggleOpen() {
    const node = wrapRef.current;
    if (node) {
      const r = node.getBoundingClientRect();
      // A right-anchored popover spans [r.right − POPOVER_W, r.right]. Keep
      // that unless it would run past the left viewport edge (8px margin).
      setAlignRight(r.right - POPOVER_W >= 8);
    }
    setOpen(function (v) { return !v; });
  }

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

  // "connecting" is only the pre-first-connect window; once we've been up,
  // a drop is a genuine outage and reads red.
  const state = connected
    ? "connected"
    : (hasConnected ? "offline" : "connecting");

  const dotColor = "var(--status-" + (state === "connected" ? "online" : state) + ")";
  const glowColor = "var(--status-" + (state === "connected" ? "online" : state) + "-glow)";

  const statusText = state === "connected"
    ? "Connected"
    : (state === "connecting" ? "Connecting…" : "Connection lost");

  const statusBlurb = state === "connected"
    ? "Realtime Database is connected."
    : (state === "connecting"
      ? "Establishing the connection to the Realtime Database…"
      : "Lost connection to the Realtime Database. Changes will sync when it reconnects.");

  const title = state === "connected"
    ? "Connected to Firebase"
    : (state === "connecting" ? "Connecting to Firebase…" : "Firebase connection lost");

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        className="mgt-hover-scale mgt-press"
        onClick={toggleOpen}
        title={title}
        aria-label={title}
        style={{
          appearance: "none",
          border: "none",
          background: "transparent",
          // v16.0.0: the hover rule paints an opaque --bg-hover-card behind
          // whatever it lifts, so this button needs its own radius or the
          // hover card renders as a hard-edged rectangle around a round dot.
          borderRadius: R.pill,
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
            boxShadow: "0 0 0 3px " + glowColor,
          }}
        />
      </button>

      {open ? (
        <div
          className="mgt-fade-in"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: alignRight ? 0 : "auto",
            left: alignRight ? "auto" : 0,
            zIndex: 30,
            minWidth: 220,
            padding: 12,
            background: "var(--bg-overlay-sheet)",
            border: "1px solid var(--border-card)",
            borderRadius: R.sheet,
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
            {statusBlurb}
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
