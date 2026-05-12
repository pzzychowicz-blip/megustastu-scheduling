// vite.config.js
// React plugin enables Vite's automatic JSX runtime, so JSX files
// do NOT need `import React from "react"` at the top. All .jsx files
// are transformed automatically; .js files are NOT — keep pure logic in .js.

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
