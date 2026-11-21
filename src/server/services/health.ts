import type { Deps } from "@/server/deps";

const STALE_AFTER_MS = 5 * 60_000;

export type Health = {
  lastTickAt: number | null;
  ageMs: number | null;
  stale: boolean;
};

export async function recordTick(deps: Pick<Deps, "db" | "clock">) {
  await deps.db.query(
    "update tick_health set last_ok_at = greatest(last_ok_at, to_timestamp($1 / 1000.0))",
    [deps.clock.now()],
  );
}

export async function health(
  deps: Pick<Deps, "db" | "clock">,
): Promise<Health> {
  const [row] = await deps.db.query<{ last_ok_at: Date | null }>(
    "select last_ok_at from tick_health",
  );
  const lastTickAt = row.last_ok_at?.getTime() ?? null;
  if (lastTickAt === null) return { lastTickAt, ageMs: null, stale: true };
  const ageMs = deps.clock.now() - lastTickAt;
  return { lastTickAt, ageMs, stale: ageMs > STALE_AFTER_MS };
}
