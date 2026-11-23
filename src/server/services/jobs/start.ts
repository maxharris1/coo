import { jobDestination, oneWayMiles } from "@/lib/game/jobDest";
import { offersFor } from "@/lib/game/jobs";
import { levelFor } from "@/lib/game/levels";
import { activeLoft } from "@/lib/game/privacy";
import { jobPay } from "@/lib/game/seeds";
import { localDate } from "@/lib/game/time";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { Row } from "@/server/rows";
import { loftsOf } from "@/server/services/friends";
import { jobsStartedToday } from "./offers";

const MINUTE_MS = 60_000;

export async function startJob(
  deps: Deps,
  caller: OnboardedCaller,
  input: { jobId: string; birdId: string },
): Promise<{
  job: {
    id: string;
    jobId: string;
    birdId: string;
    endsAt: string;
    pay: number;
  };
}> {
  const { userId } = caller;
  const now = deps.clock.now();
  return deps.db.tx(async (db) => {
    const [profile] = await db.query<Profile>(
      "select * from profiles where id = $1 for update",
      [userId],
    );
    const [bird] = await db.query<Row<"birds">>(
      "select * from birds where id = $1 and owner_id = $2 for update",
      [input.birdId, userId],
    );
    if (!bird) {
      throw new AppError("not_found", "Could not find that bird.");
    }
    const job = offersFor(userId, localDate(now, profile.timezone)).find(
      (offer) => offer.id === input.jobId,
    );
    if (!job) {
      throw new AppError("not_found", "That job is not on offer today.");
    }
    if (bird.status !== "home") {
      throw new AppError("conflict", `${bird.name} is not home right now.`);
    }
    const [onJob] = await db.query<{ name: string }>(
      `select b.name from jobs j join birds b on b.id = j.bird_id
       where j.user_id = $1 and j.job_id = $2 and j.status = 'running'`,
      [userId, job.id],
    );
    if (onJob) {
      throw new AppError("conflict", `${onJob.name} is already on that job.`);
    }
    const pay = jobPay(
      job,
      await jobsStartedToday(db, userId, profile.timezone, now),
    );
    if (!pay.ok) {
      throw new AppError("conflict", "That's all the odd jobs for today.");
    }
    const endsAt = now + job.minutes * MINUTE_MS;
    const [{ id }] = await db.query<{ id: string }>(
      `insert into jobs (user_id, bird_id, job_id, pay, started_at, ends_at)
       values ($1, $2, $3, $4, to_timestamp($5 / 1000.0), to_timestamp($6 / 1000.0))
       returning id`,
      [userId, bird.id, job.id, pay.seeds, now, endsAt],
    );
    const loft = activeLoft(loftsOf(profile));
    if (loft) {
      const dest = jobDestination(
        id,
        loft.roost,
        oneWayMiles(bird.speed_mph, levelFor(bird.miles), job.minutes),
        job.short,
      );
      await db.query(
        "update jobs set dest_lat = $2, dest_lon = $3, dest_label = $4 where id = $1",
        [id, dest.lat, dest.lon, dest.label],
      );
    }
    await db.query(
      `update birds set status = 'busy', busy_kind = 'job',
         busy_until = to_timestamp($2 / 1000.0)
       where id = $1`,
      [bird.id, endsAt],
    );
    return {
      job: {
        id,
        jobId: job.id,
        birdId: bird.id,
        endsAt: new Date(endsAt).toISOString(),
        pay: pay.seeds,
      },
    };
  });
}
