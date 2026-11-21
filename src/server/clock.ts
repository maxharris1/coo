import type { Env } from "@/env";
import type { Db } from "./db";

export interface Clock {
  now(): number;
  offsetMs: number;
}

export function offsetClock(offsetMs: number): Clock {
  return { now: () => Date.now() + offsetMs, offsetMs };
}

export const systemClock: Clock = offsetClock(0);

export function clockSource(
  appEnv: Env["APP_ENV"],
): (db: Db) => Promise<Clock> {
  if (appEnv === "production") {
    return async () => systemClock;
  }
  return async (db) => {
    const [{ offset_ms }] = await db.query<{ offset_ms: number }>(
      "select offset_ms from dev_clock",
    );
    return offsetClock(offset_ms);
  };
}
