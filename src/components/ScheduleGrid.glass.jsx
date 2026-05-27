// src/components/ScheduleGrid.glass.jsx
// SPIKE FILE — thin glass shim around the production ScheduleGrid.
//
// Forking the full 1500-line ScheduleGrid just to wrap two JSX trees
// (the week-nav bar + the Generate/Clear/Undo result banner) in
// GlassSurface would be expensive and brittle. Instead, production
// ScheduleGrid accepts two optional wrap-function props
// (`glassNavBarWrap`, `glassResultBannerWrap`) that default to
// identity — invisible in production, available to the spike. This
// file is the spike's consumer of those props.
//
// The wrappers each receive the rendered JSX of the section as their
// single child and return a new JSX tree with <GlassSurface> around it.
// GlassSurface renders the four-div layered structure
// (glass-filter / glass-overlay / glass-specular / glass-content) for
// the v2 lens-distortion effect. The original content goes inside
// .glass-content and renders unchanged.
//
// All other props pass through to production ScheduleGrid verbatim.

import ScheduleGrid from "./ScheduleGrid.jsx";
import { S_GLASS } from "../lib/constants.glass.js";
import { GlassSurface } from "./atoms.glass.jsx";

function glassNavBarWrap(node) {
  // The production navBar JSX is a `<div>` with `marginBottom: 12` and
  // flex layout. Move those layout concerns OUT of the wrapped div and
  // ONTO the GlassSurface so the glass capsule sits naturally in the
  // flow. Strip the trailing margin from the inner div via inline
  // override (a wrapping GlassSurface owns the spacing).
  return (
    <GlassSurface
      style={S_GLASS.glassNavBar}
      contentStyle={{
        display: "flex",
        flex: 1,
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
      }}
    >
      {/* Render the production inner content; the inner div's own flex
          + marginBottom would double up here, so we replace the outer
          shell with the content of <GlassSurface>. The production
          children inside the original div are what we want to expose. */}
      {node.props.children}
    </GlassSurface>
  );
}

function glassResultBannerWrap(node) {
  // The result banner JSX has its own bg/border/shadow inline styles.
  // GlassSurface replaces those with the layered glass treatment, but
  // the inner content (banner text + Details + × buttons) keeps its
  // flex layout via contentStyle.
  return (
    <GlassSurface
      style={S_GLASS.glassResultBanner}
      contentStyle={{
        display: "flex",
        flex: 1,
        justifyContent: "space-between",
        alignItems: "center",
        gap: 8,
      }}
    >
      {node.props.children}
    </GlassSurface>
  );
}

export default function ScheduleGridGlass(props) {
  return (
    <ScheduleGrid
      {...props}
      glassNavBarWrap={glassNavBarWrap}
      glassResultBannerWrap={glassResultBannerWrap}
    />
  );
}
