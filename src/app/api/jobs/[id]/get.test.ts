import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { offersFor } from "@/lib/game/jobs";
import { snap } from "@/lib/game/privacy";
import { localDate } from "@/lib/game/time";
import type { OnboardedCaller, Profile } from "@/server/auth";
import { log } from "@/server/log";
import type { UserId } from "@/server/ports/auth";
import { startJob } from "@/server/services/jobs/start";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { jobGet } from "./get";

const ROUTE = readFileSync(join(__dirname, "route.ts"), "utf8");
const PHONE = { max: "+15550000001", rosa: "+15550000003" };
const MINUTE = 60_000;

type DestRow = {
  job_id: string;
  dest_lat: number;
  dest_lon: number;
  dest_label: string;
};

let deps: TestDeps;
let world: World;
let jobRowId: string;
let offer: (typeof config.jobs.jobs)[number];
let startedAt: number;

afterEach(() => vi.restoreAllMocks());

beforeEach(async () => {
  deps = await makeTestDeps();
  deps.clock.set(Date.UTC(2026, 10, 20, 14, 0));
  world = await seedWorld(deps.db, deps.clock.now());
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [world.max.id],
  );
  const caller: OnboardedCaller = {
    userId: world.max.id as UserId,
    profile,
  };
  [offer] = offersFor(
    world.max.id,
    localDate(deps.clock.now(), profile.timezone),
  );
  startedAt = deps.clock.now();
  ({
    job: { id: jobRowId },
  } = await startJob(deps, caller, {
    jobId: offer.id,
    birdId: world.max.birds[0].id,
  }));
});

const clientFor = (id: string) => geoClient(deps, jobGet, `/api/jobs/${id}`);

async function jarOf(who: keyof typeof PHONE) {
  return (await clientFor("x").signIn(PHONE[who])).jar;
}

async function storedDest(): Promise<DestRow> {
  const [row] = await deps.db.query<DestRow>(
    "select job_id, dest_lat, dest_lon, dest_label from jobs where id = $1",
    [jobRowId],
  );
  return row;
}

function points(value: unknown): { lat: number; lon: number }[] {
  if (Array.isArray(value)) return value.flatMap(points);
  if (typeof value !== "object" || value === null) return [];
  const own =
    "lat" in value && "lon" in value
      ? [{ lat: value.lat as number, lon: value.lon as number }]
      : [];
  return [...own, ...Object.values(value).flatMap(points)];
}

function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)]);
}

describe("src/app/api/jobs/[id]/route.ts", () => {
  it("holds only imports and the GET export", () => {
    const lines = ROUTE.split("\n").filter((line) => line.trim() !== "");
    const exports = lines.filter((line) => !line.startsWith("import "));
    expect(exports).toEqual(["export const GET = jobGet(jsonRoute);"]);
  });
});

describe("GET /api/jobs/[id]", () => {
  it("gives the owner the job with the snapped loft and destination", async () => {
    const { status, json } = await clientFor(jobRowId).get(
      {},
      await jarOf("max"),
    );

    expect(status).toBe(200);
    const row = await storedDest();
    const loft = snap(40.73, -73.9875);
    expect(json.job).toEqual({
      id: jobRowId,
      jobId: offer.id,
      text: offer.text,
      short: offer.short,
      startedAt: new Date(startedAt).toISOString(),
      endsAt: new Date(startedAt + offer.minutes * MINUTE).toISOString(),
      status: "running",
      bird: {
        id: world.max.birds[0].id,
        name: "Gerald",
        look: expect.any(String),
        gear: expect.any(Array),
      },
      map: {
        loft: { ...loft, label: "East Village" },
        dest: { lat: row.dest_lat, lon: row.dest_lon, label: row.dest_label },
      },
    });
    const { map } = json.job;
    expect(snap(map.loft.lat, map.loft.lon)).toEqual({
      lat: map.loft.lat,
      lon: map.loft.lon,
    });
    expect(snap(map.dest.lat, map.dest.lon)).toEqual({
      lat: map.dest.lat,
      lon: map.dest.lon,
    });
    expect(config.jobs.jobs.map((j) => j.short)).toContain(map.dest.label);
  });

  it("gives map null when the job row has no destination", async () => {
    await deps.db.query(
      "update jobs set dest_lat = null, dest_lon = null, dest_label = null where id = $1",
      [jobRowId],
    );

    const { status, json } = await clientFor(jobRowId).get(
      {},
      await jarOf("max"),
    );

    expect(status).toBe(200);
    expect(json.job).toMatchObject({ id: jobRowId, map: null });
  });

  it("gives map null when the owner no longer has a loft", async () => {
    await deps.db.query(
      `update profiles set home_lat = null, home_lon = null, home_label = null,
         home_city = null, home_city_lat = null, home_city_lon = null
       where id = $1`,
      [world.max.id],
    );

    const { status, json } = await clientFor(jobRowId).get(
      {},
      await jarOf("max"),
    );

    expect(status).toBe(200);
    expect(json.job).toMatchObject({ id: jobRowId, map: null });
  });

  it("answers another user with 404 not_found", async () => {
    const { status, json } = await clientFor(jobRowId).get(
      {},
      await jarOf("rosa"),
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(JSON.stringify(json)).not.toContain(jobRowId);
  });

  it("answers a job id that does not exist with 404 not_found", async () => {
    const { status, json } = await clientFor(
      "00000000-0000-4000-8000-0000000000ff",
    ).get({}, await jarOf("max"));
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("answers a malformed id with 404 not_found", async () => {
    const { status, json } = await clientFor("not-a-uuid").get(
      {},
      await jarOf("max"),
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await clientFor(jobRowId).get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("ac-2: returns no address field or unsnapped point and logs nothing", async () => {
    const jar = await jarOf("max");
    const spies = [
      ...(["log", "info", "warn", "error", "debug"] as const).map((level) =>
        vi.spyOn(console, level),
      ),
      ...(["info", "warn", "error"] as const).map((level) =>
        vi.spyOn(log, level),
      ),
    ];

    const { status, json } = await clientFor(jobRowId).get({}, jar);

    expect(status).toBe(200);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(keys(json).filter((k) => /street|house|address/i.test(k))).toEqual(
      [],
    );
    expect(keys(json).filter((k) => /^home_|^travel_|city/i.test(k))).toEqual(
      [],
    );
    const found = points(json);
    expect(found).toHaveLength(2);
    for (const p of found) expect(snap(p.lat, p.lon)).toEqual(p);
    const body = JSON.stringify(json);
    for (const leak of ["New York", "40.712", "-74.005"])
      expect(body).not.toContain(leak);
  });
});
