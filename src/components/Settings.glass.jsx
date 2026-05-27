// src/components/Settings.glass.jsx
// SPIKE FILE — Liquid Glass v2 fork of Settings.jsx. Regenerated from the
// current production Settings.jsx (v1.13.0) with TWO changes only:
//
//   1. Import sources swapped:
//        - `S, BTN, ...constants` → `S_GLASS as S, BTN_GLASS as BTN, ...`
//          from `../lib/constants.glass.js`
//        - `Collapsible, Toggle, Fld, mkInp, mkBtn` → from `./atoms.glass.jsx`
//      The body code references `S.*` and `BTN.*` unchanged, so the alias
//      keeps every line below pointing at the same names.
//
//   2. The 5 Collapsible accordions are wrapped in a single
//      `S_GLASS.glassContainer` so the blur is shared (Apple's
//      `GlassEffectContainer` equivalent — one blur instance, not 5).
//      The Collapsibles inside drop their per-section card styling
//      (handled by the glass atom); inter-section separation comes from
//      the body's `borderTop` hairline + the accordion-header active tint.
//
// Everything else (validation logic, autosave debounces, opening-days
// popover, the v1.11.0 / v1.12.0 schema fields) is byte-identical to
// production. Keeping the divergence minimal makes future refreshes
// (next time production Settings.jsx evolves) a copy-paste-and-edit-
// imports operation.

import { useEffect, useRef, useState } from "react";
import {
  S_GLASS as S,
  BTN_GLASS as BTN,
  SECTIONS,
  DEFAULT_SHIFT_TEMPLATE,
  OPERATING_HOURS,
  DEFAULT_OPENING_DAYS,
  DEFAULT_GENERATOR_STRICT_PREFERENCE,
  DEFAULT_GENERATOR_BANNER_AUTO_DISMISS,
  DEFAULT_GENERATOR_BANNER_DURATION_SEC,
  GENERATOR_BANNER_DURATION_MIN,
  GENERATOR_BANNER_DURATION_MAX,
  DEFAULT_MIN_CONSECUTIVE_DAYS_OFF,
  MIN_CONSECUTIVE_DAYS_OFF_MIN,
  MIN_CONSECUTIVE_DAYS_OFF_MAX,
  DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS,
  MAX_CONSECUTIVE_WORKING_DAYS_MIN,
  MAX_CONSECUTIVE_WORKING_DAYS_MAX,
  DEFAULT_DAY_REQUIRED_ROLES,
  WEEKDAYS,
} from "../lib/constants.glass.js";
import {
  normalizeOpeningDays,
  materializeShiftTemplate,
  materializeShiftTemplateBlock as materializeBlock,
  resolveDayRequiredRoles,
} from "../lib/schedule-logic.js";
import { Collapsible, Toggle, Fld, mkInp, mkBtn } from "./atoms.glass.jsx";

function cloneTemplate(src) {
  const out = materializeShiftTemplate(src);
  if (out) return out;
  return {
    foh: {
      day: materializeBlock(null, "foh", "day"),
      evening: materializeBlock(null, "foh", "evening"),
    },
    kitchen: {
      day: materializeBlock(null, "kitchen", "day"),
      evening: materializeBlock(null, "kitchen", "evening"),
    },
  };
}

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

function hoursError(hours) {
  if (!hours.operatingStart || !hours.operatingEnd) {
    return "Both times required.";
  }
  if (hours.operatingStart >= hours.operatingEnd) {
    return "Operating end must be after start.";
  }
  return null;
}

function openingDaysError(days) {
  if (!days) return "Pick at least one open day.";
  for (let i = 0; i < WEEKDAYS.length; i++) {
    const entry = days[WEEKDAYS[i].key];
    if (entry && (entry.day || entry.evening)) return null;
  }
  return "Pick at least one open day.";
}

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

function blockDirty(a, b) {
  if (!a || !b) return false;
  if (a.count !== b.count) return true;
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

export default function Settings({
  shiftTemplate,
  saveShiftTemplate,
  settings,
  saveSettings,
  isMobile,
  isDark,
}) {
  const [form, setForm] = useState(function () {
    return cloneTemplate(shiftTemplate || DEFAULT_SHIFT_TEMPLATE);
  });

  const [hoursForm, setHoursForm] = useState(function () {
    return {
      operatingStart: (settings && settings.operatingStart) || OPERATING_HOURS.start,
      operatingEnd:   (settings && settings.operatingEnd)   || OPERATING_HOURS.end,
    };
  });
  const [hoursDirty, setHoursDirty] = useState(false);

  const [openingDaysForm, setOpeningDaysForm] = useState(function () {
    return normalizeOpeningDays((settings && settings.openingDays) || DEFAULT_OPENING_DAYS);
  });

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

  const [openSection, setOpenSection] = useState(function () {
    try {
      const v = sessionStorage.getItem("mgt-sched.settingsSection");
      if (v === null) return "hours";
      if (v === "null") return null;
      const known = ["hours", "display", "rules", "generator", "foh", "kitchen"];
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

  function onCountChange(section, dayPart, e) {
    const raw = e.target.value;
    const parsed = raw === "" ? NaN : parseInt(raw, 10);
    setForm(function (prev) {
      const block = prev[section][dayPart];
      const oldTimes = Array.isArray(block.times) ? block.times : [];
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

  function onHoursChange(field, e) {
    const value = e.target.value;
    setHoursForm(function (prev) { return { ...prev, [field]: value }; });
    setHoursDirty(true);
  }

  function setOpeningDayPart(weekdayKey, dayPart, value) {
    setOpeningDaysForm(function (prev) {
      const cur = prev[weekdayKey] || { day: false, evening: false };
      return { ...prev, [weekdayKey]: { ...cur, [dayPart]: Boolean(value) } };
    });
  }

  function onShowRolePillsChange(nextValue) {
    saveSettings({ ...(settings || {}), showRolePills: nextValue });
  }

  function onDarkModeChange(nextValue) {
    saveSettings({ ...(settings || {}), darkMode: nextValue });
  }
  const darkModeFollowingSystem =
    !settings || typeof settings.darkMode !== "boolean";

  function onStrictPreferenceChange(nextValue) {
    saveSettings({ ...(settings || {}), generatorStrictPreference: nextValue });
  }
  const strictPreference =
    settings && typeof settings.generatorStrictPreference === "boolean"
      ? settings.generatorStrictPreference
      : DEFAULT_GENERATOR_STRICT_PREFERENCE;

  function onBannerAutoDismissChange(nextValue) {
    saveSettings({ ...(settings || {}), generatorBannerAutoDismiss: nextValue });
  }
  const bannerAutoDismiss =
    settings && typeof settings.generatorBannerAutoDismiss === "boolean"
      ? settings.generatorBannerAutoDismiss
      : DEFAULT_GENERATOR_BANNER_AUTO_DISMISS;
  const bannerDurationSec =
    settings && Number.isFinite(settings.generatorBannerDurationSec)
      ? Math.max(
          GENERATOR_BANNER_DURATION_MIN,
          Math.min(GENERATOR_BANNER_DURATION_MAX, settings.generatorBannerDurationSec)
        )
      : DEFAULT_GENERATOR_BANNER_DURATION_SEC;
  function onBannerDurationChange(rawValue) {
    const n = parseInt(rawValue, 10);
    if (!Number.isFinite(n)) return;
    if (n < GENERATOR_BANNER_DURATION_MIN || n > GENERATOR_BANNER_DURATION_MAX) return;
    saveSettings({ ...(settings || {}), generatorBannerDurationSec: n });
  }

  const minConsecutiveDaysOff =
    settings && Number.isFinite(settings.minConsecutiveDaysOff)
      ? Math.max(
          MIN_CONSECUTIVE_DAYS_OFF_MIN,
          Math.min(MIN_CONSECUTIVE_DAYS_OFF_MAX, settings.minConsecutiveDaysOff)
        )
      : DEFAULT_MIN_CONSECUTIVE_DAYS_OFF;
  function onMinConsecutiveDaysOffChange(nextValue) {
    const n = parseInt(nextValue, 10);
    if (!Number.isFinite(n)) return;
    if (n < MIN_CONSECUTIVE_DAYS_OFF_MIN || n > MIN_CONSECUTIVE_DAYS_OFF_MAX) return;
    saveSettings({ ...(settings || {}), minConsecutiveDaysOff: n });
  }

  const maxConsecutiveWorkingDays =
    settings && Number.isFinite(settings.maxConsecutiveWorkingDays)
      ? Math.max(
          MAX_CONSECUTIVE_WORKING_DAYS_MIN,
          Math.min(MAX_CONSECUTIVE_WORKING_DAYS_MAX, settings.maxConsecutiveWorkingDays)
        )
      : DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS;
  function onMaxConsecutiveWorkingDaysChange(rawValue) {
    const n = parseInt(rawValue, 10);
    if (!Number.isFinite(n)) return;
    if (n < MAX_CONSECUTIVE_WORKING_DAYS_MIN || n > MAX_CONSECUTIVE_WORKING_DAYS_MAX) return;
    saveSettings({ ...(settings || {}), maxConsecutiveWorkingDays: n });
  }

  function resolveDayRequiredFor(sectionKey) {
    return resolveDayRequiredRoles(settings && settings.dayRequiredRoles, sectionKey);
  }
  function onDayRequiredRoleToggle(sectionKey, role) {
    const current = resolveDayRequiredFor(sectionKey);
    const has = current.indexOf(role) !== -1;
    const nextSet = has
      ? current.filter(function (r) { return r !== role; })
      : current.concat([role]);
    const fullObject = {};
    Object.keys(SECTIONS).forEach(function (k) {
      const rolesForSection = (SECTIONS[k] && SECTIONS[k].roles) || [];
      const sourceList = k === sectionKey ? nextSet : resolveDayRequiredFor(k);
      const obj = {};
      rolesForSection.forEach(function (r) {
        obj[r] = sourceList.indexOf(r) !== -1;
      });
      fullObject[k] = obj;
    });
    saveSettings({ ...(settings || {}), dayRequiredRoles: fullObject });
  }

  const opsErr = hoursError(hoursForm);
  const openDaysErr = openingDaysError(openingDaysForm);
  const blockHours = opsErr === null ? hoursForm : null;
  const errors = {
    fohDay:         blockError(form.foh.day,         blockHours),
    fohEvening:     blockError(form.foh.evening,     blockHours),
    kitchenDay:     blockError(form.kitchen.day,     blockHours),
    kitchenEvening: blockError(form.kitchen.evening, blockHours),
  };

  const savedTemplate = shiftTemplate || DEFAULT_SHIFT_TEMPLATE;
  const fohDirty =
    blockDirty(form.foh.day, savedTemplate.foh.day) ||
    blockDirty(form.foh.evening, savedTemplate.foh.evening);
  const kitchenDirty =
    blockDirty(form.kitchen.day, savedTemplate.kitchen.day) ||
    blockDirty(form.kitchen.evening, savedTemplate.kitchen.evening);

  const savedOpeningDays = normalizeOpeningDays(
    (settings && settings.openingDays) || DEFAULT_OPENING_DAYS
  );
  const openDaysFormDirty = openingDaysDirty(openingDaysForm, savedOpeningDays);
  const operatingDirty = hoursDirty || openDaysFormDirty;

  useEffect(function () {
    if (!operatingDirty) return undefined;
    if (opsErr !== null || openDaysErr !== null) return undefined;
    const t = setTimeout(function () {
      saveSettings({
        ...(settings || {}),
        operatingStart: hoursForm.operatingStart,
        operatingEnd:   hoursForm.operatingEnd,
        openingDays:    { ...openingDaysForm },
      });
      setHoursDirty(false);
    }, 800);
    return function () { clearTimeout(t); };
  }, [operatingDirty, hoursForm, openingDaysForm, opsErr, openDaysErr, settings, saveSettings]);

  useEffect(function () {
    const templateDirty = fohDirty || kitchenDirty;
    if (!templateDirty) return undefined;
    if (errors.fohDay !== null || errors.fohEvening !== null
        || errors.kitchenDay !== null || errors.kitchenEvening !== null) {
      return undefined;
    }
    const t = setTimeout(function () { saveShiftTemplate(form); }, 800);
    return function () { clearTimeout(t); };
  }, [fohDirty, kitchenDirty, form, errors.fohDay, errors.fohEvening,
      errors.kitchenDay, errors.kitchenEvening, saveShiftTemplate]);

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
    const defaultOpenDays = normalizeOpeningDays(DEFAULT_OPENING_DAYS);
    setForm(defaults);
    setHoursForm(defaultHours);
    setOpeningDaysForm(defaultOpenDays);
    saveShiftTemplate(defaults);
    const defaultDayRequired = {};
    Object.keys(DEFAULT_DAY_REQUIRED_ROLES).forEach(function (k) {
      const src = DEFAULT_DAY_REQUIRED_ROLES[k] || {};
      const copy = {};
      Object.keys(src).forEach(function (role) { copy[role] = src[role] === true; });
      defaultDayRequired[k] = copy;
    });
    saveSettings({
      operatingStart: OPERATING_HOURS.start,
      operatingEnd:   OPERATING_HOURS.end,
      openingDays:    defaultOpenDays,
      showRolePills:  true,
      generatorStrictPreference:    DEFAULT_GENERATOR_STRICT_PREFERENCE,
      generatorBannerAutoDismiss:   DEFAULT_GENERATOR_BANNER_AUTO_DISMISS,
      generatorBannerDurationSec:   DEFAULT_GENERATOR_BANNER_DURATION_SEC,
      minConsecutiveDaysOff:        DEFAULT_MIN_CONSECUTIVE_DAYS_OFF,
      maxConsecutiveWorkingDays:    DEFAULT_MAX_CONSECUTIVE_WORKING_DAYS,
      dayRequiredRoles:             defaultDayRequired,
    });
    setHoursDirty(false);
  }

  function slotLabelFor(section, dayPart, index, count) {
    if (dayPart === "day") {
      return count > 1 ? "Shift " + (index + 1) : "Shift";
    }
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

  const hoursRowStyle = {
    display: "grid",
    gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr",
    gap: isMobile ? 8 : 12,
  };

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

      {/* Glass v2: ALL five accordions share a single glassContainer so the
          parent owns one blur instance (Apple's GlassEffectContainer
          equivalent). The Collapsible glass atom drops its own outer
          surfaceSoft wrapper; sections inside flow as header + body pairs
          separated by the body's borderTop hairline. */}
      <div style={S.glassContainer}>
        <Collapsible
          title="Operating time"
          open={openSection === "hours"}
          onToggle={function () { toggleSection("hours"); }}
          dirty={operatingDirty}
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
                      <div
                        role="dialog"
                        aria-label={d.label + " open hours"}
                        style={{
                          position: "absolute",
                          bottom: "calc(100% + 6px)",
                          left: 0,
                          zIndex: 50,
                          minWidth: 200,
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

        <Collapsible
          title="Display"
          open={openSection === "display"}
          onToggle={function () { toggleSection("display"); }}
        >
          <Toggle
            checked={showRolePills}
            onChange={onShowRolePillsChange}
            label="Show role pills on schedule cells"
            helper="The small coloured tag (Bar / Floor / Chef / Plating / Pot) next to each assignee's name in the schedule grid."
            className="mgt-hover-scale"
          />
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

        <Collapsible
          title="Scheduling rules"
          open={openSection === "rules"}
          onToggle={function () { toggleSection("rules"); }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
                Consecutive days off
              </div>
              <div style={{ ...S.muted, fontSize: 11, marginTop: 2 }}>
                Every employee must have at least this many consecutive off days touching the week. Default 2.
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {[1, 2, 3].map(function (n) {
                const on = minConsecutiveDaysOff === n;
                return (
                  <button
                    key={n}
                    type="button"
                    className="mgt-hover-scale"
                    onClick={function () { onMinConsecutiveDaysOffChange(n); }}
                    style={{
                      ...BTN.base,
                      padding: "6px 14px",
                      fontSize: 13,
                      borderRadius: 8,
                      minWidth: 40,
                      background: on ? "var(--accent)" : "var(--bg-pill)",
                      color: on ? "var(--text-on-accent)" : "var(--text-primary)",
                      border: "1px solid " + (on ? "var(--accent-deep)" : "var(--btn-ghost-border)"),
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 12px",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
                Max consecutive working days
              </div>
              <div style={{ ...S.muted, fontSize: 11, marginTop: 2 }}>
                {MAX_CONSECUTIVE_WORKING_DAYS_MIN + "–" + MAX_CONSECUTIVE_WORKING_DAYS_MAX + " days."}
              </div>
            </div>
            {mkInp({
              type: "number",
              min: MAX_CONSECUTIVE_WORKING_DAYS_MIN,
              max: MAX_CONSECUTIVE_WORKING_DAYS_MAX,
              step: 1,
              className: "mgt-hover-scale",
              value: maxConsecutiveWorkingDays,
              onChange: function (e) { onMaxConsecutiveWorkingDaysChange(e.target.value); },
              style: { width: 120, flexShrink: 0 },
            })}
          </div>

          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
              Day-shift required roles
            </div>
            <div style={{ ...S.muted, fontSize: 11, marginTop: 2, marginBottom: 10 }}>
              For each section, pick which roles an employee must hold to be eligible for the day shift.
            </div>
            {Object.keys(SECTIONS).map(function (sectionKey) {
              const section = SECTIONS[sectionKey];
              const required = resolveDayRequiredFor(sectionKey);
              return (
                <div
                  key={sectionKey}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginTop: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      minWidth: 110,
                    }}
                  >
                    {section.label}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {section.roles.map(function (role) {
                      const on = required.indexOf(role) !== -1;
                      return (
                        <button
                          key={role}
                          type="button"
                          className="mgt-hover-scale"
                          onClick={function () { onDayRequiredRoleToggle(sectionKey, role); }}
                          style={{
                            ...BTN.base,
                            padding: "6px 12px",
                            fontSize: 12,
                            borderRadius: 999,
                            background: on ? "var(--accent)" : "var(--bg-pill)",
                            color: on ? "var(--text-on-accent)" : "var(--text-primary)",
                            border: "1px solid " + (on ? "var(--accent-deep)" : "var(--btn-ghost-border)"),
                          }}
                        >
                          {role}
                        </button>
                      );
                    })}
                  </div>
                  {required.length === 0 ? (
                    <div style={{ ...S.muted, fontSize: 11 }}>
                      Permissive — any role in {section.label}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Collapsible>

        <Collapsible
          title="Auto-generator"
          open={openSection === "generator"}
          onToggle={function () { toggleSection("generator"); }}
        >
          <Toggle
            checked={strictPreference === true}
            onChange={onStrictPreferenceChange}
            label="Strict shift-preference matching"
            helper={strictPreference
              ? "Hard — generator only assigns preference-matching employees."
              : "Soft mode (default) — generator tries preferred employees first, falls back if no one fits."}
            className="mgt-hover-scale"
          />
          <Toggle
            checked={bannerAutoDismiss === true}
            onChange={onBannerAutoDismissChange}
            label="Auto-dismiss results banner"
            helper={bannerAutoDismiss
              ? "Banner fades after " + bannerDurationSec + "s. Adjust the duration below."
              : "Banner stays visible until you close it or run the generator again."}
            className="mgt-hover-scale"
          />
          {bannerAutoDismiss ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: "var(--text-primary)", fontWeight: 500 }}>
                  Banner duration
                </div>
                <div style={{ ...S.muted, fontSize: 11, marginTop: 2 }}>
                  {GENERATOR_BANNER_DURATION_MIN + "–" + GENERATOR_BANNER_DURATION_MAX + " seconds"}
                </div>
              </div>
              {mkInp({
                type: "number",
                min: GENERATOR_BANNER_DURATION_MIN,
                max: GENERATOR_BANNER_DURATION_MAX,
                step: 1,
                className: "mgt-hover-scale",
                value: bannerDurationSec,
                onChange: function (e) { onBannerDurationChange(e.target.value); },
                style: { width: 120, flexShrink: 0 },
              })}
            </div>
          ) : null}
        </Collapsible>

        <Collapsible
          title={SECTIONS.foh.label}
          open={openSection === "foh"}
          onToggle={function () { toggleSection("foh"); }}
          dirty={fohDirty}
        >
          {renderBlock("foh", "day", "Day shift")}
          {renderBlock("foh", "evening", "Evening shift")}
        </Collapsible>

        <Collapsible
          title={SECTIONS.kitchen.label}
          open={openSection === "kitchen"}
          onToggle={function () { toggleSection("kitchen"); }}
          dirty={kitchenDirty}
        >
          {renderBlock("kitchen", "day", "Day shift")}
          {renderBlock("kitchen", "evening", "Evening shift")}
        </Collapsible>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
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
      </div>
    </div>
  );
}
