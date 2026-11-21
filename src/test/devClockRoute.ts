import { createJsonRoute } from "@/server/http";
import type { TestDeps } from "./deps";

export function devClockRoute(deps: TestDeps) {
  return createJsonRoute(
    async () => {
      const [{ offset_ms }] = await deps.db.query<{ offset_ms: number }>(
        "select offset_ms from dev_clock",
      );
      return { ...deps, clock: { now: () => deps.clock.now() + offset_ms } };
    },
    { appEnv: () => "test" },
  );
}
