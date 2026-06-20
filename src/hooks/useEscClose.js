// src/hooks/useEscClose.js
// v15.3.0: Esc-to-close for modals — the mirror of useEnterSubmit.
//
// While `open`, a bare Escape (no modifier) calls `onClose`. Document-level
// (not a wrapper's onKeyDown) so it fires regardless of focus, matching the
// Esc handling in ShortcutsModal / the ConnectionStatus + Settings popovers.
// `onClose` already guards `busy` where relevant (GenerateConfirmModal /
// ClearButton), so Esc is a no-op mid-run — matching the disabled Cancel.
//
// Applied to every Overlay modal so Esc cancels globally. ScheduleGrid's own
// Esc chain (swap / jump / pill highlight) yields when any modal is open via
// the isAnyOverlayOpen() guard, so a single Esc closes the modal without also
// touching grid state.

import { useEffect } from "react";

export function useEscClose(open, onClose) {
  useEffect(function () {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key !== "Escape") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (onClose) onClose();
    }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
}
