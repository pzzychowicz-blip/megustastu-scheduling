// src/components/EmployeesList.jsx
// Roster view: list of employees + "Add employee" button.
// Owns local state for the modal (open / current target).
// Reads employees from props (passed down from AppShell → usePersistence).
//
// Props:
//   employees  ({ [id]: employee })  — map from usePersistence
//   actions    (object)              — usePersistence().actions; uses
//                                      upsertEmployee + deleteEmployee
//   isMobile   (bool)

import { useState } from "react";
import {
  S, BTN, ROLE_COLORS, WEEKDAYS,
  DEFAULT_WORKING_DAYS,
} from "../lib/constants.js";
import { mkBtn, TBadge } from "./atoms.jsx";
import EmployeeFormModal from "./EmployeeFormModal.jsx";

// Sort: active first (alphabetical), then archived (alphabetical).
function sortEmployees(list) {
  const byName = function (a, b) {
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  };
  const active = list.filter(function (e) { return e.active !== false; }).sort(byName);
  const archived = list.filter(function (e) { return e.active === false; }).sort(byName);
  return { active, archived };
}

function fixedDaysSummary(fixedDays) {
  if (!fixedDays) return null;
  const on = WEEKDAYS.filter(function (d) { return fixedDays[d.key]; }).map(function (d) { return d.label; });
  if (on.length === 0) return "Fixed days: none picked";
  return "Fixed: " + on.join(", ");
}

function preferenceLabel(p) {
  if (p === "day") return "Prefers day";
  if (p === "evening") return "Prefers evening";
  return "Either shift";
}

// v0.12.0: pattern label "N/M" where N = working days, M = 7 − N. Falls
// back to DEFAULT_WORKING_DAYS for legacy employee rows without the field.
function patternLabel(workingDaysPerWeek) {
  const n = typeof workingDaysPerWeek === "number"
    && workingDaysPerWeek >= 1
    && workingDaysPerWeek <= 7
      ? workingDaysPerWeek
      : DEFAULT_WORKING_DAYS;
  return "Pattern: " + n + "/" + (7 - n);
}

export default function EmployeesList({ employees, actions, isMobile }) {
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);   // employee record or null (= add new)

  // Show-archived toggle
  const [showArchived, setShowArchived] = useState(false);

  const list = Object.values(employees || {});
  const { active, archived } = sortEmployees(list);
  const total = list.length;

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(emp) {
    setEditing(emp);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }
  function handleSave(payload) {
    actions.upsertEmployee(payload);
    closeModal();
  }
  function handleDelete(id) {
    actions.deleteEmployee(id);
    closeModal();
  }

  // ── Row renderer ─────────────────────────────────────────────────────
  function renderRow(emp) {
    const inactive = emp.active === false;
    const fdSummary = fixedDaysSummary(emp.fixedDays);

    const roleChips = (emp.roles || []).map(function (r) {
      const rgb = ROLE_COLORS[r] || "var(--role-fallback-rgb)";
      return (
        <TBadge
          key={r}
          palette={{
            bg: "rgba(" + rgb + ", 0.15)",
            text: "rgb(" + rgb + ")",
            border: "rgba(" + rgb + ", 0.33)",
          }}
        >
          {r}
        </TBadge>
      );
    });

    return (
      <button
        key={emp.id}
        type="button"
        onClick={function () { openEdit(emp); }}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          background: inactive ? "var(--bg-row-soft)" : "var(--bg-pill)",
          border: "1px solid var(--hairline-strong)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 8,
          cursor: "pointer",
          opacity: inactive ? 0.6 : 1,
          boxShadow: "var(--shadow-soft)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              textDecoration: inactive ? "line-through" : "none",
            }}
          >
            {emp.name || "Unnamed"}
          </div>
          <span style={S.muted}>{preferenceLabel(emp.preference)}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {roleChips}
          {emp.schedulingPriority === true ? (
            <TBadge
              palette={{
                bg: "var(--accent-tint-soft)",
                text: "var(--accent-on-tint)",
                border: "var(--accent-tint-strong)",
              }}
            >
              Priority
            </TBadge>
          ) : null}
        </div>
        <div style={{ ...S.muted, marginTop: 6, fontSize: 11 }}>
          {patternLabel(emp.workingDaysPerWeek)}
        </div>
        {fdSummary
          ? <div style={{ ...S.muted, marginTop: 4, fontSize: 11 }}>★ {fdSummary}</div>
          : null}
      </button>
    );
  }

  // ── Section renderers (pre-computed so we don't use && in JSX) ───────
  const emptyState = total === 0
    ? (
      <div style={{ ...S.surfaceSoft, textAlign: "center", padding: 24 }}>
        <p style={{ ...S.body, marginBottom: 12 }}>No employees yet.</p>
        {mkBtn({
          type: "button",
          variant: "primary",
          onClick: openAdd,
          children: "Add your first employee",
        })}
      </div>
    )
    : null;

  const activeSection = active.length > 0
    ? <div>{active.map(renderRow)}</div>
    : null;

  const archivedHeader = archived.length > 0
    ? (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 16,
          marginBottom: 6,
        }}
      >
        <span style={{ ...S.muted, fontWeight: 600 }}>
          Archived ({archived.length})
        </span>
        <button
          type="button"
          onClick={function () { setShowArchived(function (v) { return !v; }); }}
          style={{ ...BTN.base, ...BTN.ghost, padding: "4px 10px", fontSize: 12 }}
        >
          {showArchived ? "Hide" : "Show"}
        </button>
      </div>
    )
    : null;

  const archivedSection = (archived.length > 0 && showArchived)
    ? <div>{archived.map(renderRow)}</div>
    : null;

  const headerRow = total > 0
    ? (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span style={S.muted}>
          {active.length} active{archived.length > 0 ? " · " + archived.length + " archived" : ""}
        </span>
        {mkBtn({
          type: "button",
          variant: "primary",
          onClick: openAdd,
          children: "+ Add employee",
        })}
      </div>
    )
    : null;

  return (
    <div>
      {headerRow}
      {emptyState}
      {activeSection}
      {archivedHeader}
      {archivedSection}

      <EmployeeFormModal
        open={modalOpen}
        employee={editing}
        isMobile={isMobile}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
