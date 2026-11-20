import type { Reporter } from "vitest/node";

export const SLOW_TEST_THRESHOLD_MS = 2000;

export const slowTestReporter: Reporter = {
  onTestRunEnd(testModules) {
    const slow = testModules
      .flatMap((testModule) =>
        Array.from(testModule.children.allTests(), (test) => ({
          file: testModule.relativeModuleId,
          name: test.fullName,
          durationMs:
            test.diagnostic()?.duration ??
            test.attempts().reduce((sum, attempt) => sum + attempt.duration, 0),
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
