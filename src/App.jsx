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
export const __APP_SIGNATURE__ = Object.freeze({
  version: "0.10.2",
  build: "2026-05-15",
  sha: "readability-polish",
});

// Expose for DevTools / debugging.
if (typeof window !== "undefined") {
  window.__MGT_SCHED_BUILD__ = __APP_SIGNATURE__;
}

// ── Boot banner ──────────────────────────────────────────────────────────
function logBootBanner() {
  const sig = __APP_SIGNATURE__;
  console.log(
    "%c[mgt-sched] v" + sig.version + " (" + sig.build + " · " + sig.sha + ")",
    "background:#007AFF;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;"
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
