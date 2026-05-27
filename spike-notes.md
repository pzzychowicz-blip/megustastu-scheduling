# Liquid Glass — design spike notes

Date: 2026-05-15 (v1), 2026-05-27 (v2 refresh + extension)
Branch: `spike/liquid-glass-redesign`
Worktree: `.claude/worktrees/charming-tu-b1494c` (v2 work);
the original v1 spike lived in `.claude/worktrees/liquid-glass-spike`.
Status: exploratory — never merges to `main`.

This file captures Liquid Glass design vocabulary harvested from the
`/liquid-glass` Claude skill (SwiftUI-targeted), translated to web
(CSS-in-JS) for MGT Staff Scheduling.

The v2 addendum (bottom of this file) adds the lens-distortion SVG
filter from the Apple Liquid Glass v2 reference HTML/CSS, refreshes
the spike against v1.13.0 production, and documents the dark-mode
recipe (missing in v1).

---

## Core principle (load-bearing)

> **Glass is for the navigation layer ONLY.** Toolbars, tab bars,
> buttons, controls. **Never** apply glass to content — lists,
> tables, media, text blocks, form inputs.

For MGT Scheduling, this maps to:

| Surface | Layer | Glass? |
|---|---|---|
| Top tab bar (Schedule / Employees / Requests / Settings) | Nav | ✅ Yes |
| Week-nav bar (week buttons + Export PDF) | Nav | ✅ Yes |
| Modal `Overlay` backdrop | Nav | ✅ Yes (already partial) |
| Primary action buttons (Save, Add) | Control | ✅ Yes (prominent) |
| Secondary buttons (Cancel, Reset) | Control | ✅ Yes (regular) |
| `Collapsible` accordion **header** strip | Control | ✅ Yes |
| `Collapsible` accordion **body** | Content | ❌ No — solid surface |
| `Toggle` switch track | Control | Subtle — keep mostly solid |
| Schedule grid cells | Content | ❌ No |
| Employee / Request list rows | Content | ❌ No |
| Form inputs (`mkInp`, selects) | Content | ❌ No |
| Settings main `S.card` container | Content | ❌ No |

So this spike does NOT reskin the schedule grid or list rows — it
reskins the navigation/control layer only. That aligns with the
existing `≤4 backdropFilter blur instances` rule in CLAUDE.md.

---

## Three glass styles (Apple terminology)

| Apple | When | Web translation |
|---|---|---|
| `.regular` | Standard nav/buttons. Medium transparency, full content adaptation. | `rgba(255,255,255,0.42)` base + `backdrop-filter: blur(28px) saturate(140%)` |
| `.clear` | High transparency. Media-rich backgrounds. | `rgba(255,255,255,0.18)` base + `backdrop-filter: blur(40px) saturate(160%)` — only over images |
| `.identity` | Disabled. Accessibility fallback (reduced transparency). | Pure solid `rgba(255,255,255,0.92)`, no blur |

`.glassProminent` exists separately for **primary action buttons** —
filled with tint colour, white text, the same liquid glass underlay
just made denser.

---

## Visual recipe (numeric, web-translated — v1)

Apple keeps blur radii / specular highlight values internal. Numbers
below are reasoned approximations based on observable iOS 26 / macOS
Tahoe screenshots and the WWDC25 session "Build a SwiftUI app with
the new design."

### Regular glass surface
```
background: rgba(255, 255, 255, 0.42);
backdrop-filter: blur(28px) saturate(140%);

box-shadow:
  inset 0 1px 0 rgba(255, 255, 255, 0.65),     /* top specular highlight */
  inset 0 -1px 0 rgba(0, 0, 0, 0.04),          /* bottom soft shadow */
  0 8px 24px rgba(0, 0, 0, 0.08);              /* drop shadow when floating */

border: 0.5px solid rgba(255, 255, 255, 0.35);
border-radius: 22px;
```

### Clear glass (over imagery / dark backgrounds)
```
background: rgba(255, 255, 255, 0.16);
backdrop-filter: blur(40px) saturate(160%);
```

### Prominent glass (primary buttons)
```
background: rgba(0, 122, 255, 0.85);
backdrop-filter: blur(20px) saturate(180%);
color: #ffffff;
```

### Tinted glass (state-coloured)
Low-alpha tint over the regular recipe via stacked linear-gradient.

---

## Motion / interactive behaviour

Apple's `.interactive()` glass scales on press, bounces on release,
shimmers, and propagates a touch-point illumination to nearby glass.
Web translation (toned down — touch-point illumination is not worth
the complexity for a spike):

- Hover scale 1.08 via the global `.mgt-hover-scale` utility (v1.9.0).
- Active press scale 0.96 via the spike's `.mgt-hover-scale--glass`
  variant (added in v2), which composes with the global utility.

---

## Container grouping (critical performance rule)

> Each glass effect creates a `CABackdropLayer` with offscreen
> textures. Without a `GlassEffectContainer`, many siblings → many
> textures → frame drops.

Web equivalent: each `backdrop-filter: blur()` is a compositor stage.
CLAUDE.md already caps the app at **≤4 simultaneous blur instances**.
Stay under that. Specifically:

- The four / five `Collapsible` HEADERS in Settings share ONE blur
  via a parent `S_GLASS.glassContainer`.
- The tab bar is ONE blur surface.
- The week-nav bar is ONE blur surface (v2 addition).
- The Overlay backdrop is ONE blur surface.
- The result banner is ONE blur surface (only when visible).

Worst case path: Schedule tab visible + result banner firing + modal
open = tab bar (1) + week-nav bar (1) + result banner (1) + modal
backdrop (1) = 4 blurs. Exactly at the limit, no headroom — must be
enforced by code review when adding any future glass.

---

## Accessibility / fallback chain

| Apple setting | Web detection | Behaviour |
|---|---|---|
| Reduced Transparency | `@media (prefers-reduced-transparency: reduce)` | All glass surfaces use the `.identity` fallback (opaque overlay-sheet, no blur). The lens filter and specular highlight are dropped. |
| Increased Contrast | `@media (prefers-contrast: more)` | Not yet wired (glass surfaces carry their own 0.5px border, which is the v1 mitigation). |
| Reduced Motion | `@media (prefers-reduced-motion: reduce)` | Hover scale + active press scale removed; transitions drop to 0ms via the `.mgt-hover-scale--glass` rules. |

The fallback chain is implemented via CSS media queries in `index.html`,
NOT via JS — keeps the React tree clean.

---

## Apply / skip plan (v1 — original spike, Settings + tab bar)

**Applied glass to:**
1. `Overlay` — backdrop blur upgraded.
2. `mkBtn` variants — primary → glassProminent, secondary → glass,
   ghost → glass clear, danger → glassProminent (red).
3. `Collapsible` header strip.
4. AppShell tab bar.
5. Settings Save/Reset row (now removed — v1.12.0 made Settings autosave).

**Skipped (per the glass-on-content prohibition):**
- Schedule grid cells, week rows, day cards.
- Employees / Requests list rows.
- Form inputs.
- Main `S.card` outer container.
- The `Section` atom (used inside content) — keep solid.

---

## Files in this spike (v2)

- `src/lib/constants.glass.js` — parallel `S_GLASS`, `BTN_GLASS`
  token exports. v2 moves every rgba literal to a CSS custom property
  in `index.html` so a single token works in both light AND dark mode.
- `src/components/atoms.glass.jsx` — parallel atoms named exactly the
  same so a wholesale import-source swap re-themes a component
  unchanged. v2 adds `GlassSurface` (the layered primitive) +
  `LensFilterDefs` (the SVG filter mount component) + composes mkBtn
  with `.mgt-hover-scale` instead of overriding it.
- `src/components/Settings.glass.jsx` — fork of Settings.jsx
  importing from `atoms.glass.jsx` end-to-end. Regenerated from
  current production at every spike refresh (do NOT hand-merge an
  old fork; the v1.6→v1.13 schema delta is too big).
- `src/components/ScheduleGrid.glass.jsx` — **v2 NEW**. Thin 30-line
  shim around production ScheduleGrid that wraps the week-nav bar
  and the result banner in `<GlassSurface>` via two optional wrap-
  prop hooks (`glassNavBarWrap`, `glassResultBannerWrap`) on
  production ScheduleGrid. The hooks default to identity functions
  in production, so production behaviour is byte-identical when the
  spike is off. Forking the full 1500-line ScheduleGrid for ~6 lines
  of structural change would be expensive and rot-prone; this
  extension point is the architectural compromise.
- `src/components/LoginScreen.glass.jsx` — **v2 NEW**. Fork of
  LoginScreen.jsx wrapping the auth card in `<GlassSurface>` so the
  card "floats" over the body gradient like the reference HTML's
  glass dock.
- `src/App.jsx` — adds `useGlass` runtime toggle (localStorage-
  backed) and a small floating capsule chip top-right of the
  viewport. Chip label flips between "Classic" and "✦ Glass" to
  advertise the current mode. Mounts `<LensFilterDefs/>` once at the
  root when glass is on.
- `src/components/AppShell.jsx` — accepts `useGlass` prop, routes
  Schedule / Settings to glass variants, wraps tab bar in
  `<GlassSurface>` when on.

**Distinct file names (`*.glass.*`) so if anything from this branch
were ever accidentally merged it would be obvious.**

---

## Decision pointer (post-spike)

Three outcomes possible:

- **Adopt** → commission a `feat/v1.14.0-liquid-glass` real branch off
  `main` that rewrites `constants.js` / `atoms.jsx` / `index.html` in
  place. The runtime toggle is dropped; glass becomes the default
  visual identity.
- **Adopt partially** → cherry-pick a subset. Likely candidates: the
  layered GlassSurface primitive + the lens filter for modals only
  (= "modals feel like Apple, rest stays current") OR the week-nav-
  bar treatment alone (= "nav floats, rest stays current").
- **Reject** → close the spike worktree, learnings persist in this
  file + `/Users/patrykzychowicz/.claude/plans/users-patrykzychowicz-desktop-megustast-zazzy-frog.md`
  for future reference.

---

# § v2 addendum (2026-05-27)

The v1 spike (2026-05-15, single commit at v0.10.1) used a single
`backdrop-filter: blur(28px) saturate(140%)` + `box-shadow` specular
recipe per glass surface. v2 adds two things on top:

1. **The layered four-div structure** from the Apple Liquid Glass v2
   reference HTML/CSS — separate sibling divs for `.glass-filter`
   (blur + lens-distortion SVG filter), `.glass-overlay` (translucent
   fill), `.glass-specular` (inset highlight), and `.glass-content`
   (actual children). The reusable `GlassSurface` primitive in
   `atoms.glass.jsx` mounts the four siblings around its children.
2. **The SVG `feDisplacementMap` lens-distortion filter** itself —
   defined once globally as `#mgtLensFilter` via the `LensFilterDefs`
   component (mounted at the App root when the toggle is on), and
   referenced from `.glass-filter` via `filter: url(#mgtLensFilter)
   saturate(120%) brightness(1.15)`. Numbers ported verbatim from the
   reference: `feGaussianBlur stdDeviation="50"` +
   `feDisplacementMap scale="50"`.

The v2 surfaces use the layered structure only on **large** surfaces
(tab bar, week-nav bar, modal backdrop, login card). Smaller surfaces
(individual buttons, accordion headers, the result banner) stay on
the v1 single-div recipe via `S_GLASS.glassRegular`. The lens filter
is GPU-heavy; restricting it to surfaces ≥ ~200px in any dimension
keeps the frame budget manageable.

## v2 dark-mode recipe

v1 was light-mode only (frozen at v0.10.1, before the v0.11.0 theming
system existed). v2 moves every JS rgba literal in `S_GLASS` to a CSS
custom property (`--lg-*` in `index.html`). The light + dark blocks
in `index.html` carry different values for each `--lg-*` token:

| Token | Light | Dark |
|---|---|---|
| `--lg-bg-regular` | `rgba(255,255,255,0.42)` | `rgba(28,28,30,0.42)` |
| `--lg-bg-prominent` | `rgba(0,122,255,0.85)` | `rgba(10,132,255,0.85)` (Apple dark systemBlue) |
| `--lg-bg-danger` | `rgba(255,59,48,0.85)` | `rgba(255,69,58,0.85)` (Apple dark systemRed) |
| `--lg-highlight` | `rgba(255,255,255,0.65)` | `rgba(255,255,255,0.40)` (lower alpha — pure white reads too sharp on dark) |
| `--lg-shadow-drop` | `rgba(0,0,0,0.08)` | `rgba(0,0,0,0.30)` (deeper, glass needs to stand off dark body) |

The atom code never branches on theme — the CSS layer handles
everything via `[data-theme="dark"]` overrides. This means atoms
stay simpler than the v1 spike envisioned (which had a hand-coded
dark recipe plan but never shipped it).

## v2 surfaces added since v1

The v1 spike scope was Settings + tab bar. Since v0.10.1 the
production app grew the Schedule tab's week-nav bar (5 action
buttons added between v1.0.0 and v1.10.0), 8 new modals (all routing
through `<Overlay>`), and three content-adjacent panels below the
grid (`<WeeklyShiftSummary>`, `<WeeklyRequestsPreview>`,
`<MonthlyFairnessPanel>`). v2 extends coverage to:

- **Schedule week-nav bar** (Prev/Today/Next + 5 action buttons +
  Export PDF) — wrapped in `<GlassSurface>` via the new
  wrap-prop hook on production ScheduleGrid. One blur instance.
- **Schedule result banner** (Generate / Clear / Undo summary) —
  wrapped on the same hook. One blur instance only when visible.
- **Login card** — desktop only; mobile keeps the solid full-sheet
  to dodge GPU budget on small devices.
- **Modal backdrop** — production Overlay already had `blur(8px)`;
  the glass Overlay upgrades to v2 layered glass + the lens filter
  at viewport scale, producing the most distinctive refraction
  effect in the app.

The three content-adjacent panels below the grid (`<WeeklyShiftSummary>`,
`<WeeklyRequestsPreview>`, `<MonthlyFairnessPanel>`) stay **solid**.
They're content surfaces per the principle. The pill buttons inside
them already use `.mgt-hover-scale` for affordance; that's enough.

## v2 risks / open questions

1. **`.mgt-hover-scale` composition with GlassSurface.** Adding the
   plain `mgt-hover-scale` class to a glass surface paints
   `background-color: var(--bg-hover-card)` over the glass effect.
   Mitigation: spike-only `.mgt-hover-scale--glass` variant that
   drops the bg override. Composes via standard CSS specificity.

2. **SVG filter clipping.** The `<filter id="mgtLensFilter">` is
   mounted at App root via `LensFilterDefs`. Modal Overlays sit at
   `position: fixed inset: 0 z-index: 1000` and reference the
   filter via `url(#mgtLensFilter)` — global, no scoping issue. To
   confirm in DEV.

3. **Past-week lockdown banner.** Stayed **solid** muted-amber per
   the design call (semantic weight matters: lockdown ≠ floating
   control). Worth double-checking that the visual rhythm — glass
   nav bar → solid amber banner → solid grid — reads correctly in
   DEV. Banner becomes the transitional surface between nav and
   content.

4. **Sparkline + jump-to-week in `<EmployeeFairnessModal>` (v1.13.0).**
   This modal sits over a glass backdrop. The 4 per-week bars are
   buttons with `.mgt-hover-scale`. Per the "no glass on content"
   rule, the bars stay solid — content reads as a clear surface
   floating over a glass-frosted backdrop.

5. **Bundle size impact.** v1 cost +2.22 kB gz over v0.10.1. v2
   adds GlassSurface (~30 LOC), LensFilterDefs (~15 LOC), and the
   two new file forks (ScheduleGrid.glass.jsx 60 LOC,
   LoginScreen.glass.jsx 140 LOC). Estimated +4–6 kB gz over
   v1.13.0. Acceptable for a spike; matters only if Adopted.

6. **The runtime toggle chip is solid, not glass.** Intentional — if
   anything in the glass tree blows up, the chip stays clickable so
   the user can switch back without F5. Chip lives in App.jsx
   (above AppShell) for the same reason: it must work even on the
   login screen, where AppShell isn't mounted.

## v2 architectural compromise: production ScheduleGrid extension points

The plan called for a `ScheduleGrid.glass.jsx` fork. Forking the full
1500-line component just to wrap two JSX trees (week-nav bar + result
banner) in `<GlassSurface>` would be expensive AND rot-prone — every
production change to ScheduleGrid would have to be re-applied to the
fork by hand.

Compromise: production ScheduleGrid grew two optional wrap-function
props (`glassNavBarWrap`, `glassResultBannerWrap`) that default to
identity. The glass fork is a 60-line shim that re-renders production
ScheduleGrid with wrappers that mount GlassSurface. Production
behaviour is byte-identical when the spike is off (the props are
unset → identity wrappers → unmodified JSX).

This is a small intrusion into production code (one comment block + 4
lines on the destructure) but is clearly labeled SPIKE HOOK and adds
no runtime cost when unused. Trade-off: cleaner long-term maintenance
vs strict adherence to the "no production contamination" spike
principle. The CLAUDE.md "push back on bad architecture" guideline
made this the right call.
