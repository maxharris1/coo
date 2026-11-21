import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import {
  insertPlannedDelivery,
  type PlannedDelivery,
} from "@/test/fixtures/plannedFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { authRoutes } from "./auth/handlers";
import { collectionGet } from "./collection/get";
import { flightGet } from "./flights/[id]/get";
import { flightsGet } from "./flights/get";
import { friendsGet } from "./friends/get";
import { geoHereGet } from "./geo/here/get";
import { geoSearchGet } from "./geo/search/get";
import { healthGet } from "./health/get";
import { inviteGet } from "./invite/[code]/get";
import { shopGet } from "./shop/get";
import { syncGet } from "./sync/get";

type JsonRoute = ReturnType<typeof createJsonRoute>;
type Handler = (req: NextRequest) => Promise<Response>;

const API = join(process.cwd(), "src/app/api");

const GET_ENDPOINTS: Record<
  string,
  { build: (r: JsonRoute) => Handler; url: string }
> = {
  "src/app/api/auth/session/route.ts": {
    build: (r) => authRoutes(r).session,
    url: "/api/auth/session",
  },
  "src/app/api/collection/route.ts": {
    build: collectionGet,
    url: "/api/collection",
  },
  "src/app/api/flights/[id]/route.ts": {
    build: flightGet,
    url: "/api/flights/:flightId",
  },
  "src/app/api/flights/route.ts": { build: flightsGet, url: "/api/flights" },
  "src/app/api/friends/route.ts": { build: friendsGet, url: "/api/friends" },
  "src/app/api/geo/here/route.ts": {
    build: geoHereGet,
    url: "/api/geo/here?lat=39.952&lon=-75.165",
  },
  "src/app/api/geo/search/route.ts": {
    build: geoSearchGet,
    url: "/api/geo/search?q=Philadelphia",
  },
  "src/app/api/health/route.ts": { build: healthGet, url: "/api/health" },
  "src/app/api/invite/[code]/route.ts": {
    build: inviteGet,
    url: "/api/invite/seed-max",
  },
  "src/app/api/shop/route.ts": { build: shopGet, url: "/api/shop" },
  "src/app/api/sync/route.ts": { build: syncGet, url: "/api/sync" },
};

function getRouteFiles(): string[] {
  return readdirSync(API, { recursive: true, encoding: "utf8" })
    .filter((file) => /(^|\/)route\.ts$/.test(file))
    .map((file) => join(API, file))
    .filter((file) => /export const GET\b/.test(readFileSync(file, "utf8")))
    .map((file) => relative(process.cwd(), file))
    .sort();
}

let deps: TestDeps;
let world: World;
let flight: PlannedDelivery;
let noteBody: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  flight = await insertPlannedDelivery(deps.db, world, deps.clock.now());
  [{ body: noteBody }] = await deps.db.query<{ body: string }>(
    "select body from notes where id = $1",
    [flight.noteId],
  );
});

async function priyaCookie(): Promise<string> {
  const jar = new FakeJar();
  const id = await deps
    .auth(jar)
    .verifyCode(toE164("+15550000002") as E164, "000000");
  if (id !== world.priya.id) throw new Error("test sign-in failed");
  return jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
}

describe("a note before its arrival time", () => {
  it("covers every GET endpoint the app has", () => {
    expect(getRouteFiles()).toEqual(Object.keys(GET_ENDPOINTS).sort());
  });

  it("is in no response the recipient can get from any endpoint", async () => {
    deps.clock.set(flight.arriveAtMs - 60_000);
    const cookie = await priyaCookie();

    for (const [file, { build, url }] of Object.entries(GET_ENDPOINTS)) {
      const res = await build(createJsonRoute(async () => deps))(
        new NextRequest(
          `https://coo.test${url.replace(":flightId", flight.flightId)}`,
          { headers: { cookie } },
        ),
      );
      const text = await res.text();
      expect(text, file).not.toContain(noteBody);
      expect(text, file).not.toContain(flight.noteId);
    }

    const [note] = await deps.db.query<{ delivered_at: Date | null }>(
      "select delivered_at from notes where id = $1",
      [flight.noteId],
    );
    expect(note.delivered_at).toBeNull();
    const [f] = await deps.db.query<{ status: string }>(
      "select status from flights where id = $1",
      [flight.flightId],
    );
    expect(f.status).toBe("flying");
  });
});
