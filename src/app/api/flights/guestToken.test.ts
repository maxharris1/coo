import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { searchPlaces } from "@/server/services/places";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { flightsPost } from "./post";

const PEPPER = "guest-token-pepper";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const CONSOLE_METHODS = ["log", "info", "warn", "error", "debug"] as const;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function everyStoredRow(): Promise<string> {
  const tables = await deps.db.query<{ schema: string; name: string }>(
    `select table_schema as schema, table_name as name
     from information_schema.tables
     where table_type = 'BASE TABLE'
       and table_schema not in ('pg_catalog', 'information_schema')`,
  );
  const rows = await Promise.all(
    tables.map(({ schema, name }) =>
      deps.db.query<{ row: string }>(
        `select t::text as row from "${schema}"."${name}" t`,
      ),
    ),
  );
  return rows
    .flat()
    .map(({ row }) => row)
    .join("\n");
}

describe("ac-1 guest send link token", () => {
  it("stores sha256(pepper + token) and the token appears only in the response", async () => {
    const consoles = CONSOLE_METHODS.map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const client = geoClient(deps, flightsPost, "/api/flights");
    const { id: max, jar } = await client.signIn("+15550000001");
    expect(max).toBe(world.max.id);
    const { results } = await searchPlaces(deps, max as UserId, "Williamsburg");

    const { status, json } = await client.post(
      {
        body: "Come see the new loft",
        sends: [
          {
            guest: { name: "Sam", placeId: results[0].placeId },
            birdId: world.max.birds[0].id,
          },
        ],
      },
      jar,
    );

    expect(status).toBe(200);
    const url: string = json.guestLinks[0].url;
    const token = url.slice(url.lastIndexOf("-") + 1);
    expect(token).toMatch(
      new RegExp(`^[A-Za-z0-9]{${deps.config.game.guestLinks.tokenChars}}$`),
    );
    expect(JSON.stringify(json).split(token)).toHaveLength(2);

    const expectedHash = createHash("sha256")
      .update(PEPPER + token)
      .digest("hex");
    const links = await deps.db.query<{ token_hash: string }>(
      "select token_hash from guest_links where sender_id = $1",
      [max],
    );
    expect(links).toEqual([{ token_hash: expectedHash }]);

    const stored = await everyStoredRow();
    expect(stored).toContain(expectedHash);
    expect(stored).not.toContain(token);

    const logged = JSON.stringify(consoles.map((spy) => spy.mock.calls));
    expect(logged).not.toContain(token);
  });
});

describe("ac-1 guest send with a doodle", () => {
  it("stores the doodle on the guest's note", async () => {
    const { width, height } = deps.config.game.notes.doodle;
    const doodle = {
      v: 1,
      w: width,
      h: height,
      strokes: [
        {
          color: "ink",
          width: "fine",
          points: [
            [1, 2],
            [3, 4],
          ],
        },
      ],
    };
    const client = geoClient(deps, flightsPost, "/api/flights");
    const { id: max, jar } = await client.signIn("+15550000001");
    const { results } = await searchPlaces(deps, max as UserId, "Williamsburg");

    const { status } = await client.post(
      {
        body: "",
        doodle,
        sends: [
          {
            guest: { name: "Sam", placeId: results[0].placeId },
            birdId: world.max.birds[0].id,
          },
        ],
      },
      jar,
    );

    expect(status).toBe(200);
    const notes = await deps.db.query<{ body: string; doodle: unknown }>(
      "select body, doodle from notes where guest_link_id is not null",
    );
    expect(notes).toEqual([{ body: "", doodle }]);
  });
});
