import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import {
  SLOW_TEST_THRESHOLD_MS,
  slowTestReporter,
} from "./src/test/slowTestReporter.mjs";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    globalSetup: ["src/test/globalSetup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    slowTestThreshold: SLOW_TEST_THRESHOLD_MS,
    reporters: ["default", slowTestReporter],
  },
});
