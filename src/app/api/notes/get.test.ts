import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import {
  addDelivery,
  HOUR_MS,
  insertFlyingDelivery,
} from "@/test/fixtures/flights";
import { addNote, insertDeliveredNote } from "@/test/fixtures/notes";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { notesGet } from "./get";

const ROUTE = readFileSync(join(__dirname, "route.ts"), "utf8");
const PHONE = {
  max: "+15550000001",
  priya: "+15550000002",
  rosa: "+15550000003",
};
const MINUTE_MS = 60_000;

let deps: TestDeps;
let world: World;
let now: number;

beforeEach(async () => {
  deps = await makeTestDeps();
  now = deps.clock.now();
  world = await seedWorld(deps.db, now);
});

const client = () => geoClient(deps, notesGet, "/api/notes");

async function jarOf(who: keyof typeof PHONE) {
  return (await client().signIn(PHONE[who])).jar;
}

async function list(who: keyof typeof PHONE, query = {}) {
  return client().get(query, await jarOf(who));
}

function delivered(from: Person, to: Person, minutesAgo: number) {
  return insertDeliveredNote(deps.db, world, now - minutesAgo * MINUTE_MS, {
    from,
    to,
  }).then((r) => r.noteId);
}

type Listed = { id: string; direction: string; with: { id: string | null } };

describe("src/app/api/notes/route.ts", () => {
  it("holds only imports and the GET export", () => {
    const lines = ROUTE.split("\n").filter((line) => line.trim() !== "");
    const exports = lines.filter((line) => !line.startsWith("import "));
    expect(exports).toEqual(["export const GET = notesGet(jsonRoute);"]);
  });
});

describe("GET /api/notes", () => {
  it("hides an undelivered note sent to me", async () => {
    const { noteId } = await insertFlyingDelivery(deps.db, world, now);
    const { status, json } = await list("priya");
    expect(status).toBe(200);
    expect(json.notes.map((n: Listed) => n.id)).not.toContain(noteId);
    expect(json.total).toBe(0);
  });

  it("shows my unlanded note as in the air", async () => {
    const { noteId } = await insertFlyingDelivery(deps.db, world, now);
    const { status, json } = await list("max");
    expect(status).toBe(200);
    expect(json.notes).toEqual([
      {
        id: noteId,
        direction: "sent",
        state: "in_the_air",
        body: "Test note from Max",
        with: { id: world.priya.id, name: "Priya", handle: "priya" },
        bird: {
          id: world.max.birds[0].id,
          name: "Gerald",
          look: expect.any(String),
        },
        trip: { distanceMi: null, durationMs: HOUR_MS },
        createdAt: now,
        deliveredAt: null,
      },
    ]);
  });

  it("shows a delivered note I received, with the bird and trip", async () => {
    const noteId = await deps.db.tx(async (t) => {
      const id = await addNote(t, world.priya, world.max, now, true);
      await addDelivery(
        t,
        world.priya,
        world.max,
        world.priya.birds[0].id,
        id,
        "landed",
        now - 2 * HOUR_MS,
        now,
      );
      return id;
    });
    const { json } = await list("max");
    expect(json.notes).toEqual([
      expect.objectContaining({
        id: noteId,
        direction: "received",
        state: "delivered",
        with: { id: world.priya.id, name: "Priya", handle: "priya" },
        bird: expect.objectContaining({ name: "Kevin" }),
        trip: { distanceMi: null, durationMs: 2 * HOUR_MS },
        deliveredAt: now,
      }),
    ]);
  });

  it("filters to one friend in both directions, newest first", async () => {
    const sent = await delivered(world.max, world.priya, 30);
    const received = await delivered(world.priya, world.max, 10);
    await delivered(world.max, world.rosa, 20);
    await delivered(world.rosa, world.max, 5);
    const { status, json } = await list("max", { friendId: world.priya.id });
    expect(status).toBe(200);
    expect(
      json.notes.map((n: Listed) => [n.id, n.direction, n.with.id]),
    ).toEqual([
      [received, "received", world.priya.id],
      [sent, "sent", world.priya.id],
    ]);
    expect(json.total).toBe(2);
    expect(json.nextCursor).toBeNull();
  });

  it("shows nothing of someone else's notes for their friend id", async () => {
    const theirs = await delivered(world.priya, world.rosa, 30);
    const theirsBack = await delivered(world.rosa, world.priya, 20);
    const mine = await delivered(world.max, world.rosa, 10);
    const { status, json } = await list("max", { friendId: world.rosa.id });
    expect(status).toBe(200);
    const ids = json.notes.map((n: Listed) => n.id);
    expect(ids).toEqual([mine]);
    expect(ids).not.toContain(theirs);
    expect(ids).not.toContain(theirsBack);

    const unfiltered = await list("max");
    expect(unfiltered.json.notes.map((n: Listed) => n.id)).toEqual([mine]);
  });

  it("shows a deleted recipient as a former friend and drops their sent notes", async () => {
    const toRosa = await delivered(world.max, world.rosa, 30);
    const fromRosa = await delivered(world.rosa, world.max, 10);
    await deps.db.query("delete from auth.users where id = $1", [
      world.rosa.id,
    ]);
    const { status, json } = await list("max");
    expect(status).toBe(200);
    expect(json.notes).toEqual([
      expect.objectContaining({
        id: toRosa,
        direction: "sent",
        with: { id: null, name: "a former friend", handle: null },
      }),
    ]);
    expect(json.notes.map((n: Listed) => n.id)).not.toContain(fromRosa);
  });

  it("shows my guest note by the guest's name, and as returned once it comes back", async () => {
    const noteId = await deps.db.tx(async (t) => {
      const [{ id: linkId }] = await t.query<{ id: string }>(
        `insert into guest_links (token_hash, sender_id, recipient_name, dest_lat, dest_lon, dest_label)
         values ('hash', $1, 'Grandma', 40.7, -74, 'Brooklyn') returning id`,
        [world.max.id],
      );
      const [{ id }] = await t.query<{ id: string }>(
        `insert into notes (sender_id, guest_link_id, body, created_at, delivered_at)
         values ($1, $2, 'Hi Grandma', $3, $3) returning id`,
        [world.max.id, linkId, new Date(now).toISOString()],
      );
      return id;
    });
    const before = await list("max");
    expect(before.json.notes).toEqual([
      expect.objectContaining({
        id: noteId,
        direction: "sent",
        state: "delivered",
        with: { id: null, name: "Grandma", handle: null },
        bird: null,
        trip: null,
      }),
    ]);

    await deps.db.query("update notes set returned_at = $2 where id = $1", [
      noteId,
      new Date(now).toISOString(),
    ]);
    const after = await list("max");
    expect(after.json.notes).toEqual([
      expect.objectContaining({ id: noteId, state: "returned" }),
    ]);
  });

  it("pages newest first with a cursor and no overlap", async () => {
    const ids = await deps.db.tx(async (t) => {
      const out: string[] = [];
      for (let i = 0; i < 31; i++) {
        out.push(
          await addNote(t, world.priya, world.max, now - i * MINUTE_MS, true),
        );
      }
      return out;
    });
    const first = await list("max");
    expect(first.json.notes).toHaveLength(30);
    expect(first.json.total).toBe(31);
    expect(first.json.nextCursor).toEqual(expect.any(String));

    const second = await list("max", { cursor: first.json.nextCursor });
    expect(second.status).toBe(200);
    expect(second.json.nextCursor).toBeNull();
    expect(second.json.total).toBe(31);
    expect(
      [...first.json.notes, ...second.json.notes].map((n: Listed) => n.id),
    ).toEqual(ids);
  });

  it("answers a bad cursor with 400 invalid", async () => {
    const { status, json } = await list("max", { cursor: "not-a-cursor" });
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("answers a cursor whose time is out of range with 400 invalid", async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        t: "99999999999999999999",
        id: "00000000-0000-4000-8000-000000000002",
      }),
    ).toString("base64url");
    const { status, json } = await list("max", { cursor });
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("answers a malformed friend id with 400 invalid", async () => {
    const { status, json } = await list("max", { friendId: "nope" });
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client().get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});
