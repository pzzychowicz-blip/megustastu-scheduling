// src/hooks/useEnterSubmit.js
// v15.3.0: Enter-to-confirm for modals with a single clear primary action.
//
// While `open`, a bare Enter (not in a textarea / button / select — see
// shouldSubmitOnEnter) fires `onSubmit`, but only when `canSubmit` is true so
// it respects the same validation/disabled gate as the primary button. The
// listener sits on `document` (not a wrapper's onKeyDown) so it works even
// when focus is on the backdrop or a non-form element — matching the Esc
// pattern used by ShortcutsModal / ConnectionStatus popovers.
//
// Used by ShiftFormModal, EmployeeFormModal, RequestFormModal,
// ExportWarningModal. NOT used by GenerateConfirmModal (two primaries) or
// ClearConfirmModal (needs a scope picked first).

import { useEffect } from "react";
import { shouldSubmitOnEnter } from "../lib/keyboard.js";

export function useEnterSubmit(open, canSubmit, onSubmit) {
  useEffect(function () {
    if (!open) return undefined;
    function onKey(e) {
      if (!shouldSubmitOnEnter(e)) return;
      if (!canSubmit) return;
      e.preventDefault();
      if (onSubmit) onSubmit();
    }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, [open, canSubmit, onSubmit]);
}
