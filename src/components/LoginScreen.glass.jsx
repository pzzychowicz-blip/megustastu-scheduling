// src/components/LoginScreen.glass.jsx
// SPIKE FILE — Liquid Glass v2 fork of LoginScreen.jsx.
// Differences from production:
//   1. The card wrapping the form is a <GlassSurface> with the v2
//      layered lens-distortion effect, not a solid surface. The card
//      "floats" over the body gradient like the reference HTML's
//      glass dock — exactly the "floating sign-in chip" the design
//      brief named.
//   2. Inputs stay solid (content layer) and Sign-in button uses
//      glassProminent (primary glass variant from BTN_GLASS).
//   3. Mobile mode keeps a full-height card. Desktop uses the v2
//      capsule width (380px max).
//
// All other behaviour — sign-in handler, busy state, error banner,
// disabled state — is byte-identical to LoginScreen.jsx.

import { useState } from "react";
import { S_GLASS as S } from "../lib/constants.glass.js";
import { Fld, mkInp, mkBtn, GlassSurface } from "./atoms.glass.jsx";

export default function LoginScreenGlass({ signIn, busy, error, isMobile }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) return;
    signIn(email.trim(), password);
  }

  const shellStyle = {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: isMobile ? "stretch" : "center",
    padding: isMobile ? 0 : 24,
  };

  // Mobile keeps a solid full-sheet (glass on a full-height surface
  // would be visually overwhelming AND consume the device's whole
  // GPU budget for backdrop-filter). Desktop gets the glass card.
  const cardWrap = function (children) {
    if (isMobile) {
      return (
        <div
          style={{
            width: "100%",
            minHeight: "100vh",
            background: "var(--bg-pill)",
            padding: 24,
            boxSizing: "border-box",
          }}
        >
          {children}
        </div>
      );
    }
    return (
      <GlassSurface style={S.glassLoginCard}>
        {children}
      </GlassSurface>
    );
  };

  const errorBanner = error
    ? (
      <div
        style={{
          marginBottom: 12,
          padding: "8px 10px",
          background: "var(--bg-danger-tint)",
          border: "1px solid var(--border-danger-tint)",
          color: "var(--text-danger)",
          borderRadius: 10,
          fontSize: 13,
        }}
      >
        {error}
      </div>
    )
    : null;

  const submitDisabled = busy || !email.trim() || !password;

  return (
    <div style={shellStyle}>
      {cardWrap(
        <>
          <h1 style={{ ...S.h1, marginBottom: 4 }}>Me Gustas Tú</h1>
          <p style={{ ...S.muted, marginBottom: 20 }}>Staff Scheduling — sign in</p>

          {errorBanner}

          <form onSubmit={onSubmit} noValidate>
            <Fld label="Email">
              {mkInp({
                type: "email",
                autoComplete: "username",
                autoFocus: true,
                value: email,
                onChange: function (e) { setEmail(e.target.value); },
                placeholder: "you@example.com",
                disabled: busy,
                className: "mgt-hover-scale",
              })}
            </Fld>

            <Fld label="Password">
              {mkInp({
                type: "password",
                autoComplete: "current-password",
                value: password,
                onChange: function (e) { setPassword(e.target.value); },
                placeholder: "••••••••",
                disabled: busy,
                className: "mgt-hover-scale",
              })}
            </Fld>

            {mkBtn({
              type: "submit",
              variant: "primary",
              disabled: submitDisabled,
              className: "mgt-hover-scale",
              style: {
                width: "100%",
                marginTop: 8,
                opacity: submitDisabled ? 0.6 : 1,
                cursor: submitDisabled ? "not-allowed" : "pointer",
              },
              children: busy ? "Signing in…" : "Sign in",
            })}
          </form>

          <p
            style={{
              ...S.muted,
              marginTop: 16,
              textAlign: "center",
              fontSize: 11,
            }}
          >
            © 2026 Patryk Zychowicz · Manager access only
          </p>
        </>
      )}
    </div>
  );
}
