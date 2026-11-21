import { config } from "@/lib/config";
import { foundObjectFor } from "@/lib/game/jobs";
import type { Db } from "@/server/db";
import type { Step, StepContext } from "../tick";
import { eachRow } from "./rows";

type ClaimedJob = {
  id: string;
  user_id: string;
  bird_id: string;
  pay: number;
  ends_at: Date;
};

async function dueIds(ctx: StepContext): Promise<string[]> {
  const due = await ctx.deps.db.query<{ id: string }>(
    `select id from jobs
     where status = 'running' and ends_at <= $1
       and ($2::uuid is null or user_id = $2)
     order by ends_at limit $3`,
    [
      new Date(ctx.deps.clock.now()).toISOString(),
      ctx.userId ?? null,
      ctx.limit,
    ],
  );
  return due.map((r) => r.id);
}

async function finishOne(tx: Db, id: string, nowMs: number) {
  const nowIso = new Date(nowMs).toISOString();
  const [job] = await tx.query<ClaimedJob>(
    `update jobs set status = 'done'
     where id = $1 and status = 'running' and ends_at <= $2
     returning id, user_id, bird_id, pay, ends_at`,
    [id, nowIso],
  );
  if (!job) return false;

  if (job.pay > 0)
    await tx.query("select apply_seeds($1, $2, 'job', $3)", [
      job.user_id,
      job.pay,
      job.id,
    ]);

  const found = foundObjectFor(job.id, config.game.jobs.foundObjectChance);
  if (found)
    await tx.query(
      `insert into found_objects (user_id, bird_id, object_id, value, source_id, found_at)
       values ($1, $2, $3, $4, $5, $6) on conflict (source_id) do nothing`,
      [
        job.user_id,
        job.bird_id,
        found.id,
        found.value,
        job.id,
        job.ends_at.toISOString(),
      ],
    );

  await tx.query(
    `update birds set status = 'home', busy_kind = null, busy_until = null
     where id = $1 and status = 'busy' and busy_kind = 'job'`,
    [job.bird_id],
  );
  await tx.query(
    "insert into events (user_id, kind, created_at) values ($1, 'landed', $2)",
    [job.user_id, nowIso],
  );
  return true;
}

export const finishJobs: Step = async (ctx) => {
  const { done, failed } = await eachRow(
    ctx,
    "finishJobs",
    await dueIds(ctx),
    async (tx, id) =>
      (await finishOne(tx, id, ctx.deps.clock.now())) ? id : null,
  );
  return { count: done.length, failed };
};
