// src/hooks/useWinW.js
// Tracks the viewport width via a resize listener.
// Pure logic — no JSX — so .js is the correct extension.
//
// Usage:
//   const w = useWinW();
//   const isMobile = w < 768;
//
// Threshold is decided AT THE CALL SITE so different components can
// pick different breakpoints if needed. Matches Bookings convention.

import { useEffect, useState } from "react";

// Single safe initial read — guards against SSR (we don't SSR, but
// keeps the function defensive).
function readWidth() {
  return typeof window !== "undefined" ? window.innerWidth : 1024;
}

export function useWinW() {
  const [w, setW] = useState(readWidth);

  useEffect(function () {
    function onResize() {
      setW(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    // Run once on mount in case the initial value drifted (e.g. devtools open).
    onResize();
    return function cleanup() {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return w;
}
