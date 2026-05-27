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
//
// SPIKE NOTE — `USE_GLASS` toggle (Liquid Glass v2): localStorage-backed
// boolean flag. A small floating capsule chip top-right of the viewport
// lets the manager flip between Classic (production v1.13.0) and Glass
// (the spike redesign) instantly. The toggle re-renders the tree with
// glass-variant components routed via `<AppShell useGlass={...}/>` +
// `<LoginScreen.glass>`. ALL spike-only behaviour gates on this flag —
// when it's false, the app is byte-identical to production. The chip
// itself uses no glass tokens (so it's reachable even when something
// in the glass tree breaks) and lives in this file rather than
// AppShell because it must be visible on the login screen too.

import { useEffect, useState } from "react";
import { S } from "./lib/constants.js";
import { useAuth } from "./hooks/useAuth.js";
import { useWinW } from "./hooks/useWinW.js";
import LoginScreen from "./components/LoginScreen.jsx";
import LoginScreenGlass from "./components/LoginScreen.glass.jsx";
import AppShell from "./components/AppShell.jsx";
import { LensFilterDefs } from "./components/atoms.glass.jsx";

// ── App signature ────────────────────────────────────────────────────────
export const __APP_SIGNATURE__ = Object.freeze({
  version: "1.13.0",
  build: "2026-05-27",
  sha: "fairness-panel-highlight-deltabar-drilldown-glass-spike-v2",
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

// ── USE_GLASS toggle (SPIKE-ONLY) ────────────────────────────────────────
// Reads from localStorage on mount; defaults to false (production).
// localStorage (not sessionStorage) because the spike preference should
// survive a browser tab close — the manager wants the same mode they
// were exploring last time.
const USE_GLASS_KEY = "mgt-sched.useGlass";

function readUseGlass() {
  try {
    return localStorage.getItem(USE_GLASS_KEY) === "true";
  } catch (_e) {
    return false;
  }
}

function writeUseGlass(value) {
  try {
    localStorage.setItem(USE_GLASS_KEY, value ? "true" : "false");
  } catch (_e) {
    /* Safari private mode swallows */
  }
}

// ── App ──────────────────────────────────────────────────────────────────
export default function App() {
  const auth = useAuth();
  const w = useWinW();
  const isMobile = w < 768;
  const [useGlass, setUseGlass] = useState(readUseGlass);

  useEffect(function () {
    logBootBanner();
    if (useGlass) {
      console.log(
        "%c[liquid-glass] Spike active — toggle off via the floating chip top-right.",
        "color:#007AFF;font-weight:bold;"
      );
    }
  }, [useGlass]);

  function toggleGlass() {
    setUseGlass(function (cur) {
      const next = !cur;
      writeUseGlass(next);
      return next;
    });
  }

  // ── Glass-mode chip ────────────────────────────────────────────────────
  // Fixed top-right, never overlaps content. Solid (no glass tokens) so
  // the affordance is always reachable. The label updates to advertise
  // the CURRENT mode (so click = switch to the other one).
  const glassChip = (
    <button
      type="button"
      onClick={toggleGlass}
      title={useGlass ? "Switch to classic v1.13.0 visuals" : "Try the Liquid Glass spike"}
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        zIndex: 9999,
        padding: "6px 12px",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        background: useGlass ? "#007AFF" : "rgba(255,255,255,0.92)",
        color: useGlass ? "#ffffff" : "#1c1c1e",
        border: "1px solid " + (useGlass ? "#0064d1" : "rgba(0,0,0,0.12)"),
        borderRadius: 999,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {useGlass ? "✦ Glass" : "Classic"}
    </button>
  );

  // ── State 1: auth not yet resolved → minimal loading splash. ────────────
  if (!auth.ready) {
    return (
      <>
        {useGlass ? <LensFilterDefs /> : null}
        {glassChip}
        <div style={S.appShell}>
          <div style={S.card}>
            <p style={S.muted}>Loading…</p>
          </div>
        </div>
      </>
    );
  }

  // ── State 2: not signed in → login form. ────────────────────────────────
  if (!auth.user) {
    const Login = useGlass ? LoginScreenGlass : LoginScreen;
    return (
      <>
        {useGlass ? <LensFilterDefs /> : null}
        {glassChip}
        <Login
          signIn={auth.signIn}
          busy={auth.busy}
          error={auth.error}
          isMobile={isMobile}
        />
      </>
    );
  }

  // ── State 3: signed in → AppShell owns persistence + feature UI. ───────
  return (
    <>
      {useGlass ? <LensFilterDefs /> : null}
      {glassChip}
      <AppShell
        user={auth.user}
        signOut={auth.signOut}
        isMobile={isMobile}
        appVersion={__APP_SIGNATURE__.version}
        useGlass={useGlass}
      />
    </>
  );
}
