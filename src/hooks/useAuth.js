// src/hooks/useAuth.js
// Manager-only auth gate.
//
// Returns { user, ready, busy, error, signIn, signOut }.
//
//   - user   : Firebase User object or null.
//   - ready  : false until the first onAuthStateChanged callback fires.
//              Render a loading state until ready === true; otherwise
//              child components may briefly see user === null on a
//              session that's actually valid (auth-persistence rehydrate
//              is async).
//   - busy   : true while signIn / signOut is in flight.
//   - error  : last sign-in error string, or null.
//   - signIn : (email, password) => Promise<void>
//   - signOut: () => Promise<void>
//
// No role resolution. This app is manager-only — if you're signed in,
// you're the manager. Database Rules enforce "authenticated == true".

import { useEffect, useRef, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from "firebase/auth";
import { auth } from "../firebase.js";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Track mount status so async handlers don't setState after unmount.
  // IMPORTANT: must be re-set to true on every effect run, not just on
  // useRef init — React 18 StrictMode double-invokes effects in dev,
  // and the first cleanup would otherwise leave this stuck at false
  // for the lifetime of the component.
  const mounted = useRef(true);

  // ── Subscribe to auth state ────────────────────────────────────────────
  useEffect(function () {
    mounted.current = true;
    const unsubscribe = onAuthStateChanged(auth, function (u) {
      if (!mounted.current) return;
      setUser(u || null);
      setReady(true);
    });
    return function cleanup() {
      mounted.current = false;
      unsubscribe();
    };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────
  async function signIn(email, password) {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // user state will update via onAuthStateChanged.
    } catch (e) {
      // Firebase error codes are technical; surface a friendlier message
      // but log the raw code for debugging.
      console.warn("[auth] signIn error", e && e.code, e && e.message);
      setError(prettifyAuthError(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await fbSignOut(auth);
    } catch (e) {
      console.warn("[auth] signOut error", e && e.code, e && e.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return { user, ready, busy, error, signIn, signOut };
}

// ── Helpers ──────────────────────────────────────────────────────────────
function prettifyAuthError(e) {
  const code = e && e.code ? e.code : "";
  if (code === "auth/invalid-email") return "That email address doesn't look right.";
  if (code === "auth/user-disabled") return "This account is disabled.";
  if (code === "auth/user-not-found") return "No account with that email.";
  if (code === "auth/wrong-password") return "Wrong password.";
  if (code === "auth/invalid-credential") return "Wrong email or password.";
  if (code === "auth/too-many-requests") return "Too many attempts — try again in a minute.";
  if (code === "auth/network-request-failed") return "Network error — check your connection.";
  return "Sign-in failed. Please try again.";
}
