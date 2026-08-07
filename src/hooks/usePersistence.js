// src/hooks/usePersistence.js
// Firebase Realtime Database plumbing for all six app paths:
//
//   /employees/{id}       — keyed collection
//   /shifts/{id}          — keyed collection
//   /requests/{id}        — keyed collection
//   /configRevisions/{id} — keyed collection (v15.1.0 — effective-dated
//                           openingDays / shiftTemplate revisions; see
//                           resolveConfigForWeek in schedule-logic.js)
//   /shiftTemplate        — singleton (null if never customized)
//   /settings             — singleton (null if never customized)
//
// Plus two integers the app writes but never reads into state:
//
//   /shiftTemplateRev     — revision counter for the singleton beside it
//   /settingsRev          — ditto (v16.0.0; see src/lib/revGuard.js)
//
// API:
//   const { data, ready, writeWarning, clearWriteWarning, actions } = usePersistence();
//
//   data.employees       : { [id]: employee }
//   data.shifts          : { [id]: shift }
//   data.requests        : { [id]: request }
//   data.configRevisions : { [id]: revision }
//   data.shiftTemplate   : object | null   ← null means "never customized"
//   data.settings        : object | null   ← null means "never customized"
//
//   ready              : boolean — true once all six paths have completed
//                                  their first onValue callback. For the two
//                                  singletons that means the node AND its
//                                  rev sibling, since a write needs both.
//
//   writeWarning       : { title, detail } | null — non-null when a write was
//                                  refused, either by a local safety guard or
//                                  by the server. Rendered by <Notice>, which
//                                  reads the two fields at different weights —
//                                  a bare string here renders an empty banner.
//
//   actions            : per-record CRUD helpers. See bottom of file.
//
// SAFETY (MANDATORY PATTERNS — see CLAUDE.md "Critical patterns"):
//
//   1. Write-guard via `loaded` ref per path.
//      Every save/delete bails out unless the initial onValue has fired.
//      Prevents "auto-effect mounts before Firebase loads, then writes
//      stale state over real data."
//
//   2. Per-record CRUD ONLY for collections.
//      We never call `set("employees", {})` — only
//      `set("employees/{id}", record)` and `remove("employees/{id}")`.
//      The wipe-the-collection failure mode is structurally impossible.
//
//   3. Empty-object guard on singletons.
//      `saveShiftTemplate(null)` / `saveSettings(null)` are refused.
//
//   4. `isSilent` parameter.
//      Auto-effects (anything that writes without direct user action)
//      pass isSilent=true to suppress the user-facing banner on refusal.
//      Manual user-initiated writes pass isSilent=false (the default).
//
//   5. StrictMode-safe mounted ref.
//      mounted.current is set true INSIDE the subscription effect, not
//      just via useRef(true) init — React 18 StrictMode double-invokes
//      effects in dev and would otherwise leave the ref stuck at false.

import { useEffect, useRef, useState } from "react";
import { ref, onValue, set, remove, push, update } from "firebase/database";
import { db } from "../firebase.js";
import { buildRevUpdate, revKeyFor } from "../lib/revGuard.js";

// ── Path metadata ────────────────────────────────────────────────────────
const COLLECTION_PATHS = ["employees", "shifts", "requests", "configRevisions"];
const SINGLETON_PATHS = ["shiftTemplate", "settings"];
const ALL_PATHS = [...COLLECTION_PATHS, ...SINGLETON_PATHS];

// v16.0.0 (phase 42): what to call each path when a write to it fails. The
// raw key leaks the database schema into a sentence the manager reads —
// "Couldn't save shiftTemplate" names a node, not a thing they just edited.
const PATH_LABELS = Object.freeze({
  employees: "Employees",
  shifts: "Shifts",
  requests: "Requests",
  configRevisions: "Scheduled changes",
  shiftTemplate: "Shift template",
  settings: "Settings",
});

export function usePersistence() {
  // ── State slices ───────────────────────────────────────────────────────
  const [employees, setEmployees] = useState({});
  const [shifts, setShifts] = useState({});
  const [requests, setRequests] = useState({});
  const [configRevisions, setConfigRevisions] = useState({});
  const [shiftTemplate, setShiftTemplate] = useState(null);
  const [settings, setSettings] = useState(null);

  const [readyMap, setReadyMap] = useState({});
  const [writeWarning, setWriteWarning] = useState(null);

  // ── Loaded refs (write-guard prerequisites) ────────────────────────────
  const employeesLoaded = useRef(false);
  const shiftsLoaded = useRef(false);
  const requestsLoaded = useRef(false);
  const configRevisionsLoaded = useRef(false);
  const templateLoaded = useRef(false);
  const settingsLoaded = useRef(false);

  // ── Revision refs (v16.0.0 — see src/lib/revGuard.js) ──────────────────
  // Last rev this client saw from the server for each guarded singleton.
  // Held in a ref, not state: writes read it synchronously inside event
  // handlers, and a re-render on every echo would be pure noise.
  //
  // Bumped OPTIMISTICALLY at write time, before the server echo lands.
  // That matters here specifically because Settings.jsx auto-saves on an
  // 800ms debounce — flip two toggles in quick succession and the second
  // write can leave before the first one's echo returns. Reading the ref
  // un-bumped would send the same base twice, and the rule would reject
  // the second write as stale even though it isn't. A rejected write's
  // rollback echo resets the ref to server truth, so a wrong optimistic
  // guess self-corrects rather than sticking.
  const settingsRev = useRef(0);
  const templateRev = useRef(0);
  const revRefByPath = {
    settings: settingsRev,
    shiftTemplate: templateRev,
  };

  // Map path string → loaded ref, for lookup inside helpers.
  const loadedRefByPath = {
    employees: employeesLoaded,
    shifts: shiftsLoaded,
    requests: requestsLoaded,
    configRevisions: configRevisionsLoaded,
    shiftTemplate: templateLoaded,
    settings: settingsLoaded,
  };

  // ── Mount tracker (StrictMode-safe — see comment block above) ──────────
  const mounted = useRef(true);

  // ── Subscriptions ──────────────────────────────────────────────────────
  useEffect(function () {
    mounted.current = true;
    const unsubs = [];

    function subscribeCollection(path, setter, loadedRef) {
      const unsub = onValue(ref(db, path), function (snap) {
        if (!mounted.current) return;
        const val = snap.val() || {};
        setter(val);
        if (!loadedRef.current) {
          loadedRef.current = true;
          setReadyMap(function (prev) { return { ...prev, [path]: true }; });
        }
      }, function (err) {
        console.warn("[persistence] onValue error at", path, err && err.code, err && err.message);
      });
      unsubs.push(unsub);
    }

    // v16.0.0: a guarded singleton is TWO subscriptions — the node and its
    // `<name>Rev` sibling — and the path only counts as loaded once BOTH
    // have reported. Gating on both is load-bearing: a write that fires
    // with the node loaded but the rev still unknown would send base 0,
    // i.e. rev 1, and the rule rejects that against any existing rev. The
    // write-guard's "initial read has not completed" refusal now covers
    // the rev too, which is exactly the failure it exists to prevent.
    function subscribeSingleton(path, setter, loadedRef, revRef) {
      let nodeSeen = false;
      let revSeen = false;
      function markLoaded() {
        if (loadedRef.current || !nodeSeen || !revSeen) return;
        loadedRef.current = true;
        setReadyMap(function (prev) { return { ...prev, [path]: true }; });
      }
      const unsubNode = onValue(ref(db, path), function (snap) {
        if (!mounted.current) return;
        setter(snap.val());  // null is valid for singletons
        nodeSeen = true;
        markLoaded();
      }, function (err) {
        console.warn("[persistence] onValue error at", path, err && err.code, err && err.message);
      });
      const revPath = revKeyFor(path);
      const unsubRev = onValue(ref(db, revPath), function (snap) {
        if (!mounted.current) return;
        // Server truth always wins over the optimistic bump — including
        // after a rejected write, where the rollback echo is what puts the
        // ref back in step so the manager's retry can succeed.
        const val = snap.val();
        revRef.current = typeof val === "number" && val > 0 ? val : 0;
        revSeen = true;
        markLoaded();
      }, function (err) {
        console.warn("[persistence] onValue error at", revPath, err && err.code, err && err.message);
      });
      unsubs.push(unsubNode);
      unsubs.push(unsubRev);
    }

    subscribeCollection("employees", setEmployees, employeesLoaded);
    subscribeCollection("shifts", setShifts, shiftsLoaded);
    subscribeCollection("requests", setRequests, requestsLoaded);
    subscribeCollection("configRevisions", setConfigRevisions, configRevisionsLoaded);
    subscribeSingleton("shiftTemplate", setShiftTemplate, templateLoaded, templateRev);
    subscribeSingleton("settings", setSettings, settingsLoaded, settingsRev);

    return function cleanup() {
      mounted.current = false;
      unsubs.forEach(function (u) { u(); });
    };
  }, []);

  // ── Composite ready flag ───────────────────────────────────────────────
  const ready = ALL_PATHS.every(function (p) { return readyMap[p] === true; });

  // ── Write-guard helper ─────────────────────────────────────────────────
  // v16.0.0 (phase 42): `reason` is a `{ title, detail }` object, not a
  // string. It shares the shape `reportWriteError` sets below because
  // <Notice> in AppShell reads `.title` / `.detail` off whatever lands in
  // `writeWarning` — a string leaves both undefined and renders an empty red
  // banner with nothing in it but a Dismiss button, which is the exact
  // opposite of what a write-guard banner is for. No caller passes `reason`
  // today; the parameter stays as the escape hatch it always was.
  function refuseUnlessLoaded(path, isSilent, reason) {
    const loadedRef = loadedRefByPath[path];
    if (!loadedRef.current) {
      console.warn("[SAFE] Refused to write " + path + " — initial read not complete.");
      if (!isSilent) {
        setWriteWarning(reason || {
          title: (PATH_LABELS[path] || path) + " not saved — still loading",
          detail: "The initial read has not completed. Try again in a moment.",
        });
      }
      return false;
    }
    return true;
  }

  // ── Per-record CRUD: employees / shifts / requests ─────────────────────
  // upsertX(record, isSilent=false):
  //   - If record.id is set, overwrites /path/{record.id}.
  //   - If record.id is missing, generates a new push() key and writes there.
  //   - Returns the id used (string) or null if the write was refused.
  //
  // deleteX(id, isSilent=false):
  //   - Removes /path/{id}. No-op if the record doesn't exist.

  // Strip undefined values from an object — Firebase's set() throws
  // synchronously when it encounters undefined ("Function set() called
  // with invalid data. Could not parse object: undefined"), which during
  // v1.8.1 generator runs would skip the GenerateButton's
  // setBusy(false) / setOpen(false) reset and leave the confirm modal
  // stuck on "Working…". null is preserved (Firebase reads it as
  // "remove this field" on the receiving end, which is the intended
  // semantic for clearing fields like employeeId or role).
  function stripUndefined(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const out = {};
    for (const k in obj) {
      if (obj[k] !== undefined) out[k] = obj[k];
    }
    return out;
  }

  // v16.0.0: report a REJECTED write to the user, not just the console.
  //
  // The guards above (1–3) refuse a write before it leaves the browser and
  // surface that in the banner. Nothing did the same for a write the SERVER
  // rejects, which is a worse failure to hide: Firebase RTDB applies `set()`
  // to its local cache immediately and fires the `onValue` listener, so the
  // UI updates — then the server refuses, Firebase rolls the value back and
  // fires `onValue` again. To the user a toggle flips and then silently
  // snaps back about a second later, with nothing on screen to explain it.
  //
  // That is exactly how a Realtime Database RULES problem presented during
  // the v16.0.0 review: every write to /settings returned PERMISSION_DENIED
  // while signed in, and the only evidence anywhere was a console.warn.
  //
  // `isSilent` is honoured the same way the pre-write guards honour it —
  // auto-effects (the eager shiftTemplate migration) must not raise a
  // banner for something the manager did not initiate.
  // v16.0.0 (phase 42): the warning is now `{ title, detail }` rather than one
  // long string, because <Notice> renders the two at different weights. The
  // split is not cosmetic — it forced the copy to separate WHAT failed from
  // WHAT IT MEANS, and in doing so retired the third sentence the old string
  // carried ("This is a Firebase Database Rules problem, not a problem with
  // what you entered"), which was the app reassuring the manager about its own
  // failure. "Database rules rejected the write" states the same fact without
  // the bedside manner.
  function reportWriteError(verb, path, err, isSilent) {
    const code = (err && err.code) ? err.code : "unknown error";
    console.warn("[persistence] " + verb + " failed", path, code);
    if (isSilent) return;
    const denied = String(code).toUpperCase().indexOf("PERMISSION_DENIED") !== -1;
    const what = PATH_LABELS[path] || path;
    setWriteWarning(
      denied
        ? {
          title: what + " not saved — permission denied",
          detail: "Database rules rejected the write. Your change was rolled back.",
        }
        : {
          title: what + " not saved — " + code,
          detail: "Your change was rolled back.",
        }
    );
  }

  function upsertCollection(path, record, isSilent) {
    if (!refuseUnlessLoaded(path, isSilent)) return null;
    const id = (record && record.id) ? record.id : push(ref(db, path)).key;
    const next = stripUndefined({ ...record, id });
    set(ref(db, path + "/" + id), next).catch(function (err) {
      reportWriteError("write", path, err, isSilent);
    });
    return id;
  }

  function deleteFromCollection(path, id, isSilent) {
    if (!refuseUnlessLoaded(path, isSilent)) return;
    if (!id) return;
    remove(ref(db, path + "/" + id)).catch(function (err) {
      reportWriteError("delete", path, err, isSilent);
    });
  }

  const upsertEmployee = function (record, isSilent) { return upsertCollection("employees", record, isSilent); };
  const deleteEmployee = function (id, isSilent)     { return deleteFromCollection("employees", id, isSilent); };
  const upsertShift    = function (record, isSilent) { return upsertCollection("shifts", record, isSilent); };
  const deleteShift    = function (id, isSilent)     { return deleteFromCollection("shifts", id, isSilent); };
  const upsertRequest  = function (record, isSilent) { return upsertCollection("requests", record, isSilent); };
  const deleteRequest  = function (id, isSilent)     { return deleteFromCollection("requests", id, isSilent); };
  // v15.1.0: effective-dated config revisions. Records always carry
  // `effectiveFrom` (ISO Monday) + at least one of openingDays /
  // shiftTemplate — Settings.jsx is responsible for never writing an
  // empty record (collections have no empty-object guard by design).
  const upsertConfigRevision = function (record, isSilent) { return upsertCollection("configRevisions", record, isSilent); };
  const deleteConfigRevision = function (id, isSilent)     { return deleteFromCollection("configRevisions", id, isSilent); };

  // ── Singletons: shiftTemplate / settings ───────────────────────────────
  // Singletons are object-replace. Empty-object writes are refused — that's
  // almost certainly an accidental wipe, not a user-intended "reset to nothing."
  //
  // v16.0.0: object-replace is also the one shape of write that can lose
  // another device's work wholesale, so these two are the app's only
  // revision-guarded nodes. The write is an atomic ROOT update carrying the
  // node and its `<name>Rev` sibling together (see src/lib/revGuard.js);
  // the database rule accepts it only if the rev is exactly stored + 1.
  //
  // `update()` not `set()`, and rooted not scoped to the node, because the
  // rev lives BESIDE the node rather than inside it — scoping to `settings`
  // could not reach `settingsRev`, and two separate writes would let the
  // rev advance without the node (or vice versa) if one half failed.
  //
  // No auto-retry on rejection. A rejection means someone else's write is
  // already in, so the safe move is to show the manager the banner and let
  // them re-apply their change on top of what actually landed — the SDK has
  // already rolled the UI back to server truth by then. (Bookings does
  // resync-and-replay here; it needs to, because two staff members share a
  // tablet and a laptop. This app has one manager.)
  function saveSingleton(path, value, isSilent) {
    if (!refuseUnlessLoaded(path, isSilent)) return;
    if (!value || (typeof value === "object" && Object.keys(value).length === 0)) {
      console.warn("[SAFE] Refused to write empty " + path + ".");
      // Same `{ title, detail }` shape as every other writeWarning — see
      // refuseUnlessLoaded above for why a bare string cannot go here.
      if (!isSilent) {
        setWriteWarning({
          title: (PATH_LABELS[path] || path) + " not saved — empty value refused",
          detail: "Writing this would have wiped the record, so nothing was sent.",
        });
      }
      return;
    }
    const revRef = revRefByPath[path];
    const built = buildRevUpdate(path, value, revRef.current);
    revRef.current = built.nextRev;
    update(ref(db), built.payload).catch(function (err) {
      reportWriteError("write", path, err, isSilent);
    });
  }

  const saveShiftTemplate = function (tpl, isSilent) { saveSingleton("shiftTemplate", tpl, isSilent); };
  const saveSettings      = function (s, isSilent)   { saveSingleton("settings", s, isSilent); };

  function clearWriteWarning() {
    setWriteWarning(null);
  }

  return {
    data: { employees, shifts, requests, configRevisions, shiftTemplate, settings },
    ready,
    writeWarning,
    clearWriteWarning,
    actions: {
      upsertEmployee, deleteEmployee,
      upsertShift, deleteShift,
      upsertRequest, deleteRequest,
      upsertConfigRevision, deleteConfigRevision,
      saveShiftTemplate, saveSettings,
    },
  };
}
