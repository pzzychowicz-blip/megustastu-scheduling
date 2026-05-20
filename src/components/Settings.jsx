// src/components/Settings.jsx
// Settings tab body. v0.5.0 scope: shift template editor.
// v0.7.0: + Operating time editor (writes to /settings).
// v0.9.0: + Display preferences (writes to /settings.showRolePills).
// v0.10.0: single-open accordion layout (Operating time, Display, FoH,
//          Kitchen). Display section auto-saves on Toggle change — no
//          Save click needed. Per-section dirty dot in the accordion
//          header for Hours / FoH / Kitchen.
// v1.3.0: Open days picker shifted from boolean pills to per-day-part
//          popovers. Each weekday pill shows a state indicator
//          (D·E / D / E / —) and opens a small inline popover with two
//          Toggle rows. Stored shape is `{day: bool, evening: bool}`
//          per weekday (legacy boolean docs auto-migrate via
//          normalizeOpeningDays). Also renamed the accordion section
//          label from "Operating hours" to "Operating time."
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
//     - Operating time is managed in a single bottom Save bar shared with
//       the shift template. Save writes only the dirty form(s) — separate
//       dirty flags per Firebase path, but one user-facing Save action.
//     - Template-row validation now also checks each block sits inside the
//       operating window. Narrowing operating hours that no longer enclose
//       the template lights up template-row errors and blocks Save — the
//       manager must widen hours or shrink the template before saving.
//   v0.10.0:
//     - Sections are now accordion items (Collapsible atom). One open at
//       a time. Operating time is the default-open section.
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

import { useEffect, useRef, useState } from "react";
import {
  S, BTN, SECTIONS,
  DEFAULT_SHIFT_TEMPLATE,
  OPERATING_HOURS,
  DEFAULT_OPENING_DAYS,
  DEFAULT_GENERATOR_STRICT_PREFERENCE,
  WEEKDAYS,
} from "../lib/constants.js";
import { normalizeOpeningDays } from "../lib/schedule-logic.js";
import { Collapsible, Toggle, Fld, mkInp, mkBtn } from "./atoms.jsx";

// ── Deep-clone the template for local edit state ─────────────────────────
// DEFAULT_SHIFT_TEMPLATE is shallow-frozen; nested objects are not. Cloning
// avoids any chance of mutating the constant by reference, AND gives us a
// clean break from the live `shiftTemplate` prop (we don't want the form
// to snap back to Firebase state mid-edit if onValue fires).
// v1.9.0: materializes each (section, dayPart) block into the per-slot
// shape — `{count, times: [{start, end}, ...]}`. Legacy v0.5.0 docs with
// the single start/end/secondPersonStart shape are migrated lazily here
// (form-state-only; the Firebase doc is rewritten on the next save).
function cloneTemplate(src) {
  return {
    foh: {
      day: materializeBlock(src.foh.day, "foh", "day"),
      evening: materializeBlock(src.foh.evening, "foh", "evening"),
    },
    kitchen: {
      day: materializeBlock(src.kitchen.day, "kitchen", "day"),
      evening: materializeBlock(src.kitchen.evening, "kitchen", "evening"),
    },
  };
}

// v1.9.0: build a normalized block with a per-slot `times` array of length
// `count`. Preserves entries already in `block.times`; for missing entries
// falls back to (a) v0.8.0 FoH-evening `secondPersonStart` for slot 1+,
// (b) the block's single `start`/`end`, (c) the operating window defaults.
// Returned object is a fresh deep copy.
function materializeBlock(block, sectionKey, dayPart) {
  if (!block || typeof block !== "object") {
    return { count: 1, times: [{ start: OPERATING_HOURS.start, end: OPERATING_HOURS.end }] };
  }
  const rawCount = block.count;
  const count = Number.isFinite(rawCount) && rawCount >= 1 ? Math.round(rawCount) : 1;
  const existing = Array.isArray(block.times) ? block.times : [];
  const fallbackStart = block.start || OPERATING_HOURS.start;
  const fallbackEnd = block.end || OPERATING_HOURS.end;
  const fohEveningSecondStart = sectionKey === "foh" && dayPart === "evening" && block.secondPersonStart
    ? block.secondPersonStart
    : null;
  const times = [];
  for (let i = 0; i < count; i++) {
    const t = existing[i];
    if (t && t.start && t.end) {
      times.push({ start: t.start, end: t.end });
      continue;
    }
    const legacyStart = i > 0 && fohEveningSecondStart ? fohEveningSecondStart : fallbackStart;
    times.push({ start: legacyStart, end: fallbackEnd });
  }
  return { count: count, times: times };
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
// v1.9.0: validates each slot's start/end independently. Errors surface
// the offending slot index (1-based for the manager) so the message is
// actionable when one of many slots is invalid.
function blockError(block, hours) {
  if (typeof block.count !== "number" || !Number.isFinite(block.count) || block.count < 1) {
    return "Count must be at least 1.";
  }
  if (!Array.isArray(block.times) || block.times.length !== block.count) {
    return "Each shift needs its own start and end times.";
  }
  for (let i = 0; i < block.times.length; i++) {
    const t = block.times[i];
    const prefix = block.times.length > 1 ? "Shift " + (i + 1) + ": " : "";
    if (!t || !t.start || !t.end) {
      return prefix + "start and end times required.";
    }
    if (t.start >= t.end) {
      return prefix + "end time must be after start.";
    }
    if (hours && hours.operatingStart && hours.operatingEnd) {
      if (t.start < hours.operatingStart) {
        return prefix + "start cannot be earlier than operating start (" + hours.operatingStart + ").";
      }
      if (t.end > hours.operatingEnd) {
        return prefix + "end cannot be later than operating end (" + hours.operatingEnd + ").";
      }
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

// v0.12.0: validate the openingDays form. Requires ≥1 day part open across
// the whole week — otherwise the schedule grid would be empty and PDF
// export would never enable.
// v1.3.0: the shape is `{mon: {day, evening}, …}`. A day is "open" iff at
// least one of day/evening is true. The form always carries normalized
// values so we don't need defensive type checks here.
function openingDaysError(days) {
  if (!days) return "Pick at least one open day.";
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const entry = days[WEEKDAYS[i].key];
    if (entry && (entry.day || entry.evening)) return null;
  }
  return "Pick at least one open day.";
}

// v0.12.0: per-form-vs-saved dirty comparison for opening-days. Drives the
// Operating time accordion header dot alongside the existing hoursDirty.
// v1.3.0: deep-compare the per-day-part objects. Both inputs always pass
// through `normalizeOpeningDays` first so legacy boolean docs don't trip
// the dirty dot on first render.
function openingDaysDirty(form, saved) {
  if (!form || !saved) return false;
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const k = WEEKDAYS[i].key;
    const a = form[k] || { day: false, evening: false };
    const b = saved[k] || { day: false, evening: false };
    if (a.day !== b.day || a.evening !== b.evening) return true;
  }
  return false;
}

// v0.10.0: per-block dirty comparison. Drives the FoH / Kitchen accordion
// header dots. Compares only the fields we know about; if either side is
// missing (shouldn't happen given DEFAULT_SHIFT_TEMPLATE fallback) we
// treat it as not-dirty rather than always-dirty.
// v1.9.0: compares the per-slot `times` arrays. `b` (the saved template)
// can be in either the new or legacy shape — we materialize it before the
// comparison so legacy docs don't register as permanently dirty.
function blockDirty(a, b) {
  if (!a || !b) return false;
  if (a.count !== b.count) return true;
  // a is always the form's materialized shape; b may be legacy — normalize.
  const bMat = Array.isArray(b.times) && b.times.length === b.count
    ? b
    : materializeBlock(b, "_", "_");
  if (!Array.isArray(a.times) || !Array.isArray(bMat.times)) return true;
  if (a.times.length !== bMat.times.length) return true;
  for (let i = 0; i < a.times.length; i++) {
    if ((a.times[i] && a.times[i].start) !== (bMat.times[i] && bMat.times[i].start)) return true;
    if ((a.times[i] && a.times[i].end) !== (bMat.times[i] && bMat.times[i].end)) return true;
  }
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

  // v0.12.0: opening-days local form. Falls back to DEFAULT_OPENING_DAYS
  // when /settings has no openingDays yet — same fallback as the rest of
  // the app uses on read, so the toggle row reflects the EFFECTIVE state.
  // v1.3.0: always normalized to the per-day-part shape (legacy boolean
  // docs round-trip through `normalizeOpeningDays`).
  const [openingDaysForm, setOpeningDaysForm] = useState(function () {
    return normalizeOpeningDays((settings && settings.openingDays) || DEFAULT_OPENING_DAYS);
  });

  // v1.3.0: which weekday's open-days popover is currently expanded.
  // `null` means closed. Outside click + Esc close it. Anchored under
  // the matching pill via a relative-parent + absolute-popover layout.
  const [openDayPopover, setOpenDayPopover] = useState(null);
  const popoverRef = useRef(null);
  useEffect(function () {
    if (!openDayPopover) return undefined;
    function handleDocMouseDown(e) {
      const node = popoverRef.current;
      if (node && !node.contains(e.target)) setOpenDayPopover(null);
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpenDayPopover(null);
    }
    document.addEventListener("mousedown", handleDocMouseDown);
    document.addEventListener("keydown", handleKey);
    return function () {
      document.removeEventListener("mousedown", handleDocMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openDayPopover]);

  // v0.10.0: which accordion section is open. `null` means all collapsed.
  // Default to "hours" because it's the top section and also the one that
  // gates template-row validation.
  // v1.6.0: persist across refresh / Vite HMR within the same browser tab
  // via sessionStorage under "mgt-sched.settingsSection". Valid values are
  // the section keys + the literal string "null" for all-collapsed.
  const [openSection, setOpenSection] = useState(function () {
    try {
      const v = sessionStorage.getItem("mgt-sched.settingsSection");
      if (v === null) return "hours";
      if (v === "null") return null;
      // Defensive: only accept known section keys; everything else falls back.
      const known = ["hours", "display", "generator", "foh", "kitchen"];
      if (known.indexOf(v) !== -1) return v;
      return "hours";
    } catch (_e) {
      return "hours";
    }
  });
  useEffect(function () {
    try {
      sessionStorage.setItem("mgt-sched.settingsSection", openSection === null ? "null" : openSection);
    } catch (_e) {}
  }, [openSection]);

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
    const parsed = raw === "" ? NaN : parseInt(raw, 10);
    setForm(function (prev) {
      const block = prev[section][dayPart];
      const oldTimes = Array.isArray(block.times) ? block.times : [];
      // v1.9.0: grow/truncate the times array in lockstep with count. When
      // the manager bumps count up, new slots inherit the last slot's times
      // (most common intent: "add another person at the same hours"). When
      // they shrink count, trailing entries drop. NaN count (mid-typing
      // empty input) leaves the array intact so the manager can finish
      // typing without losing per-slot data.
      let newTimes = oldTimes;
      if (Number.isFinite(parsed) && parsed >= 1) {
        const targetLen = parsed;
        if (oldTimes.length === targetLen) {
          newTimes = oldTimes;
        } else if (oldTimes.length > targetLen) {
          newTimes = oldTimes.slice(0, targetLen);
        } else {
          const fallback = oldTimes[oldTimes.length - 1]
            || { start: OPERATING_HOURS.start, end: OPERATING_HOURS.end };
          newTimes = oldTimes.slice();
          while (newTimes.length < targetLen) {
            newTimes.push({ start: fallback.start, end: fallback.end });
          }
        }
      }
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [dayPart]: { ...block, count: parsed, times: newTimes },
        },
      };
    });
  }
  // v1.9.0: per-slot time setter. Replaces the old per-block onTimeChange
  // (which set a single shared start/end). `slotIndex` is the position
  // in the `times` array; `field` is "start" or "end".
  function onSlotTimeChange(section, dayPart, slotIndex, field, e) {
    const value = e.target.value;
    setForm(function (prev) {
      const block = prev[section][dayPart];
      const oldTimes = Array.isArray(block.times) ? block.times : [];
      const newTimes = oldTimes.slice();
      const cur = newTimes[slotIndex] || { start: OPERATING_HOURS.start, end: OPERATING_HOURS.end };
      newTimes[slotIndex] = { ...cur, [field]: value };
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [dayPart]: { ...block, times: newTimes },
        },
      };
    });
  }

  // v0.7.0: operating-hours updater.
  function onHoursChange(field, e) {
    const value = e.target.value;
    setHoursForm(function (prev) { return { ...prev, [field]: value }; });
    setHoursDirty(true);
  }

  // v1.3.0: per-day-part toggle. `dayPart` is "day" or "evening". Dirty
  // state is derived from a comparison against the saved settings, so no
  // separate setter is needed.
  function setOpeningDayPart(weekdayKey, dayPart, value) {
    setOpeningDaysForm(function (prev) {
      const cur = prev[weekdayKey] || { day: false, evening: false };
      return { ...prev, [weekdayKey]: { ...cur, [dayPart]: Boolean(value) } };
    });
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

  // v1.0.0: Auto-generator preference-strictness Toggle. Same auto-save
  // pattern — no validation, no Save button needed. The generator reads
  // this on each click; flipping it while a generation is mid-flight has
  // no effect (the algorithm runs synchronously in the click handler).
  function onStrictPreferenceChange(nextValue) {
    saveSettings({ ...(settings || {}), generatorStrictPreference: nextValue });
  }
  const strictPreference =
    settings && typeof settings.generatorStrictPreference === "boolean"
      ? settings.generatorStrictPreference
      : DEFAULT_GENERATOR_STRICT_PREFERENCE;

  // ── Validation snapshot ────────────────────────────────────────────────
  // v0.7.0: template-row checks now also enforce the operating window.
  // Pass hoursForm only when it's valid on its own — otherwise the
  // operating-end-before-start case would cascade misleading errors into
  // every template row. The user fixes hours first, then row errors clear.
  const opsErr = hoursError(hoursForm);
  const openDaysErr = openingDaysError(openingDaysForm);
  const blockHours = opsErr === null ? hoursForm : null;
  const errors = {
    fohDay:         blockError(form.foh.day,         blockHours),
    fohEvening:     blockError(form.foh.evening,     blockHours),
    kitchenDay:     blockError(form.kitchen.day,     blockHours),
    kitchenEvening: blockError(form.kitchen.evening, blockHours),
  };
  const hasErrors =
    opsErr !== null ||
    openDaysErr !== null ||
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

  // v0.12.0: opening-days dirty derived against the saved /settings doc
  // (falling back to DEFAULT_OPENING_DAYS so a never-saved settings doc
  // matches the form's default and the dot doesn't appear spuriously).
  // v1.3.0: normalize both sides so a legacy boolean doc compares cleanly
  // against the new per-day-part form.
  const savedOpeningDays = normalizeOpeningDays(
    (settings && settings.openingDays) || DEFAULT_OPENING_DAYS
  );
  const openDaysFormDirty = openingDaysDirty(openingDaysForm, savedOpeningDays);
  // Combined dirty flag for the Operating time accordion header dot —
  // hours OR opening-days. Saved as part of the same Save click.
  const operatingDirty = hoursDirty || openDaysFormDirty;

  // ── Save / Reset ───────────────────────────────────────────────────────
  // v0.10.0: if errors exist, force-open the first section carrying an
  // error so the validator messages become visible (collapsed sections
  // hide them). The user can't reach a Save-disabled state without
  // visible feedback.
  function handleSave() {
    if (hasErrors) {
      // v0.12.0: opening-days error also forces the Operating Hours section
      // open so the message becomes visible.
      if (opsErr || openDaysErr) setOpenSection("hours");
      else if (errors.fohDay || errors.fohEvening) setOpenSection("foh");
      else if (errors.kitchenDay || errors.kitchenEvening) setOpenSection("kitchen");
      return;
    }
    if (!fohDirty && !kitchenDirty && !hoursDirty && !openDaysFormDirty) return;
    if (hoursDirty || openDaysFormDirty) {
      const next = { ...(settings || {}) };
      if (hoursDirty) {
        next.operatingStart = hoursForm.operatingStart;
        next.operatingEnd   = hoursForm.operatingEnd;
      }
      if (openDaysFormDirty) {
        next.openingDays = { ...openingDaysForm };
      }
      saveSettings(next);
      setHoursDirty(false);
      // openDaysFormDirty auto-clears once the `settings` prop updates.
    }
    if (fohDirty || kitchenDirty) {
      saveShiftTemplate(form);
      // fohDirty/kitchenDirty auto-clear once the shiftTemplate prop updates.
    }
  }

  function handleReset() {
    const ok = window.confirm(
      "Reset operating hours, opening days, display preferences AND shift template to defaults? Your current values will be overwritten."
    );
    if (!ok) return;
    const defaults = cloneTemplate(DEFAULT_SHIFT_TEMPLATE);
    const defaultHours = {
      operatingStart: OPERATING_HOURS.start,
      operatingEnd:   OPERATING_HOURS.end,
    };
    // v1.3.0: normalize so the saved object has the per-day-part shape
    // even though DEFAULT_OPENING_DAYS already declares it that way —
    // belt-and-braces in case the constant ever changes shape.
    const defaultOpenDays = normalizeOpeningDays(DEFAULT_OPENING_DAYS);
    setForm(defaults);
    setHoursForm(defaultHours);
    setOpeningDaysForm(defaultOpenDays);
    saveShiftTemplate(defaults);
    saveSettings({
      operatingStart: OPERATING_HOURS.start,
      operatingEnd:   OPERATING_HOURS.end,
      openingDays:    defaultOpenDays,
      showRolePills:  true,   // v0.9.0 default
      generatorStrictPreference: DEFAULT_GENERATOR_STRICT_PREFERENCE, // v1.0.0
    });
    setHoursDirty(false);
  }

  // ── Row renderer ───────────────────────────────────────────────────────
  // v1.9.0: each shift in the section/dayPart gets its OWN start/end
  // controls. Count input sits at the top; below it, one row per slot
  // labelled with the section's role for evening slots (Chef / Plating /
  // Pot for Kitchen evening, Bar / Floor for FoH evening) or "Shift N"
  // for day slots (where role is implicit and one person covers all).
  //
  // Layout on desktop: [label] | [start] | [end] per slot row.
  // On mobile: same layout but tighter gap. The first row (Count) stays
  // separate so the per-slot grid doesn't have a leading "Count" column
  // it doesn't use.
  function slotLabelFor(section, dayPart, index, count) {
    if (dayPart === "day") {
      return count > 1 ? "Shift " + (index + 1) : "Shift";
    }
    // Evening: use the section's role list when available.
    const roles = SECTIONS[section] && SECTIONS[section].roles;
    if (Array.isArray(roles) && roles[index]) return roles[index];
    return "Slot " + (index + 1);
  }

  function renderBlock(section, dayPart, label) {
    const block = form[section][dayPart];
    const errKey = section + (dayPart === "day" ? "Day" : "Evening");
    const err = errors[errKey];

    const slotRowStyle = {
      display: "grid",
      gridTemplateColumns: isMobile ? "90px 1fr 1fr" : "120px 1fr 1fr",
      gap: isMobile ? 8 : 12,
      alignItems: "end",
      marginTop: 8,
    };

    const times = Array.isArray(block.times) ? block.times : [];

    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ ...S.fldLabel, marginBottom: 6 }}>{label}</div>
        <Fld label="Count">
          {mkInp({
            type: "number",
            min: 1,
            step: 1,
            className: "mgt-hover-scale",
            value: Number.isFinite(block.count) ? block.count : "",
            onChange: function (e) { onCountChange(section, dayPart, e); },
            style: { maxWidth: 120 },
          })}
        </Fld>
        {times.map(function (t, i) {
          return (
            <div key={"slot-" + i} style={slotRowStyle}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  alignSelf: "center",
                  paddingBottom: 6,
                }}
              >
                {slotLabelFor(section, dayPart, i, block.count)}
              </div>
              <Fld label="Start">
                {mkInp({
                  type: "time",
                  className: "mgt-hover-scale",
                  value: t.start,
                  onChange: function (e) { onSlotTimeChange(section, dayPart, i, "start", e); },
                })}
              </Fld>
              <Fld label="End">
                {mkInp({
                  type: "time",
                  className: "mgt-hover-scale",
                  value: t.end,
                  onChange: function (e) { onSlotTimeChange(section, dayPart, i, "end", e); },
                })}
              </Fld>
            </div>
          );
        })}
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
  const anyDirty = fohDirty || kitchenDirty || hoursDirty || openDaysFormDirty;
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
        {/* Operating time.
            Sits at the top because it constrains the template — narrowing
            the window surfaces errors on any template row that no longer
            fits, and the manager has to fix the window first. */}
        <Collapsible
          title="Operating time"
          open={openSection === "hours"}
          onToggle={function () { toggleSection("hours"); }}
          dirty={operatingDirty}
          className="mgt-hover-scale"
          headerClassName="mgt-hover-scale"
        >
          <div style={{ ...S.fldLabel, marginBottom: 6 }}>Restaurant open</div>
          <div style={hoursRowStyle}>
            <Fld label="Start">
              {mkInp({
                type: "time",
                className: "mgt-hover-scale",
                value: hoursForm.operatingStart,
                onChange: function (e) { onHoursChange("operatingStart", e); },
              })}
            </Fld>
            <Fld label="End">
              {mkInp({
                type: "time",
                className: "mgt-hover-scale",
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

          {/* v0.12.0 / v1.3.0: opening-days picker. A row of weekday pills,
              each showing a state indicator (D·E / D / E / —). Tap a pill
              to open a small inline popover with two Toggle rows for
              Day / Evening. Storage shape is per-day-part `{day, evening}`;
              the schedule grid and PDF export skip closed-dayPart cells. */}
          <div style={{ marginTop: 12 }}>
            <div style={{ ...S.fldLabel, marginBottom: 6 }}>Open days</div>
            <div
              style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
              ref={popoverRef}
            >
              {WEEKDAYS.map(function (d) {
                const entry = openingDaysForm[d.key] || { day: false, evening: false };
                const dayOn = entry.day === true;
                const eveOn = entry.evening === true;
                const both = dayOn && eveOn;
                const closed = !dayOn && !eveOn;
                const stateLabel = both
                  ? "D·E"
                  : (dayOn ? "D" : (eveOn ? "E" : "—"));
                // Visual: solid accent when both open (default), soft tint
                // when partial, muted when closed.
                const bg = both
                  ? "var(--accent)"
                  : (closed ? "var(--bg-pill)" : "var(--accent-tint-soft)");
                const fg = both
                  ? "var(--text-on-accent)"
                  : (closed ? "var(--text-muted)" : "var(--accent-on-tint)");
                const border = both
                  ? "var(--accent-deep)"
                  : (closed ? "var(--btn-ghost-border)" : "var(--accent-tint-strong)");
                const popped = openDayPopover === d.key;
                return (
                  <div key={d.key} style={{ position: "relative" }}>
                    <button
                      type="button"
                      className="mgt-hover-scale"
                      onClick={function () {
                        setOpenDayPopover(function (cur) {
                          return cur === d.key ? null : d.key;
                        });
                      }}
                      aria-haspopup="dialog"
                      aria-expanded={popped ? "true" : "false"}
                      style={{
                        ...BTN.base,
                        padding: "6px 10px",
                        fontSize: 12,
                        borderRadius: 8,
                        minWidth: 56,
                        background: bg,
                        color: fg,
                        border: "1px solid " + border,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 2,
                        lineHeight: 1.1,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{d.label}</span>
                      <span style={{ fontSize: 10, opacity: 0.85 }}>{stateLabel}</span>
                    </button>
                    {popped ? (
                      // v1.3.0: anchored ABOVE the pill (bottom: 100% + 6px)
                      // so the popover sits in the empty space between the
                      // time-inputs row and the pill row — INSIDE the
                      // Collapsible body. Anchoring below was clipped by
                      // the Collapsible's overflow:hidden when the pill
                      // row sat at the bottom of the body.
                      <div
                        role="dialog"
                        aria-label={d.label + " open hours"}
                        style={{
                          position: "absolute",
                          bottom: "calc(100% + 6px)",
                          left: 0,
                          zIndex: 50,
                          minWidth: 200,
                          // v1.4.0 fixup: was var(--bg-card) — that token
                          // is 0.45 opacity (translucent card aesthetic)
                          // and let section labels above the pill row
                          // ("Restaurant open" / "Start" / "Open days")
                          // bleed through the popover. Match the Overlay
                          // atom's modal sheet (0.92 light / 0.95 dark)
                          // so the popover reads as a proper opaque
                          // surface even when the labels are right under
                          // it.
                          background: "var(--bg-overlay-sheet)",
                          border: "1px solid var(--hairline-strong)",
                          borderRadius: 10,
                          boxShadow: "var(--shadow-overlay)",
                          padding: 10,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginBottom: 2,
                          }}
                        >
                          {d.label} — open for
                        </div>
                        {[
                          { key: "day", label: "Day shifts", on: dayOn },
                          { key: "evening", label: "Evening shifts", on: eveOn },
                        ].map(function (opt) {
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              className="mgt-hover-scale"
                              onClick={function () {
                                setOpeningDayPart(d.key, opt.key, !opt.on);
                              }}
                              style={{
                                ...BTN.base,
                                padding: "8px 12px",
                                fontSize: 13,
                                borderRadius: 8,
                                textAlign: "left",
                                background: opt.on ? "var(--accent)" : "var(--bg-pill)",
                                color: opt.on ? "var(--text-on-accent)" : "var(--text-primary)",
                                border: "1px solid " + (opt.on ? "var(--accent-deep)" : "var(--btn-ghost-border)"),
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                cursor: "pointer",
                              }}
                            >
                              <span>{opt.label}</span>
                              <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 700 }}>
                                {opt.on ? "ON" : "OFF"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {openDaysErr ? (
              <div style={{ fontSize: 12, color: "var(--text-danger)", marginTop: 4 }}>
                {openDaysErr}
              </div>
            ) : (
              <div style={{ ...S.muted, marginTop: 6, fontSize: 11 }}>
                Tap a day to pick which shifts are open. Closed halves are hidden from the schedule grid and excluded from PDF export.
              </div>
            )}
          </div>
        </Collapsible>

        {/* Display preferences.
            v0.10.0: stack of Toggle rows. Each toggle auto-saves on change
            (no Save click). Structured this way so v0.11.0 dark-mode drops
            in as a sibling Toggle with zero layout churn. */}
        <Collapsible
          title="Display"
          open={openSection === "display"}
          onToggle={function () { toggleSection("display"); }}
          className="mgt-hover-scale"
          headerClassName="mgt-hover-scale"
        >
          <Toggle
            checked={showRolePills}
            onChange={onShowRolePillsChange}
            label="Show role pills on schedule cells"
            helper="The small coloured tag (Bar / Floor / Chef / Plating / Pot) next to each assignee's name in the schedule grid. Off hides them; the Employees tab badges are unaffected."
            className="mgt-hover-scale"
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
            className="mgt-hover-scale"
          />
        </Collapsible>

        {/* v1.0.0: Auto-generator config. Auto-saves on flip like the
            Display section — config-not-edit, no validation. The
            generator (Schedule grid's Generate button) reads this on
            each click. */}
        <Collapsible
          title="Auto-generator"
          open={openSection === "generator"}
          onToggle={function () { toggleSection("generator"); }}
          className="mgt-hover-scale"
          headerClassName="mgt-hover-scale"
        >
          <Toggle
            checked={strictPreference === true}
            onChange={onStrictPreferenceChange}
            label="Strict shift-preference matching"
            helper={strictPreference
              ? "Hard — generator only assigns preference-matching employees. May leave cells empty when no preferred candidate is available."
              : "Soft mode (default) — generator tries preferred employees first, falls back if no one fits."}
            className="mgt-hover-scale"
          />
        </Collapsible>

        <Collapsible
          title={SECTIONS.foh.label}
          open={openSection === "foh"}
          onToggle={function () { toggleSection("foh"); }}
          dirty={fohDirty}
          className="mgt-hover-scale"
          headerClassName="mgt-hover-scale"
        >
          {renderBlock("foh", "day", "Day shift")}
          {renderBlock("foh", "evening", "Evening shift")}
        </Collapsible>

        <Collapsible
          title={SECTIONS.kitchen.label}
          open={openSection === "kitchen"}
          onToggle={function () { toggleSection("kitchen"); }}
          dirty={kitchenDirty}
          className="mgt-hover-scale"
          headerClassName="mgt-hover-scale"
        >
          {renderBlock("kitchen", "day", "Day shift")}
          {renderBlock("kitchen", "evening", "Evening shift")}
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
          className: "mgt-hover-scale",
          onClick: handleReset,
          children: "Reset to defaults",
        })}
        {mkBtn({
          variant: "primary",
          className: "mgt-hover-scale",
          onClick: handleSave,
          disabled: saveDisabled,
          style: saveStyle,
          children: "Save changes",
        })}
      </div>
    </div>
  );
}
