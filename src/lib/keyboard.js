// src/lib/keyboard.js
// v15.3.0: shared keyboard-shortcut helpers. Pure JS, no React/Firebase.
//
// Two consumers attach global `keydown` listeners — <AppShell> (tab digits
// 1–4, `?` help overlay) and <ScheduleGrid> (week nav, schedule actions,
// Esc). Both gate on the same three conditions, so the predicates live here
// to keep one definition. A third use is the per-modal Enter-to-confirm
// guard (`shouldSubmitOnEnter`).

// True when the event target is a text-entry surface — typing there must
// never trigger single-letter app shortcuts. Covers INPUT, TEXTAREA, SELECT
// and any contentEditable host (defensive; the app has none today).
export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}

// True when ANY modal is open. Every modal renders through the <Overlay>
// atom, whose backdrop carries a `data-mgt-overlay` attribute (v15.3.0).
// A single DOM probe lets the cross-component handlers bail without sharing
// state — cheaper and simpler than a module-level counter, and immune to
// hook-ordering concerns in Overlay.
export function isAnyOverlayOpen() {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector("[data-mgt-overlay]"));
}

// True when a bare Enter (no modifier) should fire a modal's primary action.
// Skipped for:
//   - modifier combos (Cmd/Ctrl/Alt/Shift + Enter) — left to the browser;
//   - TEXTAREA — Enter inserts a newline (e.g. the Notes field);
//   - BUTTON / SELECT — a focused control owns its own Enter, so firing the
//     modal's primary action too would double-handle (e.g. Enter on a
//     focused Cancel button must Cancel, not Save).
export function shouldSubmitOnEnter(e) {
  if (!e || e.key !== "Enter") return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  const el = e.target;
  if (el) {
    const tag = el.tagName;
    if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "SELECT") return false;
    if (el.isContentEditable) return false;
  }
  return true;
}
