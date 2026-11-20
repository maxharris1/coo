import type { Env } from "@/env";
import type { Db } from "./db";

export interface Clock {
  now(): number;
}

const OFFSET_TTL_MS = 5_000;

export function offsetClock(offsetMs: number): Clock {
  return { now: () => Date.now() + offsetMs };
}

export const systemClock: Clock = offsetClock(0);

export function clockSource(
  appEnv: Env["APP_ENV"],
): (db: Db) => Promise<Clock> {
  if (appEnv === "production") {
    return async () => systemClock;
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
