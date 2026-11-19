import type { Env } from "@/env";
import type { Db } from "./db";

export interface Clock {
  now(): number;
}

const OFFSET_TTL_MS = 5_000;

export function offsetClock(offsetMs: number): Clock {
  return { now: () => Date.now() + offsetMs };
}

export function clockSource(
  appEnv: Env["APP_ENV"],
): (db: Db) => Promise<Clock> {
  if (appEnv === "production") {
    const clock = offsetClock(0);
    return async () => clock;
  }
  let cached: { offsetMs: number; readAt: number } | undefined;
  return async (db) => {
    const readAt = Date.now();
    if (!cached || readAt - cached.readAt >= OFFSET_TTL_MS) {
      const [{ offset_ms }] = await db.query<{ offset_ms: number }>(
        "select offset_ms from dev_clock",
      );
      cached = { offsetMs: offset_ms, readAt };
    }
    return offsetClock(cached.offsetMs);
  };
}
