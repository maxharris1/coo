import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { haversineMi } from "@/lib/flight/engine";
import { jobDestination, oneWayMiles } from "@/lib/game/jobDest";
import { offersFor, type Job } from "@/lib/game/jobs";
import { levelFor } from "@/lib/game/levels";
import { snap, type Point } from "@/lib/game/privacy";
import { jobPay } from "@/lib/game/seeds";
import { localDate } from "@/lib/game/time";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import type { Row } from "@/server/rows";
import { onboard } from "@/server/services/onboarding";
import { adoptRoommate } from "@/server/services/roommate";
import { tick } from "@/server/services/tick";
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
  dest_lat: number | null;
  dest_lon: number | null;
  dest_label: string | null;
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

async function withRoommate(userId: string) {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [userId],
  );
  const caller: OnboardedCaller = { userId: userId as UserId, profile };
  const { bird } = await adoptRoommate(deps, caller, {
    name: "Brenda",
    pronoun: "she",
  });
  return bird.id;
}

const HOME = snap(40.7128, -74.006);
const TRAVEL = snap(64.1466, -21.9426);

afterEach(() => vi.restoreAllMocks());

async function setLofts(userId: string, travelOn: boolean) {
  await deps.db.query(
    `update profiles set
       home_lat = $2, home_lon = $3, home_label = 'Bleecker St', home_city = 'New York',
       home_city_lat = 40.71, home_city_lon = -74.01,
       travel_lat = $4, travel_lon = $5, travel_label = 'Laugavegur', travel_city = 'Reykjavik',
       travel_city_lat = 64.15, travel_city_lon = -21.94, travel_on = $6
     where id = $1`,
    [userId, HOME.lat, HOME.lon, TRAVEL.lat, TRAVEL.lon, travelOn],
  );
}

async function expectedDest(row: JobRow, roost: Point) {
  const bird = await birdRow(row.bird_id);
  const job = config.jobs.jobs.find((j) => j.id === row.job_id)!;
  const miles = oneWayMiles(bird.speed_mph, levelFor(bird.miles), job.minutes);
  return { miles, dest: jobDestination(row.id, roost, miles, job.short) };
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
  await deps.db.query(
    "update jobs set status = 'done' where bird_id = $1 and status = 'running'",
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

  it("ac-1: refuses a second bird on a running job as 409, naming the bird on it", async () => {
    const {
      id,
      jar,
      birdId: gerald,
    } = await onboarded("(555) 123-4567", "Max");
    const brenda = await withRoommate(id);
    const [offer] = todaysOffers(id);
    expect(
      (await client.post({ jobId: offer.id, birdId: gerald }, jar)).status,
    ).toBe(200);
    const jobsBefore = await jobsOf(id);
    const geraldBefore = await birdRow(gerald);
    const brendaBefore = await birdRow(brenda);

    const { status, json } = await client.post(
      { jobId: offer.id, birdId: brenda },
      jar,
    );

    expect(status).toBe(409);
    expect(json.error).toEqual({
      code: "conflict",
      message: "Gerald is already on that job.",
    });
    expect(jobsBefore).toHaveLength(1);
    expect(await jobsOf(id)).toEqual(jobsBefore);
    expect(brendaBefore).toMatchObject({ status: "home" });
    expect(await birdRow(brenda)).toEqual(brendaBefore);
    expect(await birdRow(gerald)).toEqual(geraldBefore);
  });

  it("ac-3: once the first job is done, the same job starts again at the daily table's pay", async () => {
    const {
      id,
      jar,
      birdId: gerald,
    } = await onboarded("(555) 123-4567", "Max");
    const brenda = await withRoommate(id);
    const [offer] = todaysOffers(id);
    const first = await client.post({ jobId: offer.id, birdId: gerald }, jar);
    expect(first.status).toBe(200);
    deps.clock.set(Date.parse(first.json.job.endsAt));
    await tick(deps, { userId: id });

    const { status, json } = await client.post(
      { jobId: offer.id, birdId: brenda },
      jar,
    );

    expect(status).toBe(200);
    expect(jobPay(offer, 1)).toEqual({ ok: true, seeds: json.job.pay });
    expect((await jobsOf(id)).map((j) => j.status)).toEqual([
      "done",
      "running",
    ]);
  });

  it("ac-3: two users may run the same catalog job at once", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const priya = await onboarded("(555) 987-6543", "Priya");
    const [offer] = todaysOffers(max.id);
    await deps.db.query(
      `insert into jobs (user_id, bird_id, job_id, pay, started_at, ends_at)
       values ($1, $2, $3, 8, to_timestamp($4 / 1000.0), to_timestamp($4 / 1000.0 + 3600))`,
      [priya.id, priya.birdId, offer.id, deps.clock.now()],
    );

    expect(
      (await client.post({ jobId: offer.id, birdId: max.birdId }, max.jar))
        .status,
    ).toBe(200);

    expect(
      [...(await jobsOf(max.id)), ...(await jobsOf(priya.id))].map((j) => [
        j.job_id,
        j.status,
      ]),
    ).toEqual([
      [offer.id, "running"],
      [offer.id, "running"],
    ]);
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
  describe("job destination", () => {
    it("ac-1: stores a snapped destination at the one-way distance from the home roost, keeping pay and timing", async () => {
      const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
      await setLofts(id, false);
      const [offer] = todaysOffers(id);
      const now = deps.clock.now();

      const { status, json } = await client.post(
        { jobId: offer.id, birdId },
        jar,
      );

      expect(status).toBe(200);
      expect(json.job.pay).toBe(offer.pay);
      expect(json.job).not.toHaveProperty("dest");
      const [row] = await jobsOf(id);
      const { miles, dest } = await expectedDest(row, HOME);
      expect(row).toMatchObject({
        pay: offer.pay,
        dest_lat: dest.lat,
        dest_lon: dest.lon,
        dest_label: offer.short,
      });
      expect(new Date(row.ends_at).getTime()).toBe(
        now + offer.minutes * MINUTE,
      );
      expect(snap(row.dest_lat!, row.dest_lon!)).toEqual({
        lat: row.dest_lat,
        lon: row.dest_lon,
      });
      expect(
        Math.abs(
          haversineMi(HOME, { lat: row.dest_lat!, lon: row.dest_lon! }) - miles,
        ),
      ).toBeLessThanOrEqual(0.15);
    });

    it("ac-1: measures from the travel roost when travel is on", async () => {
      const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
      await setLofts(id, true);
      const [offer] = todaysOffers(id);

      expect((await client.post({ jobId: offer.id, birdId }, jar)).status).toBe(
        200,
      );

      const [row] = await jobsOf(id);
      const { miles, dest } = await expectedDest(row, TRAVEL);
      expect([row.dest_lat, row.dest_lon]).toEqual([dest.lat, dest.lon]);
      expect(
        Math.abs(
          haversineMi(TRAVEL, { lat: row.dest_lat!, lon: row.dest_lon! }) -
            miles,
        ),
      ).toBeLessThanOrEqual(0.15);
    });

    it("ac-1: starts the job with no destination when the user has no loft", async () => {
      const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
      const [offer] = todaysOffers(id);

      expect((await client.post({ jobId: offer.id, birdId }, jar)).status).toBe(
        200,
      );

      expect(await jobsOf(id)).toEqual([
        expect.objectContaining({
          dest_lat: null,
          dest_lon: null,
          dest_label: null,
        }),
      ]);
    });

    it("ac-1: the database refuses a job row with only some destination columns set", async () => {
      const { id, birdId } = await onboarded("(555) 123-4567", "Max");
      await expect(
        deps.db.query(
          `insert into jobs (user_id, bird_id, job_id, pay, ends_at, dest_lat)
           values ($1, $2, 'deli-slip', 8, now(), 1)`,
          [id, birdId],
        ),
      ).rejects.toThrow(/jobs_dest_check/);
      await expect(
        deps.db.query(
          `insert into jobs (user_id, bird_id, job_id, pay, ends_at, dest_lat, dest_lon)
           values ($1, $2, 'deli-slip', 8, now(), 1, 2)`,
          [id, birdId],
        ),
      ).rejects.toThrow(/jobs_dest_check/);
    });

    it("ac-1: the database refuses a second running row for the same catalog job and user", async () => {
      const { id, birdId: gerald } = await onboarded("(555) 123-4567", "Max");
      const brenda = await withRoommate(id);
      const insert = (birdId: string) =>
        deps.db.query<{ id: string }>(
          `insert into jobs (user_id, bird_id, job_id, pay, ends_at)
           values ($1, $2, 'deli-slip', 8, to_timestamp($3 / 1000.0))
           returning id`,
          [id, birdId, deps.clock.now()],
        );
      const [first] = await insert(gerald);

      await expect(insert(brenda)).rejects.toThrow(
        /jobs_one_running_per_offer/,
      );

      await deps.db.query("update jobs set status = 'done' where id = $1", [
        first.id,
      ]);
      await expect(insert(brenda)).resolves.toHaveLength(1);
    });

    it("ac-2: labels the destination with the job's short text, adds no address column, logs nothing and calls no geocoder", async () => {
      const { id, jar, birdId } = await onboarded("(555) 123-4567", "Max");
      await setLofts(id, false);
      const [offer] = todaysOffers(id);
      const logs = (["log", "info", "warn", "error", "debug"] as const).map(
        (level) => vi.spyOn(console, level),
      );
      const geo = (["search", "reverse"] as const).map((method) =>
        vi.spyOn(deps.geocoder, method),
      );

      expect((await client.post({ jobId: offer.id, birdId }, jar)).status).toBe(
        200,
      );

      for (const spy of [...logs, ...geo]) expect(spy).not.toHaveBeenCalled();
      const [row] = await deps.db.query<Record<string, unknown>>(
        "select * from jobs where user_id = $1",
        [id],
      );
      expect(Object.keys(row).sort()).toEqual([
        "bird_id",
        "dest_label",
        "dest_lat",
        "dest_lon",
        "ends_at",
        "id",
        "job_id",
        "pay",
        "started_at",
        "status",
        "user_id",
      ]);
      expect(row.dest_label).toBe(
        config.jobs.jobs.find((j) => j.id === row.job_id)!.short,
      );
    });
  });
});
