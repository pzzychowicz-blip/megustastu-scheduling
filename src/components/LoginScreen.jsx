// src/components/LoginScreen.jsx
// Manager-only login form. Renders when useAuth().user is null.
//
// Props:
//   signIn  (fn)    — useAuth().signIn(email, password)
//   busy    (bool)  — useAuth().busy
//   error   (str)   — useAuth().error (or null)
//   isMobile(bool)  — full-sheet vs centered-card layout
//
// No sign-up flow. The manager account is created once via Firebase
// Console (Authentication → Users → Add user) in each project (DEV + PROD).

import { useState } from "react";
import { S, BTN } from "../lib/constants.js";
import { Fld, mkInp, mkBtn } from "./atoms.jsx";

export default function LoginScreen({ signIn, busy, error, isMobile }) {
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

  const cardStyle = isMobile
    ? {
        width: "100%",
        minHeight: "100vh",
        background: "rgba(255,255,255,0.6)",
        padding: 24,
        boxSizing: "border-box",
      }
    : {
        width: "100%",
        maxWidth: 380,
        background: "rgba(255,255,255,0.55)",
        border: "1px solid rgba(255,255,255,0.4)",
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 20px 50px rgba(0,0,0,0.10)",
      };

  // Pre-compute error banner so we don't use && inside the JSX tree.
  const errorBanner = error
    ? (
      <div
        style={{
          marginBottom: 12,
          padding: "8px 10px",
          background: "rgba(255,59,48,0.12)",
          border: "1px solid rgba(255,59,48,0.4)",
          color: "#9a1f17",
          borderRadius: 10,
          fontSize: 13,
        }}
      >
        {error}
      </div>
    )
    : null;

  // Disable submit when fields empty.
  const submitDisabled = busy || !email.trim() || !password;

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
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
            })}
          </Fld>

          {mkBtn({
            type: "submit",
            variant: "primary",
            disabled: submitDisabled,
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
      </div>
    </div>
  );
}
