import { offersFor } from "@/lib/game/jobs";
import { jobPay } from "@/lib/game/seeds";
import { localDate } from "@/lib/game/time";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { Row } from "@/server/rows";
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
