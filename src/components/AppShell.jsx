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

import { useState } from "react";
import { S, BTN } from "../lib/constants.js";
import { usePersistence } from "../hooks/usePersistence.js";
import { useThemeMode } from "../hooks/useThemeMode.js";
import EmployeesList from "./EmployeesList.jsx";
import RequestsList from "./RequestsList.jsx";
import ScheduleGrid from "./ScheduleGrid.jsx";
import Settings from "./Settings.jsx";

// Tab keys + display order. Add new tabs here when they land.
const TABS = [
  { key: "schedule",  label: "Schedule"  },
  { key: "employees", label: "Employees" },
  { key: "requests",  label: "Requests"  },
  { key: "settings",  label: "Settings"  },
];

export default function AppShell({ user, signOut, isMobile, appVersion }) {
  const { data, ready, writeWarning, clearWriteWarning, actions } = usePersistence();
  const [tab, setTab] = useState("schedule");  // schedule is the primary working surface

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
        style={{ ...BTN.base, ...BTN.ghost }}
        onClick={signOut}
      >
        Sign out
      </button>
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
        borderRadius: 12,
        overflowX: "auto",
      }}
    >
      {TABS.map(function (t) {
        const on = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
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
    </div>
  );
}
