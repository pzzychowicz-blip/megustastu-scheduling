// src/hooks/useUndoStack.js
// v1.10.0 — Bounded FIFO undo stack for Clear / Generate / Move / Swap.
//
// API:
//   const { stack, push, pop, clear } = useUndoStack();
//
//   stack          : Array<Op>          — newest LAST (top of stack)
//   push(op)       : void               — append; drops the oldest entry once
//                                          length exceeds MAX_DEPTH
//   pop()          : Op | null          — remove + return the newest entry,
//                                          or null when the stack is empty
//   clear()        : void               — reset to empty
//
// Op shape:
//   {
//     id            : string            — for React keys / debug; mintId()
//     label         : string            — human-readable; e.g. "Clear week",
//                                          "Regenerate", "Move", "Swap",
//                                          "Fill empty"
//     timestamp     : number            — Date.now() at push time
//     restoreShifts : Array<shift>      — full shift records to re-upsert on undo
//     removeIds     : Array<string>     — shift ids to delete on undo
//   }
//
// Inverse application is the caller's responsibility (this hook is pure
// state). See ScheduleGrid's handleUndo() for the canonical apply order:
// upsert restoreShifts first, then deleteShift removeIds. Re-using a
// deleted shift id is safe — Firebase RTDB writes to any key.
//
// Persistence: in-memory only. Survives Vite HMR (Fast Refresh preserves
// useState) but resets on hard refresh / tab close. Undo is intentionally
// scoped to "I just did a thing, oops" — not "roll back yesterday."
//
// IMPLEMENTATION NOTE — why the ref mirror:
//   pop() needs to return the latest op AND remove it from the stack in
//   one call. The natural shape is to read prev[prev.length-1] inside a
//   `setStack(prev => ...)` updater, but React 18 batches setState — the
//   updater fires DURING the next render, not synchronously inside the
//   call. A `let popped; setStack(prev => { popped = ...; ... }); return
//   popped;` pattern returns null because the updater hasn't run yet
//   when `return` executes. Mirroring the stack into a ref and updating
//   ref + state together inside push/pop/clear gives pop synchronous
//   access to the latest value. Since every mutation goes through these
//   three functions, the ref never drifts from the state.

import { useCallback, useRef, useState } from "react";

// Cap chosen for the v1.10.0 scope. Five distinct multi-cell ops covers
// typical "oops, undo that" sequences without unbounded growth and
// keeps the nav-bar button's behaviour predictable (older entries drop
// silently — no UI surface advertises the cap).
const MAX_DEPTH = 5;

function mintId() {
  // Lightweight unique id — collision-resistant within a single session
  // is enough; we never persist these.
  return "undo-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

export function useUndoStack() {
  const [stack, setStack] = useState([]);
  // Synchronous mirror of `stack`. Read inside pop() so the returned op
  // reflects the current state regardless of React batching. Every
  // mutation updates the ref BEFORE calling setStack, so renders see
  // the same value the ref holds.
  const stackRef = useRef([]);

  const push = useCallback(function (op) {
    if (!op) return;
    const normalized = {
      id: op.id || mintId(),
      label: op.label || "Action",
      timestamp: typeof op.timestamp === "number" ? op.timestamp : Date.now(),
      restoreShifts: Array.isArray(op.restoreShifts) ? op.restoreShifts : [],
      removeIds: Array.isArray(op.removeIds) ? op.removeIds : [],
    };
    const current = stackRef.current;
    const next = current.concat([normalized]);
    // Drop oldest until cap satisfied. Loop (not slice) so a future
    // bump in MAX_DEPTH never silently loses ordering invariants.
    while (next.length > MAX_DEPTH) next.shift();
    stackRef.current = next;
    setStack(next);
  }, []);

  const pop = useCallback(function () {
    const current = stackRef.current;
    if (current.length === 0) return null;
    const popped = current[current.length - 1];
    const next = current.slice(0, -1);
    stackRef.current = next;
    setStack(next);
    return popped;
  }, []);

  const clear = useCallback(function () {
    stackRef.current = [];
    setStack([]);
  }, []);

  return { stack: stack, push: push, pop: pop, clear: clear };
}
