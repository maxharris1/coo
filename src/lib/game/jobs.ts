import { config } from "@/lib/config";
import { hash32, rng } from "@/lib/flight/engine";
import { localDate, type LocalDate } from "@/lib/game/time";

export type Job = (typeof config.jobs.jobs)[number];
export type FoundObject = (typeof config.foundObjects.objects)[number];

const DAY_MS = 86_400_000;

function shuffledJobs(userId: string, date: LocalDate): Job[] {
  const r = rng(hash32("jobs:" + userId + ":" + date));
  const pool = [...config.jobs.jobs];
  for (let i = 0; i < pool.length; i++) {
    const j = i + Math.floor(r() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function setKey(jobs: Job[]): string {
  return jobs
    .map((j) => j.id)
    .sort()
    .join(",");
}

export function offersFor(userId: string, date: LocalDate): Job[] {
  const pool = shuffledJobs(userId, date);
  const n = Math.min(config.game.jobs.offered, pool.length);
  const draw = pool.slice(0, n);
  const dayMs = Date.parse(date);
  if ((dayMs / DAY_MS) % 2 === 0) return draw;
  const neighbours = new Set(
    [dayMs - DAY_MS, dayMs + DAY_MS].map((ms) =>
      setKey(shuffledJobs(userId, localDate(ms, "UTC")).slice(0, n)),
    ),
  );
  if (!neighbours.has(setKey(draw))) return draw;
  const kept = draw.slice(0, n - 1);
  const last = pool
    .slice(n - 1)
    .find((job) => !neighbours.has(setKey([...kept, job])));
  return last ? [...kept, last] : draw;
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
