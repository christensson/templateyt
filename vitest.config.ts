import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is ./src: tests live next to the model in @types and
// fixtures in test/.
export default defineConfig({
  test: {
    root: ".",
    include: ["@types/**/*.test.ts", "src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
