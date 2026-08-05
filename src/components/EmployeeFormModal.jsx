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
//   - name                  (text, required)
//   - roles                 (multi-select from ROLES, ≥1 required)
//   - preference            ("day" | "evening" | "either") — segmented
//   - workingDaysPerWeek    (1..7, default 5)
//   - fixedDays             ({mon..sun: bool} | null) — null when toggle off
//   - schedulingPriority    (bool, v1.3.0) — generator picks these
//                            employees before non-priority ones
//   - active                (bool) — default true
//
// Form state mirrors props.employee when the modal opens. We don't share
// state across opens — each open is a fresh edit session.

import { useEffect, useState } from "react";
import {
  R,
  ROLES,
  WEEKDAYS,
  S,
  BTN,
  ROLE_COLORS,
  DEFAULT_WORKING_DAYS,
} from "../lib/constants.js";
import { Overlay, Fld, mkInp, mkBtn, TBadge } from "./atoms.jsx";
import { useEnterSubmit } from "../hooks/useEnterSubmit.js";
import { useEscClose } from "../hooks/useEscClose.js";

// v0.12.0: working-days-per-week choices. 1..7. Off-days = 7 − N. Stored
// on each employee for the future auto-generator (v1.x).
const WORKING_DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

// ── Defaults ─────────────────────────────────────────────────────────────
function emptyForm() {
  return {
    name: "",
    roles: [],
    preference: "either",
    workingDaysPerWeek: DEFAULT_WORKING_DAYS,
    fixedDays: null,
    schedulingPriority: false,  // v1.3.0
    active: true,
    activeFrom: "",   // v15.2.0 — tenure start (ISO date, "" = unbounded)
    activeUntil: "",  // v15.2.0 — tenure end   (ISO date, "" = unbounded)
  };
}

function formFromEmployee(emp) {
  if (!emp) return emptyForm();
  // v0.12.0: clamp legacy / out-of-range values to the default. Stored
  // values are written by this form, so the only way an out-of-range
  // value reaches us is a hand-edited Firebase doc — fail safe.
  const wdRaw = typeof emp.workingDaysPerWeek === "number"
    ? Math.round(emp.workingDaysPerWeek)
    : DEFAULT_WORKING_DAYS;
  const wd = wdRaw >= 1 && wdRaw <= 7 ? wdRaw : DEFAULT_WORKING_DAYS;
  return {
    name: emp.name || "",
    roles: Array.isArray(emp.roles) ? emp.roles.slice() : [],
    preference: emp.preference || "either",
    workingDaysPerWeek: wd,
    fixedDays: emp.fixedDays
      ? { ...emp.fixedDays }
      : null,
    schedulingPriority: emp.schedulingPriority === true,  // v1.3.0
    active: emp.active !== false,  // default true when undefined
    activeFrom: emp.activeFrom || "",    // v15.2.0
    activeUntil: emp.activeUntil || "",  // v15.2.0
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

  // v15.3.0: Enter saves. Mirror of the Save button's `disabled={!valid}`
  // gate, computed inline so the hook sits above the early return (hooks
  // run unconditionally). handleSave (below, hoisted) re-checks validity.
  const enterCanSave =
    open &&
    form.name.trim().length > 0 &&
    form.roles.length > 0 &&
    !(Boolean(form.activeFrom) && Boolean(form.activeUntil) && form.activeUntil < form.activeFrom);
  useEnterSubmit(open, enterCanSave, handleSave);
  useEscClose(open, onClose);

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
  // v15.2.0: when both tenure endpoints are set, end must not precede
  // start. ISO "YYYY-MM-DD" strings compare lexicographically.
  const tenureRangeInvalid =
    Boolean(form.activeFrom) && Boolean(form.activeUntil) &&
    form.activeUntil < form.activeFrom;
  const valid = nameTrimmed.length > 0 && form.roles.length > 0 && !tenureRangeInvalid;

  // ── Handlers ─────────────────────────────────────────────────────────
  function handleSave() {
    if (!valid) return;
    const payload = {
      id: isEdit ? employee.id : undefined,
      name: nameTrimmed,
      roles: form.roles.slice(),
      preference: form.preference,
      workingDaysPerWeek: form.workingDaysPerWeek,
      fixedDays: form.fixedDays ? { ...form.fixedDays } : null,
      schedulingPriority: form.schedulingPriority === true,  // v1.3.0
      active: form.active,
      activeFrom: form.activeFrom || null,    // v15.2.0
      activeUntil: form.activeUntil || null,  // v15.2.0
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
            className="mgt-hover-scale"
            onClick={function () { toggleRole(r); }}
            style={{
              ...BTN.base,
              padding: "6px 12px",
              fontSize: 13,
              borderRadius: R.pill,
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
        borderRadius: R.inset,
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
            className="mgt-hover-scale"
            onClick={function () { setField("preference", opt.key); }}
            style={{
              ...BTN.base,
              padding: "6px 14px",
              fontSize: 13,
              borderRadius: R.tight,
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

  // v0.12.0: working-days-per-week segmented row (1..7). Off-days helper
  // text updates live so the manager can sanity-check the pattern.
  const workingDaysSegments = (
    <div
      style={{
        display: "inline-flex",
        background: "var(--bg-segment-strong)",
        borderRadius: R.inset,
        padding: 3,
        flexWrap: "wrap",
      }}
    >
      {WORKING_DAYS_OPTIONS.map(function (n) {
        const on = form.workingDaysPerWeek === n;
        return (
          <button
            key={n}
            type="button"
            className="mgt-hover-scale"
            onClick={function () { setField("workingDaysPerWeek", n); }}
            style={{
              ...BTN.base,
              padding: "6px 12px",
              fontSize: 13,
              minWidth: 36,
              borderRadius: R.tight,
              background: on ? "var(--accent)" : "transparent",
              color: on ? "var(--text-on-accent)" : "var(--text-primary)",
              border: "1px solid transparent",
            }}
          >
            {n}
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
              className="mgt-hover-scale"
              onClick={function () { toggleFixedDay(d.key); }}
              style={{
                ...BTN.base,
                padding: "6px 10px",
                fontSize: 12,
                borderRadius: R.tight,
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
      className="mgt-hover-scale"
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
      className="mgt-hover-scale"
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

  // v1.3.0: scheduling-priority toggle. Same visual rhythm as the
  // fixed-days toggle — pill button rather than a Toggle row because
  // the modal already uses pill controls for the other booleans.
  const priorityToggle = (
    <button
      type="button"
      className="mgt-hover-scale"
      onClick={function () { setField("schedulingPriority", !form.schedulingPriority); }}
      style={{
        ...BTN.base,
        padding: "6px 12px",
        fontSize: 13,
        background: form.schedulingPriority ? "var(--accent)" : "var(--bg-pill)",
        color: form.schedulingPriority ? "var(--text-on-accent)" : "var(--text-primary)",
        border: "1px solid " + (form.schedulingPriority ? "var(--accent-deep)" : "var(--btn-ghost-border)"),
      }}
    >
      {form.schedulingPriority ? "Priority: ON" : "Priority: OFF"}
    </button>
  );

  const deleteButton = isEdit
    ? mkBtn({
        type: "button",
        className: "mgt-hover-scale",
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
      {/* v15.2.0: inner scroll wrapper. The Overlay desktop sheet uses
          overflow:visible (v1.9.0 hover-scale fix), so a form taller than
          maxHeight:80vh spills past the sheet — the footer buttons hung off
          the bottom edge (worst case: fixed-days ON + the new Active-dates
          field). Cap the field stack and scroll it internally; the action
          button row stays OUTSIDE so it's always anchored to the visible
          sheet bottom. Negative horizontal margin + matching padding gives
          hover-scaled inputs 20 px of clip breathing room (same pattern as
          GenerateResultsModal / EmployeeFairnessModal). */}
      <div
        style={{
          maxHeight: isMobile ? "60vh" : "min(62vh, 520px)",
          overflowY: "auto",
          padding: "4px 20px",
          margin: "0 -20px",
        }}
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

      <Fld label="Working days per week">
        {workingDaysSegments}
        <div style={{ ...S.muted, marginTop: 4, fontSize: 11 }}>
          {form.workingDaysPerWeek} working / {7 - form.workingDaysPerWeek} off — used by the auto-generator (coming in v1.x).
        </div>
      </Fld>

      <Fld label="Fixed working days">
        {fixedDaysToggle}
        {fixedDaysSection}
      </Fld>

      <Fld label="Auto-generator priority">
        {priorityToggle}
        <div style={{ ...S.muted, marginTop: 4, fontSize: 11 }}>
          When ON, the auto-generator picks this employee before any non-priority employee, regardless of role-specialist or load-balance ranking.
        </div>
      </Fld>

      <Fld label="Status">
        {activeToggle}
      </Fld>

      {/* v15.2.0: employment tenure. Both optional — leave blank for an
          open-ended window. The employee is only schedulable (manual
          picker + auto-generator) and counted in the weekly / fairness
          panels on dates inside this range. */}
      <Fld label="Active dates (optional)">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: isMobile ? 8 : 12,
          }}
        >
          <div>
            <div style={{ ...S.muted, fontSize: 11, marginBottom: 4 }}>From</div>
            {mkInp({
              type: "date",
              className: "mgt-hover-scale",
              value: form.activeFrom,
              max: form.activeUntil || undefined,
              onChange: function (e) { setField("activeFrom", e.target.value); },
            })}
          </div>
          <div>
            <div style={{ ...S.muted, fontSize: 11, marginBottom: 4 }}>Until</div>
            {mkInp({
              type: "date",
              className: "mgt-hover-scale",
              value: form.activeUntil,
              min: form.activeFrom || undefined,
              onChange: function (e) { setField("activeUntil", e.target.value); },
            })}
          </div>
        </div>
        <div
          style={{
            ...S.muted,
            marginTop: 4,
            fontSize: 11,
            color: tenureRangeInvalid ? "var(--text-danger)" : "var(--text-muted)",
          }}
        >
          {tenureRangeInvalid
            ? "End date must be on or after the start date."
            : "Leave blank for no limit. The employee won't be scheduled or counted outside these dates."}
        </div>
      </Fld>
      </div>

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
            className: "mgt-hover-scale",
            variant: "ghost",
            onClick: onClose,
            children: "Cancel",
          })}
          {mkBtn({
            type: "button",
            className: "mgt-hover-scale",
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
