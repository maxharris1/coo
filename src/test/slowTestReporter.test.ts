import { afterEach, describe, expect, it, vi } from "vitest";
import type { TestModule } from "vitest/node";
import { slowTestReporter } from "./slowTestReporter.mjs";

type FakeTest = {
  name: string;
  state: "pass" | "fail" | "skip";
  durationMs: number;
};

function fakeModule(file: string, tests: FakeTest[]): TestModule {
  return {
    relativeModuleId: file,
    children: {
      *allTests() {
        for (const t of tests) {
          yield {
            fullName: t.name,
            attempts: () => [{ state: t.state, duration: t.durationMs }],
            diagnostic: () =>
              t.state === "skip" ? undefined : { duration: t.durationMs },
          };
        }
      },
    },
  } as unknown as TestModule;
}

function report(modules: TestModule[]): string[] {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  slowTestReporter.onTestRunEnd!(modules, [], "passed");
  return log.mock.calls.map((call) => String(call[0]));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("slowTestReporter", () => {
  it("lists passed and failed tests over 2s, slowest first", () => {
    const lines = report([
      fakeModule("a.test.ts", [
        { name: "fast", state: "pass", durationMs: 1999 },
        { name: "slow pass", state: "pass", durationMs: 2100 },
        { name: "slow fail", state: "fail", durationMs: 3400 },
      ]),
    ]);
    expect(lines).toEqual([
      "Tests slower than 2000ms (slowest first):",
      "  3400ms  a.test.ts > slow fail",
      "  2100ms  a.test.ts > slow pass",
    ]);
  });

  it("lists a test that ran over 2s and then skipped itself", () => {
    const lines = report([
      fakeModule("b.test.ts", [
        { name: "slow then skip", state: "skip", durationMs: 2300 },
      ]),
    ]);
    expect(lines).toEqual([
      "Tests slower than 2000ms (slowest first):",
      "  2300ms  b.test.ts > slow then skip",
    ]);
  });

  it("says so when no test is over 2s", () => {
    const lines = report([
      fakeModule("c.test.ts", [
        { name: "fast", state: "pass", durationMs: 2000 },
      ]),
    ]);
    expect(lines).toEqual(["No tests slower than 2000ms."]);
  });
});
