// src/firebase.js
// Dev/prod Firebase project split via Vite's import.meta.env.DEV.
//
//   - npm run dev    → import.meta.env.DEV === true  → DEV project (safe).
//   - npm run build  → import.meta.env.DEV === false → PROD project (Vercel).
//
// Firebase web API keys are NOT secrets — Database Rules are the actual
// security layer. Hardcoding them here is fine and matches Bookings.
//
// IMPORTANT: A coloured PROD/DEV banner logs at module load so you can
// see which project you're talking to in DevTools. Pairs with App.jsx's
// version banner.

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// ── Configs ──────────────────────────────────────────────────────────────

// v16.0.0 (phase 43): this was `megustastu-bookings-dev` — the BOOKINGS DEV
// project — copied over wholesale when this repo was scaffolded from its
// sister app. The two apps therefore shared one database, and shared the
// single `/settings` node inside it: Bookings' `layout`, `optimizer`,
// `bookingDefaults`, `general`, `dayShifts`, `operatingHours`, `whatsapp`
// and `users/{uid}/prefs` interleaved with this app's `openingDays`,
// `darkMode`, `operatingStart`/`End` and the rest.
//
// That is what broke every DEV settings save with PERMISSION_DENIED, and it
// was this app's fault rather than a rules misconfiguration: usePersistence
// reads the whole `/settings` node, Settings.jsx spreads it back into its
// own write, so each save rewrote Bookings' rev-guarded children at their
// existing values without bumping their revs — which Bookings' compare-and-
// swap rules reject, correctly. Only `/settings` failed; the keyed
// collections have no rules under them, which is why shifts and employees
// wrote fine and hid the problem for so long.
//
// Now its own project, so the two apps cannot reach each other's data at
// all. NOTE this project has its own Auth user pool and its own Database
// Rules — neither is inherited from Bookings DEV.
const devConfig = {
  apiKey: "AIzaSyA7K9g_vn2lJH31HkiFc5v54i5cjzjI8Ak",
  authDomain: "megustastu-scheduling-dev.firebaseapp.com",
  databaseURL: "https://megustastu-scheduling-dev-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "megustastu-scheduling-dev",
  storageBucket: "megustastu-scheduling-dev.firebasestorage.app",
  messagingSenderId: "867805153094",
  appId: "1:867805153094:web:590325c00749a54aac0747"
};

const prodConfig = {
  apiKey: "AIzaSyCUfhsl9hXsSo0W47zx3lRrcswfcvvbkDk",
  authDomain: "megustastu-scheduling.firebaseapp.com",
  databaseURL: "https://megustastu-scheduling-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "megustastu-scheduling",
  storageBucket: "megustastu-scheduling.firebasestorage.app",
  messagingSenderId: "629547480001",
  appId: "1:629547480001:web:7ea54a1aa951d3fe03b540"
};

// ── Pick + init ──────────────────────────────────────────────────────────
const isDev = import.meta.env.DEV;
const firebaseConfig = isDev ? devConfig : prodConfig;

// Coloured boot banner — green for DEV, red for PROD.
console.log(
  "%c[firebase] " + (isDev ? "DEV" : "PROD") + " — " + firebaseConfig.projectId,
  "background:" + (isDev ? "#0a0" : "#c00") +
    ";color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold;"
);

const app = initializeApp(firebaseConfig);

// Exported singletons. Consumers always import from here, never re-init.
export const db = getDatabase(app);
export const auth = getAuth(app);
export const isDevProject = isDev;
