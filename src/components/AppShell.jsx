// src/components/AppShell.jsx
// Authenticated UI shell. Mounted by App.jsx ONLY when the user is signed in.
//
// Responsibilities:
//   - Owns the usePersistence() hook (Firebase reads + write helpers).
//   - Renders a loading state until all five paths have hydrated.
//   - Renders the write-warning banner when a save is refused.
//   - Top-of-card tab nav: Schedule | Employees | Requests | Settings.
//     All four tabs are functional as of v0.5.0.
//
// Props:
//   user      — Firebase User object (from useAuth)
//   signOut   — useAuth().signOut
//   isMobile  — viewport breakpoint flag from App.jsx
//   appVersion— __APP_SIGNATURE__.version string (for the header label)

import { useEffect, useRef, useState } from "react";
import { R, S, BTN } from "../lib/constants.js";
import { usePersistence } from "../hooks/usePersistence.js";
import { useThemeMode } from "../hooks/useThemeMode.js";
import { useFirebaseConnection } from "../hooks/useFirebaseConnection.js";
import {
  isShiftTemplateMigrated,
  materializeShiftTemplate,
} from "../lib/schedule-logic.js";
import { ModalPresence } from "./atoms.jsx";
import EmployeesList from "./EmployeesList.jsx";
import RequestsList from "./RequestsList.jsx";
import ScheduleGrid from "./ScheduleGrid.jsx";
import Settings from "./Settings.jsx";
import ConnectionStatus from "./ConnectionStatus.jsx";
import ShortcutsModal from "./ShortcutsModal.jsx";
import { isTypingTarget, isAnyOverlayOpen } from "../lib/keyboard.js";

// Tab keys + display order. Add new tabs here when they land.
const TABS = [
  { key: "schedule",  label: "Schedule"  },
  { key: "employees", label: "Employees" },
  { key: "requests",  label: "Requests"  },
  { key: "settings",  label: "Settings"  },
];

// v1.5.0: sessionStorage key for the last-open tab. Scoped under
// "mgt-sched.*" so we don't collide with the sister Bookings app if
// they're ever served from the same origin. sessionStorage (not
// localStorage) keeps the persistence intra-tab: refresh / Vite HMR
// keep your place, but a fresh browser tab defaults to Schedule.
const TAB_STORAGE_KEY = "mgt-sched.tab";

function readStoredTab() {
  try {
    const v = sessionStorage.getItem(TAB_STORAGE_KEY);
    if (!v) return "schedule";
    // Defensive: validate against the current TABS list so a stale or
    // hand-edited value can't drive `tab` into an unrenderable state.
    for (let i = 0; i < TABS.length; i++) if (TABS[i].key === v) return v;
    return "schedule";
  } catch (_e) {
    return "schedule";
  }
}

export default function AppShell({ user, signOut, isMobile, appVersion }) {
  const { data, ready, writeWarning, clearWriteWarning, actions } = usePersistence();
  // v1.5.0: lazy initializer reads the last-open tab from sessionStorage.
  // First visit / fresh browser tab → "schedule".
  const [tab, setTab] = useState(readStoredTab);

  // v15.3.0: keyboard-shortcuts help overlay (opened with `?`).
  const [showShortcuts, setShowShortcuts] = useState(false);

  // v1.5.0: persist tab changes within this browser tab.
  useEffect(function () {
    try { sessionStorage.setItem(TAB_STORAGE_KEY, tab); } catch (_e) { /* private-mode safari */ }
  }, [tab]);

  // ── v15.3.0: global keyboard shortcuts (app-wide) ───────────────────────
  // Tab switching (digits 1–4) + the `?` help overlay. Single-key, no
  // modifier — Cmd/Ctrl/Alt combos pass through to the browser/OS. Suppressed
  // while typing in a field and while any modal is open (the latter via the
  // data-mgt-overlay sentinel on the Overlay backdrop). Schedule-specific
  // shortcuts (week nav, Generate/Swap/Undo/Clear/Export, Esc) live in
  // ScheduleGrid; the two handlers never overlap on a key.
  useEffect(function () {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (isAnyOverlayOpen()) return;
      if (e.key === "?") {
        setShowShortcuts(true);
        return;
      }
      if (e.key >= "1" && e.key <= "4") {
        const idx = Number(e.key) - 1;
        if (TABS[idx]) setTab(TABS[idx].key);
      }
    }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }, []);

  // ── v1.10.1: eager /shiftTemplate migration ──────────────────────────────
  // v1.9.0 changed the per-block shape from
  //   { count, start, end, secondPersonStart? }
  // to
  //   { count, times: [{start, end}, ...] }
  // Pre-v1.10.1 docs migrated lazily — only when the manager opened Settings
  // and clicked Save. This effect promotes the migration to "once per session,
  // automatically." After persistence reports ready, if the live template is
  // non-null and still in (any flavour of) legacy shape, we materialise the
  // canonical form via `materializeShiftTemplate` and write it back via
  // `saveShiftTemplate(..., true /* isSilent */)`. The write-guard chain in
  // usePersistence holds — the write only fires after templateLoaded === true,
  // which is implied by `ready`.
  //
  // The ref prevents re-entrancy: after our own write completes, Firebase
  // emits onValue with the new shape, which re-renders this component with
  // a new `data.shiftTemplate` reference and re-runs this effect. Without
  // the ref guard, we'd then call `isShiftTemplateMigrated` on the new
  // (canonical) doc, get true, and skip — that path is already safe. The
  // ref just shortcuts to "once per session, period," which is the more
  // defensible semantic if a future refactor changes the canonical check.
  const migrationAttemptedRef = useRef(false);
  useEffect(function () {
    if (migrationAttemptedRef.current) return;
    if (!ready) return;
    if (!data.shiftTemplate) return;  // never customised → nothing to migrate
    if (isShiftTemplateMigrated(data.shiftTemplate)) {
      migrationAttemptedRef.current = true;
      return;
    }
    migrationAttemptedRef.current = true;
    const materialised = materializeShiftTemplate(data.shiftTemplate);
    if (!materialised) return;  // defensive — null only if input was null, already handled
    console.log(
      "%c[shiftTemplate] Eager migration writing canonical per-slot shape.",
      "color:#0a0;font-weight:bold;"
    );
    actions.saveShiftTemplate(materialised, true);
  }, [ready, data.shiftTemplate, actions]);

  // v0.11.0: theme resolution. settings.darkMode is true/false when the
  // manager has explicitly chosen; undefined means "follow system pref",
  // which the hook subscribes to live. Returns the resolved isDark so we
  // can pass it down to the Settings Toggle's checked-state.
  // Before `ready` flips true, data.settings is null → undefined → system.
  const isDark = useThemeMode(data.settings ? data.settings.darkMode : undefined);

  // v15.2.0: live Firebase RTDB connection state for the header status dot.
  const connected = useFirebaseConnection();

  // ── Loading state ──────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div style={S.appShell}>
        <div style={S.card}>
          <p style={S.muted}>Loading data…</p>
        </div>
      </div>
    );
  }

  // ── Write-warning banner ───────────────────────────────────────────────
  const warningBanner = writeWarning
    ? (
      <div
        style={{
          marginBottom: 12,
          padding: "10px 12px",
          background: "var(--bg-danger-tint)",
          border: "1px solid var(--border-danger-tint)",
          color: "var(--text-danger)",
          borderRadius: R.inset,
          fontSize: 13,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>{writeWarning}</span>
        <button
          onClick={clearWriteWarning}
          style={{ ...BTN.base, ...BTN.ghost, padding: "4px 10px", fontSize: 12 }}
        >
          Dismiss
        </button>
      </div>
    )
    : null;

  // ── Header ─────────────────────────────────────────────────────────────
  const header = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 12,
        marginBottom: 12,
        flexWrap: isMobile ? "wrap" : "nowrap",
      }}
    >
      <div>
        <h1 style={S.h1}>Me Gustas Tú — Staff Scheduling</h1>
      </div>
      {/* v15.2.0: version + user email line removed from here. The user
          email now lives in the ConnectionStatus popover; the version
          stays on the Settings footer. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <ConnectionStatus
          connected={connected}
          userEmail={user.email}
          isMobile={isMobile}
        />
        <button
          className="mgt-hover-scale"
          style={{ ...BTN.base, ...BTN.ghost }}
          onClick={signOut}
        >
          Sign out
        </button>
      </div>
    </div>
  );

  // ── Tab nav ────────────────────────────────────────────────────────────
  const tabNav = (
    <div
      style={{
        display: "flex",
        gap: 4,
        marginBottom: 16,
        padding: 4,
        background: "var(--bg-segment)",
        borderRadius: R.card,
        overflowX: "auto",
      }}
    >
      {TABS.map(function (t) {
        const on = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            className="mgt-hover-scale"
            onClick={function () { setTab(t.key); }}
            style={{
              ...BTN.base,
              flex: 1,
              minWidth: 90,
              padding: "8px 12px",
              fontSize: 13,
              borderRadius: R.tight,
              background: on ? "var(--bg-tab-active)" : "transparent",
              color: on ? "var(--accent)" : "var(--text-secondary)",
              border: "1px solid transparent",
              boxShadow: on ? "var(--shadow-tab-active)" : "none",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );

  // ── Tab body ───────────────────────────────────────────────────────────
  let body;
  if (tab === "schedule") {
    body = (
      <ScheduleGrid
        shifts={data.shifts}
        employees={data.employees}
        requests={data.requests}
        shiftTemplate={data.shiftTemplate}
        settings={data.settings}
        configRevisions={data.configRevisions}
        actions={actions}
        isMobile={isMobile}
      />
    );
  } else if (tab === "employees") {
    body = (
      <EmployeesList
        employees={data.employees}
        actions={actions}
        isMobile={isMobile}
      />
    );
  } else if (tab === "requests") {
    body = (
      <RequestsList
        requests={data.requests}
        employees={data.employees}
        actions={actions}
        isMobile={isMobile}
      />
    );
  } else {
    // Settings — shift template editor (v0.5.0) + operating hours (v0.7.0).
    // /settings (operating hours) and /shiftTemplate are distinct Firebase
    // paths; Settings.jsx owns both forms and routes Save to the right
    // write helper based on which form is dirty.
    body = (
      <Settings
        shiftTemplate={data.shiftTemplate}
        saveShiftTemplate={actions.saveShiftTemplate}
        settings={data.settings}
        saveSettings={actions.saveSettings}
        configRevisions={data.configRevisions}
        upsertConfigRevision={actions.upsertConfigRevision}
        deleteConfigRevision={actions.deleteConfigRevision}
        isMobile={isMobile}
        isDark={isDark}
      />
    );
  }

  return (
    <div style={S.appShell}>
      <div style={{ ...S.card, maxWidth: tab === "schedule" ? 1100 : 820 }}>
        {header}
        {warningBanner}
        {tabNav}
        {body}
      </div>
      <ModalPresence show={showShortcuts}>
        {showShortcuts ? (
          <ShortcutsModal
            open
            isMobile={isMobile}
            onClose={function () { setShowShortcuts(false); }}
          />
        ) : null}
      </ModalPresence>
    </div>
  );
}
