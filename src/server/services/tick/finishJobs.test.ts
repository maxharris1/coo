import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { foundObjectFor, offersFor } from "@/lib/game/jobs";
import { localDate } from "@/lib/game/time";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import type { Row } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { startJob } from "../jobs/start";
import { tick } from "../tick";

const MINUTE_MS = 60_000;
const CHANCE = config.game.jobs.foundObjectChance;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

async function callerFor(userId: string): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [userId],
  );
  return { userId: userId as UserId, profile };
}

async function seedsOf(userId: string) {
  const [row] = await deps.db.query<{ seeds: number }>(
    "select seeds from profiles where id = $1",
    [userId],
  );
  return row.seeds;
}

async function ledger(userId: string, reason: string) {
  return deps.db.query<{ delta: number; ref_id: string }>(
    "select delta, ref_id from seed_ledger where user_id = $1 and reason = $2",
    [userId, reason],
  );
}

async function birdRow(birdId: string) {
  const [row] = await deps.db.query<Row<"birds">>(
    "select * from birds where id = $1",
    [birdId],
  );
  return row;
}

async function jobStatus(jobId: string) {
  const [row] = await deps.db.query<{ status: string }>(
    "select status from jobs where id = $1",
    [jobId],
  );
  return row.status;
}

async function foundRows(userId: string) {
  return deps.db.query<{
    object_id: string;
    value: number;
    source_id: string;
    bird_id: string;
    traded_at: Date | null;
  }>(
    "select object_id, value, source_id, bird_id, traded_at from found_objects where user_id = $1 order by found_at, source_id",
    [userId],
  );
}

async function start(userId: string, birdId: string) {
  const caller = await callerFor(userId);
  const [offer] = offersFor(
    userId,
    localDate(deps.clock.now(), caller.profile.timezone),
  );
  const { job } = await startJob(deps, caller, { jobId: offer.id, birdId });
  return job;
}

function jobIdWhere(found: boolean, skip = new Set<string>()): string {
  for (let n = 1; n < 10_000; n++) {
    const id = `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
    if (skip.has(id)) continue;
    if ((foundObjectFor(id, CHANCE) !== null) === found) return id;
  }
  throw new Error("no job id found");
}

async function insertRunningJob(
  id: string,
  userId: string,
  birdId: string,
  pay: number,
) {
  const endsAt = new Date(deps.clock.now() + 30 * MINUTE_MS).toISOString();
  await deps.db.query(
    `insert into jobs (id, user_id, bird_id, job_id, pay, started_at, ends_at)
     values ($1, $2, $3, 'deli-slip', $4, $5, $6)`,
    [id, userId, birdId, pay, new Date(deps.clock.now()).toISOString(), endsAt],
  );
  await deps.db.query(
    "update birds set status = 'busy', busy_kind = 'job', busy_until = $2 where id = $1",
    [birdId, endsAt],
  );
  return Date.parse(endsAt);
}

describe("finishJobs", () => {
  it("ac-2: keeps the bird busy for the job's minutes, then pays the owner once and sends the bird home", async () => {
    const max = world.max.id;
    const gerald = world.max.birds[0].id;
    const before = await seedsOf(max);
    const job = await start(max, gerald);
    const endsAt = Date.parse(job.endsAt);

    deps.clock.set(endsAt - MINUTE_MS);
    expect((await tick(deps)).counts.finishJobs).toBe(0);
    expect(await birdRow(gerald)).toMatchObject({
      status: "busy",
      busy_kind: "job",
    });
    expect(await seedsOf(max)).toBe(before);
    expect(await jobStatus(job.id)).toBe("running");

    deps.clock.set(endsAt);
    expect((await tick(deps)).counts.finishJobs).toBe(1);
    expect(await birdRow(gerald)).toMatchObject({
      status: "home",
      busy_kind: null,
      busy_until: null,
    });
    expect(await jobStatus(job.id)).toBe("done");
    expect(await seedsOf(max)).toBe(before + job.pay);
    expect(await ledger(max, "job")).toEqual([
      { delta: job.pay, ref_id: job.id },
    ]);

    deps.clock.advance(MINUTE_MS);
    expect((await tick(deps)).counts.finishJobs).toBe(0);
    expect(await seedsOf(max)).toBe(before + job.pay);
    expect(await ledger(max, "job")).toHaveLength(1);
  });

  it("ac-2: pays the pay stored on the job, not the job's list price", async () => {
    const max = world.max.id;
    const gerald = world.max.birds[0].id;
    const before = await seedsOf(max);
    const endsAt = await insertRunningJob(jobIdWhere(false), max, gerald, 7);

    deps.clock.set(endsAt);
    await tick(deps);

    expect(await seedsOf(max)).toBe(before + 7);
  });

  it("ac-2: leaves a bird that is no longer on the job alone when the job ends", async () => {
    const max = world.max.id;
    const gerald = world.max.birds[0].id;
    const endsAt = await insertRunningJob(jobIdWhere(false), max, gerald, 10);
    await deps.db.query(
      "update birds set status = 'flying', busy_kind = null, busy_until = null where id = $1",
      [gerald],
    );

    deps.clock.set(endsAt);
    await tick(deps);

    expect(await birdRow(gerald)).toMatchObject({ status: "flying" });
  });

  it("ac-2: a tick scoped to one user finishes only that user's jobs", async () => {
    const maxJob = jobIdWhere(false);
    const maxEnds = await insertRunningJob(
      maxJob,
      world.max.id,
      world.max.birds[0].id,
      10,
    );
    const priyaJob = jobIdWhere(false, new Set([maxJob]));
    await insertRunningJob(priyaJob, world.priya.id, world.priya.birds[0].id, 10);

    deps.clock.set(maxEnds);
    await tick(deps, { userId: world.max.id });

    expect(await jobStatus(priyaJob)).toBe("running");
    expect(await birdRow(world.priya.birds[0].id)).toMatchObject({
      status: "busy",
    });
  });

  it("ac-4: brings back a found object only for job ids whose hash says so, once", async () => {
    const max = world.max.id;
    const lucky = jobIdWhere(true);
    const plain = jobIdWhere(false);
    const object = foundObjectFor(lucky, CHANCE)!;
    const endsAt = await insertRunningJob(
      lucky,
      max,
      world.max.birds[0].id,
      10,
    );
    await insertRunningJob(plain, max, world.max.birds[1].id, 10);

    deps.clock.set(endsAt);
    expect((await tick(deps)).counts.finishJobs).toBe(2);
    deps.clock.advance(MINUTE_MS);
    await tick(deps);

    expect(await foundRows(max)).toEqual([
      {
        object_id: object.id,
        value: object.value,
        source_id: lucky,
        bird_id: world.max.birds[0].id,
        traded_at: null,
      },
    ]);
  });
});
