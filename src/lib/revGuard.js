// src/lib/revGuard.js
// v16.0.0 — revision compare-and-swap for whole-node singletons.
//
// Ported from MGT Bookings' `revGuard.js` (v15.3.0 there), which exists
// because of the 2026-07-05 incident in that app: a laptop asleep at home
// woke and wrote its stale snapshot over a night of edits made on the
// tablet. A timestamp cannot catch that — a stale device stamps its write
// with its current wall clock, which is always newer. The only thing that
// proves a write was based on what it is overwriting is a counter the
// writer has to have SEEN.
//
// THE MECHANISM
// Each guarded node gets an integer sibling, `<name>Rev`. Every write is a
// single atomic root `update()` carrying BOTH the node and its next rev:
//
//     update(ref(db), { settings: {...}, settingsRev: base + 1 })
//
// The database rule on `<name>Rev` accepts the write only when the incoming
// value is exactly `stored + 1` (or 1 when the node is new). A device whose
// `base` is behind sends a rev the server has already passed, and the whole
// atomic update is rejected — node included. The SDK's rollback echo then
// restores that device's local state to server truth.
//
// WHY ONLY SINGLETONS
// This app's other four paths (`employees`, `shifts`, `requests`,
// `configRevisions`) are KEYED COLLECTIONS written one child at a time —
// `set("shifts/{id}", record)`, never `set("shifts", {...})`. Two writers
// touching different records write disjoint paths and the database merges
// them, so there is no whole-node race for a rev to protect. (Bookings
// reached the same conclusion for `/bookings/{id}` and guards those with a
// per-child `updatedAt`/`baseUpdatedAt` pair instead — a separate mechanism
// this app has no field for yet.) `settings` and `shiftTemplate` are the
// only nodes here written as a whole object, so they are the only ones that
// can be clobbered wholesale.
//
// This file is PURE — no Firebase import, per the `src/lib/` rule in
// CLAUDE.md. It builds the update payload; `usePersistence` applies it.

// The sibling key for a guarded node. One definition, because the app and
// the database rules have to agree on it exactly and a typo here would
// silently produce an unguarded write that the rules then reject.
export function revKeyFor(path) {
  return path + "Rev";
}

// Build the atomic root-update payload for a guarded whole-node write.
//
//   path    — top-level node name ("settings" / "shiftTemplate")
//   value   — the complete new value for that node
//   baseRev — the rev this write is based on: the last value the writer
//             saw from the server. 0 / null / undefined / a non-number all
//             mean "no rev stored yet", which produces 1 — matching the
//             rule's `data.exists() ? … : newData.val() === 1` branch.
//
// Returns an object keyed by ROOT-RELATIVE paths, which is what a root
// `update()` wants. Both keys land in one transaction, so the rev can never
// advance without the node it describes.
export function buildRevUpdate(path, value, baseRev) {
  const base = Number.isFinite(baseRev) && baseRev > 0 ? baseRev : 0;
  const next = base + 1;
  const payload = {};
  payload[path] = value;
  payload[revKeyFor(path)] = next;
  return { payload: payload, nextRev: next };
}
