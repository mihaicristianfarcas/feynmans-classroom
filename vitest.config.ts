// Unit tests: tests/**/*.test.ts, each file in its own process (several set DATA_DIR before importing the server).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { root: ".", include: ["tests/**/*.test.ts"], testTimeout: 60000, pool: "forks" },
});
