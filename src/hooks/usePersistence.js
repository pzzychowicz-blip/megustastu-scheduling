// src/hooks/usePersistence.js
// Firebase Realtime Database plumbing for all five app paths:
//
//   /employees/{id}     — keyed collection
//   /shifts/{id}        — keyed collection
//   /requests/{id}      — keyed collection
//   /shiftTemplate      — singleton (null if never customized)
//   /settings           — singleton (null if never customized)
//
// API:
//   const { data, ready, writeWarning, clearWriteWarning, actions } = usePersistence();
//
//   data.employees     : { [id]: employee }
//   data.shifts        : { [id]: shift }
//   data.requests      : { [id]: request }
//   data.shiftTemplate : object | null   ← null means "never customized"
//   data.settings      : object | null   ← null means "never customized"
//
//   ready              : boolean — true once all five paths have completed
//                                  their first onValue callback. Consumers
//                                  should render a loading state until then.
//
//   writeWarning       : string | null — non-null when a write was refused
//                                        by a safety guard. Show as a banner.
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
import { ref, onValue, set, remove, push } from "firebase/database";
import { db } from "../firebase.js";

// ── Path metadata ────────────────────────────────────────────────────────
const COLLECTION_PATHS = ["employees", "shifts", "requests"];
const SINGLETON_PATHS = ["shiftTemplate", "settings"];
const ALL_PATHS = [...COLLECTION_PATHS, ...SINGLETON_PATHS];

export function usePersistence() {
  // ── State slices ───────────────────────────────────────────────────────
  const [employees, setEmployees] = useState({});
  const [shifts, setShifts] = useState({});
  const [requests, setRequests] = useState({});
  const [shiftTemplate, setShiftTemplate] = useState(null);
  const [settings, setSettings] = useState(null);

  const [readyMap, setReadyMap] = useState({});
  const [writeWarning, setWriteWarning] = useState(null);

  // ── Loaded refs (write-guard prerequisites) ────────────────────────────
  const employeesLoaded = useRef(false);
  const shiftsLoaded = useRef(false);
  const requestsLoaded = useRef(false);
  const templateLoaded = useRef(false);
  const settingsLoaded = useRef(false);

  // Map path string → loaded ref, for lookup inside helpers.
  const loadedRefByPath = {
    employees: employeesLoaded,
    shifts: shiftsLoaded,
    requests: requestsLoaded,
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

    function subscribeSingleton(path, setter, loadedRef) {
      const unsub = onValue(ref(db, path), function (snap) {
        if (!mounted.current) return;
        setter(snap.val());  // null is valid for singletons
        if (!loadedRef.current) {
          loadedRef.current = true;
          setReadyMap(function (prev) { return { ...prev, [path]: true }; });
        }
      }, function (err) {
        console.warn("[persistence] onValue error at", path, err && err.code, err && err.message);
      });
      unsubs.push(unsub);
    }

    subscribeCollection("employees", setEmployees, employeesLoaded);
    subscribeCollection("shifts", setShifts, shiftsLoaded);
    subscribeCollection("requests", setRequests, requestsLoaded);
    subscribeSingleton("shiftTemplate", setShiftTemplate, templateLoaded);
    subscribeSingleton("settings", setSettings, settingsLoaded);

    return function cleanup() {
      mounted.current = false;
      unsubs.forEach(function (u) { u(); });
    };
  }, []);

  // ── Composite ready flag ───────────────────────────────────────────────
  const ready = ALL_PATHS.every(function (p) { return readyMap[p] === true; });

  // ── Write-guard helper ─────────────────────────────────────────────────
  function refuseUnlessLoaded(path, isSilent, reason) {
    const loadedRef = loadedRefByPath[path];
    if (!loadedRef.current) {
      console.warn("[SAFE] Refused to write " + path + " — initial read not complete.");
      if (!isSilent) setWriteWarning(reason || "Cannot save — data still loading. Try again in a moment.");
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

  function upsertCollection(path, record, isSilent) {
    if (!refuseUnlessLoaded(path, isSilent)) return null;
    const id = (record && record.id) ? record.id : push(ref(db, path)).key;
    const next = { ...record, id };
    set(ref(db, path + "/" + id), next).catch(function (err) {
      console.warn("[persistence] write failed", path, id, err && err.code);
    });
    return id;
  }

  function deleteFromCollection(path, id, isSilent) {
    if (!refuseUnlessLoaded(path, isSilent)) return;
    if (!id) return;
    remove(ref(db, path + "/" + id)).catch(function (err) {
      console.warn("[persistence] delete failed", path, id, err && err.code);
    });
  }

  const upsertEmployee = function (record, isSilent) { return upsertCollection("employees", record, isSilent); };
  const deleteEmployee = function (id, isSilent)     { return deleteFromCollection("employees", id, isSilent); };
  const upsertShift    = function (record, isSilent) { return upsertCollection("shifts", record, isSilent); };
  const deleteShift    = function (id, isSilent)     { return deleteFromCollection("shifts", id, isSilent); };
  const upsertRequest  = function (record, isSilent) { return upsertCollection("requests", record, isSilent); };
  const deleteRequest  = function (id, isSilent)     { return deleteFromCollection("requests", id, isSilent); };

  // ── Singletons: shiftTemplate / settings ───────────────────────────────
  // Singletons are object-replace. Empty-object writes are refused — that's
  // almost certainly an accidental wipe, not a user-intended "reset to nothing."

  function saveSingleton(path, value, isSilent) {
    if (!refuseUnlessLoaded(path, isSilent)) return;
    if (!value || (typeof value === "object" && Object.keys(value).length === 0)) {
      console.warn("[SAFE] Refused to write empty " + path + ".");
      if (!isSilent) setWriteWarning("Refused to save empty " + path + ".");
      return;
    }
    set(ref(db, path), value).catch(function (err) {
      console.warn("[persistence] write failed", path, err && err.code);
    });
  }

  const saveShiftTemplate = function (tpl, isSilent) { saveSingleton("shiftTemplate", tpl, isSilent); };
  const saveSettings      = function (s, isSilent)   { saveSingleton("settings", s, isSilent); };

  function clearWriteWarning() {
    setWriteWarning(null);
  }

  return {
    data: { employees, shifts, requests, shiftTemplate, settings },
    ready,
    writeWarning,
    clearWriteWarning,
    actions: {
      upsertEmployee, deleteEmployee,
      upsertShift, deleteShift,
      upsertRequest, deleteRequest,
      saveShiftTemplate, saveSettings,
    },
  };
}
