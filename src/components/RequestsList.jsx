// src/components/RequestsList.jsx
// Day-off / holiday requests view: list + "Add request" button.
//
// Mirrors the EmployeesList pattern: header row with count + Add button,
// upcoming requests on top, past requests in a collapsible section.
// Click any row to edit.
//
// Props:
//   requests   ({ [id]: request })   — from usePersistence
//   employees  ({ [id]: employee })  — for resolving employeeId → name
//   actions    (object)              — usePersistence().actions; uses
//                                      upsertRequest + deleteRequest
//   isMobile   (bool)

import { useMemo, useState } from "react";
import { S, BTN, REQUEST_TYPES } from "../lib/constants.js";
import { mkBtn, TBadge } from "./atoms.jsx";
import { isoDate, parseIsoDate } from "../lib/schedule-logic.js";
import RequestFormModal from "./RequestFormModal.jsx";

// Lookup table built once per render — REQUEST_TYPES is small (2 entries).
function typeMeta(key) {
  for (let i = 0; i < REQUEST_TYPES.length; i++) {
    if (REQUEST_TYPES[i].key === key) return REQUEST_TYPES[i];
  }
  return { key: key, label: key, palette: { bg: "var(--status-open-bg)", text: "var(--status-open-text)", border: "var(--status-open-border)" } };
}

// Pretty range: "12 May 2026" or "12–14 May 2026" or "29 Apr–2 May 2026".
const SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatRange(fromIso, toIso) {
  if (!fromIso) return "";
  const from = parseIsoDate(fromIso);
  if (fromIso === toIso) {
    return from.getDate() + " " + SHORT_MONTH[from.getMonth()] + " " + from.getFullYear();
  }
  const to = parseIsoDate(toIso);
  if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear()) {
    return from.getDate() + "–" + to.getDate() + " " + SHORT_MONTH[to.getMonth()] + " " + to.getFullYear();
  }
  if (from.getFullYear() === to.getFullYear()) {
    return from.getDate() + " " + SHORT_MONTH[from.getMonth()] + "–" +
           to.getDate() + " " + SHORT_MONTH[to.getMonth()] + " " + to.getFullYear();
  }
  return from.getDate() + " " + SHORT_MONTH[from.getMonth()] + " " + from.getFullYear() + "–" +
         to.getDate() + " " + SHORT_MONTH[to.getMonth()] + " " + to.getFullYear();
}

// "Upcoming" = anything whose dateTo is today or later. Past requests
// stay in the DB so historical context is preserved; they're collapsed.
function partition(list, todayIso) {
  const upcoming = [];
  const past = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if ((r.dateTo || r.dateFrom || "") >= todayIso) upcoming.push(r);
    else past.push(r);
  }
  // Upcoming: soonest first.
  upcoming.sort(function (a, b) { return (a.dateFrom || "").localeCompare(b.dateFrom || ""); });
  // Past: most-recent first.
  past.sort(function (a, b) { return (b.dateFrom || "").localeCompare(a.dateFrom || ""); });
  return { upcoming, past };
}

export default function RequestsList({ requests, employees, actions, isMobile }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showPast, setShowPast] = useState(false);

  const todayIso = useMemo(function () { return isoDate(new Date()); }, []);
  const list = useMemo(function () { return Object.values(requests || {}); }, [requests]);
  const { upcoming, past } = useMemo(function () { return partition(list, todayIso); }, [list, todayIso]);
  const total = list.length;

  function openAdd() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(req) {
    setEditing(req);
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }
  function handleSave(payload) {
    actions.upsertRequest(payload);
    closeModal();
  }
  function handleDelete(id) {
    actions.deleteRequest(id);
    closeModal();
  }

  // ── Row renderer ─────────────────────────────────────────────────────
  function renderRow(req) {
    const emp = employees[req.employeeId];
    const empName = emp ? emp.name : "(unknown employee)";
    const empArchived = emp && emp.active === false;
    const meta = typeMeta(req.type);
    const isPast = (req.dateTo || req.dateFrom || "") < todayIso;

    return (
      <button
        key={req.id}
        type="button"
        onClick={function () { openEdit(req); }}
        style={{
          display: "block",
          width: "100%",
          textAlign: "left",
          background: isPast ? "var(--bg-row-soft)" : "var(--bg-pill)",
          border: "1px solid var(--hairline-strong)",
          borderRadius: 12,
          padding: 12,
          marginBottom: 8,
          cursor: "pointer",
          opacity: isPast ? 0.7 : 1,
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
              textDecoration: empArchived ? "line-through" : "none",
              opacity: empArchived ? 0.6 : 1,
            }}
          >
            {empName}
          </div>
          <TBadge palette={meta.palette}>{meta.label}</TBadge>
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          {formatRange(req.dateFrom, req.dateTo)}
        </div>
        {req.notes
          ? <div style={{ ...S.muted, marginTop: 4, fontSize: 12 }}>{req.notes}</div>
          : null}
      </button>
    );
  }

  // ── Section renderers ────────────────────────────────────────────────
  const emptyState = total === 0
    ? (
      <div style={{ ...S.surfaceSoft, textAlign: "center", padding: 24 }}>
        <p style={{ ...S.body, marginBottom: 12 }}>No requests yet.</p>
        {mkBtn({
          type: "button",
          variant: "primary",
          onClick: openAdd,
          children: "Add your first request",
        })}
      </div>
    )
    : null;

  const upcomingSection = upcoming.length > 0
    ? <div>{upcoming.map(renderRow)}</div>
    : null;

  const upcomingEmptyNote = (total > 0 && upcoming.length === 0)
    ? <p style={{ ...S.muted, marginTop: 4, marginBottom: 12 }}>No upcoming requests.</p>
    : null;

  const pastHeader = past.length > 0
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
          Past ({past.length})
        </span>
        <button
          type="button"
          onClick={function () { setShowPast(function (v) { return !v; }); }}
          style={{ ...BTN.base, ...BTN.ghost, padding: "4px 10px", fontSize: 12 }}
        >
          {showPast ? "Hide" : "Show"}
        </button>
      </div>
    )
    : null;

  const pastSection = (past.length > 0 && showPast)
    ? <div>{past.map(renderRow)}</div>
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
          {upcoming.length} upcoming{past.length > 0 ? " · " + past.length + " past" : ""}
        </span>
        {mkBtn({
          type: "button",
          variant: "primary",
          onClick: openAdd,
          children: "+ Add request",
        })}
      </div>
    )
    : null;

  return (
    <div>
      {headerRow}
      {emptyState}
      {upcomingSection}
      {upcomingEmptyNote}
      {pastHeader}
      {pastSection}

      <RequestFormModal
        open={modalOpen}
        request={editing}
        employees={employees}
        isMobile={isMobile}
        onClose={closeModal}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}
