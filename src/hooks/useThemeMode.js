// src/hooks/useThemeMode.js
// v0.11.0: dark/light mode resolver.
//
// One hook, one job: take an `explicitPref` (true | false | undefined) and:
//   1. Write `document.documentElement.dataset.theme = "dark" | "light"`
//      so the CSS `[data-theme="dark"]` overrides in index.html activate.
//   2. Return the resolved `isDark` boolean so the caller can pass it
//      down to a Settings Toggle (for the "what is currently applied"
//      checked-state).
//
// Resolution rules:
//   - explicitPref === true   → dark
//   - explicitPref === false  → light
//   - explicitPref === undefined → follow `prefers-color-scheme: dark`
//     (and listen for OS-level changes so the app reacts live)
//
// Mount this in AppShell (which has access to settings.darkMode). The
// LoginScreen does NOT mount it — its initial paint comes from the inline
// no-flash script in index.html. Edge case: if the user changes their
// OS theme while sitting on the LoginScreen, the page won't react until
// they sign in. Acceptable for a manager-only app.

import { useEffect, useState } from "react";

export function useThemeMode(explicitPref) {
  // Initial state mirrors the same resolution the effect does. This avoids
  // a brief mismatch between the rendered Toggle state and the DOM theme
  // attribute on the first render.
  const [isDark, setIsDark] = useState(function () {
    if (explicitPref === true) return true;
    if (explicitPref === false) return false;
    if (typeof window === "undefined") return false;
    if (!window.matchMedia) return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(function () {
    function apply(dark) {
      setIsDark(dark);
      document.documentElement.dataset.theme = dark ? "dark" : "light";
    }

    // Explicit override — write the value, don't listen for OS changes.
    if (explicitPref === true || explicitPref === false) {
      apply(explicitPref);
      return;
    }

    // Follow system. Subscribe to OS-level theme changes so the app stays
    // in sync if the user flips their system dark mode mid-session.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    apply(mq.matches);
    function onChange(e) { apply(e.matches); }
    mq.addEventListener("change", onChange);
    return function () { mq.removeEventListener("change", onChange); };
  }, [explicitPref]);

  return isDark;
}
