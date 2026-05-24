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

import { useCallback, useState } from "react";

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

  const push = useCallback(function (op) {
    if (!op) return;
    const normalized = {
      id: op.id || mintId(),
      label: op.label || "Action",
      timestamp: typeof op.timestamp === "number" ? op.timestamp : Date.now(),
      restoreShifts: Array.isArray(op.restoreShifts) ? op.restoreShifts : [],
      removeIds: Array.isArray(op.removeIds) ? op.removeIds : [],
    };
    setStack(function (prev) {
      const next = prev.concat([normalized]);
      // Drop oldest until cap satisfied. Loop (not slice) so a future
      // bump in MAX_DEPTH never silently loses ordering invariants.
      while (next.length > MAX_DEPTH) next.shift();
      return next;
    });
  }, []);

  // Pop returns the latest op AND drops it from the stack in one shot.
  // We use a ref-style trick via a synchronous read of the current state
  // inside the setter so the returned op matches what got removed even
  // under React 18 batching.
  const pop = useCallback(function () {
    let popped = null;
    setStack(function (prev) {
      if (prev.length === 0) return prev;
      popped = prev[prev.length - 1];
      return prev.slice(0, -1);
    });
    return popped;
  }, []);

  const clear = useCallback(function () {
    setStack([]);
  }, []);

  return { stack: stack, push: push, pop: pop, clear: clear };
}
