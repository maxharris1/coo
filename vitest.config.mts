import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import type { Reporter } from "vitest/node";

const SLOW_TEST_THRESHOLD_MS = 2000;

const slowTestReporter: Reporter = {
  onTestRunEnd(testModules) {
    const slow = testModules
      .flatMap((testModule) =>
        Array.from(testModule.children.allTests(), (test) => ({
          file: testModule.relativeModuleId,
          name: test.fullName,
          durationMs: test.diagnostic()?.duration ?? 0,
        })),
      )
      .filter((row) => row.durationMs > SLOW_TEST_THRESHOLD_MS)
      .sort((a, b) => b.durationMs - a.durationMs);

    if (slow.length === 0) {
      console.log(`No tests slower than ${SLOW_TEST_THRESHOLD_MS}ms.`);
      return;
    }
    console.log(
      `Tests slower than ${SLOW_TEST_THRESHOLD_MS}ms (slowest first):`,
    );
    for (const { file, name, durationMs } of slow) {
      console.log(`  ${Math.round(durationMs)}ms  ${file} > ${name}`);
    }
  },
};

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
