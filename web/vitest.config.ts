import { defineConfig } from "vitest/config";
import path from "path";

// Vitest config for the portfolio math layer (and any future pure-logic
// modules). We keep this minimal — no jsdom, no React Testing Library yet,
// and no CSS pipeline. The agent-loop tests in Phase 2 will likely add a
// jsdom config alongside.
//
// `css: false` tells Vitest not to load PostCSS / Tailwind. Without it,
// Vite's auto-discovery picks up the project's `postcss.config.js`,
// initializes Tailwind, and fails on any flaky transitive dep. Our tests
// don't touch CSS at all — opting out is the right call.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: false,
    css: false,
  },
  // Skip Vite's PostCSS pipeline entirely.
  css: { postcss: { plugins: [] } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
