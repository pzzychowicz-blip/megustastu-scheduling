// src/components/Settings.jsx
// Settings tab body. v0.5.0 scope: shift template editor only.
//
// What it edits:
//   /shiftTemplate (singleton) → { foh: { day, evening }, kitchen: { day, evening } }
//   Each block has { start, end, count }. FoH evening also has secondPersonStart.
//
// Locked decisions (this session):
//   - Global template only (no per-day-of-week override) — v1.x stretch.
//   - OPERATING_HOURS stays a constant (no editor) — no consumers yet.
//   - Count decrease leaves orphan /shifts/{id} records alone — they
//     stop rendering when count drops below their position, reappear if
//     count goes back up. Cleanup deferred to v1.x maintenance.
//   - Explicit Save button (config surface, not a modal). Disabled until
//     dirty AND valid.
//
// Props:
//   shiftTemplate     (object|null)  — from usePersistence; null on first run
//   saveShiftTemplate (fn)           — from actions
//   isMobile          (bool)         — viewport flag for the row layout
//
// SECTIONS.foh.label / .kitchen.label drive the card titles so renaming
// a section in constants.js propagates automatically.

import { useState } from "react";
import { S, BTN, SECTIONS, DEFAULT_SHIFT_TEMPLATE } from "../lib/constants.js";
import { Section, Fld, mkInp, mkBtn } from "./atoms.jsx";

// ── Deep-clone the template for local edit state ─────────────────────────
// DEFAULT_SHIFT_TEMPLATE is shallow-frozen; nested objects are not. Cloning
// avoids any chance of mutating the constant by reference, AND gives us a
// clean break from the live `shiftTemplate` prop (we don't want the form
// to snap back to Firebase state mid-edit if onValue fires).
function cloneTemplate(src) {
  return JSON.parse(JSON.stringify(src));
}

// ── Per-block validation ─────────────────────────────────────────────────
// Returns the first error string, or null if valid. We surface one error
// per block at a time — keeps the UI tidy and matches how Bookings does
// inline validation.
function blockError(block) {
  if (typeof block.count !== "number" || !Number.isFinite(block.count) || block.count < 1) {
    return "Count must be at least 1.";
  }
  if (!block.start || !block.end) {
    return "Start and end times required.";
  }
  if (block.start >= block.end) {
    return "End time must be after start.";
  }
  return null;
}

// Lexicographic string compare on "HH:MM" works because the format is
// fixed-width and zero-padded. Same trick used by schedule-logic.js for
// date strings. No Date object needed.

export default function Settings({ shiftTemplate, saveShiftTemplate, isMobile }) {
  // ── Seed local form state ONCE on mount ────────────────────────────────
  // We deliberately do NOT re-sync from props after mount. Manager-only
  // app, single tab editing — if the prop changes mid-edit it's because
  // we just saved, and the form already matches.
  const [form, setForm] = useState(function () {
    return cloneTemplate(shiftTemplate || DEFAULT_SHIFT_TEMPLATE);
  });
  const [dirty, setDirty] = useState(false);

  // ── Field updaters ─────────────────────────────────────────────────────
  function updateField(section, dayPart, field, value) {
    setForm(function (prev) {
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [dayPart]: { ...prev[section][dayPart], [field]: value },
        },
      };
    });
    setDirty(true);
  }

  function onCountChange(section, dayPart, e) {
    const raw = e.target.value;
    // Allow the input to be temporarily empty during typing; coerce on save.
    // parseInt("", 10) is NaN, which blockError() flags as invalid.
    const n = raw === "" ? NaN : parseInt(raw, 10);
    updateField(section, dayPart, "count", n);
  }
  function onTimeChange(section, dayPart, field, e) {
    updateField(section, dayPart, field, e.target.value);
  }

  // ── Validation snapshot ────────────────────────────────────────────────
  const errors = {
    fohDay: blockError(form.foh.day),
    fohEvening: blockError(form.foh.evening),
    kitchenDay: blockError(form.kitchen.day),
    kitchenEvening: blockError(form.kitchen.evening),
  };
  const hasErrors =
    errors.fohDay !== null ||
    errors.fohEvening !== null ||
    errors.kitchenDay !== null ||
    errors.kitchenEvening !== null;

  // ── Save / Reset ───────────────────────────────────────────────────────
  function handleSave() {
    if (hasErrors || !dirty) return;
    saveShiftTemplate(form);
    setDirty(false);
  }

  function handleReset() {
    const ok = window.confirm(
      "Reset shift template to defaults? Your current template will be overwritten."
    );
    if (!ok) return;
    const defaults = cloneTemplate(DEFAULT_SHIFT_TEMPLATE);
    setForm(defaults);
    saveShiftTemplate(defaults);
    setDirty(false);
  }

  // ── Row renderer ───────────────────────────────────────────────────────
  // On desktop: Count | Start | End | [2nd person] side-by-side.
  // On mobile:  two columns; the 4th cell wraps to a second row.
  function renderBlock(section, dayPart, label, withSecondPerson) {
    const block = form[section][dayPart];
    const errKey = section + (dayPart === "day" ? "Day" : "Evening");
    const err = errors[errKey];

    const desktopCols = withSecondPerson ? "90px 1fr 1fr 1fr" : "90px 1fr 1fr";
    const rowStyle = {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr 1fr" : desktopCols,
      gap: isMobile ? 8 : 12,
    };

    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...S.fldLabel, marginBottom: 6 }}>{label}</div>
        <div style={rowStyle}>
          <Fld label="Count">
            {mkInp({
              type: "number",
              min: 1,
              step: 1,
              value: Number.isFinite(block.count) ? block.count : "",
              onChange: function (e) { onCountChange(section, dayPart, e); },
            })}
          </Fld>
          <Fld label="Start">
            {mkInp({
              type: "time",
              value: block.start,
              onChange: function (e) { onTimeChange(section, dayPart, "start", e); },
            })}
          </Fld>
          <Fld label="End">
            {mkInp({
              type: "time",
              value: block.end,
              onChange: function (e) { onTimeChange(section, dayPart, "end", e); },
            })}
          </Fld>
          {withSecondPerson ? (
            <Fld label="2nd person starts">
              <select
                value={block.secondPersonStart || "18:00"}
                onChange={function (e) {
                  updateField("foh", "evening", "secondPersonStart", e.target.value);
                }}
                style={S.inputBase}
              >
                <option value="18:00">18:00</option>
                <option value="19:00">19:00</option>
              </select>
            </Fld>
          ) : null}
        </div>
        {err ? (
          <div style={{ fontSize: 12, color: "#9a1f17", marginTop: 4 }}>
            {err}
          </div>
        ) : null}
      </div>
    );
  }

  // ── Save button styling ────────────────────────────────────────────────
  // Native `disabled` works but the visual cue is weak. Add explicit opacity
  // + cursor override so the manager can tell at a glance.
  const saveDisabled = !dirty || hasErrors;
  const saveStyle = saveDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined;

  return (
    <div>
      <p style={{ ...S.body, margin: "0 0 16px 0" }}>
        Configure how many staff each section needs per day part, and the
        default shift times. Changes affect new cells; existing shifts keep
        their own per-cell times until edited.
      </p>

      <Section title={SECTIONS.foh.label} style={{ marginBottom: 12 }}>
        {renderBlock("foh", "day", "Day shift", false)}
        {renderBlock("foh", "evening", "Evening shift", true)}
      </Section>

      <Section title={SECTIONS.kitchen.label} style={{ marginBottom: 12 }}>
        {renderBlock("kitchen", "day", "Day shift", false)}
        {renderBlock("kitchen", "evening", "Evening shift", false)}
      </Section>

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "space-between",
          marginTop: 16,
          flexWrap: "wrap",
        }}
      >
        {mkBtn({
          variant: "ghost",
          onClick: handleReset,
          children: "Reset to defaults",
        })}
        {mkBtn({
          variant: "primary",
          onClick: handleSave,
          disabled: saveDisabled,
          style: saveStyle,
          children: "Save changes",
        })}
      </div>
    </div>
  );
}
