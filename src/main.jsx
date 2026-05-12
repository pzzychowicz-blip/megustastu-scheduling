// src/main.jsx
// Single entry point. Mounts <App /> into #root.
// No React import — Vite's automatic JSX runtime handles it.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

const rootEl = document.getElementById("root");
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
