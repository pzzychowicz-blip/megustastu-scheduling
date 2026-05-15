// src/components/EmployeeFormModal.jsx
// Add/edit employee form, rendered inside <Overlay>.
//
// Props:
//   open        (bool)   — render the modal or null
//   employee    (obj?)   — existing employee record for edit, or null for "add new"
//   isMobile    (bool)   — passed to Overlay for full-sheet vs centered-card layout
//   onClose     (fn)     — called on cancel / backdrop click
//   onSave      (fn)     — called with the form data on Save
//   onDelete    (fn)     — called with employee.id on Delete (only when editing)
//
// Form fields:
//   - name        (text, required)
//   - roles       (multi-select from ROLES, ≥1 required)
//   - preference  ("day" | "evening" | "either") — segmented control
//   - fixedDays   ({mon..sun: bool} | null) — null when toggle off
//   - active      (bool) — default true
//
// Form state mirrors props.employee when the modal opens. We don't share
// state across opens — each open is a fresh edit session.

import { useEffect, useState } from "react";
import {
  ROLES,
  WEEKDAYS,
  S,
  BTN,
  ROLE_COLORS,
} from "../lib/constants.js";
import { Overlay, Fld, mkInp, mkBtn, TBadge } from "./atoms.jsx";

// ── Defaults ─────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    name: "",
    roles: [],
    preference: "either",
    fixedDays: null,
    active: true,
  };
}

function formFromEmployee(emp) {
  if (!emp) return emptyForm();
  return {
    name: emp.name || "",
    roles: Array.isArray(emp.roles) ? emp.roles.slice() : [],
    preference: emp.preference || "either",
    fixedDays: emp.fixedDays
      ? { ...emp.fixedDays }
      : null,
    active: emp.active !== false,  // default true when undefined
  };
}

// Empty fixedDays object — used when toggle flips ON.
function emptyFixedDays() {
  return { mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false };
}

// ── Component ────────────────────────────────────────────────────────────
export default function EmployeeFormModal({
  open, employee, isMobile, onClose, onSave, onDelete,
}) {
  const isEdit = Boolean(employee && employee.id);
  const [form, setForm] = useState(emptyForm);

  // Sync form state from employee prop whenever the modal opens with
  // a (possibly different) employee record.
  useEffect(function () {
    if (open) setForm(formFromEmployee(employee));
  }, [open, employee]);

  if (!open) return null;

  // ── Field setters ────────────────────────────────────────────────────
  function setField(key, value) {
    setForm(function (prev) { return { ...prev, [key]: value }; });
  }

  function toggleRole(role) {
    setForm(function (prev) {
      const has = prev.roles.includes(role);
      const next = has ? prev.roles.filter(function (r) { return r !== role; }) : [...prev.roles, role];
      return { ...prev, roles: next };
    });
  }

  function toggleFixedDay(key) {
    setForm(function (prev) {
      if (!prev.fixedDays) return prev;
      return { ...prev, fixedDays: { ...prev.fixedDays, [key]: !prev.fixedDays[key] } };
    });
  }

  function toggleFixedDaysOnOff() {
    setForm(function (prev) {
      return { ...prev, fixedDays: prev.fixedDays ? null : emptyFixedDays() };
    });
  }

  // ── Validation ───────────────────────────────────────────────────────
  const nameTrimmed = form.name.trim();
  const valid = nameTrimmed.length > 0 && form.roles.length > 0;

  // ── Handlers ─────────────────────────────────────────────────────────
  function handleSave() {
    if (!valid) return;
    const payload = {
      id: isEdit ? employee.id : undefined,
      name: nameTrimmed,
      roles: form.roles.slice(),
      preference: form.preference,
      fixedDays: form.fixedDays ? { ...form.fixedDays } : null,
      active: form.active,
    };
    onSave(payload);
  }

  function handleDelete() {
    if (!isEdit) return;
    const ok = window.confirm(
      "Delete " + (employee.name || "this employee") + "?\n\n" +
      "This is permanent. Past shifts assigned to this employee will keep " +
      "their reference but show as an unknown person."
    );
    if (ok) onDelete(employee.id);
  }

  // ── Sub-renders ──────────────────────────────────────────────────────
  const rolesGrid = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {ROLES.map(function (r) {
        const on = form.roles.includes(r);
        const rgb = ROLE_COLORS[r] || "var(--role-fallback-rgb)";
        return (
          <button
            key={r}
            type="button"
            onClick={function () { toggleRole(r); }}
            style={{
              ...BTN.base,
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: 999,
              background: on ? "rgb(" + rgb + ")" : "var(--bg-pill)",
              color: on ? "var(--text-on-accent)" : "var(--text-primary)",
              border: "1px solid " + (on ? "rgb(" + rgb + ")" : "var(--btn-ghost-border)"),
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );

  const preferenceSegments = (
    <div
      style={{
        display: "inline-flex",
        background: "var(--bg-segment-strong)",
        borderRadius: 10,
        padding: 3,
      }}
    >
      {[
        { key: "day", label: "Day" },
        { key: "evening", label: "Evening" },
        { key: "either", label: "Either" },
      ].map(function (opt) {
        const on = form.preference === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={function () { setField("preference", opt.key); }}
            style={{
              ...BTN.base,
              padding: "6px 14px",
              fontSize: 13,
              borderRadius: 8,
              background: on ? "var(--accent)" : "transparent",
              color: on ? "var(--text-on-accent)" : "var(--text-primary)",
              border: "1px solid transparent",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  const fixedDaysSection = form.fixedDays
    ? (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {WEEKDAYS.map(function (d) {
          const on = form.fixedDays[d.key];
          return (
            <button
              key={d.key}
              type="button"
              onClick={function () { toggleFixedDay(d.key); }}
              style={{
                ...BTN.base,
                padding: "6px 10px",
                fontSize: 12,
                borderRadius: 8,
                minWidth: 44,
                background: on ? "var(--accent)" : "var(--bg-pill)",
                color: on ? "var(--text-on-accent)" : "var(--text-primary)",
                border: "1px solid " + (on ? "var(--accent-deep)" : "var(--btn-ghost-border)"),
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    )
    : null;

  const activeToggle = (
    <button
      type="button"
      onClick={function () { setField("active", !form.active); }}
      style={{
        ...BTN.base,
        padding: "6px 12px",
        fontSize: 13,
        background: form.active ? "var(--bg-active-on)" : "var(--bg-active-off)",
        color: form.active ? "var(--text-active-on)" : "var(--text-active-off)",
        border: "1px solid " + (form.active ? "var(--border-active-on)" : "var(--border-active-off)"),
      }}
    >
      {form.active ? "Active" : "Archived"}
    </button>
  );

  const fixedDaysToggle = (
    <button
      type="button"
      onClick={toggleFixedDaysOnOff}
      style={{
        ...BTN.base,
        padding: "6px 12px",
        fontSize: 13,
        background: form.fixedDays ? "var(--accent-tint-mid)" : "var(--bg-pill)",
        color: form.fixedDays ? "var(--accent-on-tint)" : "var(--text-primary)",
        border: "1px solid " + (form.fixedDays ? "var(--accent-tint-strong)" : "var(--btn-ghost-border)"),
      }}
    >
      {form.fixedDays ? "Fixed days: ON" : "Fixed days: OFF"}
    </button>
  );

  const deleteButton = isEdit
    ? mkBtn({
        type: "button",
        variant: "danger",
        onClick: handleDelete,
        children: "Delete",
      })
    : null;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <Overlay
      open={open}
      isMobile={isMobile}
      onClose={onClose}
      title={isEdit ? "Edit employee" : "Add employee"}
    >
      <Fld label="Name">
        {mkInp({
          type: "text",
          autoFocus: !isEdit,
          value: form.name,
          onChange: function (e) { setField("name", e.target.value); },
          placeholder: "e.g. Maria López",
        })}
      </Fld>

      <Fld label="Roles">
        {rolesGrid}
      </Fld>

      <Fld label="Shift preference">
        {preferenceSegments}
      </Fld>

      <Fld label="Fixed working days">
        {fixedDaysToggle}
        {fixedDaysSection}
      </Fld>

      <Fld label="Status">
        {activeToggle}
      </Fld>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          marginTop: 16,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {deleteButton}
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
          {mkBtn({
            type: "button",
            variant: "ghost",
            onClick: onClose,
            children: "Cancel",
          })}
          {mkBtn({
            type: "button",
            variant: "primary",
            onClick: handleSave,
            disabled: !valid,
            style: { opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" },
            children: isEdit ? "Save changes" : "Add employee",
          })}
        </div>
      </div>
    </Overlay>
  );
}
