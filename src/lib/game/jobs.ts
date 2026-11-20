import { config } from "@/lib/config";
import { hash32, rng } from "@/lib/flight/engine";
import type { LocalDate } from "@/lib/game/time";

export type Job = (typeof config.jobs.jobs)[number];
export type FoundObject = (typeof config.foundObjects.objects)[number];

export function offersFor(userId: string, date: LocalDate): Job[] {
  const r = rng(hash32("jobs:" + userId + ":" + date));
  const pool = [...config.jobs.jobs];
  const n = Math.min(config.game.jobs.offered, pool.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(r() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export function foundObjectFor(
  sourceId: string,
  chance: number,
): FoundObject | null {
  const r = rng(hash32("found:" + sourceId));
  if (r() >= chance) return null;
  const objects = config.foundObjects.objects;
  return objects[Math.floor(r() * objects.length)];
}
