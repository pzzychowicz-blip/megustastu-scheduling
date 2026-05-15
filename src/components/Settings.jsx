// src/components/Settings.jsx
// Settings tab body. v0.5.0 scope: shift template editor.
// v0.7.0: + Operating Hours editor (writes to /settings).
// v0.9.0: + Display preferences (writes to /settings.showRolePills).
// v0.10.0: single-open accordion layout (Operating Hours, Display, FoH,
//          Kitchen). Display section auto-saves on Toggle change — no
//          Save click needed. Per-section dirty dot in the accordion
//          header for Hours / FoH / Kitchen.
//
// What it edits:
//   /shiftTemplate (singleton) → { foh: { day, evening }, kitchen: { day, evening } }
//     Each block has { start, end, count }. FoH evening also has secondPersonStart.
//   /settings      (singleton) → { operatingStart, operatingEnd,    (v0.7.0)
//                                  showRolePills }                  (v0.9.0)
//
// Locked decisions:
//   v0.5.0:
//     - Global template only (no per-day-of-week override) — v1.x stretch.
//     - Count decrease leaves orphan /shifts/{id} records alone — they
//       stop rendering when count drops below their position, reappear if
//       count goes back up. Cleanup deferred to v1.x maintenance.
//     - Explicit Save button (config surface, not a modal). Disabled until
//       dirty AND valid.
//   v0.7.0:
//     - Operating hours are managed in a single bottom Save bar shared with
//       the shift template. Save writes only the dirty form(s) — separate
//       dirty flags per Firebase path, but one user-facing Save action.
//     - Template-row validation now also checks each block sits inside the
//       operating window. Narrowing operating hours that no longer enclose
//       the template lights up template-row errors and blocks Save — the
//       manager must widen hours or shrink the template before saving.
//   v0.10.0:
//     - Sections are now accordion items (Collapsible atom). One open at
//       a time. Operating Hours is the default-open section.
//     - Display section auto-saves immediately on Toggle change. It is
//       intentionally divergent from Hours/FoH/Kitchen (which need an
//       explicit Save) because Display toggles have instant visual
//       effect on the schedule grid.
//     - Per-section dirty dot in the Collapsible header surfaces which
//       section has unsaved edits, so a collapsed dirty section is
//       visible without expanding.
//     - When Save is clicked while errors exist, the first section
//       carrying an error force-opens so the validator messages become
//       visible (the user can't see errors in collapsed sections).
//
// Props:
//   shiftTemplate     (object|null)  — from usePersistence; null on first run
//   saveShiftTemplate (fn)           — from actions
//   settings          (object|null)  — from usePersistence; null on first run
//   saveSettings      (fn)           — from actions (v0.7.0)
//   isMobile          (bool)         — viewport flag for the row layout
//
// SECTIONS.foh.label / .kitchen.label drive the card titles so renaming
// a section in constants.js propagates automatically.

import { useState } from "react";
import {
  S, BTN, SECTIONS,
  DEFAULT_SHIFT_TEMPLATE,
  OPERATING_HOURS,
} from "../lib/constants.js";
import { Collapsible, Toggle, Fld, mkInp, mkBtn } from "./atoms.jsx";

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
//
// v0.7.0: when `hours` is supplied, we also check the block sits inside
// the operating window. `hours` may be omitted by callers that haven't
// loaded the operating-hours form yet — in that case the constraint is
// skipped rather than failing closed.
function blockError(block, hours) {
  if (typeof block.count !== "number" || !Number.isFinite(block.count) || block.count < 1) {
    return "Count must be at least 1.";
  }
  if (!block.start || !block.end) {
    return "Start and end times required.";
  }
  if (block.start >= block.end) {
    return "End time must be after start.";
  }
  if (hours && hours.operatingStart && hours.operatingEnd) {
    if (block.start < hours.operatingStart) {
      return "Start cannot be earlier than operating start (" + hours.operatingStart + ").";
    }
    if (block.end > hours.operatingEnd) {
      return "End cannot be later than operating end (" + hours.operatingEnd + ").";
    }
  }
  return null;
}

// v0.7.0: validation for the operating-hours card itself. Same shape as
// blockError — first error string or null.
function hoursError(hours) {
  if (!hours.operatingStart || !hours.operatingEnd) {
    return "Both times required.";
  }
  if (hours.operatingStart >= hours.operatingEnd) {
    return "Operating end must be after start.";
  }
  return null;
}

// v0.10.0: per-block dirty comparison. Drives the FoH / Kitchen accordion
// header dots. Compares only the fields we know about; if either side is
// missing (shouldn't happen given DEFAULT_SHIFT_TEMPLATE fallback) we
// treat it as not-dirty rather than always-dirty.
function blockDirty(a, b) {
  if (!a || !b) return false;
  if (a.start !== b.start) return true;
  if (a.end !== b.end) return true;
  if (a.count !== b.count) return true;
  if ((a.secondPersonStart || null) !== (b.secondPersonStart || null)) return true;
  return false;
}

// Lexicographic string compare on "HH:MM" works because the format is
// fixed-width and zero-padded. Same trick used by schedule-logic.js for
// date strings. No Date object needed.

export default function Settings({
  shiftTemplate,
  saveShiftTemplate,
  settings,
  saveSettings,
  isMobile,
  isDark,
}) {
  // ── Seed local form state ONCE on mount ────────────────────────────────
  // We deliberately do NOT re-sync from props after mount. Manager-only
  // app, single tab editing — if the prop changes mid-edit it's because
  // we just saved, and the form already matches.
  const [form, setForm] = useState(function () {
    return cloneTemplate(shiftTemplate || DEFAULT_SHIFT_TEMPLATE);
  });

  // v0.7.0: Operating-hours form. Falls back to the OPERATING_HOURS
  // constant when Firebase /settings hasn't been populated yet.
  // v0.10.0: hoursForm is now ONLY operatingStart/End. The Display
  // section reads showRolePills directly from `settings` and auto-saves
  // on change, so it doesn't share local form state with hours.
  const [hoursForm, setHoursForm] = useState(function () {
    return {
      operatingStart: (settings && settings.operatingStart) || OPERATING_HOURS.start,
      operatingEnd:   (settings && settings.operatingEnd)   || OPERATING_HOURS.end,
    };
  });
  const [hoursDirty, setHoursDirty] = useState(false);

  // v0.10.0: which accordion section is open. `null` means all collapsed.
  // Default to "hours" because it's the top section and also the one that
  // gates template-row validation.
  const [openSection, setOpenSection] = useState("hours");

  function toggleSection(key) {
    setOpenSection(function (cur) {
      return cur === key ? null : key;
    });
  }

  // ── Field updaters ─────────────────────────────────────────────────────
  // v0.10.0: no longer set a manual `dirty` flag — fohDirty/kitchenDirty
  // are derived below from blockDirty() comparison against the saved
  // shiftTemplate prop.
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

  // v0.7.0: operating-hours updater.
  function onHoursChange(field, e) {
    const value = e.target.value;
    setHoursForm(function (prev) { return { ...prev, [field]: value }; });
    setHoursDirty(true);
  }

  // v0.10.0: Display section auto-save. Toggling immediately writes to
  // /settings. We spread `settings` (or {}) so operatingStart/End and any
  // future fields are preserved — saveSettings does a full-path write.
  // We do NOT include hoursForm here: the user might be mid-edit of
  // operating hours, and committing those silently would surprise them.
  function onShowRolePillsChange(nextValue) {
    saveSettings({ ...(settings || {}), showRolePills: nextValue });
  }

  // v0.11.0: Dark mode auto-save. Same pattern as showRolePills above.
  // `isDark` is the currently-applied resolved value (from AppShell's
  // useThemeMode hook); we save the explicit boolean so the user's choice
  // overrides the system preference from this point on.
  function onDarkModeChange(nextValue) {
    saveSettings({ ...(settings || {}), darkMode: nextValue });
  }
  const darkModeFollowingSystem =
    !settings || typeof settings.darkMode !== "boolean";

  // ── Validation snapshot ────────────────────────────────────────────────
  // v0.7.0: template-row checks now also enforce the operating window.
  // Pass hoursForm only when it's valid on its own — otherwise the
  // operating-end-before-start case would cascade misleading errors into
  // every template row. The user fixes hours first, then row errors clear.
  const opsErr = hoursError(hoursForm);
  const blockHours = opsErr === null ? hoursForm : null;
  const errors = {
    fohDay:         blockError(form.foh.day,         blockHours),
    fohEvening:     blockError(form.foh.evening,     blockHours),
    kitchenDay:     blockError(form.kitchen.day,     blockHours),
    kitchenEvening: blockError(form.kitchen.evening, blockHours),
  };
  const hasErrors =
    opsErr !== null ||
    errors.fohDay !== null ||
    errors.fohEvening !== null ||
    errors.kitchenDay !== null ||
    errors.kitchenEvening !== null;

  // ── Per-section dirty flags (v0.10.0) ──────────────────────────────────
  // FoH/Kitchen derive from blockDirty comparison so the dot auto-clears
  // once the saved `shiftTemplate` prop reflects the latest save. Falls
  // back to DEFAULT_SHIFT_TEMPLATE when nothing has been saved yet.
  const savedTemplate = shiftTemplate || DEFAULT_SHIFT_TEMPLATE;
  const fohDirty =
    blockDirty(form.foh.day, savedTemplate.foh.day) ||
    blockDirty(form.foh.evening, savedTemplate.foh.evening);
  const kitchenDirty =
    blockDirty(form.kitchen.day, savedTemplate.kitchen.day) ||
    blockDirty(form.kitchen.evening, savedTemplate.kitchen.evening);

  // ── Save / Reset ───────────────────────────────────────────────────────
  // v0.10.0: if errors exist, force-open the first section carrying an
  // error so the validator messages become visible (collapsed sections
  // hide them). The user can't reach a Save-disabled state without
  // visible feedback.
  function handleSave() {
    if (hasErrors) {
      if (opsErr) setOpenSection("hours");
      else if (errors.fohDay || errors.fohEvening) setOpenSection("foh");
      else if (errors.kitchenDay || errors.kitchenEvening) setOpenSection("kitchen");
      return;
    }
    if (!fohDirty && !kitchenDirty && !hoursDirty) return;
    if (hoursDirty) {
      saveSettings({
        ...(settings || {}),
        operatingStart: hoursForm.operatingStart,
        operatingEnd:   hoursForm.operatingEnd,
      });
      setHoursDirty(false);
    }
    if (fohDirty || kitchenDirty) {
      saveShiftTemplate(form);
      // fohDirty/kitchenDirty auto-clear once the shiftTemplate prop updates.
    }
  }

  function handleReset() {
    const ok = window.confirm(
      "Reset operating hours, display preferences AND shift template to defaults? Your current values will be overwritten."
    );
    if (!ok) return;
    const defaults = cloneTemplate(DEFAULT_SHIFT_TEMPLATE);
    const defaultHours = {
      operatingStart: OPERATING_HOURS.start,
      operatingEnd:   OPERATING_HOURS.end,
    };
    setForm(defaults);
    setHoursForm(defaultHours);
    saveShiftTemplate(defaults);
    saveSettings({
      operatingStart: OPERATING_HOURS.start,
      operatingEnd:   OPERATING_HOURS.end,
      showRolePills:  true,   // v0.9.0 default
    });
    setHoursDirty(false);
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
          <div style={{ fontSize: 12, color: "var(--text-danger)", marginTop: 4 }}>
            {err}
          </div>
        ) : null}
      </div>
    );
  }

  // ── Save button styling ────────────────────────────────────────────────
  // Native `disabled` works but the visual cue is weak. Add explicit opacity
  // + cursor override so the manager can tell at a glance.
  const anyDirty = fohDirty || kitchenDirty || hoursDirty;
  const saveDisabled = !anyDirty || hasErrors;
  const saveStyle = saveDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined;

  // v0.7.0: operating-hours row. Two time inputs in the same row layout
  // pattern as the template rows so the visual language stays consistent.
  const hoursRowStyle = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr",
    gap: isMobile ? 8 : 12,
  };

  // v0.10.0: derived showRolePills for the Display Toggle. Falls back to
  // true when /settings hasn't been populated. Explicit boolean check so a
  // stored `false` survives the fallback (a `||` would silently flip it).
  const showRolePills =
    settings && typeof settings.showRolePills === "boolean"
      ? settings.showRolePills
      : true;

  return (
    <div>
      <p style={{ ...S.body, margin: "0 0 16px 0" }}>
        Configure how many staff each section needs per day part, and the
        default shift times. Changes affect new cells; existing shifts keep
        their own per-cell times until edited.
      </p>

      {/* v0.10.0: accordion column. Sections render in fixed order;
          openSection state controls which one is expanded. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Operating hours.
            Sits at the top because it constrains the template — narrowing
            the window surfaces errors on any template row that no longer
            fits, and the manager has to fix the window first. */}
        <Collapsible
          title="Operating hours"
          open={openSection === "hours"}
          onToggle={function () { toggleSection("hours"); }}
          dirty={hoursDirty}
        >
          <div style={{ ...S.fldLabel, marginBottom: 6 }}>Restaurant open</div>
          <div style={hoursRowStyle}>
            <Fld label="Start">
              {mkInp({
                type: "time",
                value: hoursForm.operatingStart,
                onChange: function (e) { onHoursChange("operatingStart", e); },
              })}
            </Fld>
            <Fld label="End">
              {mkInp({
                type: "time",
                value: hoursForm.operatingEnd,
                onChange: function (e) { onHoursChange("operatingEnd", e); },
              })}
            </Fld>
          </div>
          {opsErr ? (
            <div style={{ fontSize: 12, color: "var(--text-danger)", marginTop: 4 }}>
              {opsErr}
            </div>
          ) : null}
        </Collapsible>

        {/* Display preferences.
            v0.10.0: stack of Toggle rows. Each toggle auto-saves on change
            (no Save click). Structured this way so v0.11.0 dark-mode drops
            in as a sibling Toggle with zero layout churn. */}
        <Collapsible
          title="Display"
          open={openSection === "display"}
          onToggle={function () { toggleSection("display"); }}
        >
          <Toggle
            checked={showRolePills}
            onChange={onShowRolePillsChange}
            label="Show role pills on schedule cells"
            helper="The small coloured tag (Bar / Floor / Chef / Plating / Pot) next to each assignee's name in the schedule grid. Off hides them; the Employees tab badges are unaffected."
          />
          {/* v0.11.0: dark mode. First-time default follows OS preference;
              flipping the toggle saves an explicit boolean that overrides
              system pref from that point on. */}
          <Toggle
            checked={isDark === true}
            onChange={onDarkModeChange}
            label="Dark mode"
            helper={darkModeFollowingSystem
              ? "Following your system preference. Tap to override."
              : null}
          />
        </Collapsible>

        <Collapsible
          title={SECTIONS.foh.label}
          open={openSection === "foh"}
          onToggle={function () { toggleSection("foh"); }}
          dirty={fohDirty}
        >
          {renderBlock("foh", "day", "Day shift", false)}
          {renderBlock("foh", "evening", "Evening shift", true)}
        </Collapsible>

        <Collapsible
          title={SECTIONS.kitchen.label}
          open={openSection === "kitchen"}
          onToggle={function () { toggleSection("kitchen"); }}
          dirty={kitchenDirty}
        >
          {renderBlock("kitchen", "day", "Day shift", false)}
          {renderBlock("kitchen", "evening", "Evening shift", false)}
        </Collapsible>
      </div>

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
