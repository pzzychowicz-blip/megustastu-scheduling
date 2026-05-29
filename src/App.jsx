/**
 * Me Gustas Tú — Staff Scheduling System
 * Copyright © 2026 Patryk Zychowicz. All rights reserved.
 *
 * This source code is proprietary and confidential.
 * Unauthorized copying, distribution, modification, or use
 * is strictly prohibited. See the LICENSE file in the repo root.
 *
 * Author:  Patryk Zychowicz
 * Contact: pz.zychowicz@gmail.com
 */
// src/App.jsx
// Orchestration layer. Three top-level states:
//   1. !auth.ready          → loading splash (auth state hasn't resolved yet)
//   2. !auth.user           → <LoginScreen />
//   3. auth.user            → <AppShell /> (owns persistence + feature UI)
//
// Keeping persistence OUT of this file is deliberate: the auth gate must
// render without ever subscribing to Firebase data. AppShell mounts only
// after sign-in, which means usePersistence() never fires for an
// unauthenticated session.
//
// __APP_SIGNATURE__ is the SINGLE source of truth for version, build, sha.
// Schema: MAJOR.MINOR.PATCH. Bump patch on every meaningful change.

import { useEffect } from "react";
import { S } from "./lib/constants.js";
import { useAuth } from "./hooks/useAuth.js";
import { useWinW } from "./hooks/useWinW.js";
import LoginScreen from "./components/LoginScreen.jsx";
import AppShell from "./components/AppShell.jsx";

// ── App signature ────────────────────────────────────────────────────────
// v1.14.0: extended with author / contact / copyright / license fields
// alongside the existing version / build / sha. Module-level identity
// record; the strings below remain readable in any deployed bundle
// (bundler can't tree-shake — referenced by the boot banner below).
// Forensic evidence of origin if this code appears in an unauthorized
// deployment. Mirrors MGT Bookings' __APP_SIGNATURE__ structure.
export const __APP_SIGNATURE__ = Object.freeze({
  app: "Me Gustas Tú Staff Scheduling System",
  version: "1.15.0",
  build: "2026-05-28",
  sha: "per-employee-avg-shift-hours-modal-scroll",
  author: "Patryk Zychowicz",
  contact: "pz.zychowicz@gmail.com",
  copyright: "© 2026 Patryk Zychowicz. All rights reserved.",
  license: "Proprietary — All rights reserved. See LICENSE.",
});

// Expose for DevTools / debugging.
if (typeof window !== "undefined") {
  window.__MGT_SCHED_BUILD__ = __APP_SIGNATURE__;
}

// ── Boot banner ──────────────────────────────────────────────────────────
// v1.14.0: extended with two extra lines (copyright + unauthorized-use
// notice). Visible to anyone opening DevTools. Mirrors the three-line
// pattern from MGT Bookings.
function logBootBanner() {
  const sig = __APP_SIGNATURE__;
  console.log(
    "%c[mgt-sched] v" + sig.version + " (" + sig.build + " · " + sig.sha + ")",
    "background:#007AFF;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;"
  );
  console.log(
    "%c" + sig.copyright,
    "color:#9ca3af;font-size:13px;font-family:Menlo,Monaco,Consolas,monospace;"
  );
  console.log(
    "%cUnauthorized use, copying, redistribution, or modification is prohibited.",
    "color:#9ca3af;font-size:12px;font-family:Menlo,Monaco,Consolas,monospace;"
  );
}

// ── App ──────────────────────────────────────────────────────────────────
export default function App() {
  const auth = useAuth();
  const w = useWinW();
  const isMobile = w < 768;

  useEffect(function () {
    logBootBanner();
  }, []);

  // State 1: auth not yet resolved → minimal loading splash.
  if (!auth.ready) {
    return (
      <div style={S.appShell}>
        <div style={S.card}>
          <p style={S.muted}>Loading…</p>
        </div>
      </div>
    );
  }

  // State 2: not signed in → login form.
  if (!auth.user) {
    return (
      <LoginScreen
        signIn={auth.signIn}
        busy={auth.busy}
        error={auth.error}
        isMobile={isMobile}
      />
    );
  }

  // State 3: signed in → AppShell owns persistence + feature UI.
  return (
    <AppShell
      user={auth.user}
      signOut={auth.signOut}
      isMobile={isMobile}
      appVersion={__APP_SIGNATURE__.version}
    />
  );
}
