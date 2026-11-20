import type { Clock } from "./clock";
import type { Db } from "./db";
import { AppError } from "./errors";

export async function rateLimit(
  db: Db,
  clock: Clock,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(clock.now() / windowMs) * windowMs;
  const [{ count }] = await db.query<{ count: number }>(
    `insert into rate_limits (key, window_start, count)
     values ($1, to_timestamp($2 / 1000.0), 1)
     on conflict (key, window_start) do update set count = rate_limits.count + 1
     returning count`,
    [key, windowStartMs],
  );
  if (count > limit) {
    throw new AppError("rate_limited", "Too many requests. Try again later.");
  }
}
