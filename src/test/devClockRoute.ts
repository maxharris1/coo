import { createJsonRoute } from "@/server/http";
import type { TestDeps } from "./deps";

export function devClockBuild(deps: TestDeps) {
  return async () => {
    const [{ offset_ms }] = await deps.db.query<{ offset_ms: number }>(
      "select offset_ms from dev_clock",
    );
    return {
      ...deps,
      clock: { now: () => deps.clock.now() + offset_ms, offsetMs: offset_ms },
    };
  };
}

export function devClockRoute(deps: TestDeps, build = devClockBuild(deps)) {
  return createJsonRoute(build, { appEnv: () => "test" });
}
