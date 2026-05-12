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
// TODO(patryk): paste real configs after creating the two Firebase projects
// (megustastu-scheduling and megustastu-scheduling-dev), region europe-west1.

const devConfig = {
  apiKey: "AIzaSyA7K9g_vn2lJH31HkiFc5v54i5cjzjI8Ak",
  authDomain: "megustastu-scheduling-dev.firebaseapp.com",
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
