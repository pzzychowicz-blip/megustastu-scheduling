// src/App.jsx
// Orchestration layer + stub UI for v0.1.0 scaffold.
// Feature components land here in session 2.
//
// __APP_SIGNATURE__ is the SINGLE source of truth for version, build, sha.
// It propagates to:
//   - console boot banner (below)
//   - window.__MGT_SCHED_BUILD__ (for DevTools inspection)
//   - Settings → General label (when Settings component exists)
//
// Schema: MAJOR.MINOR.PATCH. Bump patch on every meaningful change.

import { useEffect } from "react";
import { S } from "./lib/constants.js";

// ── App signature ────────────────────────────────────────────────────────
export const __APP_SIGNATURE__ = Object.freeze({
  version: "0.1.0",
  build: "2026-05-12",
  sha: "scaffold",
});

// Expose for DevTools / debugging.
if (typeof window !== "undefined") {
  window.__MGT_SCHED_BUILD__ = __APP_SIGNATURE__;
}

// ── Boot banner ──────────────────────────────────────────────────────────
function logBootBanner() {
  const sig = __APP_SIGNATURE__;
  // Single-line coloured banner. Pairs with firebase.js' PROD/DEV banner.
  console.log(
    "%c[mgt-sched] v" + sig.version + " (" + sig.build + " · " + sig.sha + ")",
    "background:#007AFF;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;"
  );
}

// ── App ──────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(function () {
    logBootBanner();
  }, []);

  return (
    <div style={S.appShell}>
      <div style={S.card}>
        <h1 style={S.h1}>Me Gustas Tú — Staff Scheduling</h1>
        <p style={S.muted}>v{__APP_SIGNATURE__.version} · scaffold</p>
        <p style={S.body}>
          Session-1 scaffold. Feature components (schedule grid, employee form,
          requests, export) land in session 2.
        </p>
      </div>
    </div>
  );
}
