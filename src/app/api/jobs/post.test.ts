import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { offersFor, type Job } from "@/lib/game/jobs";
import { localDate } from "@/lib/game/time";
import type { UserId } from "@/server/ports/auth";
import type { Row } from "@/server/rows";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { jobsPost } from "./post";

type JobRow = {
  id: string;
  bird_id: string;
  job_id: string;
  pay: number;
  status: string;
  ends_at: Date;
};

const MINUTE = 60_000;
const DAY = 86_400_000;
const TZ = "America/New_York";
const SETUP = {
  timezone: TZ,
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  deps.clock.set(Date.UTC(2026, 10, 20, 14, 0));
  client = geoClient(deps, jobsPost, "/api/jobs");
});

async function withProfile(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  return session;
}

async function onboarded(number: string, name: string) {
  const session = await withProfile(number, name);
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  const [bird] = await deps.db.query<{ id: string }>(
    "select id from birds where owner_id = $1 order by hatched_at, id limit 1",
    [session.id],
  );
  return { ...session, birdId: bird.id };
}

function todaysOffers(userId: string): Job[] {
  return offersFor(userId, localDate(deps.clock.now(), TZ));
}

function moveToDayWithOddPay(userId: string): Job {
  for (let i = 0; i < 60; i++) {
    const odd = todaysOffers(userId).find((job) => job.pay % 2 === 1);
    if (odd) return odd;
    deps.clock.advance(DAY);
  }
  throw new Error("no day in 60 offers an odd-pay job");
}

async function sendHome(birdId: string) {
  await deps.db.query(
    "update birds set status = 'home', busy_kind = null, busy_until = null where id = $1",
    [birdId],
  );
}

async function birdRow(birdId: string) {
  const [row] = await deps.db.query<Row<"birds">>(
    "select * from birds where id = $1",
    [birdId],
  );
  return row;
}

async function jobsOf(userId: string) {
  return deps.db.query<JobRow>(
    "select * from jobs where user_id = $1 order by started_at",
    [userId],
  );
}

describe("POST /api/jobs", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.post({
      jobId: "deli-slip",
      birdId: crypto.randomUUID(),
    });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.post(
      { jobId: "deli-slip", birdId: crypto.randomUUID() },
      jar,
    );
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });

  it.each([
    ["an empty body", {}],
    ["a missing birdId", { jobId: "deli-slip" }],
    ["a birdId that is not a uuid", { jobId: "deli-slip", birdId: "gerald" }],
    ["an empty jobId", { jobId: "", birdId: crypto.randomUUID() }],
    [
      "an unknown key",
      { jobId: "deli-slip", birdId: crypto.randomUUID(), pay: 99 },
    ],
  ])("answers %s with 400 invalid", async (_, body) => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.post(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await jobsOf(id)).toEqual([]);
  });

  it("starts an offered job: the bird is busy until the job ends", async () => {
    const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
    const [offer] = todaysOffers(id);
    const now = deps.clock.now();

    const { status, json } = await client.post(
      { jobId: offer.id, birdId },
      jar,
    );

    expect(status).toBe(200);
    const endsAt = now + offer.minutes * MINUTE;
    expect(json.job).toEqual({
      id: expect.any(String),
      jobId: offer.id,
      birdId,
      endsAt: new Date(endsAt).toISOString(),
      pay: offer.pay,
    });
    const [row] = await jobsOf(id);
    expect(row).toMatchObject({
      id: json.job.id,
      bird_id: birdId,
      job_id: offer.id,
      pay: offer.pay,
      status: "running",
    });
    expect(new Date(row.ends_at).getTime()).toBe(endsAt);
    const bird = await birdRow(birdId);
    expect(bird).toMatchObject({ status: "busy", busy_kind: "job" });
    expect(new Date(bird.busy_until!).getTime()).toBe(endsAt);
  });

  it("ac-3: pays full for three jobs, half rounded down for the fourth to sixth, and refuses the seventh", async () => {
    const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
    const odd = moveToDayWithOddPay(id);
    const { fullPayPerDay, maxPerDay, reducedPayFactor } = config.game.jobs;

    const pays: number[] = [];
    for (let n = 0; n < maxPerDay; n++) {
      const { status, json } = await client.post(
        { jobId: odd.id, birdId },
        jar,
      );
      expect(status).toBe(200);
      pays.push(json.job.pay);
      await sendHome(birdId);
      deps.clock.advance(MINUTE);
    }

    const half = Math.floor(odd.pay * reducedPayFactor);
    expect(half).toBeLessThan(odd.pay * reducedPayFactor);
    expect(pays).toEqual([
      ...Array(fullPayPerDay).fill(odd.pay),
      ...Array(maxPerDay - fullPayPerDay).fill(half),
    ]);
    expect((await jobsOf(id)).map((j) => j.pay)).toEqual(pays);

    const seventh = await client.post({ jobId: odd.id, birdId }, jar);
    expect(seventh.status).toBe(409);
    expect(seventh.json.error.code).toBe("conflict");
    expect(await jobsOf(id)).toHaveLength(maxPerDay);
    expect(await birdRow(birdId)).toMatchObject({ status: "home" });
  });

  it("ac-3: counts the owner's local day, so the next local morning pays full again", async () => {
    const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
    deps.clock.set(Date.UTC(2026, 10, 21, 4, 0));
    for (let n = 0; n < config.game.jobs.maxPerDay; n++) {
      const [offer] = todaysOffers(id);
      const res = await client.post({ jobId: offer.id, birdId }, jar);
      expect(res.status).toBe(200);
      await sendHome(birdId);
    }
    const [late] = todaysOffers(id);
    expect((await client.post({ jobId: late.id, birdId }, jar)).status).toBe(
      409,
    );

    deps.clock.set(Date.UTC(2026, 10, 21, 5, 1));
    const [morning] = todaysOffers(id);
    const { status, json } = await client.post(
      { jobId: morning.id, birdId },
      jar,
    );
    expect(status).toBe(200);
    expect(json.job.pay).toBe(morning.pay);
  });

  it("ac-5: refuses a bird that is busy on a job as 409 conflict", async () => {
    const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
    const [first, second] = todaysOffers(id);
    expect((await client.post({ jobId: first.id, birdId }, jar)).status).toBe(
      200,
    );
    const before = await birdRow(birdId);

    const { status, json } = await client.post(
      { jobId: second.id, birdId },
      jar,
    );

    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(await jobsOf(id)).toHaveLength(1);
    expect(await birdRow(birdId)).toEqual(before);
  });

  it("ac-5: refuses a bird that is flying as 409 conflict", async () => {
    const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
    await deps.db.query("update birds set status = 'flying' where id = $1", [
      birdId,
    ]);
    const before = await birdRow(birdId);
    const [offer] = todaysOffers(id);

    const { status, json } = await client.post(
      { jobId: offer.id, birdId },
      jar,
    );

    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(await jobsOf(id)).toEqual([]);
    expect(await birdRow(birdId)).toEqual(before);
  });

  it.each([
    ["a real job that is not on offer today", "offpool"],
    ["a job id that does not exist", "made-up-job"],
  ])("ac-5: refuses %s as 404 not_found", async (_, kind) => {
    const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
    const offered = new Set(todaysOffers(id).map((job) => job.id));
    const jobId =
      kind === "offpool"
        ? config.jobs.jobs.find((job) => !offered.has(job.id))!.id
        : "made-up-job";
    const before = await birdRow(birdId);

    const { status, json } = await client.post({ jobId, birdId }, jar);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await jobsOf(id)).toEqual([]);
    expect(await birdRow(birdId)).toEqual(before);
  });

  it("refuses someone else's bird as 404 not_found", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const priya = await onboarded("(555) 987-6543", "Priya");
    const before = await birdRow(priya.birdId);
    const [offer] = todaysOffers(max.id);

    const { status, json } = await client.post(
      { jobId: offer.id, birdId: priya.birdId },
      max.jar,
    );

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await jobsOf(max.id)).toEqual([]);
    expect(await jobsOf(priya.id)).toEqual([]);
    expect(await birdRow(priya.birdId)).toEqual(before);
  });
});
