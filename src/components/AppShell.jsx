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
import { S, BTN } from "../lib/constants.js";
import { usePersistence } from "../hooks/usePersistence.js";
import { useThemeMode } from "../hooks/useThemeMode.js";
import {
  isShiftTemplateMigrated,
  materializeShiftTemplate,
} from "../lib/schedule-logic.js";
import EmployeesList from "./EmployeesList.jsx";
import RequestsList from "./RequestsList.jsx";
import ScheduleGrid from "./ScheduleGrid.jsx";
import ScheduleGridGlass from "./ScheduleGrid.glass.jsx";
import Settings from "./Settings.jsx";
import SettingsGlass from "./Settings.glass.jsx";
import { S_GLASS } from "../lib/constants.glass.js";
import { GlassSurface } from "./atoms.glass.jsx";

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

export default function AppShell({ user, signOut, isMobile, appVersion, useGlass }) {
  const { data, ready, writeWarning, clearWriteWarning, actions } = usePersistence();
  // v1.5.0: lazy initializer reads the last-open tab from sessionStorage.
  // First visit / fresh browser tab → "schedule".
  const [tab, setTab] = useState(readStoredTab);

  // v1.5.0: persist tab changes within this browser tab.
  useEffect(function () {
    try { sessionStorage.setItem(TAB_STORAGE_KEY, tab); } catch (_e) { /* private-mode safari */ }
  }, [tab]);

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

  // ── Loading state ──────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div style={S.appShell}>
        {useGlass ? (
          <GlassSurface
            style={{
              ...S_GLASS.glassRegularV2,
              borderRadius: 22,
              width: "100%",
              maxWidth: 720,
            }}
            contentStyle={{ padding: 20 }}
          >
            <p style={S.muted}>Loading data…</p>
          </GlassSurface>
        ) : (
          <div style={S.card}>
            <p style={S.muted}>Loading data…</p>
          </div>
        )}
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
          borderRadius: 10,
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
        <p style={S.muted}>v{appVersion} · {user.email}</p>
      </div>
      <button
        className="mgt-hover-scale"
        style={{ ...BTN.base, ...BTN.ghost }}
        onClick={signOut}
      >
        Sign out
      </button>
    </div>
  );

  // ── Tab nav ────────────────────────────────────────────────────────────
  // SPIKE: when `useGlass` is true, the tab pill row is wrapped in a single
  // <GlassSurface> (one blur instance, capsule shape) and the active tab
  // gains the accent-tint pill from the spike's `glassTabActive` token.
  // Production behaviour is byte-identical when `useGlass` is false.
  const tabButtons = TABS.map(function (t) {
    const on = tab === t.key;
    if (useGlass) {
      const style = {
        ...S_GLASS.glassTab,
        ...(on ? S_GLASS.glassTabActive : null),
      };
      return (
        <button
          key={t.key}
          type="button"
          className="mgt-hover-scale--glass"
          onClick={function () { setTab(t.key); }}
          style={style}
        >
          {t.label}
        </button>
      );
    }
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
          borderRadius: 8,
          background: on ? "var(--bg-tab-active)" : "transparent",
          color: on ? "var(--accent)" : "var(--text-secondary)",
          border: "1px solid transparent",
          boxShadow: on ? "var(--shadow-tab-active)" : "none",
        }}
      >
        {t.label}
      </button>
    );
  });

  const tabNav = useGlass
    ? (
      <GlassSurface
        style={S_GLASS.glassTabBar}
        contentStyle={{ display: "flex", flex: 1, gap: 4, overflowX: "auto" }}
      >
        {tabButtons}
      </GlassSurface>
    )
    : (
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          padding: 4,
          background: "var(--bg-segment)",
          borderRadius: 12,
          overflowX: "auto",
        }}
      >
        {tabButtons}
      </div>
    );

  // ── Tab body ───────────────────────────────────────────────────────────
  // SPIKE: when `useGlass` is true, Schedule + Settings route to their
  // glass forks (ScheduleGridGlass adds GlassSurface wrappers around
  // the week-nav bar + result banner via production's wrap-prop hooks;
  // SettingsGlass wraps the 5 accordions in a shared glassContainer).
  // Employees + Requests tabs render production unchanged — they're
  // pure content surfaces with no nav-layer affordance to glass-ify.
  const ScheduleComponent = useGlass ? ScheduleGridGlass : ScheduleGrid;
  const SettingsComponent = useGlass ? SettingsGlass : Settings;
  let body;
  if (tab === "schedule") {
    body = (
      <ScheduleComponent
        shifts={data.shifts}
        employees={data.employees}
        requests={data.requests}
        shiftTemplate={data.shiftTemplate}
        settings={data.settings}
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
      <SettingsComponent
        shiftTemplate={data.shiftTemplate}
        saveShiftTemplate={actions.saveShiftTemplate}
        settings={data.settings}
        saveSettings={actions.saveSettings}
        isMobile={isMobile}
        isDark={isDark}
      />
    );
  }

  // ── Outer app card ─────────────────────────────────────────────────────
  // SPIKE: in glass mode, the dominant visual surface (the card holding
  // all four tabs) becomes a <GlassSurface> with the v2 layered lens
  // distortion. Everything inside it (tab nav, panels, lists, grid
  // cells) layers on top of the glass effect. The translucent inner
  // surfaces partially show through, giving the whole app the
  // "stained-glass cathedral" feel the user asked for.
  const cardMaxWidth = tab === "schedule" ? 1100 : 820;
  const cardContents = (
    <>
      {header}
      {warningBanner}
      {tabNav}
      {body}
    </>
  );

  return (
    <div style={S.appShell}>
      {useGlass ? (
        <GlassSurface
          style={{
            ...S_GLASS.glassRegularV2,
            borderRadius: 22,
            width: "100%",
            maxWidth: cardMaxWidth,
          }}
          contentStyle={{ padding: 20 }}
        >
          {cardContents}
        </GlassSurface>
      ) : (
        <div style={{ ...S.card, maxWidth: cardMaxWidth }}>
          {cardContents}
        </div>
      )}
    </div>
  );
}
