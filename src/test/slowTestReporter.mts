import type { Reporter, TestAttempt } from "vitest/node";

export const SLOW_TEST_THRESHOLD_MS = 2000;

function elapsedAcrossAttempts(attempts: ReadonlyArray<TestAttempt>): number {
  const first = attempts.at(0);
  const last = attempts.at(-1);
  return first && last ? last.startTime + last.duration - first.startTime : 0;
}

export const slowTestReporter: Reporter = {
  onTestRunEnd(testModules) {
    const slow = testModules
      .flatMap((testModule) =>
        Array.from(testModule.children.allTests(), (test) => ({
          file: testModule.relativeModuleId,
          name: test.fullName,
          durationMs:
            test.diagnostic()?.duration ??
            elapsedAcrossAttempts(test.attempts()),
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
