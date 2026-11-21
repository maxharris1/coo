import { offersFor } from "@/lib/game/jobs";
import { jobPay } from "@/lib/game/seeds";
import { localDate, startOfLocalDayMs } from "@/lib/game/time";
import type { OnboardedCaller } from "@/server/auth";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";

export type JobOffer = {
  id: string;
  text: string;
  minutes: number;
  pay: number;
};
export type JobOffers = { offers: JobOffer[]; leftToday: number };

export async function jobsStartedToday(
  db: Db,
  userId: string,
  timezone: string,
  nowMs: number,
): Promise<number> {
  const [{ count }] = await db.query<{ count: number }>(
    `select count(*)::int as count from jobs
     where user_id = $1 and started_at >= to_timestamp($2 / 1000.0)`,
    [userId, startOfLocalDayMs(nowMs, timezone)],
  );
  return count;
}

export async function jobOffers(
  deps: Deps,
  caller: OnboardedCaller,
): Promise<JobOffers> {
  const { userId, profile } = caller;
  const now = deps.clock.now();
  const started = await jobsStartedToday(
    deps.db,
    userId,
    profile.timezone,
    now,
  );
  const pay = (job: { pay: number }) => {
    const next = jobPay(job, started);
    return next.ok ? next.seeds : 0;
  };
  return {
    offers: offersFor(userId, localDate(now, profile.timezone)).map((job) => ({
      id: job.id,
      text: job.text,
      minutes: job.minutes,
      pay: pay(job),
    })),
    leftToday: Math.max(0, deps.config.game.jobs.maxPerDay - started),
  };
}
